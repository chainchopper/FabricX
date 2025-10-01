import React, { useEffect, useRef } from "react";
import { Animated, Image, Pressable, View } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

const AVATAR_SIZE = 96;

export default function ProfileDrawerButton() {
  const { toggle, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("profile");
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

  // attachedX = tx + width so when closed (-width) it's 0; when open (0) it's width
  const attachedX = Animated.add(tx, new Animated.Value(width));

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 12,
        left: 0,
        zIndex: 80,
        transform: [{ translateX: attachedX }, { scale: pulse.interpolate({ inputRange: [0,1], outputRange: [1, 1.06] }) }],
        opacity: pulse.interpolate({ inputRange: [0,1], outputRange: [1, 0.92] }),
        borderTopRightRadius: 14,
        borderBottomRightRadius: 14,
        backgroundColor: "rgba(2,8,23,0.65)",
        borderColor: "rgba(34,211,238,0.45)",
        borderWidth: 1,
      }}
    >
      <Pressable
        onPress={() => { haptics.impactLight(); audio.click(); toggle("profile"); }}
        style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: "center", justifyContent: "center" }}
      >
        <Image source={require("../../../logo.png")} style={{ width: AVATAR_SIZE - 16, height: AVATAR_SIZE - 16, borderRadius: 12 }} />
      </Pressable>
    </Animated.View>
  );
}