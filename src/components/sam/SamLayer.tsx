import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { getLocalIdentity, hueCss } from "../../identity/identityStore";
import {
  FABRIC_PLAY_PATTERN_EVENT,
  loadLLMConfig,
  validatePattern,
  type Pattern,
} from "../../ai/PatternComposer";
import {
  SAM_REGION_CAP,
  type SamConfig,
  type SamRegion,
} from "../../sam/samSegment";
import {
  getSamCameraSnapshot,
  publishSamCamera,
  registerSamVideo,
  subscribeSamCamera,
  type SamCameraSnapshot,
} from "../../sam/samCameraStore";
import {
  publishSegmentationSource,
  seeChipDecision,
  segmentationAvailable,
  subscribeSegmentationAvailable,
} from "../../sam/segmentationAvailability";
import { subscribeOnDeviceBrain } from "../../ai/onDeviceBrain";
import { rememberHardwareGrant } from "../../sensors/hardwareGrants";
import { colors, radius, spacing } from "../../theme/tokens";
// Slice 30's imports sit below the theme import on purpose:
// Slices 29 and 30 both first inserted at the anchor above, and
// the S29/S30 reconciliation keeps each side's insertion on its
// own ground so the merge stays clean.
import {
  FABRIC_SEE_HIGHLIGHT_EVENT,
  type SeeHighlightDetail,
} from "../../sam/seeActs";
import { segmentPhrase } from "../../sam/segmentation";
import {
  getGroundingSnapshot,
  isDeviceGroundingReady,
  noteGroundingWanted,
  subscribeDeviceGrounding,
  type GroundingSnapshot,
} from "../../sam/deviceGrounding";
import { getSegmentationSources } from "../../sam/segmentationAvailability";
import ImageUploadButton from "../../../app/components/ImageUploadButton";

/**
 * SamLayer — "See", a fabric of its own (Slice 14's layer,
 * promoted by Slice 64): touch what you see. Terrell: "that
 * camera vision shit should be a fabric it's own" — the census
 * (SEE-CENSUS.md) showed why it read as lost before: this
 * perception stack was real, but the experience presented as a
 * layer smeared across other fabrics, while a second, divergent
 * vision surface (the legacy Vision AI drawer) sat in the
 * settings system doing something else entirely. The drawer is
 * retired; its one real feature — still-photo analysis — lives
 * on this surface now (the photo tool below). One home for
 * everything the app does with vision.
 *
 * SAM 3.1 segmentation as a Fabric experience, in Terrell's world
 * model: what SAM finds in the camera view becomes OBJECTS on the
 * fabric: outlined regions you can tap, and tapping one fires a
 * splat burst at its position through the normal interaction funnel
 * (Slice 5 session gating applies — playback rides
 * FABRIC_PLAY_PATTERN_EVENT into LegacyFluid's dispatchStep, which
 * sends via sendInteraction exactly like a composed pattern).
 *
 * COMPOSITING (Hotfix 2.4's field correction, declared as this
 * fabric's canvas kind by Slice 64): the camera IS the canvas —
 * the picture is the ground. The renderer keys on the registry's
 * declared canvas kind ("camera"), never on this experience's id.
 * The fabric is therefore TWO components, rendered by
 * ExperienceRenderer in the same slot so the canvas never
 * remounts:
 * - SamCameraBackground (below): the camera surface — the
 *   fabric's ground — mounted UNDER the fluid canvas (zIndex -1
 *   inside the renderer's stacking context). The video fills the
 *   canvas cover-fit — no letterbox bands, no distortion — and
 *   the fluid engine runs in its transparent-backdrop mode while
 *   See is active, so the fluid is only a transparent interaction
 *   layer here: touches, smoke, splats and the ghostie all draw
 *   OVER the picture, and the fluid is never the ground.
 * - SamLayer (this default export, above): region outlines, the
 *   status chip, and the Segment tools, above everything.
 * The halves meet in src/sam/samCameraStore (status + frame
 * capture); neither imports the other.
 *
 * Camera lifecycle (unchanged): this layer runs its own
 * getUserMedia stream (ARContext's stream feeds a THREE.VideoTexture,
 * which is not frame-addressable for capture; the constraints and
 * facing mode mirror ARContext's). The camera runs only while this
 * layer is front: unmount stops the tracks, and a hidden tab pauses
 * them (visibilitychange) — the layer's idle contract is `still`
 * (see ExperienceContext), and a paused camera is what stillness
 * means here.
 *
 * STATUS, NOT MECHANISM-SPEAK (Hotfix 2.4; silence rule, Slice
 * 29): the layer's face at the top edge is SILENT by default —
 * when the camera is live and a segmentation path is available,
 * the chip renders nothing at all; the layer working is not news.
 * Availability is the shared boolean in
 * src/sam/segmentationAvailability.ts: the cloud path publishes
 * its presence from the resolution below, the on-device tier from
 * the brain snapshot, and Slice 30's Acts interpreter from its own
 * router — one boolean every See surface reads. A one-line chip
 * appears only for genuine need states — the camera denied/absent
 * ("See · Camera blocked"), or no segmentation path anywhere
 * ("See · Segmentation resting", plainly, with no plea to connect
 * anything) — and stays dismissible to the small "See" pill, as
 * before. How segmentation works and the frame-privacy line live
 * where reference copy belongs: this layer's ID card and THIS
 * LAYER in the menu. The privacy behavior itself is unchanged and
 * true in the code: frames are sent ONLY on the explicit Segment
 * tap — one frame, to the resolved Meta endpoint (the user's own
 * AI Services config, or Fanalogy's build-time-locked cloud — the
 * composer's shared resolution, Cleanup 2). Nothing streams to
 * the API, the frame is captured to a local data URL, used for
 * that one request, and dropped; regions keep only box
 * coordinates. With no path resolved at all, the camera and the
 * rest of the layer still work.
 *
 * Pointer events (PR #16 discipline): the overlay root is box-none,
 * the camera surface and its video element are "none" (the video
 * must never swallow touches meant for the fluid above it), and
 * every control — chip, preset chips, input, Segment, region boxes,
 * tray items — carries its own pointerEvents="auto".
 *
 * Masks: v0 ships BOXES. The spike's mask runs are recorded per
 * region (hasMask) but their encoding is undocumented; see
 * attemptDecodeMask in src/sam/samSegment.ts for the honest attempt.
 *
 * Slice 30: this layer also ACTS now. Act asks in the compose
 * stream ("touch the apple", "draw a circle around the chair",
 * "ghostie, touch the apple") resolve through the tier seam
 * (src/sam/segmentation.ts — cloud SAM 3.1 when configured, the
 * on-device GroundingDINO eyes when ready) inside LegacyFluid,
 * which performs them; the found regions arrive here on
 * FABRIC_SEE_HIGHLIGHT_EVENT and are outlined like Segment
 * results (a soft pulse, for a highlight ask). The manual flow
 * below runs on the same seam, so Segment works with whichever
 * eyes this device has — its frame discipline is unchanged.
 *
 * Availability wiring: the seam's "device" source is the
 * on-device EYES' readiness — this layer's truth keeper derives
 * it from the grounding tier (the same truth segmentation.ts's
 * getSegmentationStatus() reports) after every change, and
 * derives "acts" (servable whenever either tier is) from the
 * seam's current sources. (Slice 29 originally published
 * "device" from the WebLLM brain's snapshot — a placeholder
 * from before the eyes existed, which misattributed
 * availability; the S29/S30 reconciliation superseded it with
 * the keeper while keeping it as text for a clean merge, and
 * Slice 31 deleted it outright. The keeper is the only
 * publisher of "device" now.) The seam's API is unchanged.
 *
 * Powered by Nirvana
 */

const PRESET_EXPRESSIONS = [
  "the performer",
  "the glowing phones",
  "the brightest light",
  "the person",
  "the screen",
] as const;

/* ------------------------------------------------------------------ */
/* Camera background — the picture UNDER the fluid                     */
/* ------------------------------------------------------------------ */

export function SamCameraBackground() {
  const { state } = useExperience();
  const isSam = state.activeExperience?.id === "sam-see";

  const hostRef = useRef<View | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    runningRef.current = false;
  }, []);

  const startCamera = useCallback(async () => {
    if (Platform.OS !== "web" || runningRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      publishSamCamera({ status: "error", error: "This browser has no camera API." });
      return;
    }
    try {
      publishSamCamera({
        status: getSamCameraSnapshot().status === "live" ? "live" : "starting",
      });
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
        // Cover (Hotfix 2.4): the picture FILLS the canvas and the
        // overflow is cropped — no letterbox bands, no distortion.
        // SAM's normalized boxes map linearly onto this same
        // cover-cropped frame (the overlay computes the matching
        // frameRect), so outlines still land on their pixels.
        el.style.objectFit = "cover";
        // The video is a background: it must never swallow touches
        // meant for the fluid canvas above it.
        el.style.pointerEvents = "none";
        el.addEventListener("loadedmetadata", () => {
          if (el.videoWidth > 0 && el.videoHeight > 0) {
            publishSamCamera({ aspect: el.videoWidth / el.videoHeight });
          }
        });
        host.appendChild(el);
        videoRef.current = el;
        registerSamVideo(el);
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (videoRef.current.videoHeight > 0) {
        publishSamCamera({
          aspect: videoRef.current.videoWidth / videoRef.current.videoHeight,
        });
      }
      runningRef.current = true;
      publishSamCamera({ status: "live", error: null });
      // Slice 50: the grant stands in the app's memory now —
      // later sessions consult it before any ask (hardwareGrants).
      rememberHardwareGrant("camera", "granted");
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        rememberHardwareGrant("camera", "denied");
      }
      publishSamCamera({
        status: "error",
        error: err instanceof Error ? err.message : "Unable to access camera",
      });
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!isSam) return;
    void startCamera();
    const onVis = () => {
      if (document.hidden) {
        stopCamera();
        publishSamCamera({
          status: getSamCameraSnapshot().status === "error" ? "error" : "paused",
        });
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
      registerSamVideo(null);
      publishSamCamera({ status: "starting", error: null, aspect: 0 });
    };
  }, [isSam, startCamera, stopCamera]);

  if (Platform.OS !== "web" || !isSam) return null;

  return (
    <View
      ref={hostRef}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        const cur = getSamCameraSnapshot().size;
        if (cur.w !== width || cur.h !== height) {
          publishSamCamera({ size: { w: width, h: height } });
        }
      }}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Below the fluid canvas (zIndex 0) inside the renderer's
        // stacking context: the picture is the background, the
        // fluid draws over it. Dark until the first frame lands —
        // the engine's transparent backdrop shows this through
        // empty dye, exactly like a resting eye.
        zIndex: -1,
        backgroundColor: "rgb(2,6,17)",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Overlay — outlines, chip, Segment tools (ABOVE the fluid)           */
/* ------------------------------------------------------------------ */

export default function SamLayer() {
  const { state } = useExperience();
  const isSam = state.activeExperience?.id === "sam-see";

  // Slice 64: still-photo analysis — the retired Vision AI
  // drawer's one real feature, living on the fabric it always
  // belonged to. It reuses the drawer's own flow (the shared
  // ImageUploadButton + VisionAIService + the legacy vision
  // config in AI Settings, read through the drawer's own config
  // module — dynamically, the way the drawer itself loaded the
  // service) and renders ONLY when that config is enabled: with
  // no vision provider configured, the tool does not exist on
  // this surface, exactly as the drawer was dead by default. The
  // camera path never touches it — frames go to SAM; a still the
  // primary picks goes here, by their choice alone.
  const [photoGate, setPhotoGate] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoLines, setPhotoLines] = useState<string[] | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import(
          "../../../app/components/neo/AISettingsDrawer"
        );
        const cfg = mod.getAIConfig();
        if (!cancelled) {
          setPhotoGate(
            cfg.vision.enabled && cfg.vision.provider !== "none"
          );
        }
      } catch {
        if (!cancelled) setPhotoGate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAnalyzePhoto = useCallback(async (imageUri: string) => {
    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoLines(null);
    try {
      const { getVisionAIService } = await import(
        "../../services/VisionAIService"
      );
      const service = getVisionAIService();
      const result = await service.analyzeImage(
        imageUri,
        "Describe this image in detail."
      );
      if (!result.success) {
        setPhotoError(result.error ?? "Analysis failed.");
        return;
      }
      const lines: string[] = [];
      if (result.description) lines.push(result.description);
      if (result.labels && result.labels.length > 0) {
        lines.push(`Labels: ${result.labels.join(", ")}`);
      }
      if (result.objects && result.objects.length > 0) {
        lines.push(
          `Objects: ${result.objects
            .map((o) => `${o.name} (${Math.round(o.confidence * 100)}%)`)
            .join(", ")}`
        );
      }
      if (result.text) lines.push(`Text: ${result.text}`);
      setPhotoLines(lines.length > 0 ? lines : ["No analysis results."]);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setPhotoBusy(false);
    }
  }, []);

  const [cam, setCam] = useState<SamCameraSnapshot>(() => getSamCameraSnapshot());
  useEffect(() => subscribeSamCamera(setCam), []);

  const [config, setConfig] = useState<SamConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [expression, setExpression] = useState<string>("the brightest light");
  const [segmenting, setSegmenting] = useState(false);
  const [regions, setRegions] = useState<SamRegion[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [chipDismissed, setChipDismissed] = useState(false);
  // Slice 29: the shared segmentation-availability boolean (the
  // seam in src/sam/segmentationAvailability.ts). This layer
  // publishes the cloud source itself and — via the truth keeper
  // below — the device and acts sources. The chip below reads
  // only this.
  const [segAvailable, setSegAvailable] = useState<boolean>(() =>
    segmentationAvailable()
  );
  useEffect(() => subscribeSegmentationAvailable(setSegAvailable), []);

  // Displayed-frame geometry: the video is COVER-fit, so SAM's
  // normalized boxes map onto the displayed frame rect, which may
  // extend past the canvas edges (negative offsets — the cropped
  // overflow). The mapping stays linear; outlines land on their
  // pixels and the cropped parts simply fall off-canvas. Before
  // the frame geometry is known, outlines wait.
  const frameRect = useMemo(() => {
    const { w: hostW, h: hostH } = cam.size;
    if (!hostW || !hostH || !cam.aspect) return null;
    let w = hostW;
    let h = w / cam.aspect;
    if (h < hostH) {
      h = hostH;
      w = h * cam.aspect;
    }
    return { left: (hostW - w) / 2, top: (hostH - h) / 2, w, h };
  }, [cam.size, cam.aspect]);

  // Slice 30, Tier B: this device's own eyes (GroundingDINO).
  // The tools render when EITHER tier can serve — a resolved
  // cloud model (Tier A) or ready on-device eyes (Tier B).
  // (Relocated below frameRect in the S29/S30 reconciliation:
  // both slices' state blocks first landed in the same gap.)
  const [grounding, setGrounding] = useState<GroundingSnapshot>(() =>
    getGroundingSnapshot()
  );
  useEffect(() => subscribeDeviceGrounding(setGrounding), []);
  const eyesReady = grounding.state === "ready";
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The availability seam's truth keeper (S29/S30
  // reconciliation; Slice 31 removed the retired brain-snapshot
  // publisher it once corrected, so this is now the ONLY
  // publisher of "device"): it re-derives "device" from the
  // grounding tier's own readiness — the same truth
  // segmentation.ts's getSegmentationStatus() reports — after
  // every change, so the seam's value is always the tier truth;
  // and it derives "acts" (servable whenever either tier is)
  // from the seam's current sources. The config watcher covers
  // the cloud side: when this layer's model resolution settles,
  // "acts" re-derives against the cloud source the resolution
  // published. Net behavior, every combination: cloud configured
  // or eyes ready → the seam says available and acts can serve;
  // neither → "Segmentation resting" and acts honestly cannot.
  const publishAvailabilityTruth = useCallback(() => {
    publishSegmentationSource("device", isDeviceGroundingReady());
    const s = getSegmentationSources();
    publishSegmentationSource("acts", s.cloud || s.device);
  }, []);
  useEffect(() => {
    publishAvailabilityTruth();
    const offGrounding = subscribeDeviceGrounding(
      publishAvailabilityTruth
    );
    const offBrain = subscribeOnDeviceBrain(publishAvailabilityTruth);
    return () => {
      offGrounding();
      offBrain();
    };
  }, [publishAvailabilityTruth]);
  useEffect(() => {
    publishAvailabilityTruth();
  }, [config, publishAvailabilityTruth]);

  // -- Model resolution (the composer's shared path, Cleanup 2) -----
  // The user's saved model first, then Fanalogy's build-time-locked
  // cloud — so the demo's SAM works out of the box with nothing to
  // connect, exactly like the composer and the ghost brain.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const resolved = await loadLLMConfig();
      if (!mounted) return;
      if (resolved) {
        setConfig({
          "apiKey": resolved.apiKey,
          endpoint: resolved.endpoint || "https://api.meta.ai/v1",
        });
      } else {
        setConfig(null);
      }
      // The cloud path's presence joins the shared boolean.
      publishSegmentationSource("cloud", !!resolved);
      setConfigLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // -- See acts (Slice 30): the found regions of an act ask --------
  // LegacyFluid dispatches FABRIC_SEE_HIGHLIGHT_EVENT for every
  // act it performs (the outline explains where the act landed)
  // and as the whole performance for a highlight ask (a pulse,
  // then the outline lets go). Regions arrive in image space and
  // render through the same frameRect as Segment results.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHighlight = (ev: Event) => {
      const d = (ev as CustomEvent<SeeHighlightDetail>).detail;
      if (!d || !Array.isArray(d.regions) || d.regions.length === 0) return;
      setRegions(
        d.regions.map((r, i) => ({
          id: `act-${Date.now()}-${i}`,
          expression: d.phrase,
          index: i,
          label: r.label || `${d.phrase} #${i + 1}`,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          area: r.w * r.h,
          hasMask: false,
        }))
      );
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (d.pulse) {
        setPulse(true);
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => setPulse(false), 1400);
        if (d.lingerMs > 0) {
          clearTimer.current = setTimeout(() => {
            setRegions((cur) =>
              cur.every((r) => r.id.startsWith("act-")) ? [] : cur
            );
          }, d.lingerMs);
        }
      }
    };
    window.addEventListener(
      FABRIC_SEE_HIGHLIGHT_EVENT,
      onHighlight as EventListener
    );
    return () => {
      window.removeEventListener(
        FABRIC_SEE_HIGHLIGHT_EVENT,
        onHighlight as EventListener
      );
    };
  }, []);

  // -- Segment: the manual flow, on the Slice 30 tier seam ----------
  // The frame discipline is exactly as shipped: ONE frame, only
  // on this explicit tap, dropped right after; regions keep only
  // box coordinates. What changed is the seam underneath: cloud
  // SAM 3.1 when a model resolves (boxes + masks), else this
  // device's own eyes when they are ready (boxes only — and then
  // the frame is read HERE and never sent anywhere at all).
  const onSegment = useCallback(async () => {
    if (segmenting) return;
    if (!config && !eyesReady) {
      // Unreachable from the UI (the tools only render when a
      // tier can serve; the chip carries the resting state) —
      // kept honest if a caller ever lands here anyway.
      noteGroundingWanted();
      setStatus("Segmentation is resting on this device.");
      return;
    }
    setSegmenting(true);
    setStatus(`Looking for “${expression.trim()}”…`);
    const outcome = await segmentPhrase(expression, { cloud: config });
    if (outcome.status === "error") {
      setStatus(outcome.message);
    } else if (outcome.status === "unavailable") {
      noteGroundingWanted();
      setStatus("Segmentation is resting on this device.");
    } else {
      setRegions(
        outcome.regions.map((r, i) => ({
          id: `seg-${Date.now()}-${i}`,
          expression,
          index: i,
          label: r.label,
          x: r.box.x,
          y: r.box.y,
          w: r.box.w,
          h: r.box.h,
          area: r.box.w * r.box.h,
          hasMask: r.hasMask,
        }))
      );
      setStatus(
        outcome.regions.length === 0
          ? `No “${expression.trim()}” found in this frame. Try another phrase.`
          : `Found ${outcome.regions.length} region${outcome.regions.length === 1 ? "" : "s"} — tap one to touch it.` +
              (outcome.tier === "device-grounding"
                ? " Found by this device's own eyes."
                : "") +
              (outcome.regions.length >= SAM_REGION_CAP
                ? ` (Top ${SAM_REGION_CAP} by size shown.)`
                : "")
      );
    }
    setSegmenting(false);
  }, [config, eyesReady, expression, segmenting]);

  // -- Fire a region: an object on the layer, touched ----------------
  const fireRegion = useCallback(
    (region: SamRegion) => {
      if (Platform.OS !== "web") return;
      const hue = getLocalIdentity()?.hue ?? 187;
      const pattern = validatePattern(
        {
          name: `SAM: ${region.expression}`.slice(0, 48),
          steps: [
            {
              atMs: 0,
              kind: "splat",
              x: region.x + region.w / 2,
              y: region.y + region.h / 2,
              radius: Math.min(1, Math.max(0.12, Math.max(region.w, region.h))),
              hue,
              intensity: 0.85,
            },
          ],
        },
        "builtin"
      );
      if (!pattern) return;
      const evt: CustomEvent<Pattern> = new CustomEvent(
        FABRIC_PLAY_PATTERN_EVENT,
        { detail: pattern }
      );
      window.dispatchEvent(evt);
    },
    []
  );

  if (Platform.OS !== "web" || !isSam) return null;

  const hue = getLocalIdentity()?.hue ?? 187;
  const outline = hueCss(hue);

  // The chip's decision (Slice 29 silence rule, pure in
  // segmentationAvailability.ts): nothing at all while the camera
  // is live and any segmentation path is available; one plain line
  // for the two genuine need states; the small "See" pill when a
  // need state is dismissed.
  const chip = seeChipDecision({
    camStatus: cam.status,
    segAvailable,
    configLoaded,
    dismissed: chipDismissed,
  });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
      }}
    >
      {/* Region outlines — objects on this layer, drawn over the
          fluid over the camera. Each box is its own tap target
          (PR #16: own pointerEvents="auto"). Boxes are placed
          inside the displayed frame rect (frameRect), so the
          cover-fit crop never shifts an outline off its pixels. */}
      {frameRect
        ? regions.map((r) => (
        <Pressable
          key={r.id}
          pointerEvents="auto"
          onPress={() => fireRegion(r)}
          accessibilityRole="button"
          accessibilityLabel={`Touch ${r.label}`}
          style={{
            position: "absolute",
            left: frameRect.left + r.x * frameRect.w,
            top: frameRect.top + r.y * frameRect.h,
            width: r.w * frameRect.w,
            height: r.h * frameRect.h,
            borderWidth: pulse ? 3 : 2,
            borderColor: outline,
            borderRadius: 8,
            backgroundColor: pulse
              ? "rgba(34,211,238,0.18)"
              : "rgba(34,211,238,0.08)",
          }}
        >
          <Text
            style={{
              color: outline,
              fontSize: 10,
              fontWeight: "800",
              paddingHorizontal: 4,
              paddingVertical: 1,
            }}
          >
            {`#${r.index + 1}`}
          </Text>
        </Pressable>
          ))
        : null}

      {/* Top edge column: the status chip (silent unless a need
          state speaks — Slice 29), then the Segment tools.
          Doctrine: nothing covers the work — at most one line of
          state at the edge, and the tools stay a slim strip
          under it. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 76,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        {chip.kind === "pill" ? (
          <Pressable
            pointerEvents="auto"
            onPress={() => setChipDismissed(false)}
            accessibilityRole="button"
            accessibilityLabel="Show the See status"
            style={{
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.panel,
            }}
          >
            <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: "700" }}>
              See
            </Text>
          </Pressable>
        ) : chip.kind === "line" ? (
          <View
            pointerEvents="auto"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.panel,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
              {chip.text}
            </Text>
            <Pressable
              pointerEvents="auto"
              onPress={() => setChipDismissed(true)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss the See status"
              style={{ paddingHorizontal: 2 }}
            >
              <Text style={{ color: colors.textDim, fontSize: 12, fontWeight: "700" }}>
                ✕
              </Text>
            </Pressable>
          </View>
        ) : null}

        {cam.status === "error" && cam.error ? (
          <Text style={{ color: "#fca5a5", fontSize: 11, marginTop: 6 }}>
            {cam.error}
          </Text>
        ) : null}

        {/* Segment tools — only when a tier can serve (Slice 30:
            a resolved cloud model OR this device's ready eyes).
            At rest there is nothing to segment with, so the layer
            offers no dead controls: the chip above carries the
            state, and the ID card / THIS LAYER carry the one
            factual line about how segmentation resolves. The
            Segment action and the frame-privacy behavior are
            exactly as shipped. */}
        {config || eyesReady ? (
          <View
            pointerEvents="auto"
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: radius.sheet,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              maxWidth: "94%",
              width: 430,
              gap: 6,
              marginTop: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {PRESET_EXPRESSIONS.map((preset) => {
                const selected = expression === preset;
                return (
                  <Pressable
                    key={preset}
                    pointerEvents="auto"
                    onPress={() => setExpression(preset)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 9,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: selected ? colors.accent : colors.line,
                      backgroundColor: selected ? colors.accentDim : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.accent : colors.text,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {preset}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TextInput
                pointerEvents="auto"
                value={expression}
                onChangeText={setExpression}
                onSubmitEditing={() => void onSegment()}
                placeholder="What should SAM find? (bare phrase)"
                placeholderTextColor="#64748b"
                accessibilityLabel="Referring expression for SAM"
                style={{
                  flex: 1,
                  color: "#e5e7eb",
                  // 16px floor (Hotfix 2.3's rule, applied here too):
                  // below 16px iOS Safari auto-zooms on focus and
                  // strands the page scrolled with white below the
                  // app — the same typing bug class as the piano.
                  fontSize: 16,
                  backgroundColor: "rgba(34,211,238,0.08)",
                  borderColor: "rgba(34,211,238,0.45)",
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  outlineStyle: "none",
                } as object}
              />
              <Pressable
                pointerEvents="auto"
                onPress={() => void onSegment()}
                accessibilityRole="button"
                accessibilityLabel="Segment this frame"
                style={({ pressed }) => ({
                  backgroundColor: pressed
                    ? "rgba(34,211,238,0.35)"
                    : "rgba(34,211,238,0.15)",
                  borderColor: "rgba(34,211,238,0.45)",
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingVertical: 5,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  opacity: segmenting ? 0.6 : 1,
                })}
              >
                <Text style={{ color: "#e5e7eb", fontSize: 12, fontWeight: "700" }}>
                  {segmenting ? "Segmenting…" : "Segment"}
                </Text>
              </Pressable>
            </View>

            {status ? (
              <Text style={{ color: "#93c5fd", fontSize: 11 }}>{status}</Text>
            ) : null}

            {/* Object tray — the regions as named objects on this layer. */}
            {regions.length > 0 ? (
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {regions.map((r) => (
                    <Pressable
                      key={r.id}
                      pointerEvents="auto"
                      onPress={() => fireRegion(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`Touch ${r.label}`}
                      style={{
                        paddingVertical: 3,
                        paddingHorizontal: 8,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 10, fontWeight: "700" }}>
                        {`${r.label} · ${Math.round(r.area * 100)}%${r.hasMask ? " · mask" : ""}`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  pointerEvents="auto"
                  onPress={() => {
                    setRegions([]);
                    setStatus(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all regions"
                  style={{ alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 4 }}
                >
                  <Text style={{ color: "#fca5a5", fontSize: 11, fontWeight: "700" }}>
                    Clear all
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Slice 64: still-photo analysis — the retired Vision
            AI drawer's feature, on the fabric now. Rendered only
            when the legacy vision config (AI Settings) is
            enabled: the drawer's own gate, kept. It sits under
            the Segment tools in the same top-edge column; the
            camera canvas itself stays clear. */}
        {photoGate ? (
          <View
            pointerEvents="auto"
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: radius.sheet,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              maxWidth: "94%",
              width: 430,
              gap: 6,
              marginTop: spacing.sm,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>
              Analyze a photo
            </Text>
            <Text style={{ color: colors.textDim, fontSize: 11 }}>
              A still photo, described by the vision model configured
              in AI Settings — the old Vision AI drawer's one trick,
              living on the See fabric now.
            </Text>
            <ImageUploadButton
              onImageSelected={() => {
                setPhotoLines(null);
                setPhotoError(null);
              }}
              onAnalysisRequest={(uri) => {
                void handleAnalyzePhoto(uri);
              }}
            />
            {photoBusy ? (
              <Text style={{ color: "#93c5fd", fontSize: 11 }}>
                Analyzing…
              </Text>
            ) : null}
            {photoLines
              ? photoLines.map((line, i) => (
                  <Text key={i} style={{ color: colors.text, fontSize: 11 }}>
                    {line}
                  </Text>
                ))
              : null}
            {photoError ? (
              <Text style={{ color: "#fca5a5", fontSize: 11 }}>
                {`⚠️ ${photoError}`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
