import React from "react";
import { Platform, View, Text } from "react-native";
import BackToFabric from "./components/BackToFabric";

export default function FluidTest() {
  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "white", textAlign: "center", paddingHorizontal: 16 }}>
          {Platform.OS === "web"
            ? "Global Fabric is running persistently in the background.\nThis page is now for diagnostics."
            : "Fluid test is web-only. Open this page in a web build."}
        </Text>
      </View>
      <BackToFabric />
    </View>
  );
}