/**
 * Hands store — the meeting point for Slice 28's halves, in the
 * same module pub/sub pattern as src/sam/samCameraStore.
 *
 * The camera + detection engine (components/hands/HandsLayer) owns
 * the hand; everyone else reads:
 * - LegacyFluid: the camera-live flag (its transparent-backdrop
 *   compositing follows it on layers where Hands brings the
 *   camera), and — through the window events below — the hand's
 *   touches themselves.
 * - FabricMenu: the phase + error, so the Hands toggle in THIS
 *   LAYER can say plainly what state the feature is in.
 * - The overlay (same component family): the fingertip, the pinch
 *   state and the last recognized sign, for the reticle + caption.
 *
 * THE EVENTS are the input seam, and they are deliberately the
 * house pattern (FABRIC_VERB_EVENT, FABRIC_PET_GHOST_EVENT,
 * FABRIC_WARM_WELCOME_EVENT): the hand does not call into the
 * fluid. It ASKS, on the window, and LegacyFluid answers through
 * the exact funnel a finger uses — session gate, sendInteraction,
 * local splat, ghost note. Every hand-made interaction is stamped
 * source: "hand" (FluidInteraction.source): the fluid cannot tell
 * a hand-touch from a finger-touch except by that tag, which is
 * the design.
 *
 * PRIVACY: nothing in this module holds a frame, an image or a
 * landmark history. The snapshot is a phase, a point and a sign —
 * the present tense only. Landmarks are computed on-device by the
 * engine and dropped frame by frame; nothing here can retain them
 * because nothing here ever sees them.
 *
 * Powered by Nirvana
 */

import type { CanvasPoint, HandSignId } from "./handGeometry";
import type { GestureToken } from "./gestureVocabulary";

/** Hand input asks, dispatched on the window (see header). */
export const FABRIC_HAND_INPUT_EVENT = "fabric:hand-input";

/** A recognized sign, dispatched as it fires (the ghost hears it). */
export const FABRIC_HAND_SIGN_EVENT = "fabric:hand-sign";

/**
 * Slice 34 (Layer B1): a gesture TOKEN, dispatched as it fires.
 * Where the sign event carries Slice 28's four held shapes for the
 * ghost's event journal, this event carries the full v2 vocabulary
 * (src/hands/gestureVocabulary) — pinch, point, finger_draw, wave,
 * palm_push, thumbs_down and the signs in token language — and
 * LegacyFluid forwards it to the ghost's noteGesture sense, which
 * lands the reading in the scenario digest's `gestures` field.
 */
export const FABRIC_GESTURE_EVENT = "fabric:gesture";

export interface GestureDetail {
  token: GestureToken;
  hand: "left" | "right" | "unknown";
  /** Heuristic 0..1 from the vocabulary tracker (not a model score). */
  confidence: number;
  held_s: number;
  source: "hand";
}

export type HandInputDetail =
  | {
      kind: "stroke";
      source: "hand";
      x: number;
      y: number;
      /** Canvas-space delta since the previous stroke point. */
      dx: number;
      dy: number;
      pinched: boolean;
    }
  | {
      kind: "push";
      source: "hand";
      x: number;
      y: number;
      /** Palm velocity, canvas units per second. */
      dx: number;
      dy: number;
    }
  | { kind: "clear"; source: "hand"; x: number; y: number }
  | {
      /**
       * Slice 34 (Layer B2): a pinch-grab — the hand closes on the
       * fluid at the fingertip and HOLDS it. start: the grab lands;
       * move: the held point travels (dx/dy = canvas delta of the
       * fingertip since the previous grab point); end: release.
       * LegacyFluid answers with a sustained held-point splat
       * through the same send funnel as a stroke, so the grab and
       * its travel land on every screen in the room.
       */
      kind: "grab";
      source: "hand";
      phase: "start" | "move" | "end";
      x: number;
      y: number;
      dx: number;
      dy: number;
    };

export interface HandSignDetail {
  sign: HandSignId;
  source: "hand";
}

/** Product-language names for the recognized signs (overlay + menu). */
export const HAND_SIGN_LABELS: Record<HandSignId, string> = {
  hold: "✋ Hold",
  peace: "✌ Peace — cheer",
  fist: "✊ Fist — clear",
  thumbsup: "👍 Thumbs up — heart",
};

export type HandsPhase =
  | "off"
  | "starting"
  | "live"
  | "blocked"
  | "unsupported";

export interface HandsSnapshot {
  phase: HandsPhase;
  /** Plain-language failure (camera blocked, model failed) or null. */
  error: string | null;
  /** True while Hands owns a camera stream on a non-SAM layer. */
  cameraLive: boolean;
  handPresent: boolean;
  /** Fingertip in canvas space (smoothed), null when no hand. */
  tip: CanvasPoint | null;
  pinched: boolean;
  /** The last sign that fired, with its firing time. */
  lastSign: { sign: HandSignId; at: number } | null;
  /** Slice 34: the last gesture TOKEN that fired, with its time. */
  lastGesture: { token: GestureToken; at: number } | null;
}

let snapshot: HandsSnapshot = {
  phase: "off",
  error: null,
  cameraLive: false,
  handPresent: false,
  tip: null,
  pinched: false,
  lastSign: null,
  lastGesture: null,
};

const listeners = new Set<(s: HandsSnapshot) => void>();

export function getHandsSnapshot(): HandsSnapshot {
  return snapshot;
}

export function subscribeHands(
  fn: (s: HandsSnapshot) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishHands(partial: Partial<HandsSnapshot>): void {
  const next: HandsSnapshot = { ...snapshot, ...partial };
  if (
    next.phase === snapshot.phase &&
    next.error === snapshot.error &&
    next.cameraLive === snapshot.cameraLive &&
    next.handPresent === snapshot.handPresent &&
    next.pinched === snapshot.pinched &&
    next.lastSign === snapshot.lastSign &&
    next.lastGesture === snapshot.lastGesture &&
    next.tip?.x === snapshot.tip?.x &&
    next.tip?.y === snapshot.tip?.y
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((fn) => fn(snapshot));
}

/* ------------------------------------------------------------------ */
/* The fluid-path camera element (Hands' own stream, non-SAM layers)   */
/* ------------------------------------------------------------------ */

let handsVideoEl: HTMLVideoElement | null = null;

/** Register Hands' own <video> (null when its camera stops). */
export function registerHandsVideo(el: HTMLVideoElement | null): void {
  handsVideoEl = el;
}

export function getHandsVideoElement(): HTMLVideoElement | null {
  return handsVideoEl;
}
