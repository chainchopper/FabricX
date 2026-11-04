/**
 * Fluid backdrop store — Slice 62: the meeting point for the fluid
 * layer's two halves, in the same module pub/sub pattern as
 * src/sam/samCameraStore and src/hands/handsStore.
 *
 * The layer is split by compositing order, exactly like See: the
 * backdrop surface (FluidBackdrop) renders UNDER the fluid canvas
 * while the engine (LegacyFluid) needs to know — without importing
 * the surface — whether a picture is actually beneath it, because
 * only then may it run its transparent-backdrop mode. What passes
 * through here:
 *
 * - LIVENESS (surface -> engine): `live` is true only while a
 *   photo is on screen or a camera frame is flowing. The engine's
 *   transparent flag follows this and nothing else — a backdrop
 *   that failed to start never turns the canvas transparent, so a
 *   denied camera can never leave a see-through (or black) canvas.
 * - STATUS + CAPTION (surface -> controls): the Background row in
 *   THIS LAYER shows the failure caption ("Camera couldn't start…")
 *   after the surface has already fallen back to the color preset.
 *
 * PRIVACY: nothing but state passes through this module — never a
 * frame, never an image. The photo itself lives in the layer's own
 * config (LayerSettingsMirror); the camera feed lives only in the
 * surface's <video> element and is never recorded or sent.
 *
 * Powered by Nirvana
 */

export type FluidBackdropKind = "photo" | "camera";
export type FluidBackdropStatus = "idle" | "starting" | "live" | "error";

export interface FluidBackdropSnapshot {
  /** A picture or feed is on screen beneath the canvas right now. */
  live: boolean;
  kind: FluidBackdropKind | null;
  status: FluidBackdropStatus;
  /** Product-language failure line for the controls; null otherwise. */
  error: string | null;
}

let snapshot: FluidBackdropSnapshot = {
  live: false,
  kind: null,
  status: "idle",
  error: null,
};

const listeners = new Set<(s: FluidBackdropSnapshot) => void>();

export function getFluidBackdropSnapshot(): FluidBackdropSnapshot {
  return snapshot;
}

export function subscribeFluidBackdrop(
  fn: (s: FluidBackdropSnapshot) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishFluidBackdrop(
  partial: Partial<FluidBackdropSnapshot>
): void {
  const next: FluidBackdropSnapshot = {
    live: partial.live ?? snapshot.live,
    kind: partial.kind !== undefined ? partial.kind : snapshot.kind,
    status: partial.status ?? snapshot.status,
    error: partial.error !== undefined ? partial.error : snapshot.error,
  };
  if (
    next.live === snapshot.live &&
    next.kind === snapshot.kind &&
    next.status === snapshot.status &&
    next.error === snapshot.error
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // A listener must never break the backdrop's lifecycle.
    }
  });
}

/**
 * The failure captions, in product language — one place, so the
 * surface that falls back and the controls that explain it can
 * never disagree. Denial and absence are different facts and get
 * different lines; neither ever blames the user.
 */
export function backdropErrorCaption(errName: string | null): string {
  if (errName === "NotAllowedError" || errName === "SecurityError") {
    return "The camera stayed off, so your color background is back. Allow the camera for this site and try Live camera again.";
  }
  if (
    errName === "NotFoundError" ||
    errName === "DevicesNotFoundError" ||
    errName === "OverconstrainedError"
  ) {
    return "No camera was found, so your color background is back.";
  }
  return "The camera couldn't start, so your color background is back.";
}

export const PHOTO_LOST_CAPTION =
  "That photo isn't on this device anymore, so your color background is back.";

/** Test-only reset. */
export function resetFluidBackdropForTests(): void {
  snapshot = { live: false, kind: null, status: "idle", error: null };
  listeners.clear();
}
