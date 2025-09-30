import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluidInteraction } from "../types/fluid";

export function useFluidMultiUser(roomId: string) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [remoteInteractions, setRemote] = useState<FluidInteraction[]>([]);
  const userId = useMemo(() => `user-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel(`fabric-fluid-${roomId}`);
      channelRef.current.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type: string; data: FluidInteraction };
        if (msg?.type === "fluid-interaction" && msg.data.userId !== userId) {
          setRemote((prev) => [...prev, msg.data]);
          setTimeout(() => {
            setRemote((prev) => prev.filter((i) => i.timestamp !== msg.data.timestamp));
          }, 1000);
        }
      };
      return () => {
        channelRef.current?.close();
        channelRef.current = null;
      };
    }
  }, [roomId, userId]);

  const sendInteraction = useCallback(
    (interaction: Omit<FluidInteraction, "userId" | "timestamp">) => {
      const full: FluidInteraction = {
        ...interaction,
        userId,
        timestamp: Date.now(),
      };
      if (channelRef.current) {
        channelRef.current.postMessage({ type: "fluid-interaction", data: full });
      }
      if (navigator.vibrate && interaction.pressure > 0.7) {
        navigator.vibrate([50, 30, 50]);
      }
      return full;
    },
    [userId]
  );

  return { userId, remoteInteractions, sendInteraction };
}