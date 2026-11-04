/**
 * Voice input mode — Slice 58: how talking to the ghostie
 * STARTS, as one preference with three honest shapes.
 *
 * Terrell (Nov 3): the mic should ask on its own, permission
 * should persist, and input should not be tap-to-talk only —
 * he wants the natural shape, or the modes configurable. And
 * the shape matters (his correction, same night): this is
 * NOT a conversation and there is no window. The ghostie
 * produces no words — it never did; it decides and acts in
 * its own nonverbal way. The person just talks, the way you
 * talk to MicroDuck: say its name, it perks up — its own
 * body is the signal — and whatever you say, it hears and
 * acts on through the same decision stack as everything
 * else. Nothing about the exchange is a chat.
 *
 *   "tap"     — today's behavior, unchanged: the mic button
 *               starts listening, one utterance, done.
 *   "natural" — the ghostie listens for its own NAME. Saying
 *               the name gets its attention (it shows you,
 *               itself), and from there you just talk: what
 *               you say is heard and acted on, no taps, no
 *               wake phrase per sentence. The mic button
 *               arms / disarms the listening instead of
 *               starting a one-off listen.
 *   "both"    — either door works: tap the mic for an
 *               immediate utterance, or say the name anytime.
 *
 * The persisted preference lives where the other universal
 * switches live — fabric_prefs_v1.voiceInputMode, owned and
 * written ONLY by PreferencesContext (the vibration switch's
 * law, Slice 50). This module is the gate the canvas reads:
 * it lazily reads the record once and accepts a live mirror
 * from PreferencesContext on load and on every flip, so the
 * switch and the listener can never disagree. DEFAULT is
 * "tap" — nobody's input changes shape until they choose it.
 *
 * Pure module + a storage read, in the vibration pattern, so
 * the headless check can drive the gate directly.
 *
 * Powered by Nirvana
 */

import { getJSON } from "../../app/utils/storage";

/** The settings record PreferencesContext owns. Read-only here. */
export const PREFS_KEY = "fabric_prefs_v1";

export type VoiceInputMode = "tap" | "natural" | "both";

export const VOICE_INPUT_MODES: readonly VoiceInputMode[] = [
  "tap",
  "natural",
  "both",
];

/** Today's behavior until a stored preference says otherwise. */
export const DEFAULT_VOICE_INPUT_MODE: VoiceInputMode = "tap";

export function isVoiceInputMode(v: unknown): v is VoiceInputMode {
  return v === "tap" || v === "natural" || v === "both";
}

/** The settings row's plain-words name for a mode. */
export function voiceInputModeLabel(mode: VoiceInputMode): string {
  switch (mode) {
    case "natural":
      return "Natural";
    case "both":
      return "Both";
    default:
      return "Tap to talk";
  }
}

/** The settings cycle: tap → natural → both → tap. */
export function nextVoiceInputMode(mode: VoiceInputMode): VoiceInputMode {
  const i = VOICE_INPUT_MODES.indexOf(mode);
  return VOICE_INPUT_MODES[(i + 1) % VOICE_INPUT_MODES.length];
}

/** Whether the name-listener should be armed in this mode. */
export function naturalArmedInMode(mode: VoiceInputMode): boolean {
  return mode === "natural" || mode === "both";
}

let mode: VoiceInputMode = DEFAULT_VOICE_INPUT_MODE;
let loadStarted = false;
const listeners = new Set<(m: VoiceInputMode) => void>();

/** Synchronous read for hot paths and the check. */
export function voiceInputModeNow(): VoiceInputMode {
  return mode;
}

export function subscribeVoiceInputMode(
  fn: (m: VoiceInputMode) => void
): () => void {
  listeners.add(fn);
  fn(mode);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * PreferencesContext (the settings owner) calls this whenever
 * its voiceInputMode value loads or changes — the mirror that
 * keeps this gate in step with the switch in Settings. Also
 * used by this module's own one-time storage read.
 */
export function mirrorVoiceInputMode(v: VoiceInputMode): void {
  loadStarted = true;
  if (v === mode) return;
  mode = v;
  listeners.forEach((fn) => {
    try {
      fn(mode);
    } catch {
      // A listener must never break an input surface.
    }
  });
}

/**
 * One-time lazy read of the persisted preference. Read-only:
 * this module never writes fabric_prefs_v1 —
 * PreferencesContext is its only writer.
 */
export function ensureVoiceInputModePref(): void {
  if (loadStarted) return;
  loadStarted = true;
  void (async () => {
    try {
      const saved = await getJSON<{ voiceInputMode?: unknown } | null>(
        PREFS_KEY,
        null
      );
      if (saved && isVoiceInputMode(saved.voiceInputMode)) {
        mirrorVoiceInputMode(saved.voiceInputMode);
      }
    } catch {
      // Storage unavailable: the default (tap) stands.
    }
  })();
}

/** Test-only reset (not storage). */
export function resetVoiceInputModeForTests(): void {
  mode = DEFAULT_VOICE_INPUT_MODE;
  loadStarted = false;
  listeners.clear();
}
