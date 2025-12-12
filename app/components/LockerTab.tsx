import React, { useRef } from "react";
import { Animated, Pressable, Text, View, Platform } from "react-native";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";
import { eventBus } from "../../shared/utils/eventBus";
import { useMenuController } from "./MenuController";

export default function LockerTab() {
  const { toggleLocker } = useMenuController();
  const haptics = useHaptics();
  const audio = useAudioCues();

  const glow = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const animateGlow = (to: number) => {
    Animated.timing(glow, { toValue: to, duration: 180, useNativeDriver: false }).start();
  };
  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: Platform.OS !== 'web', friction: 7, tension: 120 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web', friction: 7, tension: 120 }).start();
  };

  const bgColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(2,8,23,0.65)", "rgba(2,132,199,0.22)"],
  });

  const borderColor = glow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(34,211,238,0.45)", "rgba(34,211,238,0.85)"],
  });

  const onPress = () => {
    haptics.impactLight();
    audio.click();
    eventBus.emitTap(0.02, 0.14);
    toggleLocker();
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 12 + 48 + 8, left: 0, zIndex: 60 }}>
      <Animated.View
        style={{
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
          backgroundColor: bgColor as unknown as string,
          borderColor: borderColor as unknown as string,
          borderLeftWidth: 0,
          borderRightWidth: 1,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          transform: [{ scale }],
        }}
      >
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            animateGlow(1);
            pressIn();
          }}
          onPressOut={() => {
            animateGlow(0);
            pressOut();
          }}
          style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: "#22d3ee", fontWeight: "800" }}>≡</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}