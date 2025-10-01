import React from "react";
import { Pressable, Text, View } from "react-native";
import { useUserDrawer } from "./UserDrawer";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";
import { drawerEvents } from "../../shared/utils/drawerEvents";

export default function ProfileTab() {
  const { open, openDrawer } = useUserDrawer();
  const haptics = useHaptics();
  const audio = useAudioCues();

  if (open) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 12,
        left: 0,
        zIndex: 60,
      }}
    >
      <Pressable
        onPress={() => {
          // Ensure other drawer is closed, then open profile
          drawerEvents.emitCloseLocker();
          haptics.impactLight();
          audio.click();
          openDrawer();
        }}
        style={{
          width: 48,
          height: 48,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderLeftWidth: 0,
          borderRightWidth: 1,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text style={{ color: "#22d3ee", fontWeight: "800" }}>👤</Text>
      </Pressable>
    </View>
  );
}