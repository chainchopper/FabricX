import React, { Suspense, useEffect, useRef, useState } from "react";
import { Platform, View, Text, Pressable, Animated, Easing } from "react-native";
import FabricCanvas from "./components/FabricCanvas";

type Web3DComp = React.ComponentType;

export default function HomeScreen() {
  const [Web3D, setWeb3D] = useState<Web3DComp | null>(null);
  const [overlayActive, setOverlayActive] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../src/components/FabricWeb3D").then((m) => setWeb3D(() => m.default));
    }
  }, []);

  const fadeOutOverlay = () => {
    if (!overlayActive) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setOverlayActive(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      {/* Full-screen Fabric */}
      <View style={{ flex: 1 }}>
        {Platform.OS === "web" && Web3D ? (
          <Suspense fallback={null}>
            <Web3D />
          </Suspense>
        ) : (
          <FabricCanvas fullScreen />
        )}
      </View>

      {/* Branding overlay: fades away on first interaction */}
      {overlayActive ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
            opacity,
          }}
        >
          {/* Capture the first interaction, then disappear */}
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