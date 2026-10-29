import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { getLocalIdentity, hueCss } from "../../identity/identityStore";
import { useNewDrawers } from "../../../app/components/neo/NewDrawersContext";
import {
  FABRIC_PLAY_PATTERN_EVENT,
  loadLLMConfig,
  validatePattern,
  type Pattern,
} from "../../ai/PatternComposer";
import {
  SAM_REGION_CAP,
  segmentFrame,
  type SamConfig,
  type SamRegion,
} from "../../sam/samSegment";
import { colors, radius, spacing } from "../../theme/tokens";

/**
 * SamLayer — the "See" layer (Slice 14): touch what you see.
 *
 * SAM 3.1 segmentation as a Fabric layer, in Terrell's world model:
 * the layer sits ON the world canvas (ExperienceRenderer keeps the
 * fluid mounted beneath it, exactly like the piano layer — the
 * canvas never remounts), and what SAM finds in the camera view
 * becomes OBJECTS on that layer: outlined regions you can tap, and
 * tapping one fires a splat burst at its position through the normal
 * interaction funnel (Slice 5 session gating applies — playback
 * rides FABRIC_PLAY_PATTERN_EVENT into LegacyFluid's dispatchStep,
 * which sends via sendInteraction exactly like a composed pattern).
 *
 * Camera: this layer runs its own getUserMedia stream (ARContext's
 * stream feeds a THREE.VideoTexture, which is not frame-addressable
 * for capture; the constraints and facing mode mirror ARContext's).
 * The camera runs only while this layer is front: unmount stops the
 * tracks, and a hidden tab pauses them (visibilitychange) — the
 * layer's idle contract is `still` (see ExperienceContext), and a
 * paused camera is what stillness means here.
 *
 * PRIVACY, IN THE UI'S OWN WORDS (and true in the code): frames are
 * sent ONLY on the explicit Segment tap — one frame, to the
 * resolved Meta endpoint (the user's own AI Services config, or
 * Fanalogy's build-time-locked cloud — the composer's shared
 * resolution, Cleanup 2). Nothing streams to the API, the frame
 * is captured to a local data URL, used for that one request, and
 * dropped; regions keep only box coordinates. With no cloud
 * resolved at all, the layer says so plainly and offers the AI
 * Services door instead of failing dark.
 *
 * Pointer events (PR #16 discipline): the overlay root is box-none,
 * the video surface is "none", and every control — chips, input,
 * Segment, region boxes, tray items — carries its own
 * pointerEvents="auto".
 *
 * Masks: v0 ships BOXES. The spike's mask runs are recorded per
 * region (hasMask) but their encoding is undocumented; see
 * attemptDecodeMask in src/sam/samSegment.ts for the honest attempt.
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

type CamStatus = "starting" | "live" | "paused" | "error";

export default function SamLayer() {
  const { state } = useExperience();
  const drawers = useNewDrawers();
  const isSam = state.activeExperience?.id === "sam-see";

  const [config, setConfig] = useState<SamConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [camStatus, setCamStatus] = useState<CamStatus>("starting");
  const [camError, setCamError] = useState<string | null>(null);
  const [expression, setExpression] = useState<string>("the brightest light");
  const [segmenting, setSegmenting] = useState(false);
  const [regions, setRegions] = useState<SamRegion[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  // Displayed-frame geometry: the video is contain-fit, so SAM's
  // normalized boxes map onto the letterboxed content rect, not the
  // full overlay. Track host size + stream aspect to place outlines
  // where the pixels actually are.
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
  const [videoAspect, setVideoAspect] = useState(0);
  const frameRect = useMemo(() => {
    if (!hostSize.w || !hostSize.h || !videoAspect) return null;
    let w = hostSize.w;
    let h = w / videoAspect;
    if (h > hostSize.h) {
      h = hostSize.h;
      w = h * videoAspect;
    }
    return { left: (hostSize.w - w) / 2, top: (hostSize.h - h) / 2, w, h };
  }, [hostSize, videoAspect]);

  const hostRef = useRef<View | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);

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
      setConfigLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // -- Camera lifecycle: front layer only, hidden tab pauses ---------
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
      setCamStatus("error");
      setCamError("This browser has no camera API.");
      return;
    }
    try {
      setCamStatus((s) => (s === "live" ? s : "starting"));
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
        // contain (not cover): normalized SAM boxes map linearly onto
        // the displayed frame only when nothing is cropped. The fluid
        // canvas shows in the letterbox — a layer ON the fabric, not
        // a replacement for it.
        el.style.objectFit = "contain";
        host.appendChild(el);
        videoRef.current = el;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (videoRef.current.videoHeight > 0) {
        setVideoAspect(
          videoRef.current.videoWidth / videoRef.current.videoHeight
        );
      }
      runningRef.current = true;
      setCamStatus("live");
      setCamError(null);
    } catch (err) {
      setCamStatus("error");
      setCamError(
        err instanceof Error ? err.message : "Unable to access camera"
      );
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!isSam) return;
    void startCamera();
    const onVis = () => {
      if (document.hidden) {
        stopCamera();
        setCamStatus((s) => (s === "error" ? s : "paused"));
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
    };
  }, [isSam, startCamera, stopCamera]);

  // -- Frame capture: one frame, local, dropped after the call -------
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }
    const scale = Math.min(1, 1024 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // The data URL exists only as this return value: segmentFrame
    // puts it in one request body, and nothing here retains it.
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  // -- Segment: the ONLY path that sends a frame ---------------------
  const onSegment = useCallback(async () => {
    if (segmenting) return;
    if (!config) {
      setStatus("SAM is off on this device — no Meta Model API connection is configured.");
      return;
    }
    const frame = captureFrame();
    if (!frame) {
      setStatus("Camera isn't ready yet — give it a moment and tap Segment again.");
      return;
    }
    setSegmenting(true);
    setStatus(`Looking for “${expression.trim()}”…`);
    try {
      const found = await segmentFrame(config, expression, frame);
      setRegions(found);
      setStatus(
        found.length === 0
          ? `No “${expression.trim()}” found in this frame. Try another phrase.`
          : `Found ${found.length} region${found.length === 1 ? "" : "s"} — tap one to touch it.` +
              (found.length >= SAM_REGION_CAP
                ? ` (Top ${SAM_REGION_CAP} by size shown.)`
                : "")
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Segmentation failed.");
    } finally {
      setSegmenting(false);
    }
  }, [captureFrame, config, expression, segmenting]);

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
      {/* Camera surface — the fluid stays mounted beneath (renderer),
          visible in the letterbox and around the panel. */}
      <View
        ref={hostRef}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setHostSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
        }}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(2,6,17,0.35)",
        }}
      />

      {/* Region outlines — objects on this layer. Each box is its own
          tap target (PR #16: own pointerEvents="auto"). Boxes are
          placed inside the displayed frame rect (frameRect), so the
          contain-fit letterbox never shifts an outline off its
          pixels. Before the frame geometry is known, outlines wait. */}
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
            borderWidth: 2,
            borderColor: outline,
            borderRadius: 8,
            backgroundColor: "rgba(34,211,238,0.08)",
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

      {/* Control panel — top center, like First Breath's card: it
          covers no canvas control (the HUD cluster lives at the
          bottom; the F anchor owns the corner). */}
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
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
              See — touch what you see
            </Text>
            <Text style={{ color: camStatus === "live" ? "#34d399" : "#fbbf24", fontSize: 11 }}>
              {camStatus === "live"
                ? "Camera live"
                : camStatus === "paused"
                  ? "Camera paused"
                  : camStatus === "error"
                    ? "Camera blocked"
                    : "Starting camera…"}
            </Text>
          </View>
          {camError ? (
            <Text style={{ color: "#fca5a5", fontSize: 11 }}>{camError}</Text>
          ) : null}

          {configLoaded && !config ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textDim, fontSize: 11 }}>
                SAM 3.1 segments through the Meta Model API. This build
                carries no locked-in cloud and this device has no model
                saved, so segmentation is off — the camera and the rest
                of this layer still work. Connect your own model in AI
                Services only if you want it.
              </Text>
              <Pressable
                pointerEvents="auto"
                onPress={() => drawers.open("ai-settings")}
                accessibilityRole="button"
                accessibilityLabel="Open AI Services"
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.accent,
                  backgroundColor: colors.accentDim,
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                  Open AI Services
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
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
                    fontSize: 12,
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
            </>
          )}

          {status ? (
            <Text style={{ color: "#93c5fd", fontSize: 11 }}>{status}</Text>
          ) : null}
          <Text style={{ color: colors.textDim, fontSize: 10 }}>
            Frames are sent only when you tap Segment — one frame, to
            your configured Meta endpoint. Nothing streams, and the
            frame is dropped right after. Regions keep only their box
            coordinates.
          </Text>

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
      </View>
    </View>
  );
}
