import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";
import ExperienceRenderer from "./ExperienceRenderer";
import FabricErrorBoundary from "./fabric/FabricErrorBoundary";
import ARStatus from "./ARStatus";
import { useOverlays } from "../context/OverlayContext";
import { drawerEvents } from "../../shared/utils/drawerEvents";
import { eventBus } from "../../shared/utils/eventBus";
import ConnectionToasts from "./ConnectionToasts";

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
        {/* Hotfix 2.3: a renderer/canvas throw must degrade to a
            calm, reloadable panel — never unmount the whole app
            (chrome included) into a white screen. */}
        <FabricErrorBoundary label="canvas" variant="canvas">
          <ExperienceRenderer />
        </FabricErrorBoundary>
        {/* ExperienceHUD and ConnectionBadge are NOT rendered here any
            more (F-doctrine rebuild). They are interactive, and this
            branch is the zIndex-0 stacking context under the routes
            layer — the ancestry that left the old HUD's buttons dead
            (see the rebuild PR for the full pointer-events trace).
            They now mount in _layout's ChromeLayer, as direct children
            of the root view with no pointerEvents="none" ancestor, so
            their tappability follows from their own props alone. This
            branch keeps only the canvas and non-interactive status. */}
        <ARStatus />
        {/* Slice 29: the FPS meter that rendered here under the
            diag gate is RETIRED — the top-right corner belongs to
            the Essence now, with no resident counters at any gate.
            The engine's own ?diag=1 panel in LegacyFluid remains
            the diagnostic surface. */}
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