import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluidInteraction } from "../types/fluid";
import { useWebRTC } from "./useWebRTC";
import { setRealtimeStatus } from "../../shared/utils/realtimeStatus";

type TransportMsg =
  | { type: "fluid-interaction"; data: FluidInteraction }
  | { type: "fabric-ping"; seq: number; t: number; from?: string }
  | { type: "fabric-pong"; seq: number; t: number; from?: string };

/** How long a BroadcastChannel peer counts as present after last contact. */
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

  // BroadcastChannel presence (local mode): last-seen timestamp per
  // remote userId, learned from interactions and ping/pong senders.
  // Lets the status layer report honest peer counts in local mode
  // instead of a permanent (and alarming) zero.
  const bcPeersRef = useRef<Map<string, number>>(new Map());

  const noteBcPeer = useCallback((id: unknown) => {
    if (typeof id === "string" && id && id !== userId) {
      bcPeersRef.current.set(id, Date.now());
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

  // Shared inbound payload handling for both transports. Validates the
  // payload shape before touching it and is fully guarded by callers.
  const handleTransportMsg = useCallback(
    (msg: TransportMsg, reply: (m: TransportMsg) => void) => {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "fluid-interaction") {
        const data = msg.data;
        if (!data || typeof data.userId !== "string") return;
        noteBcPeer(data.userId);
        if (data.userId !== userId) {
          setRemote((prev) => [...prev, data]);
          setTimeout(() => {
            setRemote((prev) => prev.filter((i) => i.timestamp !== data.timestamp));
          }, 1000);
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
      }
    },
    [userId, noteBcPeer, updateStatus]
  );

  // Setup BroadcastChannel fallback only when WebRTC is not active
  useEffect(() => {
    if (webrtc.active) {
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      bcPeersRef.current.clear();
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

  const sendInteraction = useCallback(
    (interaction: Omit<FluidInteraction, "userId" | "timestamp">) => {
      const full: FluidInteraction = {
        ...interaction,
        userId,
        timestamp: Date.now(),
      };

      const msg: TransportMsg = { type: "fluid-interaction", data: full };
      postViaCurrent(msg);

      if (navigator.vibrate && interaction.pressure > 0.7) {
        navigator.vibrate([50, 30, 50]);
      }
      return full;
    },
    [userId, postViaCurrent]
  );

  return { userId, remoteInteractions, sendInteraction };
}
