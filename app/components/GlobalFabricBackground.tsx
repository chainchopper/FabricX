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
import LockerTab from "./LockerTab";
import ProfileTab from "./ProfileTab";

export default function GlobalFabricBackground() {
  const { close } = useOverlays();

  useEffect(() => {
    const unsub = eventBus.on(() => {
      close();
      drawerEvents.emitCloseUserDrawer();
      drawerEvents.emitCloseLocker();
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
        {/* Edge tabs */}
        <ProfileTab />
        <LockerTab />
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
      {/* Edge tabs also useful on native */}
      <ProfileTab />
      <LockerTab />
    </View>
  );
}