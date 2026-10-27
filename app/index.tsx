import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, Platform } from "react-native";
import SafetyBackground from "./components/SafetyBackground";

/**
 * Home — a transparent shell over the global canvas.
 *
 * Branding (F doctrine, rule 5): "Fabric — By Fanalogy" is an INTRO,
 * not a resident. It appears once per session when the canvas first
 * loads, holds ~1.4s, fades over ~0.4s (≈1.8s total), and unmounts for
 * the rest of the session. It is pointerEvents="none" from the first
 * frame and there is no Pressable anywhere in it: after Hotfixes
 * 1.4/1.5 (a nav-theme cover, then a full-screen Pressable whose fade
 * callback could strand it as an invisible touch-catcher) the branding
 * must never again be able to stand between a finger and the canvas.
 */

// Module scope = session scope for the SPA: remounting Home (route
// churn) must not replay the intro.
let brandingPlayedThisSession = false;

const BRANDING_HOLD_MS = 1400;
const BRANDING_FADE_MS = 400;

export default function HomeScreen() {
  const [showBranding, setShowBranding] = useState(
    () => !brandingPlayedThisSession
  );
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!showBranding) return;
    brandingPlayedThisSession = true;
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: BRANDING_FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start(() => setShowBranding(false));
    }, BRANDING_HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // Hotfix 1.3 (web): Home is a transparent shell over the global
    // canvas — its root must not eat touches or the canvas below can
    // never be drawn on. Pass through on web (native unchanged).
    <View
      pointerEvents={Platform.OS === "web" ? "none" : "auto"}
      style={{ flex: 1, backgroundColor: "transparent" }}
    >
      {/* Safety: if global background isn’t ready, use a local fallback on Home */}
      <SafetyBackground />

      {/* Branding intro — decorative only, never interactive. */}
      {showBranding ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0, right: 0, bottom: 0, left: 0,
            alignItems: "center",
            justifyContent: "center",
            opacity,
            zIndex: 10,
          }}
        >
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
            <Text
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "rgba(229,231,235,0.55)",
                textAlign: "center",
                letterSpacing: 1,
              }}
            >
              Powered by Nirvana
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
