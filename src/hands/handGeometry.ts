/**
 * Hand geometry — the pure math of Slice 28 ("Hands").
 *
 * Everything here is landmark arithmetic with no DOM, no camera and
 * no MediaPipe types: the controller (handsEngine) feeds it the 21
 * normalized landmarks a HandLandmarker returns, and gets back
 * canvas-space points, a pinch verdict, a palm-push vector and a
 * static-sign classification. Pure on purpose — the check script
 * drives this module with synthetic landmark fixtures, so the
 * classifier's promises are proven off-device.
 *
 * COORDINATE SPACES (three, kept straight):
 * - Landmark space: MediaPipe's normalized image space — x right,
 *   y DOWN, origin top-left, of the (mirrored selfie) camera frame.
 * - Canvas space: the fluid's interaction space (FluidInteraction
 *   positions, engine texcoords) — x right, y UP. The pointer path
 *   proves it: LegacyFluidEngine maps a pointer's top-down ny to
 *   texcoordY = 1 - ny. A hand point lands as
 *   { x: 1 - lm.x, y: 1 - lm.y } — mirrored (your right hand appears
 *   on the canvas where you see it in the selfie view) and flipped
 *   into the fluid's y-up world.
 * - CSS space (the reticle overlay): left = canvas.x * w,
 *   top = (1 - canvas.y) * h.
 *
 * FINGER STATE is judged by distance ratios, not angles: a finger
 * is extended when its tip sits farther from the wrist than its
 * PIP joint does (a curled finger pulls its tip in toward the
 * palm). Ratios travel across hand sizes and camera distances;
 * absolute distances do not. The pinch verdict is likewise a ratio
 * — thumb-tip↔index-tip distance over the hand's own scale (wrist
 * to middle-finger base).
 *
 * Powered by Nirvana
 */

export interface HandPoint {
  x: number;
  y: number;
  z?: number;
}

/** A full hand: MediaPipe's 21 landmarks, in landmark space. */
export type HandLandmarks = HandPoint[];

/** MediaPipe hand landmark indices used here. */
export const LM = {
  wrist: 0,
  thumbTip: 4,
  thumbIp: 2,
  indexMcp: 5,
  indexPip: 6,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleTip: 12,
  ringPip: 14,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyTip: 20,
} as const;

export type FingerId = "thumb" | "index" | "middle" | "ring" | "pinky";

export type FingerStates = Record<FingerId, boolean>;

export type HandSignId = "hold" | "peace" | "fist" | "thumbsup";

export interface CanvasPoint {
  x: number;
  y: number;
}

function dist(a: HandPoint, b: HandPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function at(lm: HandLandmarks, i: number): HandPoint {
  return lm[i] ?? { x: 0, y: 0 };
}

/** The hand's own ruler: wrist to middle-finger base. */
export function handScale(lm: HandLandmarks): number {
  const s = dist(at(lm, LM.wrist), at(lm, LM.middleMcp));
  return s > 1e-6 ? s : 1;
}

function fingerExtended(lm: HandLandmarks, tip: number, pip: number): boolean {
  const wrist = at(lm, LM.wrist);
  return dist(at(lm, tip), wrist) > dist(at(lm, pip), wrist) * 1.1;
}

function thumbExtended(lm: HandLandmarks): boolean {
  // The thumb folds across the palm: extended means its tip has
  // swung away from the pinky side of the hand, relative to its
  // own IP joint.
  const anchor = at(lm, LM.pinkyMcp);
  return dist(at(lm, LM.thumbTip), anchor) > dist(at(lm, LM.thumbIp), anchor) * 1.08;
}

/** Which fingers are extended, per finger. */
export function fingerStates(lm: HandLandmarks): FingerStates {
  return {
    thumb: thumbExtended(lm),
    index: fingerExtended(lm, LM.indexTip, LM.indexPip),
    middle: fingerExtended(lm, LM.middleTip, LM.middlePip),
    ring: fingerExtended(lm, LM.ringTip, LM.ringPip),
    pinky: fingerExtended(lm, LM.pinkyTip, LM.pinkyPip),
  };
}

/** Thumb-tip↔index-tip distance as a fraction of the hand's scale. */
export function pinchRatio(lm: HandLandmarks): number {
  return dist(at(lm, LM.thumbTip), at(lm, LM.indexTip)) / handScale(lm);
}

/** Below this pinch ratio, thumb and index count as pressed together. */
export const PINCH_RATIO = 0.38;

export function isPinched(lm: HandLandmarks): boolean {
  return pinchRatio(lm) < PINCH_RATIO;
}

/**
 * The draw pose: index pointing, middle folded. Pointing (index
 * only) draws; a pinch in this pose presses. Peace (middle up too),
 * an open palm and a fist deliberately do NOT draw — a hand must be
 * able to cross the camera's view, and to sign, without painting.
 */
export function isPointPose(lm: HandLandmarks): boolean {
  const f = fingerStates(lm);
  return f.index && !f.middle;
}

/** All four fingers extended — the palm that pushes and holds. */
export function isPalmOpen(lm: HandLandmarks): boolean {
  const f = fingerStates(lm);
  return f.index && f.middle && f.ring && f.pinky;
}

/**
 * Classify a static handshape. Priority matters: peace is judged
 * before the open palm (its fingers are a subset), thumbs-up before
 * the fist (its four folded fingers are a fist's; the raised thumb
 * is the difference, and it must point UP — tip clearly above its
 * IP joint in image space, where y runs down).
 */
export function classifySign(lm: HandLandmarks): HandSignId | null {
  if (!lm || lm.length < 21) return null;
  const f = fingerStates(lm);
  const fourFolded = !f.index && !f.middle && !f.ring && !f.pinky;
  if (f.index && f.middle && !f.ring && !f.pinky) return "peace";
  if (
    fourFolded &&
    f.thumb &&
    at(lm, LM.thumbTip).y < at(lm, LM.thumbIp).y - 0.25 * handScale(lm)
  ) {
    return "thumbsup";
  }
  if (f.index && f.middle && f.ring && f.pinky) return "hold";
  if (fourFolded) return "fist";
  return null;
}

/** Landmark space → the fluid's canvas space (mirror + y-flip). */
export function landmarkToCanvas(p: HandPoint): CanvasPoint {
  return { x: 1 - p.x, y: 1 - p.y };
}

/** Canvas space → CSS pixels for the overlay (reticle, captions). */
export function canvasToCss(
  p: CanvasPoint,
  w: number,
  h: number
): { left: number; top: number } {
  return { left: p.x * w, top: (1 - p.y) * h };
}

/** The palm's center in canvas space (wrist + the four knuckles). */
export function palmCentroidCanvas(lm: HandLandmarks): CanvasPoint {
  const idx = [LM.wrist, LM.indexMcp, LM.middleMcp, 13, LM.pinkyMcp];
  let x = 0;
  let y = 0;
  for (const i of idx) {
    const p = landmarkToCanvas(at(lm, i));
    x += p.x;
    y += p.y;
  }
  return { x: x / idx.length, y: y / idx.length };
}

/**
 * Exponential smoothing for a tracked point — the fingertip's
 * anti-jitter. Detection noise at 30Hz reads as a shaking hand;
 * lerping toward each new sample keeps deliberate motion and eats
 * the tremor.
 */
export function createPointSmoother(alpha = 0.45) {
  let cur: CanvasPoint | null = null;
  return {
    next(p: CanvasPoint): CanvasPoint {
      if (!cur) {
        cur = { ...p };
        return { ...cur };
      }
      cur = {
        x: cur.x + (p.x - cur.x) * alpha,
        y: cur.y + (p.y - cur.y) * alpha,
      };
      return { ...cur };
    },
    reset(): void {
      cur = null;
    },
    peek(): CanvasPoint | null {
      return cur ? { ...cur } : null;
    },
  };
}

/**
 * The sign-hold state machine: a static shape must be HELD to
 * fire (default ~600ms), fires once per continuous hold, and
 * re-arms when the hand leaves the shape. A one-frame flicker of a
 * different classification does not reset the clock (grace window)
 * — landmark classifiers breathe at the edges, and a sign you are
 * clearly holding should not stutter out from under you.
 */
export function createSignTracker(holdMs = 600, graceMs = 150) {
  let candidate: HandSignId | null = null;
  let since = 0;
  let lastSeenAt = 0;
  let fired = false;
  return {
    /** Returns the sign at the moment it fires, else null. */
    sample(sign: HandSignId | null, now: number): HandSignId | null {
      if (sign === null) {
        if (candidate !== null && now - lastSeenAt > graceMs) {
          candidate = null;
          fired = false;
        }
        return null;
      }
      if (sign !== candidate) {
        // A different shape arriving inside the grace window is
        // distrusted for this sample — the candidate keeps its
        // clock. A shape that persists outlives the grace and
        // becomes the candidate on a later sample.
        if (candidate !== null && now - lastSeenAt <= graceMs) return null;
        candidate = sign;
        since = now;
        fired = false;
      }
      lastSeenAt = now;
      if (!fired && now - since >= holdMs) {
        fired = true;
        return sign;
      }
      return null;
    },
    reset(): void {
      candidate = null;
      fired = false;
      lastSeenAt = 0;
    },
  };
}

/**
 * The palm-push tracker: an open palm in fast motion is a shove.
 * Velocity is measured over a ~120ms window of (smoothed) palm
 * centroids so per-frame jitter cannot fake speed; a fired push
 * cools down before the next, so one swipe is one wave.
 */
export function createPalmPushTracker(
  minSpeed = 1.15,
  cooldownMs = 700,
  windowMs = 120
) {
  let anchor: { p: CanvasPoint; t: number } | null = null;
  let lastFiredAt = -Infinity;
  return {
    /**
     * Feed the palm centroid (canvas space) while the palm is open;
     * pass null the moment it isn't. Returns the push velocity
     * (canvas units per second) at the moment a push fires.
     */
    sample(
      centroid: CanvasPoint | null,
      now: number
    ): { dx: number; dy: number } | null {
      if (!centroid) {
        anchor = null;
        return null;
      }
      if (!anchor) {
        anchor = { p: { ...centroid }, t: now };
        return null;
      }
      const dt = (now - anchor.t) / 1000;
      if (dt * 1000 < windowMs) return null;
      const vx = (centroid.x - anchor.p.x) / dt;
      const vy = (centroid.y - anchor.p.y) / dt;
      anchor = { p: { ...centroid }, t: now };
      const speed = Math.hypot(vx, vy);
      if (speed >= minSpeed && now - lastFiredAt >= cooldownMs) {
        lastFiredAt = now;
        return { dx: vx, dy: vy };
      }
      return null;
    },
    reset(): void {
      anchor = null;
    },
  };
}
