/**
 * Felt Strokes — the thesis event the haptics audit found missing:
 * when a remote human draws on the shared fluid, the receiving
 * phone should FEEL the stroke, not just see it. Pressure
 * already rides the wire (FluidInteraction.pressure); this
 * module turns it into a vibration, and throttles the storm
 * of points in a continuous stroke into a rhythm.
 *
 * What this module is NOT:
 * - It is not the gate. It never touches the platform
 *   vibrator directly. Every pulse goes out through the gate
 *   in vibration.ts — so the Settings switch, the Slice 61
 *   suppression notice, and the settings50 census all cover
 *   felt strokes from day one.
 * - It is not physics. The web Vibration API has no amplitude
 *   control: a pattern is timing only. "Harder" can only ever
 *   mean "longer" on this actuator, so the buckets below are a
 *   mapping, chosen plainly and pinned by the check — light
 *   strokes a short tick, firm presses a longer buzz. True
 *   amplitude needs the native expo-haptics actuator (its own
 *   slice, iOS included).
 * - It is not a speaker. A stroke is dozens of points a
 *   second; the per-peer throttle drops everything inside the
 *   window so the hand feels a pulse, not a buzzsaw. Dropped
 *   is the documented behavior, not a bug.
 *
 * Pure module in the vibration.ts pattern, so the node check
 * can drive it directly. No runtime imports.
 *
 * Powered by Nirvana
 */

/** One felt stroke per peer per this long, at most. */
export const FELT_STROKE_MIN_INTERVAL_MS = 140;

/**
 * Pressure (0..1 from the wire) → one-shot vibration duration
 * in milliseconds. 0 means "too light to feel — no pulse".
 *
 *   p < 0.35  → 0   (a whisper of a touch stays silent)
 *   0.35–0.7  → 18  (a light stroke: a short tick)
 *   0.7–0.9   → 32  (a firm stroke: a clear buzz)
 *   > 0.9     → 48  (a hard press: the longest the dial goes)
 *
 * Boundaries are inclusive at the bottom of each bucket
 * (0.35 → 18, 0.7 → 32, 0.9 → 48). Over-range pressure
 * clamps to the top bucket; missing, non-numeric, NaN or
 * non-finite pressure never pulses.
 */
export function strokePulseDuration(pressure: unknown): number {
  if (typeof pressure !== "number" || !Number.isFinite(pressure)) return 0;
  if (pressure < 0.35) return 0;
  if (pressure < 0.7) return 18;
  if (pressure < 0.9) return 32;
  return 48;
}

export interface StrokeThrottle {
  /**
   * True when this peer may feel a stroke now — first stroke,
   * or the window has elapsed since its last felt one. A
   * `true` records the time; a `false` (dropped) leaves the
   * clock untouched, so a dropped stroke never delays the
   * next pulse. `now` defaults to Date.now() and is injectable
   * for deterministic tests.
   */
  shouldFire(peerId: string, now?: number): boolean;
  /** Forget every peer's last-fire time. */
  reset(): void;
}

/**
 * Per-peer stroke throttle. Each peer gets its own clock, so
 * two hands drawing at once pulse independently and neither
 * starves the other.
 */
export function createStrokeThrottle(
  minIntervalMs: number = FELT_STROKE_MIN_INTERVAL_MS
): StrokeThrottle {
  const interval =
    Number.isFinite(minIntervalMs) && minIntervalMs >= 0
      ? minIntervalMs
      : FELT_STROKE_MIN_INTERVAL_MS;
  const lastFiredByPeer = new Map<string, number>();
  return {
    shouldFire(peerId: string, now: number = Date.now()): boolean {
      const last = lastFiredByPeer.get(peerId);
      if (last === undefined || now - last >= interval) {
        lastFiredByPeer.set(peerId, now);
        return true;
      }
      return false;
    },
    reset(): void {
      lastFiredByPeer.clear();
    },
  };
}
