import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluidInteraction } from "../types/fluid";
import { useWebRTC } from "./useWebRTC";
import { setRealtimeStatus } from "../../shared/utils/realtimeStatus";

export function useFluidMultiUser(roomId: string) {
  const [remoteInteractions, setRemote] = useState<FluidInteraction[]>([]);
  const userId = useMemo(() => `user-${Math.random().toString(36).slice(2, 8)}`, []);
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Try WebRTC first
  const webrtc = useWebRTC(roomId);

  // Setup BroadcastChannel fallback only when WebRTC is not active
  useEffect(() => {
    if (webrtc.active) {
      if (bcRef.current) {
        bcRef.current.close();
        bcRef.current = null;
      }
      setRealtimeStatus({ transport: "webrtc", peers: webrtc.peersCount });
      return;
    }
    if (!("BroadcastChannel" in window)) {
      setRealtimeStatus({ transport: "broadcast", peers: 0 });
      return;
    }
    const bc = new BroadcastChannel(`fabric-fluid-${roomId}`);
    bc.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type: string; data: FluidInteraction };
      if (msg?.type === "fluid-interaction" && msg.data.userId !== userId) {
        setRemote((prev) => [...prev, msg.data]);
        setTimeout(() => {
          setRemote((prev) => prev.filter((i) => i.timestamp !== msg.data.timestamp));
        }, 1000);
      }
    };
    bcRef.current = bc;
    setRealtimeStatus({ transport: "broadcast", peers: 0 });
    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [roomId, userId, webrtc.active, webrtc.peersCount]);

  // Wire WebRTC onMessage to interactions stream
  useEffect(() => {
    if (!webrtc.active) return;
    const off = webrtc.onMessage((payload) => {
      const msg = payload as { type: string; data: FluidInteraction };
      if (msg?.type === "fluid-interaction" && msg.data.userId !== userId) {
        setRemote((prev) => [...prev, msg.data]);
        setTimeout(() => {
          setRemote((prev) => prev.filter((i) => i.timestamp !== msg.data.timestamp));
        }, 1000);
      }
    });
    // Return the unsubscribe function directly (Effect cleanup type-safe)
    return off;
  }, [webrtc, userId]);

  const sendInteraction = useCallback(
    (interaction: Omit<FluidInteraction, "userId" | "timestamp">) => {
      const full: FluidInteraction = {
        ...interaction,
        userId,
        timestamp: Date.now(),
      };

      if (webrtc.active) {
        webrtc.send({ type: "fluid-interaction", data: full });
      } else if (bcRef.current) {
        bcRef.current.postMessage({ type: "fluid-interaction", data: full });
      }

      if (navigator.vibrate && interaction.pressure > 0.7) {
        navigator.vibrate([50, 30, 50]);
      }
      return full;
    },
    [userId, webrtc]
  );

  return { userId, remoteInteractions, sendInteraction };
}