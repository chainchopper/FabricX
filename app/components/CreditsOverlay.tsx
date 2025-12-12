import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View, Text, Image , Platform } from "react-native";

interface CreditsOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export default function CreditsOverlay({ visible, onClose }: CreditsOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(scale, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.98);
    }
  }, [visible, opacity, scale]);

  if (!visible) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        inset: 0 as unknown as number,
        backgroundColor: "rgba(0,0,0,0.5)",
        opacity,
        zIndex: 70,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Pressable onPress={onClose} style={{ position: "absolute", inset: 0 as unknown as number }} />
      <Animated.View
        style={{
          width: 320,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: "rgba(15,23,42,0.92)",
          borderWidth: 1,
          borderColor: "rgba(34,211,238,0.35)",
          transform: [{ scale }],
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <View style={{ padding: 16, gap: 10, alignItems: "center" }}>
          <Image source={require("../../logo.png")} style={{ width: 48, height: 48, borderRadius: 8 }} />
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Fabric</Text>
          <Text style={{ color: "#93c5fd" }}>Fanalogy</Text>
          <Text style={{ color: "#a3e635", marginTop: 2 }}>Powered by Nirvana</Text>

          <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", alignSelf: "stretch", marginVertical: 8 }} />

          <Text style={{ color: "#cbd5e1", textAlign: "center" }}>
            Multi‑sensory interactive platform • game‑like, minimal chrome
          </Text>

          <Pressable
            onPress={onClose}
            style={{
              marginTop: 10,
              backgroundColor: "#0891b2",
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Close</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}