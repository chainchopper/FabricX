import React, { Suspense, useEffect, useRef, useState } from "react";
import { Platform, View, Text, Pressable } from "react-native";
import BackToFabric from "./components/BackToFabric";
import type { FluidEngine } from "../src/simulation/FluidEngine";

type WebFluidComp = React.ComponentType<{ roomId?: string; onReady?: (engine: FluidEngine) => void }>;

export default function FluidTest() {
  const [WebFluid, setWebFluid] = useState<WebFluidComp | null>(null);
  const engineRef = useRef<FluidEngine | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../src/components/fabric/FluidFabric").then((m) =>
        setWebFluid(() => (m.FluidFabric as unknown as WebFluidComp))
      );
    }
  }, []);

  const handleReady = (engine: FluidEngine) => {
    engineRef.current = engine;
  };

  const splatCenter = () => {
    const e = engineRef.current;
    if (!e) return;
    e.applySplatFromUser("test-user", {
      position: { x: 0.5, y: 0.5 },
      force: { x: 0, y: 0 },
      pressure: 1.0,
      color: { r: 0.2, g: 0.8, b: 1.0 },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <BackToFabric />
      {/* Fluid in isolation */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {Platform.OS === "web" && WebFluid ? (
          <Suspense fallback={null}>
            <WebFluid roomId="test" onReady={handleReady} />
          </Suspense>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "white" }}>
              FluidFabric test is web-only here. Open on web to verify.
            </Text>
          </View>
        )}
      </View>

      {/* Minimal test overlay controls */}
      <View
        pointerEvents="auto"
        style={{
          position: "absolute",
          bottom: 24,
          left: 16,
          right: 16,
          flexDirection: "row",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={splatCenter}
          style={{
            backgroundColor: "#0891b2",
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            shadowColor: "#22d3ee",
            shadowOpacity: 0.35,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Splat Center</Text>
        </Pressable>

        <View
          style={{
            backgroundColor: "rgba(2,8,23,0.6)",
            borderColor: "rgba(34,211,238,0.45)",
            borderWidth: 1,
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: "#93c5fd" }}>FluidFabric Test</Text>
        </View>
      </View>
    </View>
  );
}