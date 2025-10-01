import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluidInteraction } from "../types/fluid";
import { useWebRTC } from "./useWebRTC";
import { setRealtimeStatus } from "../../shared/utils/realtimeStatus";

type TransportMsg =
  | { type: "fluid-interaction"; data: FluidInteraction }
  | { type: "fabric-ping"; seq: number; t: number }
  | { type: "fabric-pong"; seq: number; t: number };

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

  const updateStatus = useCallback(
    (latency?: number) => {
      setRealtimeStatus({
        transport: webrtc.active ? "webrtc" : "broadcast",
        peers: webrtc.active ? webrtc.peersCount : 0,
        latencyMs: latency ?? avgLatencyRef.current,
        peerIds: webrtc.active ? webrtc.peerIds : [],
      });
    },
    [webrtc.active, webrtc.peersCount, webrtc.peerIds]
  );

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
        if (msg.data.userId !== userId) {
          setRemote((prev) => [...prev, msg.data]);
          setTimeout(() => {
            setRemote((prev) => prev.filter((i) => i.timestamp !== msg.data.timestamp));
          }, 1000);
        }
      } else if (msg?.type === "fabric-ping") {
        const pong: TransportMsg = { type: "fabric-pong", seq: msg.seq, t: msg.t };
        bc.postMessage(pong);
      } else if (msg?.type === "fabric-pong") {
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
  }, [roomId, userId, webrtc.active, updateStatus]);

  // Wire WebRTC onMessage to interactions and ping/pong
  useEffect(() => {
    if (!webrtc.active) return;
    const off = webrtc.onMessage((payload) => {
      const msg = payload as TransportMsg;
      if (msg?.type === "fluid-interaction") {
        if (msg.data.userId !== userId) {
          setRemote((prev) => [...prev, msg.data]);
          setTimeout(() => {
            setRemote((prev) => prev.filter((i) => i.timestamp !== msg.data.timestamp));
          }, 1000);
        }
      } else if (msg?.type === "fabric-ping") {
        const pong: TransportMsg = { type: "fabric-pong", seq: msg.seq, t: msg.t };
        webrtc.send(pong);
      } else if (msg?.type === "fabric-pong") {
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
  }, [webrtc, userId, updateStatus]);

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
      const ping: TransportMsg = { type: "fabric-ping", seq, t: now };
      postViaCurrent(ping);
      window.setTimeout(() => pendingRef.current.delete(seq), 5000);
    }, 2000) as unknown as number;

    return () => {
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    };
  }, [webrtc.active, bcRef.current, postViaCurrent]);

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