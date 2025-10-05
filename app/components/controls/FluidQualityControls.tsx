import React from "react";
import { View, Text, Pressable } from "react-native";
import { useExperience } from "../../context/ExperienceContext";

type Quality = "auto" | "low" | "medium" | "high";

export default function FluidQualityControls() {
  const { state, updateConfig } = useExperience();
  const active = state.activeExperience;
  const s = state.experienceConfig.specific as Record<string, unknown> | undefined;

  if (!active || active.id !== "default-fluid") return null;

  const current = (s?.fluidQuality as Quality) ?? "high";

  const setQ = (q: Quality) => {
    updateConfig({ specific: { ...state.experienceConfig.specific, fluidQuality: q } });
  };

  const options: Quality[] = ["auto", "low", "medium", "high"];

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Fluid Quality</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((q) => {
          const activeQ = current === q;
          return (
            <Pressable
              key={q}
              onPress={() => setQ(q)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: activeQ ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                backgroundColor: activeQ ? "rgba(2,132,199,0.22)" : "transparent",
              }}
            >
              <Text style={{ color: activeQ ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                {q}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}