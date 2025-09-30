import React from "react";
import { View, Text, Pressable } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";

export default function ExperienceControls() {
  const { state, updateConfig } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const haptics = useHaptics();
  const toast = useToast();

  if (!activeExperience) return null;

  const presets = [
    { label: "Cyan Glow", value: "#0b1020" },
    { label: "Deep Space", value: "#000000" },
    { label: "Nebula", value: "#0a1f2e" },
    { label: "Transparent", value: "transparent" },
  ];

  const applyBg = (color: string) => {
    updateConfig({ common: { ...experienceConfig.common, backgroundColor: color } });
    haptics.impactLight();
    toast.show("Background updated");
  };

  return (
    <View
      style={{
        backgroundColor: "rgba(2,8,23,0.6)",
        borderColor: "rgba(34,211,238,0.25)",
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 8,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800" }}>Experience Controls</Text>
      <Text style={{ color: "#93c5fd" }}>{activeExperience.name}</Text>

      <View style={{ marginTop: 6, gap: 6 }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Background</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {presets.map((p) => {
            const active = experienceConfig.common.backgroundColor === p.value;
            return (
              <Pressable
                key={p.value}
                onPress={() => applyBg(p.value)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                  backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                }}
              >
                <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}