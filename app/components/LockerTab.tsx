import React from "react";
import { Pressable, Text, View } from "react-native";
import { useLocker } from "./Locker";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";
import { drawerEvents } from "../../shared/utils/drawerEvents";

export default function LockerTab() {
  const { open, openLocker } = useLocker();
  const haptics = useHaptics();
  const audio = useAudioCues();

  if (open) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        height: 0, // container just provides a stacking context
      }}
    >
      <Pressable
        onPress={() => {
          // Close profile drawer if open, then open locker
          drawerEvents.emitCloseUserDrawer();
          haptics.impactLight();
          audio.click();
          openLocker();
        }}
        style={{
          position: "absolute",
          top: 12,
          right: 0,
          width: 48,
          height: 48,
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderRightWidth: 0,
          borderLeftWidth: 1,
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
        <Text style={{ color: "#22d3ee", fontWeight: "800" }}>≡</Text>
      </Pressable>
    </View>
  );
}