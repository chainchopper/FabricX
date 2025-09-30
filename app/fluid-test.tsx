import React from "react";
import { Platform, View, Text } from "react-native";
import BackToFabric from "./components/BackToFabric";
import LegacyFluid from "../src/components/fluid/LegacyFluid";

export default function FluidTest() {
  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      {Platform.OS === "web" ? (
        <LegacyFluid />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b1020" }}>
          <Text style={{ color: "white" }}>
            Fluid test is web-only. Open this page in a web build.
          </Text>
        </View>
      )}
      <BackToFabric />
    </View>
  );
}