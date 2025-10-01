import React, { useEffect, useRef } from "react";
import { Animated, Pressable, Text } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

const ICON_SIZE = 48;

export default function SettingsDrawerButton() {
  const { toggle, getIconTx } = useNewDrawers();
  const tx = getIconTx("settings");
  const haptics = useHaptics();
  const audio = useAudioCues();

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ])).start();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 12 + 96 + 10 + 48 + 10 + 48 + 10 + 48 + 10 + 48 + 10 + 48 + 10 + 48 + 10 + 48 + 10 + 48 + 10,
        left: 0,
        zIndex: 80,
        transform: [{ translateX: tx }, { scale: pulse.interpolate({ inputRange: [0,1], outputRange: [1, 1.06] }) }],
        opacity: pulse.interpolate({ inputRange: [0,1], outputRange: [1, 0.94] }),
        borderTopRightRadius: 12,
        borderBottomRightRadius: 12,
        backgroundColor: "rgba(2,8,23,0.65)",
        borderColor: "rgba(148,163,184,0.45)",
        borderWidth: 1,
      }}
    >
      <Pressable
        onPress={() => { haptics.impactLight(); audio.click(); toggle("settings"); }}
        style={{ width: ICON_SIZE, height: ICON_SIZE, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontSize: 22, color: "#e5e7eb" }}>⚙️</Text>
      </Pressable>
    </Animated.View>
  );
}