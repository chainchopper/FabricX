/**
 * Slice 48 — The Fold's structure camera: a stable cinematic rig.
 *
 * Why this module exists. The molecular view used to aim a FIXED camera
 * at a group whose rotation/offset chased pointer targets with a flat
 * 0.12-per-frame lerp — no delta time anywhere, so the approach speed
 * doubled and halved with the frame rate of a view that rebuilds its
 * tube geometry every single frame, and the only framing in the system
 * was the morph normalizer's fit of the folded end state. On a phone
 * that read as a camera that "moves wonkey": every frame hitch became
 * a lurch, orbiting surged and lagged behind the finger, and nothing
 * owned where the camera sits.
 *
 * The rig here owns the framing, and it is a function of exactly two
 * things: the TARGET structure and the viewer's own hands.
 *  - The frame — orbit pivot + bounding sphere + fitted distance — is
 *    computed ONCE per structure from the folded Cα coordinates only.
 *    The open-chain layout and everything the morph interpolates
 *    between never enter a framing decision.
 *  - The fold has no seat at this table: no input to any function in
 *    this module carries the verified fraction or any morph state, so
 *    folding, settling, and verifying move the camera by exactly zero.
 *  - Every channel (azimuth, polar, zoom) rides a critically damped
 *    spring — damping ratio exactly 1, the fastest approach that
 *    never overshoots — integrated on real delta time with substeps,
 *    so the feel is identical at 30, 60, or 120 fps and a long frame
 *    cannot teleport the camera.
 *  - Before the viewer first touches the view, a slow sinusoidal
 *    drift breathes on the azimuth. The first touch retires it for
 *    good, and a live drag suppresses it absolutely: the viewer's
 *    input always wins over any residual auto-motion.
 *
 * No React, no three.js, no clocks, no randomness: callers pass time
 * in. Same inputs, same pose, on every device.
 */

import type { MolVec3 } from "./molMath";

/** Vertical field of view of the structure canvas, degrees. */
export const CAMERA_FOV_DEG = 42;
/** Breathing-room multiplier on the exact bounding-sphere fit. */
export const CAMERA_FIT_MARGIN = 1.3;
/**
 * Angular rate (rad/s) of the critically damped camera spring — the
 * rig's damping constant. Damping ratio is exactly 1 by construction
 * (see springChannel), so approaches never overshoot or ring.
 */
export const CAMERA_SPRING_OMEGA = 11;
/** Peak idle azimuth drift before first touch, radians (~2.9°). */
export const CAMERA_DRIFT_AMPLITUDE = 0.05;
/** Drift phase rate (rad/s) — one full sway takes about 57 seconds. */
export const CAMERA_DRIFT_RATE = 0.11;
/** Zoom clamps, as factors of the fitted distance. */
export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2.4;
/** Polar clamps (radians), the original rig's range. */
export const CAMERA_POL_MIN = -1.2;
export const CAMERA_POL_MAX = 1.2;
/** Default view direction, carried over from the original rig. */
export const CAMERA_DEFAULT_AZ = 0.6;
export const CAMERA_DEFAULT_POL = 0.25;

/** A frame a structure is viewed through: pivot + bounding sphere. */
export interface MolCameraFrame {
  /** Centroid (mean) of the target Cα positions — the orbit pivot. */
  center: MolVec3;
  /** Bounding-sphere radius about that centroid, target positions only. */
  radius: number;
}

/**
 * The frame for one structure, from its TARGET positions alone (the
 * normalized folded coordinates the view already computes). Computed
 * once per structure; nothing about the morph can change it.
 */
export function frameForTarget(target: MolVec3[]): MolCameraFrame {
  if (target.length === 0) return { center: [0, 0, 0], radius: 0 };
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const [x, y, z] of target) {
    cx += x;
    cy += y;
    cz += z;
  }
  const n = target.length;
  const center: MolVec3 = [cx / n, cy / n, cz / n];
  let radius = 0;
  for (const [x, y, z] of target) {
    const d = Math.hypot(x - center[0], y - center[1], z - center[2]);
    if (d > radius) radius = d;
  }
  return { center, radius };
}

/**
 * The distance at which the frame's bounding sphere fits inside the
 * tighter of the vertical / horizontal fields of view, with margin.
 * Aspect comes from the viewport, never from the fold.
 */
export function fitDistance(
  frame: MolCameraFrame,
  aspect: number,
  fovDeg: number = CAMERA_FOV_DEG,
  margin: number = CAMERA_FIT_MARGIN,
): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
  const fitFov = Math.min(vFov, hFov);
  const r = Math.max(frame.radius, 0.35);
  return (r / Math.sin(fitFov / 2)) * margin;
}

/** The whole rig state: spring values, their targets, and drift authority. */
export interface MolCameraRig {
  frame: MolCameraFrame;
  /** Current (spring-integrated) channel values. */
  az: number;
  pol: number;
  zoom: number;
  /** Targets — written ONLY by viewer input (rigOrbit / rigZoomBy). */
  tAz: number;
  tPol: number;
  tZoom: number;
  /** Spring velocities, one per channel. */
  vAz: number;
  vPol: number;
  vZoom: number;
  /** The viewer has taken the camera at least once. */
  interacted: boolean;
  /** A pointer is down right now. */
  dragging: boolean;
  /** 0..1 — how much of the idle drift currently reaches the pose. */
  driftWeight: number;
}

export function createCameraRig(frame: MolCameraFrame): MolCameraRig {
  return {
    frame,
    az: CAMERA_DEFAULT_AZ,
    pol: CAMERA_DEFAULT_POL,
    zoom: 1,
    tAz: CAMERA_DEFAULT_AZ,
    tPol: CAMERA_DEFAULT_POL,
    tZoom: 1,
    vAz: 0,
    vPol: 0,
    vZoom: 0,
    interacted: false,
    dragging: false,
    driftWeight: 1,
  };
}

/** A pointer went down: the viewer owns the camera from here on. */
export function rigDragStart(rig: MolCameraRig): void {
  rig.dragging = true;
  rig.interacted = true;
}

export function rigDragEnd(rig: MolCameraRig): void {
  rig.dragging = false;
}

/** Orbit input, as deltas in radians. Moves the targets only. */
export function rigOrbit(rig: MolCameraRig, dAz: number, dPol: number): void {
  rig.interacted = true;
  rig.tAz += dAz;
  rig.tPol = Math.min(CAMERA_POL_MAX, Math.max(CAMERA_POL_MIN, rig.tPol + dPol));
}

/** Zoom input, as a log-space delta (pinch / wheel). Targets only. */
export function rigZoomBy(rig: MolCameraRig, logDelta: number): void {
  rig.interacted = true;
  rig.tZoom = Math.min(
    CAMERA_ZOOM_MAX,
    Math.max(CAMERA_ZOOM_MIN, rig.tZoom * Math.exp(logDelta)),
  );
}

/** A longer frame than this is clamped, never chased. */
const MAX_STEP_DT = 0.05;
/** Spring integration resolution — fine enough that ω·h stays tiny. */
const SUBSTEP = 1 / 240;

/**
 * One channel of a critically damped spring (semi-implicit Euler):
 * acceleration = ω²·(target − x) − 2ω·v, with damping ratio exactly 1.
 * Returns [next value, next velocity].
 */
function springChannel(
  x: number,
  v: number,
  target: number,
  h: number,
): [number, number] {
  const w = CAMERA_SPRING_OMEGA;
  const acc = w * w * (target - x) - 2 * w * v;
  const nv = v + acc * h;
  return [x + nv * h, nv];
}

/**
 * Advance the rig by dtSec of REAL time. The fold is not an input:
 * stepping the rig while any fold state changes elsewhere cannot move
 * the camera — at rest (targets == values) a step is an exact no-op.
 */
export function stepCameraRig(rig: MolCameraRig, dtSec: number): void {
  let dt = Number.isFinite(dtSec) && dtSec > 0 ? Math.min(dtSec, MAX_STEP_DT) : 0;
  // Drift authority: full until the first touch, then it retires for
  // good. An exponential approach on real time (not a camera channel).
  const driftTarget = rig.interacted ? 0 : 1;
  rig.driftWeight +=
    (driftTarget - rig.driftWeight) * (1 - Math.exp(-dt / 0.45));
  while (dt > 0) {
    const h = Math.min(dt, SUBSTEP);
    [rig.az, rig.vAz] = springChannel(rig.az, rig.vAz, rig.tAz, h);
    [rig.pol, rig.vPol] = springChannel(rig.pol, rig.vPol, rig.tPol, h);
    [rig.zoom, rig.vZoom] = springChannel(rig.zoom, rig.vZoom, rig.tZoom, h);
    dt -= h;
  }
}

/** Where the camera sits this frame, and what it looks at. */
export interface MolCameraPose {
  position: MolVec3;
  lookAt: MolVec3;
  /** The drift's current azimuth contribution (exactly 0 once the
   *  viewer owns the camera, and during any live drag). */
  driftAz: number;
}

/**
 * The pose for a fitted distance and a clock reading. The position is
 * the spherical orbit about the frame's centroid — the exact inverse
 * of the rotation the old rig applied to the model group, so the
 * framing the room already knows is preserved; the pivot is now the
 * target centroid instead of the coordinate origin.
 */
export function cameraPose(
  rig: MolCameraRig,
  fitDist: number,
  timeSec: number,
): MolCameraPose {
  const driftAz =
    !rig.dragging && rig.driftWeight > 0
      ? CAMERA_DRIFT_AMPLITUDE * rig.driftWeight * Math.sin(timeSec * CAMERA_DRIFT_RATE)
      : 0;
  const az = rig.az + driftAz;
  const dist = Math.max(0.05, fitDist * rig.zoom);
  const cp = Math.cos(rig.pol);
  const [cx, cy, cz] = rig.frame.center;
  return {
    position: [
      cx - dist * cp * Math.sin(az),
      cy + dist * Math.sin(rig.pol),
      cz + dist * cp * Math.cos(az),
    ],
    lookAt: [cx, cy, cz],
    driftAz,
  };
}
