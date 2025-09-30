import React from "react";
import { Platform, View, Text } from "react-native";
import BackToFabric from "./components/BackToFabric";
import BackgroundDiagnostics from "./components/BackgroundDiagnostics";

export default function FluidTest() {
  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "white", textAlign: "center", paddingHorizontal: 16 }}>
          {Platform.OS === "web"
            ? "Global Fabric is running persistently in the background.\nUse the diagnostics panel to verify and tweak."
            : "Fluid test is web-only. Open this page in a web build."}
        </Text>
      </View>

      {Platform.OS === "web" ? <BackgroundDiagnostics /> : null}
      <BackToFabric />
    </View>
  );
}