/**
 * QuickExperienceToggle - Floating button for quick AR Piano access
 * Powered by Nirvana
 */
import React from "react";
import { Pressable, Text, Animated, View } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";

export default function QuickExperienceToggle() {
  const { state, switchExperience } = useExperience();
  const { activeExperience } = state;
  const haptics = useHaptics();
  const audio = useAudioCues();

  const isARPiano = activeExperience?.id === "ar-piano";
  const isFluid = activeExperience?.id === "default-fluid";

  if (!isARPiano && !isFluid) return null;

  const handleToggle = async () => {
    haptics.impactMedium();
    audio.success();
    
    if (isARPiano) {
      await switchExperience("default-fluid");
    } else {
      await switchExperience("ar-piano");
    }
  };

  return (
    <Pressable
      onPress={handleToggle}
      style={{
        position: "absolute",
        bottom: 20,
        right: 20,
        zIndex: 100,
        backgroundColor: "rgba(34,211,238,0.9)",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.3)",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.5,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Text style={{ fontSize: 20 }}>{isARPiano ? "🌊" : "🎹"}</Text>
      <Text style={{ color: "white", fontWeight: "800", fontSize: 14 }}>
        {isARPiano ? "Fluid Mode" : "AR Piano"}
      </Text>
    </Pressable>
  );
}
