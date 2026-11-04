/**
 * Phrase Events (Slice 68) — the ONLY transform the music
 * renderer applies to a brain-authored phrase: grid steps to
 * seconds. Pitch, order, count and velocity pass through
 * untouched; timing is pure arithmetic (an eighth note at the
 * phrase's own tempo). There is deliberately nothing else here
 * — no pool, no pattern, no randomness — so a check can prove
 * the rendered stream equals the authored stream by driving
 * this one function.
 *
 * Kept Tone-free so the music check can bundle it headlessly.
 *
 * Powered by Nirvana
 */

import type { GhostMusicPhrase } from "../../ghost/GhostBrain";

export interface PhraseEvent {
  note: string;
  /** Seconds after the phrase starts. */
  offsetSec: number;
  durationSec: number;
  velocity: number;
}

/** Seconds per step: the grid is eighth notes (half a beat). */
export function phraseStepSeconds(bpm: number): number {
  return 30 / bpm;
}

export function phraseToEvents(phrase: GhostMusicPhrase): PhraseEvent[] {
  const stepSec = phraseStepSeconds(phrase.bpm);
  return phrase.notes.map((n) => ({
    note: n.note,
    offsetSec: n.step * stepSec,
    // A hair under the full length so legato phrases still
    // articulate each note.
    durationSec: Math.max(0.05, n.len_steps * stepSec * 0.92),
    velocity: n.velocity,
  }));
}
