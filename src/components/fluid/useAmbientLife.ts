import { useEffect, useRef, type RefObject } from "react";
import type { LegacyFluidEngine } from "./LegacyFluidEngine";
import { getIdentitySnapshot, hueDyeColor } from "../../identity/identityStore";

/**
 * Slice 7 (Alive) — the base fluid's ambient life driver.
 *
 * Terrell's field report, after the 3-device test: "I hate how the
 * fabric dies after idle. It doesn't have a mind of its own to react
 * to events or just breathe and play a little and just be alone on
 * its own." The idle contract (see src/types/experience.ts) makes
 * every layer declare its idle behavior; the base fluid declares
 * `ambient`, and this hook is that declaration made real.
 *
 * Design:
 * - QUIET FIRST. Nothing happens until the room has been completely
 *   still for AMBIENT_IDLE_THRESHOLD_MS — no local touch, no remote
 *   splat, no verb, no note, no pattern step, no ghost gesture.
 *   LegacyFluid owns that activity clock (activityRef) and feeds
 *   every genuine input path into it; this driver only reads it.
 * - A RESTING CREATURE, NOT A SCREENSAVER. Once alive, the canvas
 *   breathes (broad, slow pressure pulses at a wandering center),
 *   drifts (gentle micro-currents), and occasionally blooms (a soft
 *   radial exhale). Gesture choice, timing, position, direction,
 *   and strength all come from a seeded PRNG stream that never
 *   re-seeds, so no two gestures repeat and no loop ever forms.
 * - SEEDED PER DEVICE. The PRNG seeds from this device's LifePacket
 *   seed (plus a per-mount salt, so two tabs differ too). Ambient
 *   life is LOCAL: it is rendered through engine.splatAt on this
 *   device only and is never put on a transport. A room of devices
 *   therefore breathes together in spirit, each in its own phase —
 *   shipping "aliveness" over the wire would make every screen a
 *   mirror of one device's weather, cost bandwidth forever, and
 *   break the session send gates (a view-only guest must send
 *   nothing, yet their screen should still be alive to watch).
 * - YIELDS INSTANTLY. Any real activity moves activityRef; the next
 *   gesture step checks the clock before every sub-splat and aborts
 *   mid-gesture, and the driver falls back to waiting. The ghost is
 *   ABOVE ambient in the pecking order: ghost gestures are real
 *   activity on the same clock, so a waking ghost takes the canvas
 *   back without the two ever contending — and ambient never calls
 *   a single ghost API, so it cannot consume the ghost's emit
 *   budget (16/10s, GhostPeer's own counter).
 * - CHEAP. A 1s tick that almost always bails immediately. Degrade
 *   ladder (Hotfix 1.5): rung 1 keeps only slow breathing at
 *   reduced strength and doubled gaps; rung 2 suspends ambient
 *   entirely (a struggling device rests). While the tab is hidden
 *   the driver does nothing at all.
 */

export const AMBIENT_IDLE_THRESHOLD_MS = 20_000;

export interface AmbientLifeStats {
  /** off: layer setting disabled · waiting: room not quiet long enough ·
   *  living: breathing on its own · degraded: suspended by the perf ladder */
  state: "off" | "waiting" | "living" | "degraded";
  breaths: number;
  gestures: number;
}

/** Same PRNG family as the ghost brain and the identity store. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function useAmbientLife(opts: {
  engineRef: RefObject<LegacyFluidEngine | null>;
  /** Last REAL activity, ms epoch. Owned and fed by LegacyFluid. */
  activityRef: RefObject<number>;
  /** The layer's "Ambient life" setting (absent = on). */
  enabled: boolean;
}): RefObject<AmbientLifeStats> {
  const { engineRef, activityRef, enabled } = opts;
  const statsRef = useRef<AmbientLifeStats>({
    state: enabled ? "waiting" : "off",
    breaths: 0,
    gestures: 0,
  });

  useEffect(() => {
    const stats = statsRef.current;
    if (!enabled) {
      stats.state = "off";
      return;
    }
    stats.state = "waiting";

    // Seed once per driver lifetime: this device's LifePacket seed
    // gives every device its own phase; the mount salt keeps two
    // tabs of the same device out of lockstep. The stream is never
    // re-seeded, so the repertoire cannot settle into a loop.
    const selfSeed = getIdentitySnapshot().self?.seed ?? 0;
    const mountSalt = (Math.random() * 0xffffffff) >>> 0;
    const rng = mulberry32((selfSeed ^ mountSalt) | 0);

    let disposed = false;
    const pending = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        pending.delete(id);
        if (!disposed) fn();
      }, ms);
      pending.add(id);
    };

    // The wandering heart of the canvas: gestures cluster around a
    // center that itself drifts a little with every gesture.
    const center = { x: 0.3 + rng() * 0.4, y: 0.3 + rng() * 0.4 };
    let nextGestureAt = 0;

    const splat = (
      gestureStart: number,
      delayMs: number,
      x: number,
      y: number,
      fx: number,
      fy: number,
      color: { r: number; g: number; b: number }
    ) => {
      later(() => {
        // Yield mid-gesture: anything real since this gesture began
        // ends it — the remaining sub-splats simply never land.
        if (activityRef.current > gestureStart + 50) return;
        if (typeof document !== "undefined" && document.hidden) return;
        engineRef.current?.splatAt(x, y, fx, fy, color);
      }, delayMs);
    };

    const runGesture = (rung: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const startedAt = Date.now();
      stats.gestures += 1;
      center.x = clamp(center.x + (rng() - 0.5) * 0.24, 0.18, 0.82);
      center.y = clamp(center.y + (rng() - 0.5) * 0.24, 0.2, 0.8);
      const hue = getIdentitySnapshot().self?.hue ?? 205;
      const color = hueDyeColor(hue, 0.5 + rng() * 0.4);
      const strength = (rung === 1 ? 0.7 : 1) * (0.8 + rng() * 0.45);
      const pick = rng();
      if (rung === 1 || pick < 0.55) {
        // Breath: a slow inhale of soft pressure around the center,
        // force swelling and subsiding along a rotating arc.
        stats.breaths += 1;
        const baseAngle = rng() * Math.PI * 2;
        const steps = 6;
        for (let k = 0; k < steps; k++) {
          const swell = Math.sin((k / (steps - 1)) * Math.PI); // 0→1→0
          const mag = (16 + 30 * swell) * strength;
          const ang = baseAngle + k * 0.38;
          splat(
            startedAt,
            k * 240,
            center.x + Math.cos(ang) * 0.035,
            center.y + Math.sin(ang) * 0.035,
            Math.cos(ang) * mag,
            Math.sin(ang) * mag,
            color
          );
        }
      } else if (pick < 0.85) {
        // Micro-current: a short, gentle drift in one direction,
        // laid down as a dotted line of soft pushes.
        const ang = rng() * Math.PI * 2;
        const mag = (42 + rng() * 26) * strength;
        for (let k = 0; k < 4; k++) {
          splat(
            startedAt,
            k * 170,
            center.x + Math.cos(ang) * 0.04 * k,
            center.y + Math.sin(ang) * 0.04 * k,
            Math.cos(ang) * mag,
            Math.sin(ang) * mag,
            color
          );
        }
      } else {
        // Bloom: a soft radial exhale — six pushes outward from a
        // ring, near-simultaneous, then stillness.
        const ring = 6;
        for (let k = 0; k < ring; k++) {
          const ang = (k / ring) * Math.PI * 2 + rng() * 0.3;
          const mag = (30 + rng() * 20) * strength;
          splat(
            startedAt,
            k * 70,
            center.x + Math.cos(ang) * 0.045,
            center.y + Math.sin(ang) * 0.045,
            Math.cos(ang) * mag,
            Math.sin(ang) * mag,
            color
          );
        }
      }
    };

    const tick = () => {
      if (disposed) return;
      const engine = engineRef.current;
      if (!engine) {
        stats.state = "waiting";
        return;
      }
      // A hidden tab costs nothing: no gestures are scheduled or
      // fired (sub-splats also re-check), and the clock below means
      // a tab that was alive simply resumes when seen again.
      if (typeof document !== "undefined" && document.hidden) return;
      const rung = engine.getStats().degradeRung;
      if (rung >= 2) {
        stats.state = "degraded";
        return;
      }
      const now = Date.now();
      if (now - activityRef.current < AMBIENT_IDLE_THRESHOLD_MS) {
        stats.state = "waiting";
        nextGestureAt = 0;
        return;
      }
      stats.state = "living";
      if (nextGestureAt === 0) {
        // First breath comes soon after the quiet settles — the
        // room should read as alive well inside a minute.
        nextGestureAt = now + 1200 + rng() * 1500;
        return;
      }
      if (now >= nextGestureAt) {
        runGesture(rung);
        const gap =
          rung === 1 ? 9000 + rng() * 8000 : 4500 + rng() * 5500;
        nextGestureAt = now + gap;
      }
    };

    const interval = window.setInterval(tick, 1000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
    };
  }, [enabled, engineRef, activityRef]);

  return statsRef;
}
