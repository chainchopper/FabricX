import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";
import ExperienceRenderer from "./ExperienceRenderer";
import ARStatus from "./ARStatus";
import ExperienceHUD from "./ExperienceHUD";

export default function GlobalFabricBackground() {
  // Web: persistent experience-driven background (single authority)
  if (Platform.OS === "web") {
    const [bgKey, setBgKey] = useState(0);

    useEffect(() => {
      const onRestart = () => setBgKey((k) => k + 1);
      window.addEventListener("fabric:restart-background", onRestart as EventListener);
      return () => window.removeEventListener("fabric:restart-background", onRestart as EventListener);
    }, []);

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
        <ExperienceRenderer key={bgKey} />
        <ExperienceHUD />
        <ARStatus />
      </View>
    );
  }

  // Native: ripple canvas full-screen
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