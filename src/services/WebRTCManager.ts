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

  constructor(roomId: string, peerId: string, signaling: SignalingService | null = null) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.signaling = signaling;

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

  private handleSignalingMessage(message: SignalingMessage): void {
    if (!message || message.roomId !== this.roomId) return;

    switch (message.type) {
      case 'peer-joined':
        if (message.peerId !== this.peerId) {
          // We initiate connection to the new peer
          this.createPeer(message.peerId, true);
        }
        break;

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
          this.removePeer(message.peerId);
        }
        break;

      case 'presence':
        // Handle initial peer list
        if (!Array.isArray(message.peers)) return;
        message.peers.forEach(otherId => {
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

    const peer: Peer = {
      id: peerId,
      pc,
      dc: null,
      liveDc: null,
      ready: false,
      pendingIce: this.earlyIce.get(peerId) ?? [],
    };
    this.earlyIce.delete(peerId);

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
  private wireDataChannel(peer: Peer, channel: RTCDataChannel, isControl: boolean): void {
    channel.onopen = () => {
      if (isControl) {
        peer.ready = true;
      }
      console.log(`[WebRTCManager] Data channel '${channel.label}' open with ${peer.id}`);
    };

    channel.onclose = () => {
      if (isControl) {
        peer.ready = false;
      }
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
   * Send a message to all connected peers
   */
  send(data: unknown): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.peers.forEach(peer => {
      if (peer.ready && peer.dc?.readyState === 'open') {
        try {
          peer.dc.send(message);
        } catch (error) {
          console.warn(`[WebRTCManager] Failed to send to ${peer.id}:`, error);
        }
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
   */
  sendLive(data: unknown): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.peers.forEach(peer => {
      const live = peer.liveDc?.readyState === 'open' ? peer.liveDc : null;
      const dc = live ?? (peer.ready && peer.dc?.readyState === 'open' ? peer.dc : null);
      if (!dc) return;
      try {
        dc.send(message);
      } catch (error) {
        console.warn(`[WebRTCManager] Failed live send to ${peer.id}:`, error);
      }
    });
  }

  /**
   * Send a message to a specific peer
   */
  sendTo(peerId: string, data: unknown): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.ready && peer.dc?.readyState === 'open') {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      try {
        peer.dc.send(message);
      } catch (error) {
        console.warn(`[WebRTCManager] Failed to send to ${peerId}:`, error);
      }
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
