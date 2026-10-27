import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluidInteraction } from "../types/fluid";
import { useWebRTC } from "./useWebRTC";
import { noteBus } from "../../shared/utils/noteBus";
import { setRealtimeStatus } from "../../shared/utils/realtimeStatus";
import {
  getHostIntent,
  setSessionPublicState,
  subscribeHostIntent,
  type HostIntent,
  type SessionMode,
} from "../session/sessionStore";
import {
  ensureLocalIdentity,
  notePeerHue,
  prunePeerIdentities,
  setPeerIdentity,
  subscribeIdentity,
  type ParticipantIdentity,
} from "../identity/identityStore";
import { getSignalingService } from "../services/SignalingService";
import { StrokeBatcher, type StrokePoint } from "../services/strokeBatch";

type TransportMsg =
  | { type: "fluid-interaction"; data: FluidInteraction }
  // Hotfix 1.9: a coalesced run of stroke points from ONE sender
  // (see src/services/strokeBatch.ts). Sender identity (from, hue)
  // rides once on the envelope — every point in the batch is that
  // sender's, so Slice 6 attribution survives batching intact.
  // Additive: older clients ignore the unknown type. A lone point
  // never uses this envelope (it rides fluid-interaction), so slow
  // drawing stays fully visible to older clients; only fast-stroke
  // runs — the case this fixes — use the batch form.
  | {
      type: "fluid-batch";
      from: string;
      hue?: number;
      points: StrokePoint[];
    }
  | { type: "fabric-ping"; seq: number; t: number; from?: string }
  | { type: "fabric-pong"; seq: number; t: number; from?: string }
  // Slice 5 session control plane. Session state rides the SAME
  // transports as interactions (WebRTC data channels, or the
  // BroadcastChannel fallback) — the signaling channel stays pure
  // SDP/presence, so mode changes need no relay support.
  | {
      type: "session-announce";
      from: string;
      mode: SessionMode;
      hostId: string;
      driverId: string | null;
      /** When the host's claim began — seniority if two hosts race. */
      since: number;
    }
  | { type: "session-request"; from?: string }
  | { type: "session-clear"; from: string; hostId: string }
  // Slice 6 identity cards ("Who's Who"). A participant announces
  // the public face of their LifePacket v0 — name + signature hue;
  // the seed never leaves the device. Announced on arrival, in reply
  // to a peer-request, on edit, and on a slow heartbeat while peers
  // are present. Additive: older clients ignore unknown types.
  | { type: "peer-announce"; from: string; name: string; hue: number }
  | { type: "peer-request"; from?: string }
  // Hotfix 1.7: discrete musical notes. Fluid interactions carry
  // splats, not pitch — a peer's piano note arrived as colored
  // streams but never SOUNDED on the receiving client. A note is
  // two tiny messages total (on, then off), not a stream: MIDI-
  // sized, as the medium deserves. Older clients ignore the types.
  | { type: "note-on"; from: string; note: string; velocity: number }
  | { type: "note-off"; from: string; note: string };

/** How long a BroadcastChannel peer counts as present after last contact. */
const BC_PEER_TTL_MS = 6000;

/**
 * Hotfix 1.9: receive-buffer flush cadence. Inbound interactions
 * collect in a ref and enter React state at most this often, so a
 * fast remote stroke costs ~1 render per window instead of one per
 * point. 16ms ≈ one display frame — no visible delay is added
 * beyond the frame the render loop would take anyway.
 */
const REMOTE_FLUSH_MS = 16;

/** Virtual agent peers (the Slice 2 ghost, "ghost:<ownerId>") ride a
 * human's connection — they are never human presence. */
const isGhostId = (id: string) => id.startsWith("ghost:");

/**
 * Slice 5: how long a guest keeps treating a silent host as live.
 * Hosts re-announce every SESSION_ANNOUNCE_MS, so ~4 missed beats
 * means the host is gone and the room degrades to open collab.
 */
const SESSION_HOST_TTL_MS = 12000;
const SESSION_ANNOUNCE_MS = 3000;

/** A host claim held by THIS client (set from menu host intent). */
type HostClaim = {
  mode: SessionMode;
  driverId: string | null;
  since: number;
};

/** A session announced by another client in this room. */
type RemoteSession = {
  mode: SessionMode;
  hostId: string;
  driverId: string | null;
  since: number;
};

/**
 * THE ENFORCEMENT RULE (Slice 5). Session modes are not UI cosmetics:
 * sendInteraction consults this before anything reaches a transport.
 * - open room (no host): everyone sends (the original collab).
 * - collab: everyone sends.
 * - control: only the current driver sends; everyone else is mirror.
 * - mirror / view: only the host sends. A guest's interactions stay
 *   on their own device (mirror renders them locally via the engine;
 *   view disables the input outright — see LegacyFluidEngine).
 */
function computeCanSend(
  mode: SessionMode,
  hostId: string | null,
  driverId: string | null,
  selfId: string
): boolean {
  if (!hostId) return true;
  if (mode === "collab") return true;
  if (mode === "control") return driverId === selfId;
  return hostId === selfId;
}

export function useFluidMultiUser(roomId: string) {
  const [remoteInteractions, setRemote] = useState<FluidInteraction[]>([]);
  const userId = useMemo(() => `user-${Math.random().toString(36).slice(2, 8)}`, []);
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Try WebRTC first
  const webrtc = useWebRTC(roomId);

  // Latency measurement
  const pingSeqRef = useRef(0);
  const pendingRef = useRef<Map<number, number>>(new Map());
  const pingTimerRef = useRef<number | null>(null);
  const avgLatencyRef = useRef<number | undefined>(undefined);

  // BroadcastChannel presence (local mode): last-seen timestamp per
  // remote HUMAN userId, learned from interactions and ping/pong senders.
  // Lets the status layer report honest peer counts in local mode
  // instead of a permanent (and alarming) zero. This map is the single
  // presence source for BOTH consumers:
  //   - the shared realtime status (peers / peerIds, via freshBcPeers), and
  //   - the reactive bcPeerIds/humanPeers pair the ghost's solo-fade rule
  //     reads (a ghost fades when a HUMAN arrives; ghost ids are filtered
  //     out in noteBcPeer, so a visiting ghost never counts).
  const bcPeersRef = useRef<Map<string, number>>(new Map());
  const [bcPeerIds, setBcPeerIds] = useState<string[]>([]);

  // Slice 6 identity: this client's participant identity (loaded
  // async from the identity store) and the announce trigger. The ref
  // indirection is the same late-binding pattern as postRef below —
  // callbacks defined earlier in this hook must be able to announce
  // before the announce function itself is defined.
  const identityRef = useRef<ParticipantIdentity | null>(null);
  const announceIdentityRef = useRef<() => void>(() => {});

  // Slice 5 session state. Despite the legacy name, bcPeersRef is fed
  // from EVERY transport's messages (see noteBcPeer calls in
  // handleTransportMsg), so it doubles as the room's known-human set
  // — the pass-control list reads it via knownPeerIds.
  const [knownPeerIds, setKnownPeerIds] = useState<string[]>([]);
  const [hostClaim, setHostClaim] = useState<HostClaim | null>(null);
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null);
  const hostClaimRef = useRef<HostClaim | null>(null);
  hostClaimRef.current = hostClaim;
  /** Room the current claim belongs to (seniority is per-room). */
  const claimRoomRef = useRef<string | null>(null);
  const remoteSessionRef = useRef<RemoteSession | null>(null);
  remoteSessionRef.current = remoteSession;
  /** Last time the current remote host was heard from (liveness). */
  const remoteSeenRef = useRef(0);

  const noteBcPeer = useCallback((id: unknown) => {
    if (typeof id !== "string" || !id || id === userId) return;
    if (isGhostId(id)) return;
    const isNew = !bcPeersRef.current.has(id);
    bcPeersRef.current.set(id, Date.now());
    if (isNew) {
      const ids = Array.from(bcPeersRef.current.keys());
      setBcPeerIds(ids);
      setKnownPeerIds(ids);
      // Slice 6: a face we haven't seen needs our identity card
      // without waiting for their request or the heartbeat — names
      // and colors land with the first strokes, not seconds later.
      announceIdentityRef.current();
    }
  }, [userId]);

  const freshBcPeers = useCallback((): { count: number; ids: string[] } => {
    const now = Date.now();
    const ids: string[] = [];
    bcPeersRef.current.forEach((seenAt, id) => {
      if (now - seenAt <= BC_PEER_TTL_MS) {
        ids.push(id);
      } else {
        bcPeersRef.current.delete(id);
      }
    });
    return { count: ids.length, ids };
  }, []);

  // Human presence for the active transport. WebRTC counts connections
  // (humans only — ghosts ride an owner's connection, never their own);
  // BroadcastChannel uses the tracked human peer set above.
  const humanPeers = webrtc.active ? webrtc.peersCount : bcPeerIds.length;

  // The effective session from this client's chair: my own claim wins
  // (I am the host), else a live remote host's announced session, else
  // the room is open. canSend / inputEnabled are the enforcement
  // outputs — sendInteraction and LegacyFluid read them, never raw
  // mode, so the rule lives in exactly one place (computeCanSend).
  const session = useMemo(() => {
    if (hostClaim) {
      const driverId = hostClaim.driverId ?? userId;
      return {
        role: "host" as const,
        mode: hostClaim.mode,
        hostId: userId as string | null,
        driverId: hostClaim.mode === "control" ? driverId : null,
        canSend: computeCanSend(hostClaim.mode, userId, driverId, userId),
        inputEnabled: true, // the host's own input is never disabled
      };
    }
    if (remoteSession) {
      const driverId = remoteSession.driverId ?? remoteSession.hostId;
      return {
        role: "guest" as const,
        mode: remoteSession.mode,
        hostId: remoteSession.hostId as string | null,
        driverId: remoteSession.mode === "control" ? driverId : null,
        canSend: computeCanSend(
          remoteSession.mode,
          remoteSession.hostId,
          driverId,
          userId
        ),
        // View-only guests lose canvas input outright (audience
        // mode); every other guest keeps local input — in mirror it
        // simply never leaves the device, because canSend is false.
        inputEnabled: remoteSession.mode !== "view",
      };
    }
    return {
      role: "open" as const,
      mode: "collab" as SessionMode,
      hostId: null as string | null,
      driverId: null as string | null,
      canSend: true,
      inputEnabled: true,
    };
  }, [hostClaim, remoteSession, userId]);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Expire silent BroadcastChannel peers so presence stays honest, and
  // reflect the pruned set in the reactive peer list.
  useEffect(() => {
    const id = window.setInterval(() => {
      const { ids } = freshBcPeers();
      setBcPeerIds((prev) =>
        prev.length === ids.length && prev.every((p, i) => p === ids[i]) ? prev : ids
      );
      setKnownPeerIds((prev) =>
        prev.length === ids.length && prev.every((p, i) => p === ids[i]) ? prev : ids
      );
      // Slice 6: learned identities expire with presence (the store
      // applies its own grace TTL for the WebRTC transport flip).
      prunePeerIdentities(ids);
      // Slice 5: a host that stopped announcing is gone — degrade
      // the room to open collab rather than enforcing a dead session.
      if (
        remoteSessionRef.current &&
        Date.now() - remoteSeenRef.current > SESSION_HOST_TTL_MS
      ) {
        setRemoteSession(null);
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [freshBcPeers]);

  const updateStatus = useCallback(
    (latency?: number) => {
      const bc = freshBcPeers();
      setRealtimeStatus({
        transport: webrtc.active ? "webrtc" : "broadcast",
        peers: webrtc.active ? webrtc.peersCount : bc.count,
        latencyMs: latency ?? avgLatencyRef.current,
        peerIds: webrtc.active ? webrtc.peerIds : bc.ids,
        // 'online' | 'local' | 'connecting' from the signaling layer.
        // Local is a designed mode, not an error (Hotfix 1.1).
        mode: webrtc.connectionState,
      });
    },
    [webrtc.active, webrtc.peersCount, webrtc.peerIds, webrtc.connectionState, freshBcPeers]
  );

  const updateStatusRef = useRef(updateStatus);
  updateStatusRef.current = updateStatus;

  // Keep the shared realtime status fresh as human peers come and go
  // (arrivals and TTL expiries don't otherwise touch the status layer).
  useEffect(() => {
    updateStatusRef.current();
  }, [humanPeers, bcPeerIds]);

  const postViaCurrent = useCallback(
    (msg: TransportMsg, lane: "control" | "live" = "control") => {
      // Never throw: this runs synchronously inside the fluid engine's
      // pointer-event chain (engine.onLocalInteraction -> sendInteraction),
      // so a transport failure must not be able to break local input.
      // Hotfix 1.9: stroke traffic (fluid-interaction, fluid-batch)
      // rides the LIVE lane — unordered, no retransmits — when the
      // caller says so; everything else (session, identity, notes,
      // ping) stays on the reliable ordered control lane. The
      // BroadcastChannel fallback carries either, unchanged.
      try {
        if (webrtc.active) {
          if (lane === "live") {
            webrtc.sendLive(msg);
          } else {
            webrtc.send(msg);
          }
        } else if (bcRef.current) {
          bcRef.current.postMessage(msg);
        }
      } catch (error) {
        console.warn("[useFluidMultiUser] Transport send failed (dropped):", error);
      }
    },
    [webrtc]
  );

  const postRef = useRef(postViaCurrent);
  postRef.current = postViaCurrent;

  // Slice 6: announce this client's identity card (name + hue) to
  // the room. No-op until the identity has loaded; the public face
  // only — the seed never leaves the device.
  const announceIdentity = useCallback(() => {
    const id = identityRef.current;
    if (!id) return;
    postRef.current({
      type: "peer-announce",
      from: userId,
      name: id.name,
      hue: id.hue,
    });
  }, [userId]);
  announceIdentityRef.current = announceIdentity;

  // Load the local identity once, keep the ref current, and
  // re-announce immediately when the user edits their name or hue
  // in the menu — the room sees the new face with the next stroke.
  useEffect(() => {
    void ensureLocalIdentity().then((id) => {
      identityRef.current = id;
      // Peers who arrived before the identity finished loading
      // still get the card now, not at the next heartbeat.
      if (bcPeersRef.current.size > 0) announceIdentityRef.current();
    });
    return subscribeIdentity((snap) => {
      const prev = identityRef.current;
      identityRef.current = snap.self;
      if (
        snap.self &&
        prev &&
        (prev.name !== snap.self.name || prev.hue !== snap.self.hue)
      ) {
        announceIdentityRef.current();
      }
    });
  }, []);

  // Identity heartbeat: while anyone is here, re-announce on a slow
  // cadence so a missed card (a dropped first message, a peer whose
  // request raced our load) always heals. Steady-state is polite —
  // the fast paths (arrival, request, edit) carry the experience.
  const anyoneHere = humanPeers > 0;
  useEffect(() => {
    if (!anyoneHere) return;
    announceIdentity();
    const id = window.setInterval(announceIdentity, 10_000);
    return () => window.clearInterval(id);
  }, [anyoneHere, announceIdentity]);

  /** Announce this client's host claim to the room (no-op if not hosting). */
  const announceClaim = useCallback(() => {
    const claim = hostClaimRef.current;
    if (!claim) return;
    postRef.current({
      type: "session-announce",
      from: userId,
      mode: claim.mode,
      hostId: userId,
      driverId: claim.driverId ?? userId,
      since: claim.since,
    });
  }, [userId]);
  const announceRef = useRef(announceClaim);
  announceRef.current = announceClaim;

  // Single entry point for accepting a remote interaction, used by every
  // transport AND by local injectors (see injectRemoteInteraction below),
  // so rendering, dedupe and pruning behave identically for all sources.
  //
  // Hotfix 1.9 (receive path): arrivals no longer setState one by
  // one. The old shape — one setRemote per message, plus one
  // setTimeout per message whose prune filter removed EVERY entry
  // sharing that millisecond timestamp — meant a fast remote stroke
  // re-rendered the canvas component per point (~60-120/sec),
  // registered ~120 timers/sec, and could silently eat a second
  // finger's same-ms points at prune time. Now arrivals collect in
  // a ref buffer and flush into state at most once per
  // REMOTE_FLUSH_MS; pruning happens once per flush, by age, inside
  // the same state update. State still accumulates a ~1s window
  // (consumers dedupe by (userId, seq ?? timestamp)), so every
  // consumer's contract is unchanged — only the churn is gone.
  const pendingRemoteRef = useRef<FluidInteraction[]>([]);
  const remoteFlushTimerRef = useRef<number | null>(null);
  const flushRemote = useCallback(() => {
    remoteFlushTimerRef.current = null;
    const pending = pendingRemoteRef.current;
    if (pending.length === 0) return;
    pendingRemoteRef.current = [];
    const cutoff = Date.now() - 1000;
    setRemote((prev) => {
      const kept = prev.filter((i) => i.timestamp >= cutoff);
      return [...kept, ...pending];
    });
  }, []);
  const flushRemoteRef = useRef(flushRemote);
  flushRemoteRef.current = flushRemote;

  const acceptRemote = useCallback(
    (data: FluidInteraction) => {
      if (data.userId === userId) return;
      pendingRemoteRef.current.push(data);
      if (remoteFlushTimerRef.current === null) {
        remoteFlushTimerRef.current = window.setTimeout(
          flushRemoteRef.current,
          REMOTE_FLUSH_MS
        ) as unknown as number;
      }
    },
    [userId]
  );

  // Shared inbound payload handling for both transports. Validates the
  // payload shape before touching it and is fully guarded by callers.
  const handleTransportMsg = useCallback(
    (msg: TransportMsg, reply: (m: TransportMsg) => void) => {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "fluid-interaction") {
        const data = msg.data;
        if (!data || typeof data.userId !== "string") return;
        noteBcPeer(data.userId);
        // Slice 6: an interaction's hue stamp teaches the sender's
        // color (and sound pitch) even before their card arrives.
        if (typeof data.hue === "number") notePeerHue(data.userId, data.hue);
        acceptRemote(data);
      } else if (msg.type === "fluid-batch") {
        // Hotfix 1.9: a coalesced stroke run from one sender.
        // Validate the envelope and every point before expanding —
        // a malformed batch is dropped whole, never half-applied.
        // Expansion feeds the SAME acceptRemote path as single
        // interactions, so rendering, dedupe, ghost-brain feed and
        // ambient yield behave identically per point.
        if (typeof msg.from !== "string" || msg.from === userId) return;
        if (!Array.isArray(msg.points) || msg.points.length === 0) return;
        if (msg.points.length > 64) return;
        const hue = typeof msg.hue === "number" ? msg.hue : undefined;
        const points: FluidInteraction[] = [];
        for (const p of msg.points) {
          if (
            !p ||
            typeof p !== "object" ||
            typeof p.position?.x !== "number" ||
            typeof p.position?.y !== "number" ||
            typeof p.force?.x !== "number" ||
            typeof p.force?.y !== "number" ||
            typeof p.pressure !== "number" ||
            typeof p.timestamp !== "number" ||
            typeof p.seq !== "number"
          ) {
            return;
          }
          points.push({
            userId: msg.from,
            position: p.position,
            force: p.force,
            pressure: p.pressure,
            color: p.color,
            radiusScale: p.radiusScale,
            timestamp: p.timestamp,
            seq: p.seq,
            ...(hue !== undefined ? { hue } : {}),
          });
        }
        noteBcPeer(msg.from);
        if (hue !== undefined) notePeerHue(msg.from, hue);
        points.forEach((data) => acceptRemote(data));
      } else if (msg.type === "peer-announce") {
        // Slice 6: a participant's identity card. Validate before
        // learning — a malformed card is dropped like any bad payload.
        if (typeof msg.from !== "string" || msg.from === userId) return;
        if (typeof msg.hue !== "number") return;
        noteBcPeer(msg.from);
        setPeerIdentity(msg.from, {
          name: typeof msg.name === "string" ? msg.name : "",
          hue: msg.hue,
        });
      } else if (msg.type === "peer-request") {
        // Slice 6: someone (usually a fresh joiner) asks who's who.
        // Everyone answers with their own card — cheap and complete.
        noteBcPeer(msg.from);
        announceIdentityRef.current();
      } else if (msg.type === "note-on" || msg.type === "note-off") {
        // Hotfix 1.7: a peer's piano note. Hand it to this client's
        // note pipeline as a REMOTE bus event: useToneSynth sounds
        // it through the shared synth (via useRemoteNotes), while
        // useVirtualNotes ignores remote events — the note is heard
        // here, never re-streamed into the fluid or re-broadcast.
        // Hearing is NOT gated by session mode; only sending is
        // (see sendNote) — a view-only guest still hears the host's
        // piano, exactly as they see the host's splats.
        if (typeof msg.from !== "string" || msg.from === userId) return;
        if (typeof msg.note !== "string" || !msg.note) return;
        noteBcPeer(msg.from);
        if (msg.type === "note-on") {
          const v =
            typeof msg.velocity === "number"
              ? Math.max(0.05, Math.min(1, msg.velocity))
              : 0.8;
          noteBus.emitRemoteNoteOn(msg.note, v);
        } else {
          noteBus.emitRemoteNoteOff(msg.note);
        }
      } else if (msg.type === "fabric-ping") {
        noteBcPeer(msg.from);
        const pong: TransportMsg = { type: "fabric-pong", seq: msg.seq, t: msg.t, from: userId };
        reply(pong);
      } else if (msg.type === "fabric-pong") {
        noteBcPeer(msg.from);
        const start = pendingRef.current.get(msg.seq);
        if (typeof start === "number") {
          pendingRef.current.delete(msg.seq);
          const rtt = performance.now() - start;
          avgLatencyRef.current =
            avgLatencyRef.current === undefined
              ? rtt
              : avgLatencyRef.current * 0.7 + rtt * 0.3;
          updateStatus(avgLatencyRef.current);
        }
      } else if (msg.type === "session-announce") {
        // Another client's host claim. Note the sender as a known
        // human either way — hosts are pass-control context too.
        noteBcPeer(msg.from);
        if (msg.from === userId || msg.hostId === userId) return;
        if (typeof msg.hostId !== "string" || typeof msg.since !== "number") return;
        const myClaim = hostClaimRef.current;
        if (myClaim) {
          // Two hosts in one room (e.g. the host opened a second
          // tab and claimed there too): the EARLIER claim is
          // senior. Yield to it; if mine is senior, ignore — my
          // heartbeat re-announce makes the other side yield.
          if (msg.since < myClaim.since) {
            setHostClaim(null);
            remoteSeenRef.current = Date.now();
            setRemoteSession({
              mode: msg.mode,
              hostId: msg.hostId,
              driverId: msg.driverId,
              since: msg.since,
            });
          }
          return;
        }
        const prev = remoteSessionRef.current;
        const prevFresh =
          prev !== null &&
          Date.now() - remoteSeenRef.current <= SESSION_HOST_TTL_MS;
        // A different, still-live host already runs this room —
        // first live host wins; interlopers don't flap the mode.
        if (prev && prev.hostId !== msg.hostId && prevFresh) return;
        remoteSeenRef.current = Date.now();
        if (
          !prev ||
          prev.hostId !== msg.hostId ||
          prev.mode !== msg.mode ||
          prev.driverId !== msg.driverId ||
          prev.since !== msg.since
        ) {
          setRemoteSession({
            mode: msg.mode,
            hostId: msg.hostId,
            driverId: msg.driverId,
            since: msg.since,
          });
        }
      } else if (msg.type === "session-request") {
        // A peer (usually a fresh joiner) asks who runs the room.
        // Only a host answers; the answer is just an announce.
        noteBcPeer(msg.from);
        if (hostClaimRef.current) announceRef.current();
      } else if (msg.type === "session-clear") {
        // The host resigned gracefully: degrade now instead of
        // waiting out the heartbeat TTL.
        if (remoteSessionRef.current?.hostId === msg.hostId) {
          setRemoteSession(null);
        }
      }
    },
    [userId, noteBcPeer, acceptRemote, updateStatus]
  );

  // Setup BroadcastChannel fallback only when WebRTC is not active
  useEffect(() => {
    if (webrtc.active) {
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      bcPeersRef.current.clear();
      setBcPeerIds([]);
      updateStatus();
      return;
    }
    if (!("BroadcastChannel" in window)) {
      updateStatus();
      return;
    }

    const bc = new BroadcastChannel(`fabric-fluid-${roomId}`);
    bc.onmessage = (ev: MessageEvent) => {
      // A malformed message is logged and dropped, never thrown: the
      // realtime layer must not be able to take the canvas down.
      try {
        handleTransportMsg(ev.data as TransportMsg, (m) => {
          try {
            bc.postMessage(m);
          } catch {
            // Channel raced closed; the reply is simply dropped.
          }
        });
      } catch (error) {
        console.warn("[useFluidMultiUser] Dropped malformed broadcast message:", error);
      }
    };
    bcRef.current = bc;
    updateStatus();

    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [roomId, userId, webrtc.active, updateStatus, handleTransportMsg]);

  // Wire WebRTC onMessage to interactions and ping/pong
  useEffect(() => {
    if (!webrtc.active) return;
    const off = webrtc.onMessage((payload) => {
      try {
        handleTransportMsg(payload as TransportMsg, (m) => webrtc.send(m));
      } catch (error) {
        console.warn("[useFluidMultiUser] Dropped malformed WebRTC message:", error);
      }
    });
    updateStatus();
    return off;
  }, [webrtc, userId, updateStatus, handleTransportMsg]);

  // Start/stop ping loop whenever transport availability changes
  useEffect(() => {
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    const canSend = webrtc.active || !!bcRef.current;
    if (!canSend) return;

    // Slice 6 join latency: the first ping used to wait out the
    // full 2s interval, so on the BroadcastChannel transport a fresh
    // tab was invisible to the room (no presence, no session/identity
    // discovery) until it drew or the first tick landed. Ping once
    // immediately, then on the steady 2s cadence as before.
    const sendPing = () => {
      const seq = ++pingSeqRef.current;
      const now = performance.now();
      pendingRef.current.set(seq, now);
      const ping: TransportMsg = { type: "fabric-ping", seq, t: now, from: userId };
      postViaCurrent(ping);
      window.setTimeout(() => pendingRef.current.delete(seq), 5000);
    };
    sendPing();
    pingTimerRef.current = window.setInterval(sendPing, 2000) as unknown as number;

    return () => {
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    };
  }, [webrtc.active, bcRef.current, postViaCurrent, userId]);

  // Slice 5: apply menu host intent to this room. Intent is store
  // state (not a fire-and-forget event), so a claim minted a moment
  // before the room switch is still honored when this hook (re)binds
  // to the new room — subscribeHostIntent fires immediately.
  useEffect(() => {
    // A new room is a new session: forget the old room's host.
    setRemoteSession(null);
    remoteSeenRef.current = 0;
    const applyIntent = (intent: HostIntent | null) => {
      if (!intent) {
        // Resigned while still in the room: tell guests now so they
        // degrade immediately instead of waiting out the TTL.
        if (hostClaimRef.current) {
          postRef.current({ type: "session-clear", from: userId, hostId: userId });
          setHostClaim(null);
          claimRoomRef.current = null;
        }
        return;
      }
      if (intent.roomId !== roomId) {
        // The claim belongs to another room (the mint flow switches
        // rooms right after recording intent). No session-clear is
        // sent to the room left behind: the transport has already
        // moved, and its guests degrade via the heartbeat TTL.
        if (hostClaimRef.current) setHostClaim(null);
        claimRoomRef.current = null;
        return;
      }
      setHostClaim((prev) => {
        // Seniority ("since") is per-room: a claim carried over from
        // another room starts fresh here, never with old seniority.
        const sameRoom = claimRoomRef.current === roomId;
        claimRoomRef.current = roomId;
        const next: HostClaim = {
          mode: intent.mode,
          driverId: intent.driverId,
          since: prev && sameRoom ? prev.since : Date.now(),
        };
        return prev && prev.mode === next.mode && prev.driverId === next.driverId
          ? prev
          : next;
      });
    };
    return subscribeHostIntent(applyIntent);
  }, [roomId, userId]);

  // Host heartbeat: announce on claim start, on every claim change
  // (mode switch, control pass), and every SESSION_ANNOUNCE_MS so
  // late joiners learn the mode and guests can tell a live host from
  // a dead one (SESSION_HOST_TTL_MS).
  useEffect(() => {
    if (!hostClaim) return;
    announceClaim();
    const id = window.setInterval(announceClaim, SESSION_ANNOUNCE_MS);
    return () => window.clearInterval(id);
  }, [hostClaim, announceClaim]);

  // Ask the room who hosts it whenever a transport path to peers
  // (re)appears — a host answers with an announce. The heartbeat
  // covers any race this misses within a few seconds.
  // Slice 6: the same moment asks who's who (peer-request) and
  // offers our own card (peer-announce), so names and hues resolve
  // in the same round trip as the session mode.
  const askedKeyRef = useRef("");
  useEffect(() => {
    if (humanPeers <= 0) return;
    const key = `${roomId}|${webrtc.active}|${humanPeers}`;
    if (askedKeyRef.current === key) return;
    askedKeyRef.current = key;
    postRef.current({ type: "session-request", from: userId });
    postRef.current({ type: "peer-request", from: userId });
    announceIdentityRef.current();
  }, [roomId, webrtc.active, humanPeers, userId]);

  // ---- Slice 7 (Alive): session resilience -------------------------
  // Two field failures from the 3-device test drive this block:
  // devices that needed a manual refresh to join the room, and an
  // iPhone that screen-locked and silently lost its session. iOS
  // freezes a locked page — timers stall, the socket dies or the
  // bounded reconnect budget burns down unobserved — so recovery
  // cannot rely on anything that runs while the page is away. It
  // has to happen on the way BACK in.

  /**
   * One discovery round: ask who hosts, ask who's who, offer our
   * identity card, and (if we host) re-state our session. All of it
   * is fire-and-forget over transports that may not be up yet — a
   * dropped round is healed by the next round, a heartbeat, or the
   * peer-arrival fast paths. Re-running a round is how a rejoined
   * device becomes fully itself again: same mode, same role, same
   * name and hue, no refresh.
   */
  const runAskRound = useCallback(() => {
    postRef.current({ type: "session-request", from: userId });
    postRef.current({ type: "peer-request", from: userId });
    announceIdentityRef.current();
    if (hostClaimRef.current) announceRef.current();
  }, [userId]);
  const askRoundRef = useRef(runAskRound);
  askRoundRef.current = runAskRound;

  /** Has this client heard ANY room life yet — a peer noted through
   * any transport, a remote host's session, or its own host claim? */
  const roomKnown = useCallback(
    () =>
      bcPeersRef.current.size > 0 ||
      remoteSessionRef.current !== null ||
      hostClaimRef.current !== null,
    []
  );

  // Join backoff: until the room answers, re-run the discovery round
  // on a short, bounded backoff — rounds at ~0s, 1.5s, 4.5s, 10.5s,
  // 22.5s, then stop. Each round is a handful of tiny messages, and
  // the standing heartbeats (host announce 3s, identity 10s while
  // peers are present, ping 2s) own steady state afterwards, so a
  // room full of late joiners cannot turn this into relay load. A
  // client alone in a room simply runs the schedule out — there was
  // nobody to discover, and nothing was owed.
  useEffect(() => {
    const delays = [0, 1500, 3000, 6000, 12000];
    const timers: number[] = [];
    let at = 0;
    delays.forEach((d) => {
      at += d;
      const id = window.setTimeout(() => {
        if (roomKnown()) return;
        askRoundRef.current();
      }, at);
      timers.push(id);
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [roomId, roomKnown]);

  // Return-from-background: the user unlocked the phone, switched
  // back to the tab, or the network returned. Three triggers, one
  // resume (debounced — a single return often fires all three):
  //  1. If signaling is not online, redial WITH a fresh retry
  //     budget (SignalingService.reconnect). When the socket
  //     reaches 'online' the WebRTC manager re-joins the room on
  //     its own via its state subscription, so transport presence
  //     heals without help from here.
  //  2. Re-announce transport presence regardless (the manager's
  //     'fabric:webrtc-reannounce' path: re-join + local hello).
  //     This also covers the socket that still READS 'online' but
  //     silently died while the page was frozen: the re-join makes
  //     the relay re-teach us presence, and if the socket truly is
  //     dead the failed send surfaces as a close and step 1's next
  //     trigger takes over.
  //  3. One discovery round, so session mode, host claim, and
  //     identity cards are re-stated now instead of at the next
  //     heartbeat.
  const lastResumeRef = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const resume = () => {
      const now = Date.now();
      if (now - lastResumeRef.current < 1000) return;
      lastResumeRef.current = now;
      try {
        const sig = getSignalingService();
        if (sig.getState() !== "online") {
          void sig.reconnect();
        }
      } catch {
        // No signaling in this runtime (local-only): the session
        // re-announce below still runs over local transports.
      }
      window.dispatchEvent(new Event("fabric:webrtc-reannounce"));
      askRoundRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") resume();
    };
    const onFocus = () => resume();
    const onOnline = () => resume();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Self-heal: menu intent says I host this room, but I hold no
  // claim and no live host exists (the corner case: I yielded to a
  // duplicate tab of myself that has since closed). Re-claim.
  useEffect(() => {
    const id = window.setInterval(() => {
      const intent = getHostIntent();
      if (
        intent &&
        intent.roomId === roomId &&
        !hostClaimRef.current &&
        !remoteSessionRef.current
      ) {
        claimRoomRef.current = roomId;
        setHostClaim({
          mode: intent.mode,
          driverId: intent.driverId,
          since: Date.now(),
        });
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [roomId]);

  // Publish the room's session truth for the chrome (menu, HUD chip,
  // connection badge, diagnostics) — presence is never guessed by UI.
  useEffect(() => {
    setSessionPublicState({
      roomId,
      selfId: userId,
      role: session.role,
      mode: session.mode,
      hostId: session.hostId,
      driverId: session.driverId,
      canSend: session.canSend,
      inputEnabled: session.inputEnabled,
      peers: humanPeers,
      online: webrtc.connectionState,
      guestIds: knownPeerIds,
    });
  }, [roomId, userId, session, humanPeers, webrtc.connectionState, knownPeerIds]);

  /**
   * Hotfix 1.7: send a discrete note on/off to the room (the send
   * half of the note pipeline — useMIDIFluid diffs its held-note set
   * and calls this on transitions). Gated by the SAME session rule
   * as interactions (sessionRef.canSend, from computeCanSend): a
   * mirror/view guest or a control-mode non-driver never puts notes
   * on the wire, exactly like their splats. Receiving is ungated —
   * see the note-on/note-off branch in handleTransportMsg.
   */
  const sendNote = useCallback(
    (note: string, velocity: number, phase: "on" | "off") => {
      if (!sessionRef.current.canSend) return;
      if (phase === "on") {
        postRef.current({ type: "note-on", from: userId, note, velocity });
      } else {
        postRef.current({ type: "note-off", from: userId, note });
      }
    },
    [userId]
  );

  // Hotfix 1.9: per-sender sequence + the stroke batcher. The
  // batcher holds ONLY local-human, verb-less stroke points (the
  // engine's per-frame input, via the { batch: true } opt-in) for a
  // ~30ms window (hard cap 50ms) and emits runs: a lone point rides
  // the classic envelope; 2+ ride fluid-batch with sender identity
  // on the envelope. Verbs, pattern steps, notes and ghost gestures
  // are events — they are never batched and never wait.
  const seqRef = useRef(0);
  const batcherRef = useRef<StrokeBatcher | null>(null);
  if (batcherRef.current === null) {
    batcherRef.current = new StrokeBatcher((points) => {
      // Re-check the session gate at flush time, not just at queue
      // time: if the room's mode changed inside the window, the
      // points must not leave — the gate is the contract.
      if (!sessionRef.current.canSend) return;
      // Attribution is read at emit: the hue cannot meaningfully
      // change inside a 30ms window, and an edit re-announces the
      // identity card anyway (Slice 6).
      const hue = identityRef.current?.hue;
      if (points.length === 1) {
        const p = points[0];
        postRef.current(
          {
            type: "fluid-interaction",
            data: {
              userId,
              position: p.position,
              force: p.force,
              pressure: p.pressure,
              color: p.color,
              radiusScale: p.radiusScale,
              timestamp: p.timestamp,
              seq: p.seq,
              ...(hue !== undefined ? { hue } : {}),
            },
          },
          "live"
        );
      } else {
        postRef.current(
          {
            type: "fluid-batch",
            from: userId,
            ...(hue !== undefined ? { hue } : {}),
            points,
          },
          "live"
        );
      }
    });
  }

  // A page being hidden (screen lock, tab switch) must not strand a
  // queued batch in a frozen timer — iOS may not run it for a long
  // while, and a stale scribble delivered on wake is worse than a
  // gap. Flush on hide; on unmount, flush too (room switches keep
  // the last frames of a stroke).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        batcherRef.current?.flush();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      batcherRef.current?.flush();
      // And no receive-flush timer outlives the hook.
      if (remoteFlushTimerRef.current !== null) {
        window.clearTimeout(remoteFlushTimerRef.current);
        remoteFlushTimerRef.current = null;
      }
    };
  }, []);

  const sendInteraction = useCallback(
    (
      interaction: Omit<FluidInteraction, "userId" | "timestamp">,
      fromUserId?: string,
      opts?: { batch?: boolean }
    ) => {
      const full: FluidInteraction = {
        ...interaction,
        userId: fromUserId ?? userId,
        timestamp: Date.now(),
        // Hotfix 1.9: per-sender monotonic sequence. Receivers
        // dedupe on (userId, seq): the old (userId, timestamp) key
        // collided whenever two pointers landed in the same
        // millisecond. One counter serves self and proxy sends —
        // values stay unique per sender id stream, which is all
        // the dedupe key needs.
        seq: ++seqRef.current,
        // Slice 6: stamp the local human's signature hue on their
        // own sends (engine input, verbs, pattern steps — everything
        // that funnels through here as self). Proxy sends under
        // another id (the ghost) are NOT stamped: a ghost's color
        // already rides its color field and its voice is its own.
        ...(!fromUserId && identityRef.current
          ? { hue: identityRef.current.hue }
          : {}),
      };

      // Slice 5 ENFORCEMENT POINT: session modes gate the transport
      // here — a mirror/view guest's client (or a control-mode
      // non-driver's) never puts interactions on the wire at all.
      // The full interaction is still returned below, so local
      // behavior (the engine renders its own input; the ghost brain
      // hears its owner) is untouched: it simply never leaves.
      if (sessionRef.current.canSend) {
        if (opts?.batch && !fromUserId && !full.verb) {
          // Live stroke: coalesce (see batcher above). The point
          // leaves with its batch, ≤30ms later, on the live lane.
          batcherRef.current?.push({
            position: full.position,
            force: full.force,
            pressure: full.pressure,
            color: full.color,
            radiusScale: full.radiusScale,
            timestamp: full.timestamp,
            seq: full.seq as number,
          });
        } else {
          // Events (verbs, ghost gestures) ride the reliable
          // control lane; plain strokes that were not opted into
          // batching (pattern steps) ride the live lane directly.
          const lane =
            fromUserId || full.verb ? "control" : "live";
          const msg: TransportMsg = { type: "fluid-interaction", data: full };
          postViaCurrent(msg, lane as "control" | "live");
        }
      }

      // Local haptic tick only when sending as ourselves. When a virtual
      // peer (e.g. the session ghost) is broadcast under its own id, the
      // host's feedback arrives through the normal render path, exactly
      // like a remote peer's — no double vibration.
      if (!fromUserId && navigator.vibrate && interaction.pressure > 0.7) {
        navigator.vibrate([50, 30, 50]);
      }
      return full;
    },
    [userId, postViaCurrent]
  );

  /**
   * Injection seam for LOCAL virtual peers (e.g. the Slice 2 ghost): feed
   * an interaction into the exact path network remotes take — same state,
   * same rendering, same verb haptics/audio downstream — without sending
   * anything over a transport and without registering as a human peer.
   * The interaction must carry the virtual peer's own userId.
   */
  const injectRemoteInteraction = useCallback(
    (interaction: FluidInteraction) => {
      acceptRemote(interaction);
    },
    [acceptRemote]
  );

  return {
    userId,
    remoteInteractions,
    sendInteraction,
    /** Hotfix 1.7: discrete note send (session-gated like sendInteraction). */
    sendNote,
    injectRemoteInteraction,
    humanPeers,
    /** Human userIds heard from in this room (Slice 5, pass-control). */
    knownPeerIds,
    /** Effective session from this client's chair (Slice 5). */
    session,
  };
}
