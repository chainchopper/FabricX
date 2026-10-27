import React from "react";
import { Platform, View, Text } from "react-native";
import BackToFabric from "./components/BackToFabric";
import FabricDiagnostics from "./components/FabricDiagnostics";

export default function FluidTest() {
  return (
    <View pointerEvents="auto" style={{ flex: 1, backgroundColor: "transparent" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "white", textAlign: "center", paddingHorizontal: 16 }}>
          {Platform.OS === "web"
            ? "Fabric is running persistently. Use the diagnostics panel to verify and tweak."
            : "Fluid test is web-only. Open this page in a web build."}
        </Text>
      </View>

      {Platform.OS === "web" ? (
        <View style={{ position: "absolute", bottom: 16, left: 16 }}>
          <FabricDiagnostics />
        </View>
      ) : null}
      <BackToFabric />
    </View>
  );
}