import React from "react";
import { Platform, View, Text } from "react-native";
import BackToFabric from "./components/BackToFabric";

let WebGPUTest: React.ComponentType | null = null;

if (typeof window !== "undefined" && Platform.OS === "web") {
  // Lazy import to keep native safe
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebGPUTest = require("../src/components/gpu/WebGPUTest").default as React.ComponentType;
}

export default function FluidGPUPage() {
  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <BackToFabric />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {Platform.OS !== "web" ? (
          <Text style={{ color: "white", textAlign: "center", paddingHorizontal: 16 }}>
            WebGPU test is web-only. Open this page in a web build.
          </Text>
        ) : (
          <Text style={{ color: "white", opacity: 0.7, marginBottom: 8 }}>
            WebGPU Fluid Test — animated GPU clear as a sanity check
          </Text>
        )}
      </View>

      {Platform.OS === "web" && WebGPUTest ? (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 0,
          }}
        >
          {/* DOM canvas lives inside this web component */}
          <WebGPUTest />
        </View>
      ) : null}
    </View>
  );
}