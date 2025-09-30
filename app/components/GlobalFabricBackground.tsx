import React from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";

export default function GlobalFabricBackground() {
  if (Platform.OS === "web") {
    // Per-page background handles web; avoid double full-screen canvases.
    return null;
  }

  // Native keeps the ripple canvas full-screen.
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