import React from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";
import ExperienceRenderer from "./ExperienceRenderer";
import ARStatus from "./ARStatus";
import ExperienceHUD from "./ExperienceHUD";

export default function GlobalFabricBackground() {
  if (Platform.OS === "web") {
    return (
      <View
        pointerEvents="auto"
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 0,
          backgroundColor: "transparent",
        }}
      >
        <ExperienceRenderer />
        <ExperienceHUD />
        <ARStatus />
      </View>
    );
  }

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0,
        backgroundColor: "transparent",
      }}
    >
      <FabricCanvas fullScreen />
    </View>
  );
}