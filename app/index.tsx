import React, { useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, Platform } from "react-native";
import SafetyBackground from "./components/SafetyBackground";

export default function HomeScreen() {
  const [overlayActive, setOverlayActive] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

  const fadeOutOverlay = () => {
    if (!overlayActive) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => setOverlayActive(false));
  };

  return (
    // Hotfix 1.3 (web): Home is a transparent shell over the global
    // canvas — its root must not eat touches or the canvas below can
    // never be drawn on. Pass through on web (native unchanged); the
    // branding overlay opts back in below so its one-tap dismiss
    // behaves exactly as before.
    <View
      pointerEvents={Platform.OS === "web" ? "none" : "auto"}
      style={{ flex: 1, backgroundColor: "transparent" }}
    >
      {/* Safety: if global background isn’t ready, use a local fallback on Home */}
      <SafetyBackground />

      {/* Branding overlay */}
      {overlayActive ? (
        <Animated.View
          pointerEvents="auto"
          style={{
            position: "absolute",
            top: 0, right: 0, bottom: 0, left: 0,
            alignItems: "center",
            justifyContent: "center",
            opacity,
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={fadeOutOverlay}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View pointerEvents="none" style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 56,
                fontWeight: "800",
                color: "white",
                textAlign: "center",
                letterSpacing: 1,
                textShadowColor: "rgba(34,211,238,0.25)",
                textShadowRadius: 12,
                textShadowOffset: { width: 0, height: 2 },
              }}
            >
              Fabric
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 16,
                color: "#93c5fd",
                textAlign: "center",
              }}
            >
              By Fanalogy
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}