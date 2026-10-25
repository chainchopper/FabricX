import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";

declare global {
  interface Window {
    __fabric_bg_ready?: boolean;
  }
}

/**
 * SafetyBackground — visual floor for the Home route while the single
 * global canvas (GlobalFabricBackground -> ExperienceRenderer ->
 * LegacyFluid) warms up.
 *
 * Hotfix 1.2: this component used to mount its OWN WebFluidBackground
 * whenever __fabric_bg_ready was false — a SECOND LegacyFluid engine
 * (second WebGL context) plus a SECOND useFluidMultiUser/WebRTCManager
 * with its own peer id, stacked on top of the global canvas. The moment
 * the ready flag flipped (the global engine's onReady, or
 * ExperienceRenderer's 4s fallback timer), this instance unmounted:
 * engine.destroy() killed the topmost, interactive canvas holding the
 * user's splats, and manager.destroy() synchronously closed every one
 * of its data channels — the "canvas dies a few seconds after load,
 * both peer channels close in the same millisecond, no error thrown"
 * bug. Single-canvas authority means the global instance is the ONLY
 * engine; this fallback is now a static, engine-free layer that can
 * appear and disappear without touching WebGL, realtime state, or
 * peer connections.
 */
export default function SafetyBackground() {
  const [ready, setReady] = useState<boolean>(() => {
    if (Platform.OS !== "web") return true;
    return typeof window !== "undefined" ? !!window.__fabric_bg_ready : false;
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as boolean | undefined;
      if (typeof detail === "boolean") setReady(detail);
      else setReady(!!window.__fabric_bg_ready);
    };
    window.addEventListener("fabric:background-ready", onReady as EventListener);
    return () => window.removeEventListener("fabric:background-ready", onReady as EventListener);
  }, []);

  if (Platform.OS !== "web") return null;
  if (ready) return null;

  // Static floor only — no engine, no canvas, no realtime state. The
  // global background underneath is already rendering; this just keeps
  // the warmup frames from flashing unstyled content.
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0,
        backgroundColor: "#05080a",
      }}
    />
  );
}
