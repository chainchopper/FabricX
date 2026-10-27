import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import { getRealtimeStatus, subscribeRealtimeStatus, type RealtimeStatus } from "../../shared/utils/realtimeStatus";
import { useToast } from "./Toast";
import { colors, radius, spacing, type } from "../../src/theme/tokens";

const RETRY_SECONDS = 8;

export default function ConnectionBadge() {
  if (Platform.OS !== "web") return null;

  const toast = useToast();
  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());
  const [countdown, setCountdown] = useState<number>(RETRY_SECONDS);
  const timerRef = useRef<number | null>(null);

  const mode = rt.mode ?? "local";
  const peers = rt.peers ?? 0;

  useEffect(() => {
    const unsub = subscribeRealtimeStatus((next) => setRt(next));
    return () => unsub();
  }, []);

  // Manage auto-retry loop. It only runs in 'online' mode with no peers
  // (signaling is up, re-announcing may still find someone). In 'local'
  // mode there is nothing to retry — local is the designed state, not a
  // failure — and 'connecting' resolves itself via bounded attempts.
  useEffect(() => {
    const shouldRetry = mode === "online" && peers === 0;
    if (!shouldRetry) {
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
  }, [mode, peers]);

  const reannounce = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce"));
      toast.show("Re-announced presence");
    }
    // manual press resets countdown
    setCountdown(RETRY_SECONDS);
  };

  const transportLabel = rt.transport === "webrtc" ? "RTC" : "BC";
  const latency = typeof rt.latencyMs === "number" ? `${Math.round(rt.latencyMs)}ms` : "—";
  // Warning styling is reserved for "signaling up but nobody here".
  // Local mode is quiet and neutral by design.
  const warn = mode === "online" && peers === 0;

  const headline =
    mode === "local"
      ? `Local • ${peers}`
      : mode === "connecting"
        ? "Connecting…"
        : `${transportLabel} • ${peers}`;

  const subline = warn
    ? `Auto retry in ${countdown}s • Tap to retry`
    : mode === "local"
      ? peers > 0
        ? "Local sync • Tap to re-announce"
        : "Local mode • Tap to re-announce"
      : mode === "connecting"
        ? "Looking for signaling…"
        : "Tap to re-announce";

  return (
    <Pressable
      onPress={reannounce}
      style={{
        position: "absolute",
        // Slice 3: the top-right corner belongs to the HUD menu button;
        // this chip sits quietly beneath it as connection detail.
        top: 64,
        right: spacing.md,
        zIndex: 60,
        backgroundColor: warn ? "rgba(234,179,8,0.18)" : colors.panel,
        borderColor: warn ? "rgba(234,179,8,0.6)" : colors.line,
        borderWidth: 1,
        borderRadius: radius.card,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minWidth: 116,
        alignItems: "flex-end",
      }}
    >
      <Text
        style={{
          color: warn ? "#fbbf24" : colors.text,
          fontWeight: type.semibold,
          fontSize: type.body,
        }}
      >
        {headline}
      </Text>
      <Text style={{ color: warn ? "#fde68a" : colors.textDim, fontSize: type.caption }}>
        {latency}
      </Text>
      <Text style={{ color: warn ? "#fde68a" : colors.textDim, fontSize: type.caption, marginTop: 2 }}>
        {subline}
      </Text>
    </Pressable>
  );
}
