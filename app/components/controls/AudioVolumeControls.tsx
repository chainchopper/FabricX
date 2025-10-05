import React from "react";
import { View, Text, Pressable } from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";

export default function AudioVolumeControls() {
  const { state, updateConfig } = useExperience();
  const haptics = useHaptics();
  const toast = useToast();

  const vol = Number(state.experienceConfig.common?.audioVolume ?? 0.7);
  const setAudioVolume = (v: number) => {
    updateConfig({ common: { ...state.experienceConfig.common, audioVolume: v } });
    haptics.impactLight();
    toast.show(`Audio volume: ${Math.round(v * 100)}%`);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Audio</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[0.5, 0.7, 0.9].map((v) => {
          const active = Math.abs(vol - v) < 0.0001;
          return (
            <Pressable
              key={v}
              onPress={() => setAudioVolume(v)}
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