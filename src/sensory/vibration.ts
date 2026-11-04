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
 * - Slice 61: a suppression BY THE SWITCH is not silent to the
 *   app. Terrell (Nov 3, ~10:52 PM): "if the ghostie tries to
 *   use haptics and it's toggled off in settings a toast should
 *   come momentarily to allow me to enable it." The gate can't
 *   show UI (it is a pure module), so it raises ONE session-
 *   scoped notice — subscribeHapticSuppression — and the toast
 *   bridge (app/components/fabric/HapticsToastBridge) turns it
 *   into the toast with its Enable action. The discipline is
 *   anti-nag: the notice arms once per session; it fires only
 *   when the switch is the thing suppressing AND the platform
 *   could actually vibrate (a device with no vibrator has
 *   nothing to enable); once shown it never re-fires until the
 *   user settles it (enable or dismiss), and settling silences
 *   the session. A fresh session arms again.
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

// ----------------------------------------------------------------
// Slice 61: the haptics-off notice (see the header). Session
// state only — nothing here is persisted; a new session is a
// new module instance and arms fresh.
// ----------------------------------------------------------------

/**
 * armed   — no suppression worth reporting yet this session;
 * shown   — the notice fired and the toast is up (or queued);
 *           the user hasn't answered it;
 * settled — answered (enabled or dismissed) or the switch came
 *           back on another way; silent for the session.
 */
export type HapticNoticeState = "armed" | "shown" | "settled";

let noticeState: HapticNoticeState = "armed";
const suppressionListeners = new Set<() => void>();

/** The toast bridge subscribes; returns the unsubscribe. */
export function subscribeHapticSuppression(fn: () => void): () => void {
  suppressionListeners.add(fn);
  return () => {
    suppressionListeners.delete(fn);
  };
}

/** Synchronous read for the check and honest state reporting. */
export function hapticNoticeState(): HapticNoticeState {
  return noticeState;
}

/**
 * The bridge calls this when the user answers the toast:
 * "enabled" (they pressed Enable — the setting flip itself is
 * PreferencesContext's, via the same setter Settings uses) or
 * "dismissed" (it left unanswered). Either way the session is
 * done being asked.
 */
export function settleHapticSuppressionNotice(
  _how: "enabled" | "dismissed"
): void {
  noticeState = "settled";
}

/** Could this device vibrate at all, switch aside? */
function platformCanVibrate(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    );
  } catch {
    return false;
  }
}

/**
 * A vibrate() was just suppressed. Fire the notice ONLY when
 * the switch is the sole reason: switch off AND a platform
 * that could have vibrated. A device that simply can't vibrate
 * raises nothing — there is nothing to enable on it. Fires at
 * most once until settled; a listener must never break a touch.
 */
function noteToggleSuppression(): void {
  if (noticeState !== "armed") return;
  if (!platformCanVibrate()) return;
  noticeState = "shown";
  suppressionListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener must never break a touch.
    }
  });
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
  // Slice 61: the switch coming back on — from Settings, the
  // toast's Enable, anywhere — answers an outstanding notice.
  // The nag is over either way; the session stays silent.
  if (v && noticeState === "shown") noticeState = "settled";
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
  if (!enabled) {
    // Slice 61: the switch swallowed a felt touch. The gate
    // doesn't care who asked — a ghostie's reach and a user's
    // own tap are the same event here — it just notes the
    // suppression (once per session, platform permitting) and
    // the toast bridge does the asking.
    noteToggleSuppression();
    return false;
  }
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

/** Test-only reset (not storage). A reset is a fresh session:
 * the Slice 61 notice arms again. */
export function resetVibrationForTests(): void {
  enabled = DEFAULT_ENABLED;
  loadStarted = false;
  listeners.clear();
  noticeState = "armed";
  suppressionListeners.clear();
}
