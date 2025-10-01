import React, { useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useNeoLocker } from "./NeoLockerContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

export default function NeoLockerButton() {
  const { toggleLocker } = useNeoLocker();
  const haptics = useHaptics();
  const audio = useAudioCues();

  const glow = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const animateGlow = (to: number) => Animated.timing(glow, { toValue: to, duration: 180, useNativeDriver: false }).start();
  const pressIn = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, friction: 7, tension: 120 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 120 }).start();

  const bgColor = glow.interpolate({ inputRange: [0, 1], outputRange: ["rgba(2,8,23,0.65)", "rgba(2,132,199,0.28)"] });
  const borderColor = glow.interpolate({ inputRange: [0, 1], outputRange: ["rgba(34,211,238,0.45)", "rgba(34,211,238,0.9)"] });

  return (
    <View style={{ position: "absolute", top: 12, right: 12, zIndex: 80 }}>
      <Animated.View
        style={{
          borderRadius: 12,
          backgroundColor: bgColor as unknown as string,
          borderColor: borderColor as unknown as string,
          borderWidth: 1,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          transform: [{ scale }],
        }}
      >
        <Pressable
          onPress={() => {
            haptics.impactLight();
            audio.click();
            toggleLocker();
          }}
          onPressIn={() => {
            animateGlow(1);
            pressIn();
          }}
          onPressOut={() => {
            animateGlow(0);
            pressOut();
          }}
          style={{ paddingVertical: 10, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: "#22d3ee", fontWeight: "800" }}>Neo Locker</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}