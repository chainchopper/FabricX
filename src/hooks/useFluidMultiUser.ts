import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluidInteraction } from "../types/fluid";
import { useWebRTC } from "./useWebRTC";
import { setRealtimeStatus } from "../../shared/utils/realtimeStatus";
import {
  getHostIntent,
  setSessionPublicState,
  subscribeHostIntent,
  type HostIntent,
  type SessionMode,
} from "../session/sessionStore";

type TransportMsg =
  | { type: "fluid-interaction"; data: FluidInteraction }
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
  | { type: "session-clear"; from: string; hostId: string };

/** How long a BroadcastChannel peer counts as present after last contact. */
const BC_PEER_TTL_MS = 6000;

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
    (msg: TransportMsg) => {
      // Never throw: this runs synchronously inside the fluid engine's
      // pointer-event chain (engine.onLocalInteraction -> sendInteraction),
      // so a transport failure must not be able to break local input.
      try {
        if (webrtc.active) {
          webrtc.send(msg);
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
  const acceptRemote = useCallback(
    (data: FluidInteraction) => {
      if (data.userId === userId) return;
      setRemote((prev) => [...prev, data]);
      setTimeout(() => {
        setRemote((prev) => prev.filter((i) => i.timestamp !== data.timestamp));
      }, 1000);
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
        acceptRemote(data);
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

    pingTimerRef.current = window.setInterval(() => {
      const seq = ++pingSeqRef.current;
      const now = performance.now();
      pendingRef.current.set(seq, now);
      const ping: TransportMsg = { type: "fabric-ping", seq, t: now, from: userId };
      postViaCurrent(ping);
      window.setTimeout(() => pendingRef.current.delete(seq), 5000);
    }, 2000) as unknown as number;

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
  const askedKeyRef = useRef("");
  useEffect(() => {
    if (humanPeers <= 0) return;
    const key = `${roomId}|${webrtc.active}|${humanPeers}`;
    if (askedKeyRef.current === key) return;
    askedKeyRef.current = key;
    postRef.current({ type: "session-request", from: userId });
  }, [roomId, webrtc.active, humanPeers, userId]);

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

  const sendInteraction = useCallback(
    (
      interaction: Omit<FluidInteraction, "userId" | "timestamp">,
      fromUserId?: string
    ) => {
      const full: FluidInteraction = {
        ...interaction,
        userId: fromUserId ?? userId,
        timestamp: Date.now(),
      };

      const msg: TransportMsg = { type: "fluid-interaction", data: full };
      // Slice 5 ENFORCEMENT POINT: session modes gate the transport
      // here — a mirror/view guest's client (or a control-mode
      // non-driver's) never puts interactions on the wire at all.
      // The full interaction is still returned below, so local
      // behavior (the engine renders its own input; the ghost brain
      // hears its owner) is untouched: it simply never leaves.
      if (sessionRef.current.canSend) {
        postViaCurrent(msg);
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
    injectRemoteInteraction,
    humanPeers,
    /** Human userIds heard from in this room (Slice 5, pass-control). */
    knownPeerIds,
    /** Effective session from this client's chair (Slice 5). */
    session,
  };
}
