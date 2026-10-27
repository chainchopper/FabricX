/**
 * GhostBrainRow — the "Ghost brain" tier preference in AI Services
 * (Slice 9). Two choices, stored as fabric_ghost_brain_v1 via
 * src/ghost/ghostBrainPref: "On-device" (the default — Terrell's
 * tier rule) and "Muse Spark cloud" (an explicit opt-in).
 *
 * Honest scope, on purpose: this records the preference where the
 * future model tiers will read it. It does not swap any model
 * today — the ghost's rules keep running on-device, and the
 * composer's configured-model path is untouched. The copy in the
 * row says exactly that, so the setting never promises a brain it
 * hasn't got.
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

  useEffect(() => {
    let cancelled = false;
    void getGhostBrainTier().then((t) => {
      if (!cancelled) setTier(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <Text style={{ color: "#9ca3af", fontSize: 12 }}>
        Default is on-device. This records your preference for where
        your ghost's brain runs — the tier routing reads it as the
        on-device and Spark builds land; nothing switches silently.
      </Text>
    </View>
  );
}
