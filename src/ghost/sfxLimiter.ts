/**
 * sfxLimiter — the ghost voice's rate law, as pure data + one pure
 * predicate (Slice K).
 *
 * The voice allows at most one cue per 1.5 s per client. A
 * higher-priority cue may interrupt after 400 ms. That is the
 * whole law; it lives here so the check can prove it in Node
 * without dragging React (or an AudioContext) into the room.
 * `useGhostSfx` applies it — `play` for single cues,
 * `playSequence` for a reaction admitted as one unit.
 *
 * Powered by Nirvana
 */

/** One cue per client per 1.5 s. */
export const MIN_CUE_GAP_MS = 1_500;
/** A higher-priority cue may interrupt only after this gap. */
export const PRIORITY_INTERRUPT_MS = 400;

/**
 * The cue kinds the voice knows, by interrupt priority. A cue may
 * cut in front of the previous cue only when its priority is
 * strictly higher (a startle cuts in front of a play; a heart
 * does not cut in front of a startle — same rank, it waits).
 */
export const SFX_PRIORITY: Record<string, number> = {
  mirror: 1,
  thinking: 1,
  sniff: 2,
  play: 2,
  sleep: 2,
  wake: 2,
  composed: 2,
  startle: 3,
  heart: 3,
  heartbeat: 3,
};

/**
 * Does a cue sound, given the wall gap since the last cue that
 * sounded and the two priorities? Pure: the same inputs always
 * give the same answer, so the check proves the law directly.
 *
 * A cue in the same tick as the last one (gap ~0 ms) NEVER
 * sounds, whatever its priority — the interrupt window has not
 * opened. That is what used to swallow the checkers duet's
 * second voice, and it is also what keeps a third cue in the
 * same tick from ever sounding (the limiter is not gutted by
 * the pair path: a sequence is admitted ONCE, and any cue
 * outside the sequence still answers to this predicate).
 */
export function limiterAdmits(
  gapMs: number,
  priority: number,
  lastPriority: number
): boolean {
  if (gapMs >= MIN_CUE_GAP_MS) return true;
  if (priority > lastPriority && gapMs > PRIORITY_INTERRUPT_MS) return true;
  return false;
}
