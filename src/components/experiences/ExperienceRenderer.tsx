import React, { Suspense, lazy, useCallback, useEffect, useRef } from "react";
import { Platform, View, Animated, Easing } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";
import Ambience from "../audio/Ambience";
import AutoComposer from "../audio/AutoComposer";

const FabricWeb3DLazy = lazy(() => import("../FabricWeb3D"));

declare global {
  interface Window {
    __fabric_bg_ready?: boolean;
  }
}

export default function ExperienceRenderer() {
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { isARCameraActive } = useAR();

  const curtainOpacity = useRef(new Animated.Value(0)).current;
  const wantsAROrCamera = !!activeExperience?.capabilities.ar || !!activeExperience?.capabilities.camera;
  const lastMode = useRef<boolean>(wantsAROrCamera);

  useEffect(() => {
    if (lastMode.current !== wantsAROrCamera) {
      Animated.sequence([
        Animated.timing(curtainOpacity, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(curtainOpacity, { toValue: 0, duration: 140, delay: 40, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
      lastMode.current = wantsAROrCamera;
    }
  }, [wantsAROrCamera, curtainOpacity]);

  // Honest ready signal (Slice 1): the flag used to be set on mount,
  // before the WebGL engine had initialized — a cold load could report
  // "ready" over a blank canvas. Now the fluid engine reports real init
  // via onReady (threaded through WebFluidBackground -> LegacyFluid).
  // A 4s fallback still sets the flag if the engine errors out or an
  // experience has no ready callback (e.g. the AR path), so consumers
  // waiting on the flag never hang.
  const readyRef = useRef(false);
  const markReady = useCallback(() => {
    if (Platform.OS !== "web" || readyRef.current) return;
    readyRef.current = true;
    window.__fabric_bg_ready = true;
    window.dispatchEvent(new CustomEvent("fabric:background-ready", { detail: true }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const fallback = window.setTimeout(markReady, 4000);
    return () => {
      window.clearTimeout(fallback);
      readyRef.current = false;
      window.__fabric_bg_ready = false;
      window.dispatchEvent(new CustomEvent("fabric:background-ready", { detail: false }));
    };
  }, [markReady]);

  if (Platform.OS !== "web") return null;

  const bgColor = (experienceConfig?.common?.backgroundColor as string) || "transparent";
  const s = (experienceConfig.specific as Record<string, unknown>) || {};
  const musicEnabled = Boolean((s.musicEnabled as boolean) ?? false);

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
      {/* Ambient audio (web-only) */}
      <Ambience />
      {/* Generative composer (web-only) */}
      {musicEnabled ? <AutoComposer /> : null}

      {wantsAROrCamera ? (
        <Suspense fallback={null}>
          <FabricWeb3DLazy />
        </Suspense>
      ) : (
        <WebFluidBackground onReady={markReady} />
      )}

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