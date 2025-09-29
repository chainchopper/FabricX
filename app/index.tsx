import React, { Suspense, useEffect, useState } from "react";
import { Platform, View, Text } from "react-native";
import FabricCanvas from "./components/FabricCanvas";

type Web3DComp = React.ComponentType;

export default function HomeScreen() {
  const [Web3D, setWeb3D] = useState<Web3DComp | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../src/components/FabricWeb3D").then((m) => setWeb3D(() => m.default));
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      {/* Full-screen Fabric canvas */}
      <View style={{ flex: 1 }}>
        {Platform.OS === "web" && Web3D ? (
          <Suspense fallback={null}>
            <Web3D />
          </Suspense>
        ) : (
          <FabricCanvas fullScreen />
        )}
      </View>

      {/* Centered title overlay (non-interactive) */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0 as unknown as number,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
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
    </View>
  );
}