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

/** Hand input asks, dispatched on the window (see header). */
export const FABRIC_HAND_INPUT_EVENT = "fabric:hand-input";

/** A recognized sign, dispatched as it fires (the ghost hears it). */
export const FABRIC_HAND_SIGN_EVENT = "fabric:hand-sign";

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
  | { kind: "clear"; source: "hand"; x: number; y: number };

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
}

let snapshot: HandsSnapshot = {
  phase: "off",
  error: null,
  cameraLive: false,
  handPresent: false,
  tip: null,
  pinched: false,
  lastSign: null,
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
