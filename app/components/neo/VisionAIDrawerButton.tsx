import React from "react";
import { Pressable, Text } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

export default function VisionAIDrawerButton() {
  const { open } = useNewDrawers();
  const haptics = useHaptics();
  const audio = useAudioCues();

  const handlePress = () => {
    haptics.impactMedium();
    audio.click();
    open("vision-ai");
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(139,92,246,0.5)",
        backgroundColor: "rgba(139,92,246,0.15)",
        shadowColor: "#8b5cf6",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text
        style={{
          color: "#a78bfa",
          fontWeight: "700",
          fontSize: 14,
          textAlign: "center",
        }}
      >
        👁️ Vision AI
      </Text>
    </Pressable>
  );
}
