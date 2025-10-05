import React from "react";
import { View, Text, Pressable } from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";

export default function ParticleDensityControls() {
  const { state, updateConfig } = useExperience();
  const haptics = useHaptics();
  const toast = useToast();

  const density = Number(state.experienceConfig.common?.particleDensity ?? 0.6);

  const setParticleDensity = (v: number) => {
    updateConfig({ common: { ...state.experienceConfig.common, particleDensity: v } });
    haptics.impactLight();
    toast.show(`Particles: ${Math.round(v * 100)}%`);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Particles</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[0.4, 0.6, 0.9].map((v) => {
          const active = Math.abs(density - v) < 0.0001;
          return (
            <Pressable
              key={v}
              onPress={() => setParticleDensity(v)}
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
                {Math.round(v * 100)}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}