/**
 * Voice input mode — Slice 58 built this gate; Slice 65
 * corrects the model it holds.
 *
 * Slice 58 (Terrell, Nov 3): the mic should ask on its own,
 * permission should persist, and input should not be
 * tap-to-talk only — he wants the natural shape, or the modes
 * configurable. And the shape matters (his correction, same
 * night): this is NOT a conversation and there is no window.
 * The ghostie produces no words — it never did; it decides
 * and acts in its own nonverbal way. The person just talks,
 * the way you talk to MicroDuck: say its name, it perks up —
 * its own body is the signal — and whatever you say, it hears
 * and acts on through the same decision stack as everything
 * else. Nothing about the exchange is a chat.
 *
 * Slice 65 (Terrell's correction, Nov 4, 2026, ~11:04 AM ET,
 * verbatim): "With the voice there is no natural or both.
 * Natural doesn't require tap or push to talk so there is no
 * both it's one or the other .. both is a compatibility layer
 * not a rule ... one keeps hands off the screen one requires
 * them."
 *
 * So the setting is ONE OR THE OTHER — two modes, never a
 * blend:
 *
 *   "natural" — hands OFF the screen. The ghostie listens
 *               for its own NAME. Saying the name gets its
 *               attention (it shows you, itself), and from
 *               there you just talk: what you say is heard
 *               and acted on, no taps, no wake phrase per
 *               sentence. The listener lives on its own
 *               lifecycle — a voice-capable surface mounted,
 *               the grant known — never on a button.
 *   "tap"     — hands ON the screen. The mic button is the
 *               only voice door: tap it, one utterance, done.
 *               No name-listener runs in this mode.
 *
 * Where a tap-shaped moment still appears inside Natural, it
 * is platform COMPATIBILITY, not a mode feature, and nothing
 * — code or copy — may describe Natural as including tap:
 * the one-time mic ask itself (Slice 58's auto-request), a
 * first-touch start where the browser demands a user gesture
 * before audio can begin (the wake loop's blocked restart),
 * and the capture fallback on a browser with no speech
 * recognizer at all, where name-listening is impossible and
 * listening is never faked. Compatibility serves the mode;
 * it never becomes a third mode.
 *
 * Slice 58 shipped a third value, "both". It is gone from
 * the type, the settings row, and every label. A stored
 * "both" MIGRATES to "natural" on read (normalizeVoice
 * InputMode): those users asked for the listener, and tap
 * inside Natural is compatibility only.
 *
 * The persisted preference lives where the other universal
 * switches live — fabric_prefs_v1.voiceInputMode, owned and
 * written ONLY by PreferencesContext (the vibration switch's
 * law, Slice 50). This module is the gate the canvas reads:
 * it lazily reads the record once and accepts a live mirror
 * from PreferencesContext on load and on every flip, so the
 * switch and the listener can never disagree.
 *
 * DEFAULT is "natural" (Slice 65, changed from Slice 58's
 * "tap"): Terrell's standing direction is natural speech,
 * MicroDuck-style — a fresh install starts hands-free, and
 * the ghostie-framed mic ask is the first thing a new person
 * meets, so nobody lands in Natural unasked by surprise.
 *
 * Pure module + a storage read, in the vibration pattern, so
 * the headless check can drive the gate directly.
 *
 * Powered by Nirvana
 */

import { getJSON } from "../../app/utils/storage";

/** The settings record PreferencesContext owns. Read-only here. */
export const PREFS_KEY = "fabric_prefs_v1";

/** One or the other. There is no third member. */
export type VoiceInputMode = "natural" | "tap";

export const VOICE_INPUT_MODES: readonly VoiceInputMode[] = [
  "natural",
  "tap",
];

/** Fresh installs start hands-free: natural speech (Slice 65). */
export const DEFAULT_VOICE_INPUT_MODE: VoiceInputMode = "natural";

export function isVoiceInputMode(v: unknown): v is VoiceInputMode {
  return v === "natural" || v === "tap";
}

/**
 * Read a stored value into the two-mode model. Slice 58's
 * "both" migrates to "natural" — the listener its owner
 * asked for; anything unrecognized is null (the caller
 * keeps the default).
 */
export function normalizeVoiceInputMode(v: unknown): VoiceInputMode | null {
  if (v === "both") return "natural";
  return isVoiceInputMode(v) ? v : null;
}

/** The settings row's plain-words name for a mode. */
export function voiceInputModeLabel(mode: VoiceInputMode): string {
  return mode === "natural" ? "Natural" : "Tap to talk";
}

/** The settings cycle: natural → tap → natural. */
export function nextVoiceInputMode(mode: VoiceInputMode): VoiceInputMode {
  const i = VOICE_INPUT_MODES.indexOf(mode);
  return VOICE_INPUT_MODES[(i + 1) % VOICE_INPUT_MODES.length];
}

/** Whether the name-listener should be armed in this mode. */
export function naturalArmedInMode(mode: VoiceInputMode): boolean {
  return mode === "natural";
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
 * PreferencesContext is its only writer. A stored Slice 58
 * "both" is normalized to "natural" here (migration on read).
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
      const m = saved ? normalizeVoiceInputMode(saved.voiceInputMode) : null;
      if (m) mirrorVoiceInputMode(m);
    } catch {
      // Storage unavailable: the default (natural) stands.
    }
  })();
}

/** Test-only reset (not storage). */
export function resetVoiceInputModeForTests(): void {
  mode = DEFAULT_VOICE_INPUT_MODE;
  loadStarted = false;
  listeners.clear();
}
