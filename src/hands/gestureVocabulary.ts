/**
 * Gesture vocabulary — Slice 34 ("Senses", Layer B1): the finite
 * set of hand gestures the fabric's intelligence is allowed to
 * READ, tokenized into the ghost's state digest.
 *
 * WHY TOKENS: the ghost does not "see a hand." Its brain tiers read
 * a scenario digest (GhostBrain.GhostScenario) whose sense fields
 * are small, typed vocabularies — verbs_seen, recent_events, and
 * (schema v2, the distillation dataset's contract) `gestures`:
 * [{ token, hand, confidence, held_s }]. This module is the single
 * place where camera-landmark facts become those tokens, using the
 * EXACT token strings the v2 dataset teaches (fabric-model-pipeline
 * /dataset/schema_v2.md): open_palm, closed_fist, pinch, point,
 * finger_draw, peace, thumbs_up, thumbs_down, wave, palm_push,
 * two_hands_open, heart_hands, none — plus the RESERVED fingerspell
 * pattern asl_<letter>.
 *
 * B5 HONESTY (read before touching): asl_<letter> is a reserved
 * vocabulary slot ONLY. No classifier in this module — or anywhere
 * in this build — produces an asl_ token; no sign-language dataset
 * has been ingested; nothing here recognizes sign language. The
 * slot exists so a future recognizer can speak the same language
 * without a schema change. two_hands_open and heart_hands are
 * likewise vocabulary the digest can carry but the current
 * one-hand engine (numHands: 1) cannot observe, so the tracker
 * never emits them either. Claiming otherwise anywhere — packet,
 * menu copy, demo — would be lying about the build.
 *
 * WHAT THE TRACKER SEES: per frame, the hands engine already
 * computes the raw facts (Slice 28): the static sign classification
 * and its held-fire, the pinch verdict + ratio, the pointing pose,
 * whether a stroke was emitted, the palm centroid and the palm-push
 * tracker's verdict. This module's tracker turns those facts into
 * token edges — a token fires ONCE per gesture (on the held-fire,
 * the pinch edge, the pose dwell, the draw start, the push, the
 * wave's second direction flip), never as a per-frame stream, so
 * the digest reads "someone showed a peace sign," not thirty
 * frames of peace.
 *
 * CONFIDENCE is a heuristic honesty score, not a model output:
 * held signs survived a 600ms hold (0.95), a pinch scores by how
 * far inside the pinch ratio it sits, a push by the tracker's
 * speed margin. It exists so the brain can weigh a sure reading
 * over a marginal one; it is never presented as MediaPipe's
 * confidence, which the engine does not surface.
 *
 * PRIVACY: same law as Slice 28 — landmarks live for one frame's
 * arithmetic and are dropped. This module retains only the token
 * edges it fired and the tracker's small motion state; no landmark
 * history exists here to leak.
 *
 * Pure on purpose: no DOM, no camera, no MediaPipe types — the
 * check script drives the tracker with synthetic observations, so
 * the vocabulary's promises are proven off-device.
 *
 * Powered by Nirvana
 */

import {
  fingerStates,
  handScale,
  LM,
  type CanvasPoint,
  type HandLandmarks,
  type HandSignId,
} from "./handGeometry";

/* ------------------------------------------------------------------ */
/* The vocabulary                                                      */
/* ------------------------------------------------------------------ */

/** The v2 gesture token vocabulary (schema_v2.md), minus the
 *  reserved asl_<letter> pattern, which is a shape, not a member. */
export const GESTURE_TOKENS = [
  "open_palm",
  "closed_fist",
  "pinch",
  "point",
  "finger_draw",
  "peace",
  "thumbs_up",
  "thumbs_down",
  "wave",
  "palm_push",
  "two_hands_open",
  "heart_hands",
  "none",
] as const;

export type GestureToken = (typeof GESTURE_TOKENS)[number];

export function isGestureToken(v: unknown): v is GestureToken {
  return (
    typeof v === "string" &&
    (GESTURE_TOKENS as readonly string[]).includes(v)
  );
}

/**
 * The reserved B5 slot: a fingerspelled letter token, asl_a..asl_z.
 * Recognized as a SHAPE (the digest sanitizer will carry it the day
 * a real recognizer exists) — produced by NOTHING in this build.
 */
export function isReservedAslToken(v: unknown): boolean {
  return typeof v === "string" && /^asl_[a-z]$/.test(v);
}

/** One token reading, in the digest's v2 shape (schema_v2.md). */
export interface GestureReading {
  token: GestureToken;
  hand: "left" | "right" | "unknown";
  /** Heuristic 0..1 (see header) — never a model confidence. */
  confidence: number;
  /** How long the gesture had been held when it fired, seconds. */
  held_s: number;
}

/** Slice 28's held signs, in token language. */
export const SIGN_TO_GESTURE_TOKEN: Record<HandSignId, GestureToken> = {
  hold: "open_palm",
  peace: "peace",
  fist: "closed_fist",
  thumbsup: "thumbs_up",
};

/**
 * The thumbs-down pose, which handGeometry's sign classifier does
 * not carry (its four signs were Slice 28's verb set): four fingers
 * folded, thumb extended and pointing DOWN — tip clearly below its
 * IP joint in image space, the mirror of the thumbs-up test.
 */
export function isThumbsDownPose(lm: HandLandmarks): boolean {
  if (!lm || lm.length < 21) return false;
  const f = fingerStates(lm);
  const fourFolded = !f.index && !f.middle && !f.ring && !f.pinky;
  if (!fourFolded || !f.thumb) return false;
  return lm[LM.thumbTip].y > lm[LM.thumbIp].y + 0.25 * handScale(lm);
}

/* ------------------------------------------------------------------ */
/* The tracker                                                         */
/* ------------------------------------------------------------------ */

/**
 * One frame's facts, as the hands engine already computes them.
 * The tracker consumes facts, not landmarks, so its decisions can
 * be driven by fixtures that never touched a camera.
 */
export interface GestureObservation {
  handPresent: boolean;
  /** The sign the hold-tracker fired THIS frame, if any. */
  firedSign: HandSignId | null;
  /** Four-folded + thumb-down pose (held-timed by this tracker). */
  thumbsDownPose: boolean;
  pinched: boolean;
  /** Thumb↔index distance over hand scale (for pinch confidence). */
  pinchRatioValue: number;
  pointPose: boolean;
  /** A fingertip stroke was emitted this frame (the draw is live). */
  drawing: boolean;
  palmOpen: boolean;
  /** Smoothed palm centroid, canvas space (wave tracking). */
  centroid: CanvasPoint | null;
  /** The palm-push tracker fired this frame. */
  push: { dx: number; dy: number } | null;
  hand: "left" | "right" | "unknown";
}

/** Point must dwell this long, near-still, to count as a point. */
export const POINT_DWELL_MS = 350;
/** The thumbs-down pose must be held this long to fire. */
export const THUMB_DOWN_HOLD_MS = 600;
/** A draw re-arms after this much stroke silence. */
const DRAW_REARM_MS = 500;
/** Wave: horizontal direction flips needed inside the window. */
const WAVE_FLIPS = 2;
const WAVE_WINDOW_MS = 1600;
const WAVE_COOLDOWN_MS = 1500;
/** Below this horizontal centroid speed, motion is not a wave. */
const WAVE_MIN_VX = 0.3;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface GestureTracker {
  /** Feed one frame; returns the readings that fired on it (0..1). */
  sample: (obs: GestureObservation, now: number) => GestureReading[];
  reset: () => void;
}

export function createGestureTracker(): GestureTracker {
  let wasPinched = false;
  let pointSince = 0;
  let pointFired = false;
  let drawLive = false;
  let drawFired = false;
  let lastDrawAt = -Infinity;
  let thumbDownSince = 0;
  let thumbDownFired = false;
  // Wave state: last centroid sample + the recent flip times.
  let lastCentroid: { p: CanvasPoint; t: number } | null = null;
  let lastVxSign = 0;
  let flips: number[] = [];
  let waveCoolUntil = -Infinity;

  function resetMotion(): void {
    lastCentroid = null;
    lastVxSign = 0;
    flips = [];
  }

  function sample(obs: GestureObservation, now: number): GestureReading[] {
    if (!obs.handPresent) {
      wasPinched = false;
      pointSince = 0;
      pointFired = false;
      drawLive = false;
      drawFired = false;
      thumbDownSince = 0;
      thumbDownFired = false;
      resetMotion();
      return [];
    }
    const hand = obs.hand;
    const out: GestureReading[] = [];
    const fire = (r: GestureReading): GestureReading[] => {
      out.push(r);
      return out;
    };

    // 1. A held sign is a word — it outranks every motion token.
    //    One precision: handGeometry's classifier calls every
    //    four-folded shape a fist, including a thumbs-down (the
    //    thumb's direction is the difference). When the pose IS
    //    thumbs-down, the token language reads it as thumbs_down
    //    (rule 2, same hold) instead of closed_fist. Slice 28's
    //    sign EVENT and its clear act are untouched — only the
    //    token differs.
    if (obs.firedSign && !(obs.firedSign === "fist" && obs.thumbsDownPose)) {
      return fire({
        token: SIGN_TO_GESTURE_TOKEN[obs.firedSign],
        hand,
        confidence: 0.95,
        held_s: 0.6,
      });
    }

    // 2. Thumbs-down: this tracker's own hold timer (the geometry
    //    sign tracker does not carry the pose).
    if (obs.thumbsDownPose) {
      if (thumbDownSince === 0) thumbDownSince = now;
      if (!thumbDownFired && now - thumbDownSince >= THUMB_DOWN_HOLD_MS) {
        thumbDownFired = true;
        return fire({
          token: "thumbs_down",
          hand,
          confidence: 0.9,
          held_s: (now - thumbDownSince) / 1000,
        });
      }
    } else {
      thumbDownSince = 0;
      thumbDownFired = false;
    }

    // 3. A palm push is one deliberate shove.
    if (obs.push) {
      const speed = Math.hypot(obs.push.dx, obs.push.dy);
      return fire({
        token: "palm_push",
        hand,
        confidence: Math.round(clamp01(0.62 + speed * 0.18) * 100) / 100,
        held_s: 0,
      });
    }

    // 4. Wave: an open palm oscillating sideways — direction flips
    //    of the centroid's horizontal velocity inside the window.
    if (obs.palmOpen && obs.centroid) {
      if (lastCentroid && now > lastCentroid.t) {
        const vx =
          (obs.centroid.x - lastCentroid.p.x) / ((now - lastCentroid.t) / 1000);
        const sign = Math.abs(vx) >= WAVE_MIN_VX ? Math.sign(vx) : 0;
        if (sign !== 0) {
          if (lastVxSign !== 0 && sign !== lastVxSign) {
            flips = flips.filter((t) => now - t < WAVE_WINDOW_MS);
            flips.push(now);
            if (flips.length >= WAVE_FLIPS && now >= waveCoolUntil) {
              flips = [];
              waveCoolUntil = now + WAVE_COOLDOWN_MS;
              lastCentroid = { p: { ...obs.centroid }, t: now };
              lastVxSign = sign;
              return fire({
                token: "wave",
                hand,
                confidence: 0.85,
                held_s: 0,
              });
            }
          }
          lastVxSign = sign;
        }
      }
      lastCentroid = { p: { ...obs.centroid }, t: now };
    } else {
      resetMotion();
    }

    // 5. Pinch edge: the grab/press begins.
    const pinchEdge = obs.pinched && !wasPinched;
    wasPinched = obs.pinched;
    if (pinchEdge) {
      return fire({
        token: "pinch",
        hand,
        confidence:
          Math.round(clamp01(1.08 - obs.pinchRatioValue) * 100) / 100,
        held_s: 0,
      });
    }

    // 6. Drawing: the fingertip is painting in the air. Fires once
    //    per continuous draw; the stroke itself is B2's path, this
    //    token is B1's reading of it.
    if (obs.drawing) {
      lastDrawAt = now;
      if (!drawFired) {
        drawLive = true;
        drawFired = true;
        return fire({ token: "finger_draw", hand, confidence: 0.9, held_s: 0 });
      }
      drawLive = true;
    } else if (drawLive && now - lastDrawAt > DRAW_REARM_MS) {
      drawLive = false;
      drawFired = false;
    }

    // 7. Point: the pointing pose, dwelling. A point that starts
    //    moving becomes a draw (above); a point that stays is a
    //    word of its own — "there."
    if (obs.pointPose && !obs.drawing) {
      if (pointSince === 0) pointSince = now;
      if (!pointFired && now - pointSince >= POINT_DWELL_MS) {
        pointFired = true;
        return fire({
          token: "point",
          hand,
          confidence: 0.85,
          held_s: (now - pointSince) / 1000,
        });
      }
    } else {
      pointSince = 0;
      pointFired = false;
    }

    // No token this frame. A present-but-unreadable hand is the
    // vocabulary's "none" — a classification the CALLER may note,
    // never a token the tracker fires into the digest (a digest
    // entry every two seconds of camera noise would teach the
    // brain to ignore the whole sense).
    return out;
  }

  return {
    sample,
    reset(): void {
      wasPinched = false;
      pointSince = 0;
      pointFired = false;
      drawLive = false;
      drawFired = false;
      lastDrawAt = -Infinity;
      thumbDownSince = 0;
      thumbDownFired = false;
      waveCoolUntil = -Infinity;
      resetMotion();
    },
  };
}
