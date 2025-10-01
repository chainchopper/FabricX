import React, { useEffect, useRef } from "react";
import { Animated, Image, Pressable, View } from "react-native";
import { useProfileDrawer } from "./ProfileDrawerContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

const AVATAR_SIZE = 96; // 2x other icons

export default function ProfileDrawerButton() {
  const { toggle } = useProfileDrawer();
  const haptics = useHaptics();
  const audio = useAudioCues();

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

  return (
    <View style={{ position: "absolute", top: 12, left: 0, zIndex: 80 }}>
      <Animated.View
        style={{
          transform: [{ scale }],
          opacity,
          borderTopRightRadius: 14,
          borderBottomRightRadius: 14,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderWidth: 1,
        }}
      >
        <Pressable
          onPress={() => { haptics.impactLight(); audio.click(); toggle(); }}
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: "center", justifyContent: "center" }}
        >
          <Image source={require("../../../logo.png")} style={{ width: AVATAR_SIZE - 16, height: AVATAR_SIZE - 16, borderRadius: 12 }} />
        </Pressable>
      </Animated.View>
    </View>
  );
}