import React from "react";
import { Pressable, View, Text } from "react-native";
import { useLocker } from "./Locker";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";

export default function LockerButton() {
  const { open, openLocker } = useLocker();
  const haptics = useHaptics();
  const audio = useAudioCues();

  if (open) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 12 + 48 + 8,
        left: 0,
        zIndex: 60,
      }}
    >
      <Pressable
        onPress={() => {
          haptics.impactLight();
          audio.click();
          openLocker();
        }}
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text style={{ color: "#22d3ee", fontWeight: "800", fontSize: 18 }}>≡</Text>
      </Pressable>
    </View>
  );
}