/**
 * WebRTCManager - Manages WebRTC peer connections for a room
 *
 * Integrates with SignalingService for distributed signaling and manages
 * the lifecycle of peer connections, data channels, and messages.
 *
 * Hotfix 1.1 (offline-first fallback):
 * - The BroadcastChannel fallback is a first-class LOCAL transport and is
 *   always set up; the signaling subscription is layered on top and the
 *   room is (re)joined whenever the socket comes up, so constructing the
 *   manager before connect() resolves is no longer a race.
 * - SDP payloads are normalized to plain { type, sdp } init objects.
 *   createOffer()/createAnswer() resolve to plain RTCSessionDescriptionInit
 *   dictionaries in spec-compliant browsers (e.g. Firefox), which have no
 *   .toJSON() method — the old code called answer.toJSON() and crashed
 *   before the answer was ever sent. No .toJSON() is called on anything
 *   that arrives over a transport or comes out of create*() anymore.
 * - ICE candidates are queued per peer until that peer's remote
 *   description is set, then flushed in order. Candidates from a peer we
 *   have not seen yet are buffered under its id.
 * - Every transport dispatch and every consumer handler is isolated: a
 *   malformed message or a throwing handler is logged and dropped, never
 *   propagated toward the rendering/canvas code paths.
 *
 * Hotfix 2.0 (relay fallback):
 * - Interaction traffic was data-channel-only; on networks that pass
 *   WSS but kill P2P (hotel/conference NATs, corporate firewalls) the
 *   channels never open and the room silently never syncs. Now, when
 *   a peer's channel has been down past RELAY_GRACE_MS, sends to that
 *   peer fall back — per message, per peer — to the signaling
 *   socket's opaque `relay` (see SignalingService). The envelope is
 *   identical (sequence numbers included), so receivers run one
 *   dedupe/order path for both transports, and the moment a channel
 *   (re)opens the relay stops for that peer. Inside the grace window
 *   sends drop exactly as they always have: a healthy negotiation is
 *   never raced, and nothing is ever queued.
 */

import {
  SignalingService,
  SignalingMessage,
  SignalingConnectionState,
} from './SignalingService';

export type MessageHandler = (data: unknown, from: string) => void;

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  /** Control channel ('fabric'): ordered, retransmitted. Carries
   * session/identity/note/ping traffic — rare, small, must arrive. */
  dc: RTCDataChannel | null;
  /**
   * Live channel ('fabric-live', Hotfix 1.9): unordered,
   * maxRetransmits 0. Carries stroke points only — ephemeral data
   * where a late retransmit is worse than a gap (the fluid sim
   * interpolates over a dropped point; it cannot un-stall a stream
   * head-of-line blocked behind one). Null when the remote end is
   * an older client that only ever offers the control channel;
   * sendLive falls back to the control channel in that case.
   */
  liveDc: RTCDataChannel | null;
  ready: boolean;
  /** ICE candidates waiting for this peer's remote description. */
  pendingIce: RTCIceCandidateInit[];
  /**
   * Hotfix 2.0 down-clocks for the relay fallback. Each is the
   * Date.now() moment the corresponding path was last known DOWN,
   * or null while it is open:
   * - anyDownSince:     no usable channel at all (live or control).
   * - controlDownSince: the control channel specifically.
   * Both start at the peer's creation time — a channel that has
   * never opened gets the full grace window to negotiate before
   * the relay takes over for that peer.
   */
  anyDownSince: number | null;
  controlDownSince: number | null;
}

/**
 * Hotfix 2.0: how long a peer's data channel may stay down before
 * the signaling relay takes over its traffic. Healthy negotiations
 * complete in well under a second even across the public internet;
 * 2.5s is generous headroom that still rescues a stroke session
 * before the user concludes the room is dead.
 */
const RELAY_GRACE_MS = 2500;

/** The interaction path a diag screenshot should report. */
export type TransportPath = 'p2p' | 'relay' | 'p2p+relay' | '—';

/**
 * The live canvas's manager registers itself here so the ?diag=1
 * panel (LegacyFluid) can read the current interaction path without
 * prop-drilling through three hooks. One live room at a time is the
 * app's shape; if two managers ever coexist, the newest wins and
 * destroy() clears only its own registration.
 */
let activeManager: WebRTCManager | null = null;

export function getActiveTransportPath(): TransportPath {
  return activeManager ? activeManager.getTransportPath() : '—';
}

/**
 * Normalize anything SDP-shaped (plain JSON from a transport, an
 * RTCSessionDescription instance, or the result of createOffer/createAnswer)
 * into a plain RTCSessionDescriptionInit, or null when it is unusable.
 * Deliberately never calls .toJSON(): plain init objects don't have one.
 */
function toSdpInit(value: unknown): RTCSessionDescriptionInit | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { type?: unknown; sdp?: unknown };
  if (typeof v.type !== 'string' || typeof v.sdp !== 'string') return null;
  return { type: v.type as RTCSdpType, sdp: v.sdp };
}

/**
 * Normalize anything ICE-candidate-shaped into a plain
 * RTCIceCandidateInit, or null when it is unusable.
 */
function toCandidateInit(value: unknown): RTCIceCandidateInit | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as {
    candidate?: unknown;
    sdpMid?: unknown;
    sdpMLineIndex?: unknown;
    usernameFragment?: unknown;
  };
  if (typeof v.candidate !== 'string') return null;
  const init: RTCIceCandidateInit = { candidate: v.candidate };
  if (typeof v.sdpMid === 'string') init.sdpMid = v.sdpMid;
  if (typeof v.sdpMLineIndex === 'number') init.sdpMLineIndex = v.sdpMLineIndex;
  if (typeof v.usernameFragment === 'string') {
    init.usernameFragment = v.usernameFragment;
  }
  return init;
}

export class WebRTCManager {
  private roomId: string;
  private peerId: string;
  private signaling: SignalingService | null;
  private peers: Map<string, Peer> = new Map();
  private messageHandlers = new Set<MessageHandler>();
  private fallbackChannel: BroadcastChannel | null = null;
  private unsubscribeSignaling: (() => void) | null = null;
  private unsubscribeSignalingState: (() => void) | null = null;
  /** Candidates received before we have a Peer for their sender. */
  private earlyIce: Map<string, RTCIceCandidateInit[]> = new Map();
  /**
   * Hotfix 2.0: remote peers the signaling room (or the local
   * BroadcastChannel) has told us about, mapped to when we first
   * heard of them. Deliberately broader than `peers`: a peer whose
   * connection failed ICE and was torn down — or one negotiation
   * never created a Peer for — is still a room member, still a
   * relay target, and its first-heard time is its down-clock until
   * a Peer object exists to keep a more precise one.
   */
  private signalingPeerSince: Map<string, number> = new Map();

  constructor(roomId: string, peerId: string, signaling: SignalingService | null = null) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.signaling = signaling;
    activeManager = this;

    // Local transport first: it works with zero network infrastructure
    // and is the designed mode when no signaling server is configured.
    this.setupFallback();

    if (signaling) {
      this.setupSignaling();
    }
  }

  /**
   * Setup signaling service handlers. The room is joined when the socket
   * reaches 'online' (including late connections after construction), so
   * callers never have to await connect() before creating the manager.
   */
  private setupSignaling(): void {
    if (!this.signaling) return;

    this.unsubscribeSignaling = this.signaling.onMessage((message: SignalingMessage) => {
      try {
        this.handleSignalingMessage(message);
      } catch (error) {
        console.warn('[WebRTCManager] Dropped signaling message after error:', error);
      }
    });

    this.unsubscribeSignalingState = this.signaling.onStateChange(
      (state: SignalingConnectionState) => {
        if (state === 'online') {
          this.signaling?.joinRoom(this.roomId, this.peerId);
        }
      }
    );
  }

  /** Hotfix 2.0: remember a room member the signaling layer named. */
  private noteSignalingPeer(peerId: string): void {
    if (peerId === this.peerId) return;
    if (!this.signalingPeerSince.has(peerId)) {
      this.signalingPeerSince.set(peerId, Date.now());
    }
  }

  /** Hotfix 2.0: a member left the room for good — no longer a target. */
  private forgetSignalingPeer(peerId: string): void {
    this.signalingPeerSince.delete(peerId);
  }

  private handleSignalingMessage(message: SignalingMessage): void {
    if (!message || message.roomId !== this.roomId) return;

    switch (message.type) {
      case 'peer-joined':
        if (message.peerId !== this.peerId) {
          this.noteSignalingPeer(message.peerId);
          // We initiate connection to the new peer
          this.createPeer(message.peerId, true);
        }
        break;

      case 'relay': {
        // Hotfix 2.0: an interaction envelope that traveled the
        // signaling socket because the sender's data channel path
        // was down. It enters the EXACT path data-channel messages
        // take (notifyMessage), payload untouched — downstream
        // dedupe keys on the envelope's own sender + seq, so the
        // two transports are indistinguishable to consumers,
        // including a stroke that starts on one and ends on the
        // other. Targeted frames for someone else are not ours.
        if (message.from === this.peerId) return;
        if (message.to && message.to !== this.peerId) return;
        if (!message.payload || typeof message.payload !== 'object') return;
        this.noteSignalingPeer(message.from);
        this.notifyMessage(message.payload, message.from);
        break;
      }

      case 'offer':
        if (message.to === this.peerId) {
          void this.handleOffer(message.from, message.sdp);
        }
        break;

      case 'answer':
        if (message.to === this.peerId) {
          void this.handleAnswer(message.from, message.sdp);
        }
        break;

      case 'ice-candidate':
        if (message.to === this.peerId) {
          void this.handleIceCandidate(message.from, message.candidate);
        }
        break;

      case 'peer-left':
        if (message.peerId !== this.peerId) {
          this.forgetSignalingPeer(message.peerId);
          this.removePeer(message.peerId);
        }
        break;

      case 'presence':
        // Handle initial peer list
        if (!Array.isArray(message.peers)) return;
        message.peers.forEach(otherId => {
          if (otherId !== this.peerId) {
            this.noteSignalingPeer(otherId);
          }
          if (otherId !== this.peerId && !this.peers.has(otherId)) {
            // Determine who initiates based on peer ID comparison
            const weInitiate = this.peerId > otherId;
            if (weInitiate) {
              this.createPeer(otherId, true);
            }
          }
        });
        break;
    }
  }

  /**
   * Setup BroadcastChannel fallback (local transport: same-browser tabs).
   * Every message is validated and handled inside a guard: a malformed
   * message is logged and dropped, never thrown.
   */
  private setupFallback(): void {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return;
    }

    try {
      this.fallbackChannel = new BroadcastChannel(`fabric-webrtc-${this.roomId}`);
    } catch (error) {
      console.warn('[WebRTCManager] BroadcastChannel unavailable:', error);
      this.fallbackChannel = null;
      return;
    }

    this.fallbackChannel.onmessage = (event) => {
      try {
        const message = event.data as {
          type?: unknown;
          from?: unknown;
          to?: unknown;
          sdp?: unknown;
          candidate?: unknown;
        } | null;

        if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
          return;
        }
        const from = message.from;
        if (typeof from !== 'string' || from === this.peerId) {
          return;
        }

        switch (message.type) {
          case 'hello':
            this.noteSignalingPeer(from);
            if (!this.peers.has(from)) {
              const weInitiate = this.peerId > from;
              this.createPeer(from, weInitiate);
            }
            break;

          case 'offer':
            if (message.to === this.peerId) {
              void this.handleOffer(from, message.sdp);
            }
            break;

          case 'answer':
            if (message.to === this.peerId) {
              void this.handleAnswer(from, message.sdp);
            }
            break;

          case 'ice-candidate':
            if (message.to === this.peerId) {
              void this.handleIceCandidate(from, message.candidate);
            }
            break;

          case 'bye':
            this.forgetSignalingPeer(from);
            this.removePeer(from);
            break;
        }
      } catch (error) {
        console.warn('[WebRTCManager] Dropped malformed fallback message:', error);
      }
    };

    // Announce presence
    this.postFallback({ type: 'hello', from: this.peerId });
  }

  private postFallback(payload: Record<string, unknown>): void {
    if (!this.fallbackChannel) return;
    try {
      this.fallbackChannel.postMessage(payload);
    } catch (error) {
      console.warn('[WebRTCManager] Failed to post fallback message:', error);
    }
  }

  /** Send an offer over whichever negotiation transport is live. */
  private signalOffer(to: string, sdp: RTCSessionDescriptionInit): void {
    if (this.signaling && this.signaling.isConnected()) {
      this.signaling.sendOffer(this.roomId, this.peerId, to, sdp);
    } else {
      this.postFallback({ type: 'offer', from: this.peerId, to, sdp });
    }
  }

  /** Send an answer over whichever negotiation transport is live. */
  private signalAnswer(to: string, sdp: RTCSessionDescriptionInit): void {
    if (this.signaling && this.signaling.isConnected()) {
      this.signaling.sendAnswer(this.roomId, this.peerId, to, sdp);
    } else {
      this.postFallback({ type: 'answer', from: this.peerId, to, sdp });
    }
  }

  /** Send an ICE candidate over whichever negotiation transport is live. */
  private signalCandidate(to: string, candidate: RTCIceCandidateInit): void {
    if (this.signaling && this.signaling.isConnected()) {
      this.signaling.sendIceCandidate(this.roomId, this.peerId, to, candidate);
    } else {
      this.postFallback({ type: 'ice-candidate', from: this.peerId, to, candidate });
    }
  }

  /**
   * Create a peer connection
   */
  private createPeer(peerId: string, asCaller: boolean): Peer {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 2
    });

    const now = Date.now();
    const peer: Peer = {
      id: peerId,
      pc,
      dc: null,
      liveDc: null,
      ready: false,
      pendingIce: this.earlyIce.get(peerId) ?? [],
      // Hotfix 2.0: both paths start DOWN at creation; the relay
      // grace clock runs from here until a channel actually opens.
      anyDownSince: now,
      controlDownSince: now,
    };
    this.earlyIce.delete(peerId);
    this.noteSignalingPeer(peerId);

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const init = toCandidateInit(event.candidate);
      if (init) {
        this.signalCandidate(peerId, init);
      }
    };

    pc.onconnectionstatechange = () => {
      // Only terminal states remove the peer. 'disconnected' is a
      // TRANSIENT ICE state (brief network flap, remote tab
      // re-negotiating) from which the connection routinely recovers
      // on its own; treating it as fatal closed the peer's data
      // channel and forced a full renegotiation for a blip
      // (Hotfix 1.2).
      if (pc.connectionState === 'failed' ||
          pc.connectionState === 'closed') {
        this.removePeer(peerId);
      }
    };

    pc.ondatachannel = (event) => {
      // Hotfix 1.9: two lanes exist now. Route by label — anything
      // that is not the live lane is the control channel (including
      // the single 'fabric' channel an older client offers).
      if (event.channel.label === 'fabric-live') {
        peer.liveDc = event.channel;
        this.wireDataChannel(peer, event.channel, false);
      } else {
        peer.dc = event.channel;
        this.wireDataChannel(peer, event.channel, true);
      }
    };

    if (asCaller) {
      const dc = pc.createDataChannel('fabric', {
        ordered: true,
        maxRetransmits: 3
      });
      peer.dc = dc;
      this.wireDataChannel(peer, dc, true);

      // Hotfix 1.9: the ephemeral stroke lane. Unordered with zero
      // retransmits: under loss, stroke points arrive as fast as
      // the network allows instead of queueing behind a lost
      // packet's retransmission (the old single channel was
      // ordered + maxRetransmits 3 — head-of-line blocking on
      // exactly the traffic that least wants reliability).
      const liveDc = pc.createDataChannel('fabric-live', {
        ordered: false,
        maxRetransmits: 0
      });
      peer.liveDc = liveDc;
      this.wireDataChannel(peer, liveDc, false);

      // Create and send offer. createOffer() resolves to a plain
      // RTCSessionDescriptionInit in spec-compliant browsers, so the
      // result is sent as-is (normalized) — no .toJSON() anywhere.
      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer).then(() => offer);
      }).then((offer) => {
        const init = toSdpInit(offer) ?? toSdpInit(pc.localDescription);
        if (init) {
          this.signalOffer(peerId, init);
        }
      }).catch(error => {
        console.warn('[WebRTCManager] Failed to create offer:', error);
      });
    }

    this.peers.set(peerId, peer);
    return peer;
  }

  /**
   * Wire up data channel event handlers. Both lanes deliver into
   * the same notifyMessage path — lane choice is a send-side
   * property only. Only the CONTROL channel drives peer.ready
   * (presence): the live lane opening or closing must never flap
   * the room's peer count.
   */
  /**
   * Hotfix 2.0: keep a peer's down-clocks honest after any channel
   * state change. A path that is open clears its clock; a path that
   * just went down starts its clock NOW (a path already down keeps
   * its original moment — the grace measures the whole outage, not
   * the latest flap).
   */
  private refreshDownState(peer: Peer): void {
    const now = Date.now();
    const anyOpen =
      peer.liveDc?.readyState === 'open' || peer.dc?.readyState === 'open';
    if (anyOpen) {
      peer.anyDownSince = null;
    } else if (peer.anyDownSince === null) {
      peer.anyDownSince = now;
    }
    const controlOpen = peer.dc?.readyState === 'open';
    if (controlOpen) {
      peer.controlDownSince = null;
    } else if (peer.controlDownSince === null) {
      peer.controlDownSince = now;
    }
  }

  private wireDataChannel(peer: Peer, channel: RTCDataChannel, isControl: boolean): void {
    channel.onopen = () => {
      if (isControl) {
        peer.ready = true;
      }
      this.refreshDownState(peer);
      console.log(`[WebRTCManager] Data channel '${channel.label}' open with ${peer.id}`);
    };

    channel.onclose = () => {
      if (isControl) {
        peer.ready = false;
      }
      this.refreshDownState(peer);
      console.log(`[WebRTCManager] Data channel '${channel.label}' closed with ${peer.id}`);
    };

    channel.onmessage = (event) => {
      let data: unknown = event.data;
      try {
        data = JSON.parse(event.data);
      } catch {
        // Keep raw data
      }
      this.notifyMessage(data, peer.id);
    };

    channel.onerror = () => {
      console.warn(`[WebRTCManager] Data channel '${channel.label}' error with ${peer.id}`);
    };
  }

  /**
   * Handle incoming offer. Accepts any SDP-shaped payload; the plain
   * init object is handed to setRemoteDescription directly (the
   * RTCSessionDescription constructor is deprecated and unnecessary).
   */
  private async handleOffer(from: string, rawSdp: unknown): Promise<void> {
    const sdp = toSdpInit(rawSdp);
    if (!sdp) {
      console.warn('[WebRTCManager] Dropping offer with malformed SDP from', from);
      return;
    }

    try {
      let peer = this.peers.get(from);
      if (!peer) {
        peer = this.createPeer(from, false);
      }

      await peer.pc.setRemoteDescription(sdp);
      await this.flushIce(peer);

      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);

      // `answer` is a plain RTCSessionDescriptionInit in Firefox and an
      // RTCSessionDescription in Chrome; normalize instead of .toJSON().
      const init = toSdpInit(answer) ?? toSdpInit(peer.pc.localDescription);
      if (init) {
        this.signalAnswer(from, init);
      }
    } catch (error) {
      console.warn('[WebRTCManager] Failed to handle offer:', error);
    }
  }

  /**
   * Handle incoming answer
   */
  private async handleAnswer(from: string, rawSdp: unknown): Promise<void> {
    const sdp = toSdpInit(rawSdp);
    if (!sdp) {
      console.warn('[WebRTCManager] Dropping answer with malformed SDP from', from);
      return;
    }

    const peer = this.peers.get(from);
    if (!peer) return;

    try {
      await peer.pc.setRemoteDescription(sdp);
      await this.flushIce(peer);
    } catch (error) {
      console.warn('[WebRTCManager] Failed to handle answer:', error);
    }
  }

  /**
   * Handle incoming ICE candidate. Candidates that arrive before the
   * peer's remote description exists are queued per peer and flushed,
   * in order, once setRemoteDescription succeeds — addIceCandidate
   * before that point throws InvalidStateError.
   */
  private async handleIceCandidate(from: string, rawCandidate: unknown): Promise<void> {
    const candidate = toCandidateInit(rawCandidate);
    if (!candidate) return;

    const peer = this.peers.get(from);
    if (!peer) {
      // Negotiation for this peer hasn't started yet on our side;
      // buffer the candidate and hand it to createPeer later.
      const buffered = this.earlyIce.get(from) ?? [];
      buffered.push(candidate);
      this.earlyIce.set(from, buffered);
      return;
    }

    if (!peer.pc.remoteDescription) {
      peer.pendingIce.push(candidate);
      return;
    }

    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (error) {
      console.warn('[WebRTCManager] Failed to add ICE candidate:', error);
    }
  }

  /**
   * Apply a peer's queued ICE candidates, in arrival order.
   */
  private async flushIce(peer: Peer): Promise<void> {
    const queued = peer.pendingIce.splice(0, peer.pendingIce.length);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn('[WebRTCManager] Failed to add queued ICE candidate:', error);
      }
    }
  }

  /**
   * Remove a peer
   */
  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        peer.dc?.close();
      } catch {}
      try {
        peer.liveDc?.close();
      } catch {}
      try {
        peer.pc.close();
      } catch {}
      this.peers.delete(peerId);
    }
    this.earlyIce.delete(peerId);
  }

  /**
   * Notify message handlers. Each handler is isolated: a throwing
   * consumer can neither break the other handlers nor propagate back
   * into the transport (and from there toward rendering code).
   */
  private notifyMessage(data: unknown, from: string): void {
    this.messageHandlers.forEach(handler => {
      try {
        handler(data, from);
      } catch (error) {
        console.warn('[WebRTCManager] Message handler error (isolated):', error);
      }
    });
  }

  /**
   * Re-announce presence on all local transports (wired to the
   * 'fabric:webrtc-reannounce' window event by useWebRTC; the event was
   * previously dispatched by the UI with no listener).
   */
  reannounce(): void {
    if (this.signaling && this.signaling.isConnected()) {
      this.signaling.joinRoom(this.roomId, this.peerId);
    }
    this.postFallback({ type: 'hello', from: this.peerId });
  }

  /**
   * Hotfix 2.0: every remote peer we know of — live Peer objects
   * plus members only the signaling room has named.
   */
  private knownRemoteIds(): Set<string> {
    const ids = new Set<string>(this.signalingPeerSince.keys());
    this.peers.forEach((_, id) => ids.add(id));
    return ids;
  }

  /** Is this peer's path for `lane` served by an open data channel? */
  private servedByDc(peerId: string, lane: 'live' | 'control'): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    if (lane === 'live') {
      return (
        peer.liveDc?.readyState === 'open' || peer.dc?.readyState === 'open'
      );
    }
    return peer.ready && peer.dc?.readyState === 'open';
  }

  /**
   * When did this peer's path for `lane` go down? A number is a
   * Date.now() moment; null means the path is currently UP (a live
   * Peer's clock); undefined means we have never heard of the peer
   * (no clock, never relay-eligible). A signaling-only peer's clock
   * is its first-heard moment: no channel to us has ever opened, so
   * its whole acquaintance is the outage.
   */
  private downSinceFor(
    peerId: string,
    lane: 'live' | 'control'
  ): number | null | undefined {
    const peer = this.peers.get(peerId);
    if (peer) {
      return lane === 'live' ? peer.anyDownSince : peer.controlDownSince;
    }
    return this.signalingPeerSince.get(peerId);
  }

  /** Has the path been down long enough for the relay to take over? */
  private relayEligible(peerId: string, lane: 'live' | 'control'): boolean {
    const since = this.downSinceFor(peerId, lane);
    if (typeof since !== 'number') return false;
    return Date.now() - since >= RELAY_GRACE_MS;
  }

  /**
   * One relay attempt for one peer, through the signaling socket.
   * Never throws, never queues: if the socket is down the message
   * drops, exactly as a data-channel send to a closed channel did.
   * Addressed to this peer only (the `to` narrowing) so a peer with
   * an open channel never receives the same envelope twice.
   */
  private tryRelay(peerId: string, message: string): void {
    if (!this.signaling || !this.signaling.isConnected()) return;
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch {
      return; // The relay carries JSON envelopes only.
    }
    try {
      this.signaling.sendRelay(this.roomId, this.peerId, peerId, payload);
    } catch (error) {
      console.warn(`[WebRTCManager] Relay send to ${peerId} failed:`, error);
    }
  }

  /**
   * Is the signaling socket up, with at least one known room member
   * on it? When true, interaction sends route through this manager
   * even with zero open data channels (the relay may be carrying
   * them), and relayed frames may arrive at any moment.
   */
  hasSignalingPeers(): boolean {
    return (
      !!this.signaling &&
      this.signaling.isConnected() &&
      this.knownRemoteIds().size > 0
    );
  }

  /**
   * The room's current interaction path, for the ?diag=1 panel:
   * 'p2p' when peers are served by data channels, 'relay' when the
   * signaling relay carries the peers the channels can't reach,
   * 'p2p+relay' for a mixed room, '—' when nobody is reachable by
   * either path right now.
   */
  getTransportPath(): TransportPath {
    let dc = 0;
    let relay = 0;
    this.knownRemoteIds().forEach(peerId => {
      if (this.servedByDc(peerId, 'live')) {
        dc += 1;
      } else if (this.relayEligible(peerId, 'live')) {
        relay += 1;
      }
    });
    if (dc > 0 && relay > 0) return 'p2p+relay';
    if (dc > 0) return 'p2p';
    if (relay > 0) return 'relay';
    return '—';
  }

  /**
   * Send a message to all connected peers (control lane). Hotfix
   * 2.0: a peer whose control channel is down past the relay grace
   * window receives the message through the signaling relay
   * instead; a peer inside the window drops it, exactly as before.
   */
  send(data: unknown): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.knownRemoteIds().forEach(peerId => {
      const peer = this.peers.get(peerId);
      if (peer && peer.ready && peer.dc?.readyState === 'open') {
        try {
          peer.dc.send(message);
        } catch (error) {
          console.warn(`[WebRTCManager] Failed to send to ${peerId}:`, error);
        }
        return;
      }
      if (this.relayEligible(peerId, 'control')) {
        this.tryRelay(peerId, message);
      }
    });
  }

  /**
   * Hotfix 1.9: send on the LIVE lane (stroke points). Uses the
   * unordered/no-retransmit channel when it is open; falls back to
   * the control channel when the peer has no live lane (older
   * clients) so strokes still flow; drops silently when neither is
   * open — stroke points are ephemeral and are NEVER queued behind
   * a connection attempt (a queue would deliver a stale scribble
   * seconds late, worse than a gap the sim smooths over).
   *
   * Hotfix 2.0: "neither is open" now has one exception — when the
   * outage has outlived the relay grace window, the batch rides
   * the signaling relay to that peer instead of dropping. Still
   * never queued: it leaves NOW, over whichever path is up, or not
   * at all.
   */
  sendLive(data: unknown): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.knownRemoteIds().forEach(peerId => {
      const peer = this.peers.get(peerId);
      const live = peer?.liveDc?.readyState === 'open' ? peer.liveDc : null;
      const dc =
        live ??
        (peer && peer.ready && peer.dc?.readyState === 'open' ? peer.dc : null);
      if (dc) {
        try {
          dc.send(message);
        } catch (error) {
          console.warn(`[WebRTCManager] Failed live send to ${peerId}:`, error);
        }
        return;
      }
      if (this.relayEligible(peerId, 'live')) {
        this.tryRelay(peerId, message);
      }
    });
  }

  /**
   * Send a message to a specific peer (control lane, with the same
   * Hotfix 2.0 relay fallback as send()).
   */
  sendTo(peerId: string, data: unknown): void {
    const peer = this.peers.get(peerId);
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    if (peer && peer.ready && peer.dc?.readyState === 'open') {
      try {
        peer.dc.send(message);
      } catch (error) {
        console.warn(`[WebRTCManager] Failed to send to ${peerId}:`, error);
      }
      return;
    }
    if (this.relayEligible(peerId, 'control')) {
      this.tryRelay(peerId, message);
    }
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Get list of connected peer IDs
   */
  getPeerIds(): string[] {
    return Array.from(this.peers.values())
      .filter(peer => peer.ready)
      .map(peer => peer.id);
  }

  /**
   * Get number of connected peers
   */
  getPeerCount(): number {
    return Array.from(this.peers.values()).filter(peer => peer.ready).length;
  }

  /**
   * Check if any peers are connected
   */
  isActive(): boolean {
    return this.getPeerCount() > 0;
  }

  /**
   * Cleanup and disconnect
   */
  destroy(): void {
    if (activeManager === this) {
      activeManager = null;
    }
    this.signalingPeerSince.clear();

    // Leave room if using signaling
    if (this.signaling && this.signaling.isConnected()) {
      this.signaling.leaveRoom(this.roomId, this.peerId);
    }

    // Say goodbye on the local transport so other tabs drop us at once
    this.postFallback({ type: 'bye', from: this.peerId });

    // Unsubscribe from signaling
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }
    if (this.unsubscribeSignalingState) {
      this.unsubscribeSignalingState();
      this.unsubscribeSignalingState = null;
    }

    // Close all peer connections
    this.peers.forEach(peer => {
      try {
        peer.dc?.close();
      } catch {}
      try {
        peer.liveDc?.close();
      } catch {}
      try {
        peer.pc.close();
      } catch {}
    });
    this.peers.clear();
    this.earlyIce.clear();

    // Close fallback channel
    if (this.fallbackChannel) {
      this.fallbackChannel.close();
      this.fallbackChannel = null;
    }
  }
}
