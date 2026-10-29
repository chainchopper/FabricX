import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { getLocalIdentity, hueCss } from "../../identity/identityStore";
import {
  getSamCameraSnapshot,
  getSamVideoElement,
  subscribeSamCamera,
  type SamCameraSnapshot,
} from "../../sam/samCameraStore";
import {
  createHandLandmarker,
  createHandsEngine,
  dispatchWindowEvent,
  type HandsEngine,
} from "../../hands/handsEngine";
import {
  canvasToCss,
  type CanvasPoint,
} from "../../hands/handGeometry";
import {
  HAND_SIGN_LABELS,
  getHandsSnapshot,
  getHandsVideoElement,
  publishHands,
  registerHandsVideo,
  subscribeHands,
  type HandsSnapshot,
} from "../../hands/handsStore";
import { colors, radius } from "../../theme/tokens";

/**
 * HandsLayer — Slice 28 ("Hands"): the camera watches your hand,
 * and your hand touches the canvas without touching it.
 *
 * The beginnings of sign-based input for the fabric: point to draw
 * in the air, pinch to press, shove with an open palm, and four
 * held signs (✋ hold, ✌ peace, ✊ fist, 👍 thumbs-up). All
 * inference runs ON-DEVICE (MediaPipe HandLandmarker, via
 * src/hands/handsEngine); frames never leave the device — there is
 * no capture path in this feature at all, let alone a send path.
 *
 * WHERE IT LIVES: a per-layer feature ("Hands", THIS LAYER,
 * specific.handsEnabled, default OFF — the Slice 12 sensor
 * precedent: a layer's owner opts their body in deliberately). It
 * ships on the two layers where a hand over the fluid means
 * something today: See (sam-see), whose camera already runs, and
 * the main Fluid Fabric, where enabling Hands opens the camera as
 * the background — camera behind, fluid over, exactly the
 * compositing Hotfix 2.4 established (LegacyFluid follows the
 * hands store's cameraLive into its transparent-backdrop mode).
 *
 * CAMERA OWNERSHIP: one stream per layer, never two. On See, Hands
 * detects on SAM's existing stream (the element the camera store
 * registered for frame capture; reading it for local detection
 * changes nothing about its privacy contract). Everywhere else,
 * HandsCameraBackground (below) runs a stream of its own with
 * SamCameraBackground's lifecycle discipline: it runs only while
 * the feature is on, unmount stops the tracks, a hidden tab pauses
 * them. Toggle off = tracks stopped, stream released, model
 * closed.
 *
 * The overlay is honest chrome at the edges: a fingertip reticle
 * (your "finger" on the canvas), a caption naming a sign as it
 * fires, and one status line while the feature is starting,
 * blocked or unavailable. Nothing here takes pointer events — the
 * hand is the pointer.
 *
 * Powered by Nirvana
 */

/** The layers Hands v1 ships on (see header). */
function handsApplies(experienceId: string | null | undefined): boolean {
  return experienceId === "sam-see" || experienceId === "default-fluid";
}

/* ------------------------------------------------------------------ */
/* Camera background — Hands' own picture UNDER the fluid (non-SAM)    */
/* ------------------------------------------------------------------ */

export function HandsCameraBackground() {
  const { state } = useExperience();
  const activeId = state.activeExperience?.id;
  const enabled =
    Platform.OS === "web" &&
    ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
      ?.handsEnabled as boolean | undefined) === true;
  const isFluidHands = enabled && activeId === "default-fluid";

  const hostRef = useRef<View | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    runningRef.current = false;
  }, []);

  const startCamera = React.useCallback(async () => {
    if (Platform.OS !== "web" || runningRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      publishHands({
        phase: "blocked",
        error: "This browser has no camera API.",
        cameraLive: false,
      });
      return;
    }
    try {
      publishHands({ phase: "starting", error: null });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const host = hostRef.current as unknown as HTMLElement | null;
      if (!host) {
        stopCamera();
        return;
      }
      if (!videoRef.current) {
        const el = document.createElement("video");
        el.setAttribute("playsinline", "true");
        el.muted = true;
        el.style.position = "absolute";
        el.style.inset = "0";
        el.style.width = "100%";
        el.style.height = "100%";
        // Cover, as the See layer's camera (Hotfix 2.4): the
        // picture fills the canvas, overflow cropped.
        el.style.objectFit = "cover";
        // A background: never a touch target.
        el.style.pointerEvents = "none";
        host.appendChild(el);
        videoRef.current = el;
        registerHandsVideo(el);
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      runningRef.current = true;
      publishHands({ phase: "live", error: null, cameraLive: true });
    } catch (err) {
      publishHands({
        phase: "blocked",
        error: err instanceof Error ? err.message : "Unable to access camera",
        cameraLive: false,
      });
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!isFluidHands) return;
    void startCamera();
    const onVis = () => {
      if (document.hidden) {
        stopCamera();
        publishHands({ cameraLive: false });
      } else {
        void startCamera();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopCamera();
      if (videoRef.current) {
        videoRef.current.remove();
        videoRef.current = null;
      }
      registerHandsVideo(null);
      publishHands({ cameraLive: false });
    };
  }, [isFluidHands, startCamera, stopCamera]);

  if (Platform.OS !== "web" || !isFluidHands) return null;

  return (
    <View
      ref={hostRef}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Under the fluid canvas, over nothing: the HF2.4 order.
        zIndex: -1,
        backgroundColor: "rgb(2,6,17)",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Overlay + engine orchestration                                      */
/* ------------------------------------------------------------------ */

export default function HandsLayer() {
  const { state } = useExperience();
  const activeId = state.activeExperience?.id;
  const isSam = activeId === "sam-see";
  const enabled =
    ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
      ?.handsEnabled as boolean | undefined) === true;
  const active = Platform.OS === "web" && enabled && handsApplies(activeId);

  const engineRef = useRef<HandsEngine | null>(null);
  if (engineRef.current === null && Platform.OS === "web") {
    engineRef.current = createHandsEngine({
      createLandmarker: createHandLandmarker,
      dispatch: dispatchWindowEvent,
    });
  }

  const [hands, setHands] = useState<HandsSnapshot>(() => getHandsSnapshot());
  useEffect(() => subscribeHands(setHands), []);
  const [sam, setSam] = useState<SamCameraSnapshot>(() => getSamCameraSnapshot());
  useEffect(() => subscribeSamCamera(setSam), []);
  // Camera-live as its own state: the engine effect below keys on
  // the flip, not on the store's every publish (the fingertip
  // moves at detection rate — the lifecycle must not chase it).
  const [camLive, setCamLive] = useState<boolean>(
    () => getHandsSnapshot().cameraLive
  );
  useEffect(
    () =>
      subscribeHands((s) => {
        setCamLive((prev) => (prev === s.cameraLive ? prev : s.cameraLive));
      }),
    []
  );

  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  const [caption, setCaption] = useState<string | null>(null);

  // A fired sign names itself on the overlay, briefly.
  useEffect(() => {
    if (!hands.lastSign) return;
    setCaption(HAND_SIGN_LABELS[hands.lastSign.sign]);
    const id = window.setTimeout(() => setCaption(null), 1800);
    return () => window.clearTimeout(id);
  }, [hands.lastSign]);

  // Engine lifecycle: the toggle and the camera element are the
  // whole contract. On See the element is SAM's (start when its
  // camera is live; its error is our blocked state). On the fluid
  // the element is Hands' own background's (start when it reports
  // its camera live). Anything else — toggle off, layer switch,
  // camera gone — stops the engine and closes the model.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!active) {
      engine.stop();
      publishHands({ phase: "off", error: null });
      return;
    }
    if (isSam) {
      if (sam.status === "error") {
        engine.stop();
        publishHands({
          phase: "blocked",
          error: sam.error ?? "The camera is blocked.",
        });
        return;
      }
      const el = getSamVideoElement();
      if (sam.status === "live" && el) {
        if (!engine.running) {
          publishHands({ phase: "starting", error: null });
          void engine.start(el);
        }
      } else if (engine.running && !el) {
        engine.stop();
      }
      return;
    }
    // Fluid path: HandsCameraBackground owns the stream + phase.
    const el = getHandsVideoElement();
    if (camLive && el) {
      if (!engine.running) void engine.start(el);
    } else if (engine.running && !camLive) {
      engine.stop();
    }
  }, [active, isSam, sam.status, sam.error, camLive]);

  // Unmount: the feature leaves nothing running behind it.
  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      engine?.stop();
    };
  }, []);

  if (Platform.OS !== "web" || !active) return null;

  const hue = getLocalIdentity()?.hue ?? 187;
  const ring = hueCss(hue);
  const tipCss =
    hands.handPresent && hands.tip && hostSize.w > 0
      ? canvasToCss(hands.tip as CanvasPoint, hostSize.w, hostSize.h)
      : null;

  const statusText =
    hands.phase === "starting"
      ? "Hands · Starting"
      : hands.phase === "blocked"
        ? "Hands · Camera blocked"
        : hands.phase === "unsupported"
          ? "Hands · Not on this device"
          : null;

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== hostSize.w || height !== hostSize.h) {
          setHostSize({ w: width, h: height });
        }
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 31,
      }}
    >
      {/* Status line — only while there is a state worth naming.
          On See it sits below SAM's own chip row. */}
      {statusText ? (
        <View
          style={{
            position: "absolute",
            top: isSam ? 124 : 76,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <View
            style={{
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.panel,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
              {statusText}
            </Text>
          </View>
          {hands.error && hands.phase !== "starting" ? (
            <Text style={{ color: "#fca5a5", fontSize: 11, marginTop: 6 }}>
              {hands.error}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* The sign's name, as it fires. */}
      {caption ? (
        <View
          style={{
            position: "absolute",
            top: isSam ? 124 : 76,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <View
            style={{
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: ring,
              backgroundColor: colors.panel,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
              {caption}
            </Text>
          </View>
        </View>
      ) : null}

      {/* The fingertip reticle — your finger on the canvas. A ring
          that fills while you pinch: open is a touch, closed is a
          press. */}
      {tipCss ? (
        <View
          style={{
            position: "absolute",
            left: tipCss.left - 13,
            top: tipCss.top - 13,
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 2,
            borderColor: ring,
            backgroundColor: hands.pinched ? ring : "transparent",
            opacity: hands.pinched ? 0.85 : 0.9,
          }}
        />
      ) : null}
    </View>
  );
}
