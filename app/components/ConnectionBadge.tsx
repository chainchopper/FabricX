import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import { getRealtimeStatus, subscribeRealtimeStatus, type RealtimeStatus } from "../../shared/utils/realtimeStatus";
import { useToast } from "./Toast";

const RETRY_SECONDS = 8;

export default function ConnectionBadge() {
  if (Platform.OS !== "web") return null;

  const toast = useToast();
  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());
  const [countdown, setCountdown] = useState<number>(RETRY_SECONDS);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribeRealtimeStatus((next) => setRt(next));
    return () => unsub();
  }, []);

  // Manage auto-retry loop when disconnected
  useEffect(() => {
    const disconnected = (rt.peers ?? 0) === 0;
    if (!disconnected) {
      // Stop countdown when peers are back
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCountdown(RETRY_SECONDS);
      return;
    }

    // Start countdown if not already running
    if (!timerRef.current) {
      timerRef.current = window.setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            // Fire re-announce
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce"));
            }
            return RETRY_SECONDS; // reset loop
          }
          return c - 1;
        });
      }, 1000) as unknown as number;
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [rt.peers]);

  const reannounce = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce"));
      toast.show("Re-announced presence");
    }
    // manual press resets countdown
    setCountdown(RETRY_SECONDS);
  };

  const transportLabel = rt.transport === "webrtc" ? "RTC" : "BC";
  const peers = rt.peers ?? 0;
  const latency = typeof rt.latencyMs === "number" ? `${Math.round(rt.latencyMs)}ms` : "—";
  const warn = peers === 0;

  return (
    <Pressable
      onPress={reannounce}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 60,
        backgroundColor: warn ? "rgba(234,179,8,0.18)" : "rgba(2,8,23,0.6)",
        borderColor: warn ? "rgba(234,179,8,0.6)" : "rgba(34,211,238,0.45)",
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        minWidth: 116,
        alignItems: "flex-end",
      }}
    >
      <Text style={{ color: warn ? "#fbbf24" : "#e5e7eb", fontWeight: "800" }}>
        {transportLabel} • {peers}
      </Text>
      <Text style={{ color: warn ? "#fde68a" : "#93c5fd", fontSize: 11 }}>
        {latency}
      </Text>
      <Text style={{ color: warn ? "#fde68a" : "#9ca3af", fontSize: 10, marginTop: 2 }}>
        {warn ? `Auto retry in ${countdown}s • Tap to retry` : "Tap to re-announce"}
      </Text>
    </Pressable>
  );
}