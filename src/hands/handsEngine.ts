/**
 * Hands engine — Slice 28's controller: camera landmarks in,
 * fabric input out.
 *
 * A HandLandmarker (MediaPipe Tasks Vision) reads the camera on
 * this device and this module turns its 21 landmarks per frame
 * into the fabric's existing input language:
 *
 * - POINT-DRAW: index fingertip (landmark 8), smoothed, in the
 *   pointing pose (index up, middle down) → FABRIC_HAND_INPUT_EVENT
 *   strokes (see handsStore for the seam). LegacyFluid answers
 *   them through the same funnel a finger uses.
 * - PINCH = PRESS: thumb-tip pressed to index-tip in the pointing
 *   pose → the stroke carries pinched: true — a stronger, wider
 *   splat, and a pinch tap with no motion still lands one press.
 * - PALM PUSH: an open palm moving fast → one broad impulse along
 *   its motion vector (a "push" hand input).
 * - SIGNS, held ~600ms (handGeometry's tracker): ✋ hold, ✌ peace,
 *   ✊ fist, 👍 thumbs-up. Every fired sign dispatches
 *   FABRIC_HAND_SIGN_EVENT — the ghost hears it through LegacyFluid
 *   (GhostPeer.noteHandSign) — and fires its act: peace and
 *   thumbs-up ride FABRIC_VERB_EVENT (cheer / heart) through the
 *   verb funnel with its mode and fabric gates, exactly as if a
 *   finger had tapped the VerbBar; the fist fires a "clear" hand
 *   input; the hold's act IS the ghost hearing it (a held palm is
 *   a request for stillness, answered in the ghost's own world).
 *
 * PRIVACY: detection is on-device, full stop. Frames go from the
 * camera element into the landmarker and nowhere else; landmarks
 * live for one frame's arithmetic and are dropped. Nothing in this
 * module captures, stores or transmits an image.
 *
 * DEPENDENCIES, named plainly (see the PR body): the JS library is
 * MediaPipe Tasks Vision, loaded at first use from the pinned
 * jsDelivr CDN build — NEVER bundled. Metro cannot bundle it: its
 * vision_bundle.mjs dies inside Metro on an internal dynamic
 * import (`import(t.toString())`), which killed the Oct 29
 * production build at 98.9% (Hotfix 2.10). The runtime-constructed
 * import below is the same route Slice 27's WebLLM load and
 * Slice 30's GroundingDINO load already prove in this app, so the
 * package is deliberately absent from package.json. Its WASM
 * fileset loads from the pinned jsDelivr mirror of the exact same
 * version; the hand_landmarker.task model loads from Google's
 * hosted model URL. Self-hosting both through the repo's base64
 * transport (the Slice 26 route) is the named follow-up. If either
 * load fails, or WebGPU/WASM is unavailable, start() reports
 * "unsupported" and the layer carries on touch-only — nothing
 * else changes.
 *
 * The factory takes its dependencies (landmarker creation, event
 * dispatch, clock, rAF) so the check script can drive the whole
 * decision path with a fake landmarker and synthetic landmarks —
 * the gestures' behavior is proven off-device, not asserted.
 *
 * Powered by Nirvana
 */

import { FABRIC_VERB_EVENT } from "../sensory/verbs";
import {
  classifySign,
  createPalmPushTracker,
  createPointSmoother,
  createSignTracker,
  isPalmOpen,
  isPinched,
  isPointPose,
  landmarkToCanvas,
  palmCentroidCanvas,
  LM,
  type CanvasPoint,
  type HandLandmarks,
} from "./handGeometry";
import {
  FABRIC_HAND_INPUT_EVENT,
  FABRIC_HAND_SIGN_EVENT,
  publishHands,
  type HandInputDetail,
  type HandSignDetail,
} from "./handsStore";

/** The hosted hand_landmarker model (float16, v1). */
export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** WASM fileset: pinned CDN mirror of the exact library version. */
export const TASKS_VISION_VERSION = "0.10.14";
export const HAND_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

/** The JS library itself: the package's own ESM entry file
 * (vision_bundle.mjs, its package.json "module"), same pinned
 * version, same CDN as the WASM fileset above. */
export const TASKS_VISION_CDN_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`;

/** Detection cadence cap: at most one inference per ~33ms (~30Hz). */
export const DETECT_INTERVAL_MS = 33;

/** A fingertip must move at least this far (canvas units) to draw. */
const STROKE_MIN_DELTA = 0.0012;

export interface HandLandmarkerLike {
  detectForVideo: (
    video: unknown,
    timestampMs: number
  ) => { landmarks?: HandLandmarks[] };
  close?: () => void;
}

export interface HandsEngineDeps {
  createLandmarker: () => Promise<HandLandmarkerLike>;
  dispatch: (type: string, detail: unknown) => void;
  now?: () => number;
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
}

/** The slice of the Tasks Vision module this engine actually uses. */
export interface TasksVisionModule {
  FilesetResolver: {
    forVisionTasks: (wasmUrl: string) => Promise<unknown>;
  };
  HandLandmarker: {
    createFromOptions: (
      fileset: unknown,
      options: unknown
    ) => Promise<unknown>;
  };
}

/** Test seam: the node check injects a mocked tasks-vision module. */
type TasksVisionImporter = (url: string) => Promise<TasksVisionModule>;
let importerOverride: TasksVisionImporter | null = null;
export function setTasksVisionImporterForTests(
  fn: TasksVisionImporter | null
): void {
  importerOverride = fn;
}

async function importTasksVision(): Promise<TasksVisionModule> {
  if (importerOverride) return importerOverride(TASKS_VISION_CDN_URL);
  // A runtime-constructed import: Metro must never see the CDN
  // specifier (it would try to bundle the library and hit the
  // vision_bundle.mjs failure named in the header), and on the web
  // this performs the browser's genuine dynamic import — the exact
  // route Slice 27's onDeviceBrain and Slice 30's deviceGrounding
  // already prove in this app.
  const dynamicImport = new Function(
    "u",
    "return import(u)"
  ) as (u: string) => Promise<unknown>;
  return (await dynamicImport(TASKS_VISION_CDN_URL)) as TasksVisionModule;
}

/**
 * The production landmarker: the runtime CDN import keeps
 * MediaPipe out of the bundle entirely and loads it only when a
 * Hands toggle first turns on; GPU delegate first, CPU on refusal
 * (older devices and some browsers decline GPU inference — the
 * hand must still work there).
 */
export async function createHandLandmarker(): Promise<HandLandmarkerLike> {
  const vision = await importTasksVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(HAND_WASM_URL);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
    runningMode: "VIDEO" as const,
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return (await vision.HandLandmarker.createFromOptions(
      fileset,
      options("GPU")
    )) as HandLandmarkerLike;
  } catch {
    return (await vision.HandLandmarker.createFromOptions(
      fileset,
      options("CPU")
    )) as HandLandmarkerLike;
  }
}

/** Production dispatch: a window CustomEvent, the house pattern. */
export function dispatchWindowEvent(type: string, detail: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export interface HandsEngine {
  start: (video: unknown) => Promise<void>;
  stop: () => void;
  /**
   * One frame's decision path, exposed for the check script:
   * feed it landmarks (or null) and a timestamp; every dispatch
   * and store publish the live loop would make, it makes.
   */
  processFrame: (lm: HandLandmarks | null, now: number) => void;
  readonly running: boolean;
}

export function createHandsEngine(deps: HandsEngineDeps): HandsEngine {
  const now = deps.now ?? (() => performance.now());
  const raf =
    deps.raf ??
    ((cb: () => void) =>
      typeof requestAnimationFrame !== "undefined"
        ? requestAnimationFrame(cb)
        : (setTimeout(cb, 16) as unknown as number));
  const cancelRaf =
    deps.cancelRaf ??
    ((id: number) => {
      if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });

  const tipSmoother = createPointSmoother(0.45);
  const palmSmoother = createPointSmoother(0.5);
  const signTracker = createSignTracker(600, 150);
  const pushTracker = createPalmPushTracker(1.15, 700, 120);

  let landmarker: HandLandmarkerLike | null = null;
  let video: unknown = null;
  let rafId: number | null = null;
  let stopped = true;
  let lastVideoTime = -1;
  let lastDetectAt = 0;
  let livePublished = false;

  let prevTip: CanvasPoint | null = null;
  let wasPinched = false;

  function emitInput(detail: HandInputDetail): void {
    deps.dispatch(FABRIC_HAND_INPUT_EVENT, detail);
  }

  function fireSign(sign: NonNullable<ReturnType<typeof classifySign>>, lm: HandLandmarks): void {
    publishHands({ lastSign: { sign, at: Date.now() } });
    const detail: HandSignDetail = { sign, source: "hand" };
    deps.dispatch(FABRIC_HAND_SIGN_EVENT, detail);
    if (sign === "peace") {
      deps.dispatch(FABRIC_VERB_EVENT, "cheer");
    } else if (sign === "thumbsup") {
      deps.dispatch(FABRIC_VERB_EVENT, "heart");
    } else if (sign === "fist") {
      const c = palmCentroidCanvas(lm);
      emitInput({ kind: "clear", source: "hand", x: c.x, y: c.y });
    }
    // "hold": the sign event is the act — LegacyFluid forwards it
    // to the ghost, whose world stills around a held palm.
  }

  function processFrame(lm: HandLandmarks | null, nowMs: number): void {
    if (!lm || lm.length < 21) {
      publishHands({ handPresent: false, tip: null, pinched: false });
      tipSmoother.reset();
      palmSmoother.reset();
      signTracker.sample(null, nowMs);
      pushTracker.sample(null, nowMs);
      prevTip = null;
      wasPinched = false;
      return;
    }
    if (!livePublished) {
      livePublished = true;
      publishHands({ phase: "live", error: null });
    }
    const tip = tipSmoother.next(landmarkToCanvas(lm[LM.indexTip]));
    const centroid = palmSmoother.next(palmCentroidCanvas(lm));
    const pinched = isPinched(lm);
    publishHands({ handPresent: true, tip, pinched });

    // Signs first: a held shape is a word, and the word should not
    // also paint. (The pointing pose already excludes every sign's
    // shape, so this ordering is belt and braces.)
    const fired = signTracker.sample(classifySign(lm), nowMs);
    if (fired) fireSign(fired, lm);

    // Palm push: an open palm in fast motion.
    const push = pushTracker.sample(isPalmOpen(lm) ? centroid : null, nowMs);
    if (push) {
      emitInput({
        kind: "push",
        source: "hand",
        x: centroid.x,
        y: centroid.y,
        dx: push.dx,
        dy: push.dy,
      });
    }

    // Point-draw / pinch-press.
    if (isPointPose(lm)) {
      if (prevTip) {
        const dx = tip.x - prevTip.x;
        const dy = tip.y - prevTip.y;
        const moved = Math.hypot(dx, dy) > STROKE_MIN_DELTA;
        const pinchEdge = pinched && !wasPinched;
        if (moved || pinchEdge) {
          emitInput({
            kind: "stroke",
            source: "hand",
            x: tip.x,
            y: tip.y,
            dx,
            dy,
            pinched,
          });
        }
      }
      prevTip = tip;
    } else {
      prevTip = null;
    }
    wasPinched = pinched;
  }

  const tick = (): void => {
    if (stopped) return;
    const v = video as { readyState?: number; currentTime?: number } | null;
    const t = now();
    if (
      landmarker &&
      v &&
      (v.readyState ?? 0) >= 2 &&
      v.currentTime !== lastVideoTime &&
      t - lastDetectAt >= DETECT_INTERVAL_MS
    ) {
      lastVideoTime = v.currentTime ?? 0;
      lastDetectAt = t;
      try {
        const res = landmarker.detectForVideo(v, t);
        processFrame(res?.landmarks?.[0] ?? null, t);
      } catch {
        // A failed frame is dropped, never fatal: detection
        // hiccups (a GPU context blink, a mid-stream resolution
        // change) must not take the layer down with them.
      }
    }
    rafId = raf(tick);
  };

  return {
    get running() {
      return !stopped;
    },
    async start(videoEl: unknown): Promise<void> {
      if (!stopped) return;
      stopped = false;
      video = videoEl;
      try {
        landmarker = await deps.createLandmarker();
      } catch (err) {
        stopped = true;
        publishHands({
          phase: "unsupported",
          error:
            err instanceof Error
              ? err.message
              : "Hand tracking could not start on this device.",
        });
        return;
      }
      if (stopped) {
        // Stopped while the model loaded — release and stay off.
        landmarker.close?.();
        landmarker = null;
        return;
      }
      rafId = raf(tick);
    },
    stop(): void {
      stopped = true;
      if (rafId !== null) cancelRaf(rafId);
      rafId = null;
      landmarker?.close?.();
      landmarker = null;
      video = null;
      livePublished = false;
      prevTip = null;
      wasPinched = false;
      signTracker.reset();
      pushTracker.reset();
      publishHands({ handPresent: false, tip: null, pinched: false });
    },
    processFrame,
  };
}
