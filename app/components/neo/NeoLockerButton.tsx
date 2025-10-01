import React, { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useNeoLocker } from "./NeoLockerContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

const ICON_SIZE = 48;

export default function NeoLockerButton() {
  const { toggleLocker } = useNeoLocker();
  const haptics = useHaptics();
  const audio = useAudioCues();

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });

  return (
    <View style={{ position: "absolute", top: 12 + 96 + 10, left: 0, zIndex: 80 }}>
      <Animated.View
        style={{
          transform: [{ scale }],
          opacity,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderWidth: 1,
        }}
      >
        <Pressable
          onPress={() => { haptics.impactLight(); audio.click(); toggleLocker(); }}
          style={{ width: ICON_SIZE, height: ICON_SIZE, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 22, color: "#22d3ee" }}>☰</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}