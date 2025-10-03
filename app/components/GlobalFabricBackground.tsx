import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";
import ExperienceRenderer from "./ExperienceRenderer";
import ARStatus from "./ARStatus";
import ExperienceHUD from "./ExperienceHUD";
import { useOverlays } from "../context/OverlayContext";
import { drawerEvents } from "../../shared/utils/drawerEvents";
import { eventBus } from "../../shared/utils/eventBus";
import ConnectionBadge from "./ConnectionBadge";
import ConnectionToasts from "./ConnectionToasts";
import FPSMeter from "./FPSMeter";

export default function GlobalFabricBackground() {
  const { close } = useOverlays();

  useEffect(() => {
    const unsub = eventBus.on(() => {
      close();
      drawerEvents.emitCloseUserDrawer();
      drawerEvents.emitCloseLocker();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("newdrawers:close-all"));
      }
    });
    return () => unsub();
  }, [close]);

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
        <ConnectionBadge />
        <FPSMeter />
        <ConnectionToasts />
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
      <ConnectionToasts />
    </View>
  );
}