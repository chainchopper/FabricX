/**
 * GhostBrainRow — the "Ghost brain" tier preference in AI Services
 * (Slice 9 preference; Ghost Brain build routing). Two choices,
 * stored as fabric_ghost_brain_v1 via src/ghost/ghostBrainPref:
 * "On-device" (the default — Terrell's tier rule) and "Muse Spark
 * cloud" (an explicit opt-in).
 *
 * The routing is LIVE now: the ghost deliberates every ~10s of
 * changed context, and this preference picks its brain — the
 * on-device distilled table, or the configured cloud model. The row
 * also shows the LIVE outcome from the ghost store (which brain
 * actually decided last, and what it decided), including the honest
 * fallback: Spark picked with no key saved means the table decided,
 * and the row says so.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  getGhostBrainTier,
  setGhostBrainTier,
  type GhostBrainTier,
} from "../../../src/ghost/ghostBrainPref";
import {
  subscribeGhostState,
  type GhostBrainStatus,
} from "../../../src/ghost/ghostStore";

const OPTIONS: { tier: GhostBrainTier; label: string; blurb: string }[] = [
  {
    tier: "on-device",
    label: "On-device",
    blurb: "Your ghost thinks here, on this device. The default.",
  },
  {
    tier: "spark-cloud",
    label: "Muse Spark — cloud",
    blurb: "Opt-in teacher tier via the Meta Model API.",
  },
];

export default function GhostBrainRow() {
  const [tier, setTier] = useState<GhostBrainTier>("on-device");
  const [brain, setBrain] = useState<GhostBrainStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getGhostBrainTier().then((t) => {
      if (!cancelled) setTier(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live deliberation outcome, published by the router on every
  // deliberation (either tier, including the no-key fallback).
  useEffect(
    () => subscribeGhostState((s) => setBrain(s.brain)),
    []
  );

  const pick = (next: GhostBrainTier) => {
    setTier(next);
    void setGhostBrainTier(next);
  };

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 16, gap: 8 }}>
      <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 16 }}>
        Ghost brain
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {OPTIONS.map((opt) => {
          const active = tier === opt.tier;
          return (
            <Pressable
              key={opt.tier}
              pointerEvents="auto"
              onPress={() => pick(opt.tier)}
              accessibilityRole="button"
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: active
                  ? "rgba(34,211,238,0.8)"
                  : "rgba(148,163,184,0.25)",
                backgroundColor: active
                  ? "rgba(34,211,238,0.15)"
                  : "transparent",
                gap: 2,
              }}
            >
              <Text
                style={{
                  color: active ? "#22d3ee" : "#e5e7eb",
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {opt.label}
                {opt.tier === "on-device" ? " · default" : ""}
              </Text>
              <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                {opt.blurb}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {brain ? (
        <Text style={{ color: "#e5e7eb", fontSize: 12 }}>
          Live: {brain.tierLabel} · {brain.lastText}
        </Text>
      ) : null}
      <Text style={{ color: "#9ca3af", fontSize: 12 }}>
        Routing is live. Every ~10s of new context (pets, verbs, other
        ghosts, a long quiet) your ghost deliberates: on-device uses a
        decision table distilled from the ghost-factory dataset — no
        network. Spark (opt-in) asks your configured model above with
        the same scenario; with no key saved it falls back to the
        table and the Live line says so. Reflexes never wait on either
        brain.
      </Text>
    </View>
  );
}
