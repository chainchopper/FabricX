import React, { Suspense, lazy, useCallback, useEffect, useRef } from "react";
import { Platform, View, Animated, Easing } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";
import Ambience from "../audio/Ambience";
import AutoComposer from "../audio/AutoComposer";
import PianoNoteLayer from "../piano/PianoNoteLayer";
import SamLayer from "../sam/SamLayer";

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
  // Hotfix 1.7: the piano is a LAYER on the fluid canvas (Terrell's
  // world model — instruments stack on a compatible canvas, they do
  // not replace it). ar-piano therefore keeps the fluid mounted as
  // its base instead of swapping to the 3D branch; PianoNoteLayer
  // (below) runs the note pipeline over it.
  const isPianoLayer = activeExperience?.id === "ar-piano";
  // Slice 14: the SAM "See" layer follows the piano precedent — a
  // layer ON the fluid, never a replacement for it. It therefore
  // also stays out of the 3D camera branch below: the fluid remains
  // mounted as its base and SamLayer renders the camera + region
  // objects above it.
  const isSamLayer = activeExperience?.id === "sam-see";
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

      {wantsAROrCamera && !isPianoLayer && !isSamLayer ? (
        <Suspense fallback={null}>
          <FabricWeb3DLazy />
        </Suspense>
      ) : (
        <WebFluidBackground onReady={markReady} />
      )}

      {/* Piano layer (Hotfix 1.7): mounted over the SAME
          WebFluidBackground element the fluid experience uses — same
          tree position, same type — so switching to or from piano
          never remounts the canvas (single-canvas authority holds).
          The layer itself is headless: the HUD's 2D keyboard is the
          playable surface, and the note pipeline (fluid streams,
          room broadcast, shared synth) runs here instead of inside
          the 3D branch. The 3D PianoScene no longer mounts in the
          shell for ar-piano: it rendered edge-on and invisible
          (PR #20 trace) and its scene paints an opaque backdrop
          that would bury the smoke it is supposed to play into.
          Camera Effects still takes the 3D branch above, untouched. */}
      {isPianoLayer ? <PianoNoteLayer /> : null}

      {/* SAM layer (Slice 14): same tree position discipline as the
          piano layer — mounted above the SAME WebFluidBackground, so
          entering or leaving "See" never remounts the canvas. The
          component owns its camera stream, the Segment action, and
          the region objects; the fluid beneath receives region
          touches through the normal pattern/interaction funnel. */}
      {isSamLayer ? <SamLayer /> : null}

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