import React, { Suspense, lazy, useCallback, useEffect, useRef } from "react";
import { Platform, View, Animated, Easing } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";
import Ambience from "../audio/Ambience";
import AutoComposer from "../audio/AutoComposer";
import PianoNoteLayer from "../piano/PianoNoteLayer";
import SamLayer, { SamCameraBackground } from "../sam/SamLayer";
import HandsLayer, { HandsCameraBackground } from "../hands/HandsLayer";

const FabricWeb3DLazy = lazy(() => import("../FabricWeb3D"));
const DancerStageLazy = lazy(() => import("../../dancer/DancerStage"));

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
  // mounted as its base. Hotfix 2.4 (Terrell's world model): the
  // camera is the background UNDER that fluid and the fluid draws
  // over it — SamCameraBackground renders beneath the canvas while
  // SamLayer's outlines/chip/tools render above it (see the slot
  // below).
  const isSamLayer = activeExperience?.id === "sam-see";
  // Realignment (Oct 28): an experience may declare a non-fluid
  // canvas kind (ExperienceLayer.canvas). "stage3d" experiences own
  // a full react-three-fiber stage as THE canvas — the fluid is not
  // mounted beneath them. The Dancer Stage is the first; the fluid
  // experience above is untouched.
  const isStageCanvas = activeExperience?.canvas === "stage3d";
  // Slice 44 (chrome discipline): the curtain used to fire only
  // when the AR/camera branch flipped, so entering or leaving
  // the Dancer Stage — a whole different CANVAS — hard-cut with
  // no transition at all ("no transition between elements and
  // the fabric canvas"). The trigger key is now the canvas
  // family: AR/camera OR the stage. Switches inside the fluid
  // family (fluid ↔ Fold ↔ piano layers) still share one
  // branch and crossfade through their own layer chrome; only
  // a real canvas swap takes the curtain. Total 120+40+140 =
  // 300ms, inside the tokens' 240–320 motion range.
  const curtainKey = wantsAROrCamera || isStageCanvas;
  const lastMode = useRef<boolean>(curtainKey);

  useEffect(() => {
    if (lastMode.current !== curtainKey) {
      Animated.sequence([
        Animated.timing(curtainOpacity, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(curtainOpacity, { toValue: 0, duration: 140, delay: 40, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
      lastMode.current = curtainKey;
    }
  }, [curtainKey, curtainOpacity]);

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

      {isStageCanvas ? (
        <Suspense fallback={null}>
          <DancerStageLazy onReady={markReady} />
        </Suspense>
      ) : wantsAROrCamera && !isPianoLayer && !isSamLayer ? (
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

      {/* SAM layer (Slice 14; compositing inverted by Hotfix 2.4):
          same tree-position discipline as the piano layer — this
          slot never moves, so entering or leaving "See" never
          remounts the canvas. Inside the slot, the layer splits
          around the fluid: SamCameraBackground (zIndex -1) renders
          the cover-fit camera UNDER the WebFluidBackground canvas,
          which runs in its transparent-backdrop mode while See is
          active so touches, smoke, splats and the ghostie draw OVER
          the picture; SamLayer (zIndex 30) renders the region
          outlines, the status chip and the Segment tools above
          everything. The fragment keeps this as ONE child slot —
          every sibling's tree position is exactly as it was. The
          camera component owns the stream; the overlay owns the
          Segment action and the region objects; the fluid receives
          region touches through the normal pattern funnel. */}
      {isSamLayer ? (
        <>
          <SamCameraBackground />
          <SamLayer />
        </>
      ) : null}

      {/* Hands (Slice 28): a per-layer gesture feature on the fluid
          canvas (See + the Fluid Fabric), mounted in the same
          never-moving slot discipline as the layers above — the
          fragment's tree position is fixed, so toggling Hands never
          remounts the canvas. Inside, the feature gates itself on
          specific.handsEnabled: HandsCameraBackground (zIndex -1)
          opens the camera UNDER the fluid on layers that don't
          already run one (on See it renders nothing — SAM's stream
          is the one stream, and Hands detects on it), and HandsLayer
          (zIndex 31) runs the on-device hand engine + the reticle
          overlay. Stage-canvas experiences never reach this slot's
          feature: it applies only where the fluid is the ground. */}
      <>
        <HandsCameraBackground />
        <HandsLayer />
      </>

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