import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { subscribeRealtimeStatus, type RealtimeStatus } from "../../shared/utils/realtimeStatus";
import { useToast } from "./Toast";

export default function ConnectionToasts() {
  const toast = useToast();
  const prev = useRef<RealtimeStatus | null>(null);
  const [enabled, setEnabled] = useState<boolean>(Platform.OS === "web");

  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeRealtimeStatus((rt) => {
      const last = prev.current;
      // Transport change
      if (last && rt.transport !== last.transport) {
        toast.show(`Transport: ${rt.transport.toUpperCase()}`);
      }
      // Peer loss
      if (last && last.peers > 0 && rt.peers === 0) {
        toast.show("Peers disconnected");
      }
      // Peer recovery
      if (last && last.peers === 0 && rt.peers > 0) {
        toast.show(`Peers connected: ${rt.peers}`);
      }
      prev.current = rt;
    });
    return () => unsub();
  }, [enabled, toast]);

  return null;
}