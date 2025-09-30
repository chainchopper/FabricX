import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import WebFluidBackground from "./WebFluidBackground";

declare global {
  interface Window {
    __fabric_bg_ready?: boolean;
  }
}

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

  // Fallback fluid background (same engine) only if the global background isn’t ready
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
      <WebFluidBackground />
    </View>
  );
}