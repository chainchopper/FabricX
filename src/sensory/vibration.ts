/**
 * Vibration — Slice 50: the ONE gate every on-device vibration
 * passes through.
 *
 * Terrell (Nov 3): "There is no vibration toggle in settings I
 * don't think yet." The truth he was pointing at: a Haptics
 * switch existed (PreferencesContext, fabric_prefs_v1) and it
 * gated the expo-haptics UI taps — but the vibrations that ARE
 * Fabric, the felt touches (a verb landing, a recipe's haptic
 * steps, a remote shake, the local send tick), called
 * navigator.vibrate directly and ignored the switch entirely.
 * A toggle that doesn't gate the thing it names is worse than
 * none. Now:
 *
 * - vibrate() below is the ONLY call site of navigator.vibrate
 *   in the app (the settings50 check censuses the tree for the
 *   call shape and fails if another appears).
 * - The persisted preference stays where it has always lived —
 *   fabric_prefs_v1.hapticsEnabled, owned and written ONLY by
 *   PreferencesContext, default ON (today's behavior). This
 *   module READS that record (lazily, once) and accepts a live
 *   mirror from PreferencesContext whenever the value loads or
 *   the settings switch flips, so the gate and the switch can
 *   never disagree.
 * - expo-haptics (button taps in the chrome) keeps its own
 *   gate inside useHaptics, reading the same preference — one
 *   switch, two actuators, both covered.
 *
 * Out of scope, deliberately: S3MatrixProtocol.vibrate sends a
 * command to an EXTERNAL swarm node (an ESP32 lint's own motor).
 * That is not this device's haptics and the settings switch for
 * this device's vibration does not govern another device.
 *
 * Pure module + a storage read, in the ghostBrainPref pattern,
 * so the node check can drive the gate directly.
 *
 * Powered by Nirvana
 */

import { getJSON } from "../../app/utils/storage";

/** The settings record PreferencesContext owns. Read-only here. */
export const PREFS_KEY = "fabric_prefs_v1";

/** Current behavior until a stored preference says otherwise. */
const DEFAULT_ENABLED = true;

let enabled = DEFAULT_ENABLED;
let loadStarted = false;
const listeners = new Set<(v: boolean) => void>();

/** Synchronous read for hot paths and the check. */
export function vibrationEnabledNow(): boolean {
  return enabled;
}

export function subscribeVibrationEnabled(
  fn: (v: boolean) => void
): () => void {
  listeners.add(fn);
  fn(enabled);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * PreferencesContext (the settings owner) calls this whenever
 * its hapticsEnabled value loads or changes — the mirror that
 * keeps this gate in step with the switch in Settings. Also
 * used by this module's own one-time storage read.
 */
export function mirrorHapticsPreference(v: boolean): void {
  loadStarted = true;
  if (v === enabled) return;
  enabled = v;
  listeners.forEach((fn) => {
    try {
      fn(enabled);
    } catch {
      // A listener must never break a touch.
    }
  });
}

/**
 * One-time lazy read of the persisted preference. Read-only:
 * this module never writes fabric_prefs_v1 — PreferencesContext
 * is its only writer, so the record can never be clobbered
 * from two sides.
 */
export function ensureVibrationPref(): void {
  if (loadStarted) return;
  loadStarted = true;
  void (async () => {
    try {
      const saved = await getJSON<{ hapticsEnabled?: unknown } | null>(
        PREFS_KEY,
        null
      );
      if (saved && typeof saved.hapticsEnabled === "boolean") {
        mirrorHapticsPreference(saved.hapticsEnabled);
      }
    } catch {
      // Storage unavailable: the default (on) stands.
    }
  })();
}

/**
 * THE vibration call. Fires the device's vibration only when
 * the settings switch is on; returns whether it fired. A
 * vibration must never break the interaction that caused it,
 * so every failure mode is a quiet false.
 */
export function vibrate(pattern: number | number[]): boolean {
  ensureVibrationPref();
  if (!enabled) return false;
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      return navigator.vibrate(pattern);
    }
  } catch {
    // The platform refused — the touch still lands visually.
  }
  return false;
}

/** Test-only reset (not storage). */
export function resetVibrationForTests(): void {
  enabled = DEFAULT_ENABLED;
  loadStarted = false;
  listeners.clear();
}
