/**
 * RETIRED — Slice 29. Do not mount.
 *
 * The corner this badge occupied (top-right: "Local • 0", latency,
 * "Auto retry in Ns • Tap to retry") is now the Essence
 * (app/components/fabric/Essence.tsx): the device's fDNA Game-of-
 * Life, alive. The Essence reads the same realtime/session stores
 * and carries this file's auto-retry loop and re-announce behavior
 * verbatim — only the presentation changed. This file is kept for
 * reference and history, per the slice's instruction (marked
 * retired, not deleted); nothing imports it.
 */

import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import { getRealtimeStatus, subscribeRealtimeStatus, type RealtimeStatus } from "../../shared/utils/realtimeStatus";
import {
  SESSION_MODE_LABEL,
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../../src/session/sessionStore";
import { useToast } from "./Toast";

const RETRY_SECONDS = 8;

export default function ConnectionBadge() {
  if (Platform.OS !== "web") return null;

  const toast = useToast();
  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());
  const [session, setSession] = useState<SessionPublicState>(() =>
    getSessionPublicState()
  );
  const [countdown, setCountdown] = useState<number>(RETRY_SECONDS);
  const timerRef = useRef<number | null>(null);

  const mode = rt.mode ?? "local";
  const peers = rt.peers ?? 0;

  useEffect(() => {
    const unsub = subscribeRealtimeStatus((next) => setRt(next));
    return () => unsub();
  }, []);

  useEffect(() => subscribeSessionState(setSession), []);

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
      pointerEvents="auto"
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
        {headline}
      </Text>
      <Text style={{ color: warn ? "#fde68a" : "#93c5fd", fontSize: 11 }}>
        {latency}
      </Text>
      <Text style={{ color: warn ? "#fde68a" : "#9ca3af", fontSize: 10, marginTop: 2 }}>
        {subline}
      </Text>
      {/* Slice 5: presence truth — when a session is live, the badge
          names the room and the mode instead of stopping at a bare
          peer count. */}
      {session.hostId ? (
        <Text style={{ color: "#22d3ee", fontSize: 10, marginTop: 2, fontWeight: "700" }}>
          {`room ${session.roomId} · ${SESSION_MODE_LABEL[session.mode]}${
            session.role === "host"
              ? " · hosting"
              : session.role === "guest"
                ? " · guest"
                : ""
          }`}
        </Text>
      ) : null}
    </Pressable>
  );
}
