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
import FPSMeter from "./FPSMeter";

/**
 * Diagnostics gate — same convention as LegacyFluid's Hotfix 1.5
 * telemetry panel: ?diag=1 in the URL or the fabric_diagnostics_v1
 * localStorage flag. The FPS meter is a diagnostic, not chrome: under
 * the F doctrine the resting screen carries no resident counters, so
 * it renders only in diag mode (the engine's own ?diag=1 panel in
 * LegacyFluid is untouched).
 */
function diagEnabled(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("diag") === "1") {
      return true;
    }
    return window.localStorage.getItem("fabric_diagnostics_v1") === "1";
  } catch {
    return false;
  }
}

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
        {diagEnabled() ? <FPSMeter /> : null}
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