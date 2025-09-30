import React from "react";
import { Image, Pressable, View } from "react-native";
import { useUserDrawer } from "./UserDrawer";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";

export default function AvatarButton() {
  const { openDrawer } = useUserDrawer();
  const haptics = useHaptics();
  const audio = useAudioCues();

  return (
    <View
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 56,
      }}
    >
      <Pressable
        onPress={() => {
          haptics.impactLight();
          audio.click();
          openDrawer();
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image source={require("../../logo.png")} style={{ width: 28, height: 28, borderRadius: 14 }} />
      </Pressable>
    </View>
  );
}