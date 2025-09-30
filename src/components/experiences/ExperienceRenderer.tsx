import React, { Suspense, lazy, useEffect, useMemo, useRef } from "react";
import { Platform, View, Animated, Easing } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";

const FabricWeb3DLazy = lazy(() => import("../FabricWeb3D"));

declare global {
  interface Window {
    __fabric_bg_ready?: boolean;
  }
}

export default function ExperienceRenderer() {
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { enableARCamera, disableARCamera, isARCameraActive } = useAR();

  // Read mode from capabilities
  const wantsAROrCamera = !!activeExperience?.capabilities.ar || !!activeExperience?.capabilities.camera;

  // Curtain to soften mode flips (short fade)
  const curtainOpacity = useRef(new Animated.Value(0)).current;
  const lastMode = useRef<boolean>(wantsAROrCamera);

  useEffect(() => {
    if (lastMode.current !== wantsAROrCamera) {
      Animated.sequence([
        Animated.timing(curtainOpacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(curtainOpacity, {
          toValue: 0,
          duration: 140,
          delay: 40,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      lastMode.current = wantsAROrCamera;
    }
  }, [wantsAROrCamera, curtainOpacity]);

  // Announce readiness lifecycle
  useEffect(() => {
    if (Platform.OS === "web") {
      window.__fabric_bg_ready = true;
      window.dispatchEvent(new CustomEvent("fabric:background-ready", { detail: true }));
      return () => {
        window.__fabric_bg_ready = false;
        window.dispatchEvent(new CustomEvent("fabric:background-ready", { detail: false }));
      };
    }
    return;
  }, []);

  // Keep AR camera state in sync with experience
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (wantsAROrCamera && !isARCameraActive) {
      void enableARCamera();
    }
    if (!wantsAROrCamera && isARCameraActive) {
      disableARCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAROrCamera, isARCameraActive]);

  if (Platform.OS !== "web") return null;

  const bgColor = (experienceConfig?.common?.backgroundColor as string) || "transparent";

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0,
        backgroundColor: bgColor,
      }}
    >
      {wantsAROrCamera ? (
        <Suspense fallback={null}>
          <FabricWeb3DLazy />
        </Suspense>
      ) : (
        <WebFluidBackground />
      )}

      {/* Quick fade curtain to hide mode transitions */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: bgColor === "transparent" ? "rgba(0,0,0,0.4)" : bgColor,
          opacity: curtainOpacity,
        }}
      />
    </View>
  );
}