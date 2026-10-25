import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluidInteraction } from "../types/fluid";
import { useWebRTC } from "./useWebRTC";
import { setRealtimeStatus } from "../../shared/utils/realtimeStatus";

type TransportMsg =
  | { type: "fluid-interaction"; data: FluidInteraction }
  | { type: "fabric-ping"; seq: number; t: number; from?: string }
  | { type: "fabric-pong"; seq: number; t: number; from?: string };

/** How long a BroadcastChannel peer stays "present" without a sign of life. */
const BC_PEER_TTL_MS = 6000;

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

  // Peer presence. WebRTC reports its own peer count; BroadcastChannel has
  // no presence protocol, so we track peers seen via ping/pong/interaction
  // traffic (the ping/pong messages carry an optional `from` sender id —
  // older clients simply omit it and are ignored here).
  const peersSeenRef = useRef<Map<string, number>>(new Map());
  const [bcPeerIds, setBcPeerIds] = useState<string[]>([]);
  const humanPeers = webrtc.active ? webrtc.peersCount : bcPeerIds.length;

  const notePeer = useCallback((peerId?: string) => {
    if (!peerId || peerId === userId) return;
    // Virtual agent peers (the Slice 2 ghost, "ghost:<ownerId>") ride a
    // human's connection — they never count as human presence.
    if (peerId.startsWith("ghost:")) return;
    const isNew = !peersSeenRef.current.has(peerId);
    peersSeenRef.current.set(peerId, Date.now());
    if (isNew) {
      setBcPeerIds(Array.from(peersSeenRef.current.keys()));
    }
  }, [userId]);

  // Expire silent BroadcastChannel peers so presence stays honest.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      peersSeenRef.current.forEach((lastSeen, peerId) => {
        if (now - lastSeen > BC_PEER_TTL_MS) {
          peersSeenRef.current.delete(peerId);
          changed = true;
        }
      });
      if (changed) {
        setBcPeerIds(Array.from(peersSeenRef.current.keys()));
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const updateStatus = useCallback(
    (latency?: number) => {
      setRealtimeStatus({
        transport: webrtc.active ? "webrtc" : "broadcast",
        peers: humanPeers,
        latencyMs: latency ?? avgLatencyRef.current,
        peerIds: webrtc.active ? webrtc.peerIds : bcPeerIds,
      });
    },
    [webrtc.active, webrtc.peerIds, humanPeers, bcPeerIds]
  );

  const updateStatusRef = useRef(updateStatus);
  updateStatusRef.current = updateStatus;

  // Keep the shared realtime status fresh as peers come and go.
  useEffect(() => {
    updateStatusRef.current();
  }, [humanPeers, bcPeerIds]);

  const postViaCurrent = useCallback(
    (msg: TransportMsg) => {
      if (webrtc.active) {
        webrtc.send(msg);
      } else if (bcRef.current) {
        bcRef.current.postMessage(msg);
      }
    },
    [webrtc]
  );

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

  // Setup BroadcastChannel fallback only when WebRTC is not active
  useEffect(() => {
    if (webrtc.active) {
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      updateStatus();
      return;
    }
    if (!("BroadcastChannel" in window)) {
      updateStatus();
      return;
    }

    const bc = new BroadcastChannel(`fabric-fluid-${roomId}`);
    bc.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as TransportMsg;

      if (msg?.type === "fluid-interaction") {
        notePeer(msg.data.userId);
        acceptRemote(msg.data);
      } else if (msg?.type === "fabric-ping") {
        notePeer(msg.from);
        const pong: TransportMsg = { type: "fabric-pong", seq: msg.seq, t: msg.t, from: userId };
        bc.postMessage(pong);
      } else if (msg?.type === "fabric-pong") {
        notePeer(msg.from);
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
      }
    };
    bcRef.current = bc;
    updateStatus();

    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [roomId, userId, webrtc.active, updateStatus, acceptRemote, notePeer]);

  // Wire WebRTC onMessage to interactions and ping/pong
  useEffect(() => {
    if (!webrtc.active) return;
    const off = webrtc.onMessage((payload) => {
      const msg = payload as TransportMsg;
      if (msg?.type === "fluid-interaction") {
        notePeer(msg.data.userId);
        acceptRemote(msg.data);
      } else if (msg?.type === "fabric-ping") {
        notePeer(msg.from);
        const pong: TransportMsg = { type: "fabric-pong", seq: msg.seq, t: msg.t, from: userId };
        webrtc.send(pong);
      } else if (msg?.type === "fabric-pong") {
        notePeer(msg.from);
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
      }
    });
    updateStatus();
    return off;
  }, [webrtc, userId, updateStatus, acceptRemote, notePeer]);

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
      postViaCurrent(msg);

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

  return { userId, remoteInteractions, sendInteraction, injectRemoteInteraction, humanPeers };
}
