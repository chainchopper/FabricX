import React from "react";
import { Pressable, Text } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

export default function AIChatDrawerButton() {
  const { open } = useNewDrawers();
  const haptics = useHaptics();
  const audio = useAudioCues();

  const handlePress = () => {
    haptics.impactMedium();
    audio.click();
    open("ai-chat");
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.5)",
        backgroundColor: "rgba(34,211,238,0.15)",
        shadowColor: "#22d3ee",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text
        style={{
          color: "#22d3ee",
          fontWeight: "700",
          fontSize: 14,
          textAlign: "center",
        }}
      >
        💬 AI Chat
      </Text>
    </Pressable>
  );
}
