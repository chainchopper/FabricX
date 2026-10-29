/**
 * Sensory verbs — named, shareable touch patterns for Fabric.
 *
 * A verb is data, not code: a vibration pattern (number[] of milliseconds,
 * the same shape used by navigator.vibrate / React Native Vibration), a
 * fluid dye color (RGB floats 0..1, matching FluidInteraction.color), and
 * the name of a local audio cue from app/hooks/useAudioCues.
 *
 * Verbs travel inside a FluidInteraction via its optional `verb` field, so
 * they work over every transport useFluidMultiUser supports (WebRTC data
 * channels, BroadcastChannel fallback) with no protocol changes.
 *
 * SENSORY_VERBS is the human-facing verb set — the canonical data
 * every surface resolves (profile-card hearts, hand signs, the
 * ghost's asked verbs, composed verb steps). There is no button row
 * anymore: Hotfix 2.8 retired the VerbBar (preset macros are not how
 * Fabric verbs happen — you ask, you sign, you send one to a
 * person). PURR is a ghost-only pattern (see src/ghost): it is
 * deliberately NOT in SENSORY_VERBS, so it is never a verb humans
 * send directly, but receivers still resolve it through getVerbById
 * and play it through the exact same verb-effect path as any other
 * verb.
 *
 * Powered by Nirvana
 */

import type { FluidInteraction } from "../types/fluid";

/**
 * Window event used to ask the live canvas to send a verb: surfaces
 * dispatch it with the verb id as `detail` — a profile card's
 * "Send a heart", a held hand sign (Slice 28's hands engine) — and
 * the canvas component (LegacyFluid) performs the send so the
 * interaction flows through its useFluidMultiUser transport, its
 * session gates, and the rewards hook that lives in that listener.
 */
export const FABRIC_VERB_EVENT = "fabric:verb";

export interface SensoryVerb {
  id: string;
  label: string;
  /** Milliseconds, alternating vibrate/pause, starting with vibrate. */
  vibration: number[];
  /** Fluid dye color, RGB floats 0..1 (same shape as FluidInteraction.color). */
  color: { r: number; g: number; b: number };
  /** Name of a cue exposed by app/hooks/useAudioCues. */
  audioCue: "click" | "pulse" | "success" | "warning" | "error";
  emoji: string;
}

/** A heartbeat: two soft thumps, warm pink dye. */
export const HEART: SensoryVerb = {
  id: "heart",
  label: "Heart",
  vibration: [120, 80, 220],
  color: { r: 1.0, g: 0.25, b: 0.45 },
  audioCue: "pulse",
  emoji: "❤️",
};

/** A celebration: quick double-tap into a longer buzz, gold dye. */
export const CHEER: SensoryVerb = {
  id: "cheer",
  label: "Cheer",
  vibration: [60, 50, 60, 50, 160],
  color: { r: 1.0, g: 0.75, b: 0.2 },
  audioCue: "success",
  emoji: "🎉",
};

/** A tickle: rapid short bursts, bright cyan dye. */
export const TICKLE: SensoryVerb = {
  id: "tickle",
  label: "Tickle",
  vibration: [30, 30, 30, 30, 30, 30, 90],
  color: { r: 0.35, g: 0.9, b: 1.0 },
  audioCue: "click",
  emoji: "🪶",
};

/**
 * A purr: slow, gentle pulses, warm peach dye. Ghost-only — the ghost
 * "says" this when it is petted. Not part of SENSORY_VERBS (no human
 * button), but resolvable via getVerbById so every client plays it
 * through the standard verb-effect path.
 */
export const PURR: SensoryVerb = {
  id: "purr",
  label: "Purr",
  vibration: [40, 60, 40, 60, 120],
  color: { r: 1.0, g: 0.62, b: 0.45 },
  audioCue: "pulse",
  emoji: "🐾",
};

export const SENSORY_VERBS: SensoryVerb[] = [HEART, CHEER, TICKLE];

/** Everything getVerbById can resolve: human verbs + ghost-only PURR. */
const ALL_VERBS: SensoryVerb[] = [...SENSORY_VERBS, PURR];

export function getVerbById(id?: string | null): SensoryVerb | undefined {
  if (!id) return undefined;
  return ALL_VERBS.find((v) => v.id === id);
}

/**
 * Build the interaction payload for sending a verb: a pressure-1 splat at
 * the center of the canvas in the verb's color, tagged with the verb id so
 * receivers can fire the matching vibration pattern and audio cue.
 */
export function verbInteraction(
  verb: SensoryVerb
): Omit<FluidInteraction, "userId" | "timestamp"> {
  return {
    position: { x: 0.5, y: 0.5 },
    force: { x: 0, y: 0 },
    pressure: 1,
    color: verb.color,
    verb: verb.id,
  };
}
