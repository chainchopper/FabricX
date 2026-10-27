import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, Platform } from "react-native";
import SafetyBackground from "./components/SafetyBackground";

export default function HomeScreen() {
  const [overlayActive, setOverlayActive] = useState(true);
  const [dismissing, setDismissing] = useState(false);
  const dismissingRef = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;

  const fadeOutOverlay = () => {
    if (!overlayActive || dismissingRef.current) return;
    dismissingRef.current = true;
    // Hotfix 1.5: pointer events drop the INSTANT dismissal begins —
    // see the auto-dismiss note below for why waiting for the fade
    // to finish (previous behavior) could strand an invisible
    // full-screen touch-catcher over the canvas.
    setDismissing(true);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => setOverlayActive(false));
  };

  // Hotfix 1.5: this overlay is a full-screen Pressable (below) that
  // eats every touch until dismissed. The old dismissal path needed
  // BOTH a tap landing on it AND the fade's completion callback to
  // unmount it. If the callback is ever interrupted (re-render churn,
  // a press that reads as a drag, an animation raced by navigation),
  // the overlay stays mounted — visually faded to nothing, still
  // catching every touch: the fluid renders and animates underneath
  // (ghost splats, remote drawing, ambient motion all visible) while
  // the owner's own swirling does nothing at all. That is precisely
  // the reported symptom. Two independent escapes now: pointer
  // events switch off the moment dismissal starts, and the overlay
  // dismisses ITSELF after a short dwell so no input path can ever
  // be trapped behind it — tapped or not.
  useEffect(() => {
    if (!overlayActive) return;
    const t = setTimeout(fadeOutOverlay, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayActive]);

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
          pointerEvents={dismissing ? "none" : "auto"}
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