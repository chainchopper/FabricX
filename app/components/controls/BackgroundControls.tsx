import React from "react";
import { View, Text, Pressable } from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";

const PRESETS = [
  { label: "Cyan Glow", value: "#0b1020" },
  { label: "Deep Space", value: "#000000" },
  { label: "Nebula", value: "#0a1f2e" },
  { label: "Transparent", value: "transparent" },
];

export default function BackgroundControls() {
  const { state, updateConfig } = useExperience();
  const haptics = useHaptics();
  const toast = useToast();

  const bg = state.experienceConfig.common.backgroundColor;

  const setBg = (value: string) => {
    updateConfig({ common: { ...state.experienceConfig.common, backgroundColor: value } });
    haptics.impactLight();
    toast.show("Background updated");
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Background</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PRESETS.map((p) => {
          const active = bg === p.value;
          return (
            <Pressable
              key={p.value}
              onPress={() => setBg(p.value)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
              }}
            >
              <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}