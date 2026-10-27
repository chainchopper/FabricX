/**
 * PatternPlayer — timed playback for Slice 4 patterns.
 *
 * Schedules a Pattern's steps against a dispatch callback supplied by
 * the canvas (LegacyFluid), which turns each step into interactions on
 * the existing sendInteraction path plus the matching local render.
 * The player owns no transport and no rendering — only timing, a
 * single global stop/cancel, and a playing-state listener the canvas
 * relays to the HUD.
 *
 * Step dispatch is guarded: one bad step can never kill the pattern,
 * the canvas, or the input chain.
 *
 * Powered by Nirvana
 */

import type { Pattern, PatternStep } from "./PatternComposer";
import { MAX_PATTERN_DURATION_MS } from "./PatternComposer";

export type PatternDispatch = (step: PatternStep) => void;
export type PatternStateListener = (playingName: string | null) => void;

export class PatternPlayer {
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private playingName: string | null = null;
  private listener: PatternStateListener | null = null;

  setStateListener(listener: PatternStateListener | null): void {
    this.listener = listener;
  }

  get isPlaying(): boolean {
    return this.playingName !== null;
  }

  /**
   * The most recent pattern handed to play() (Slice 5): lets "Share
   * live" replay a pattern composed earlier this session into a
   * shared room without re-composing it.
   */
  private lastPlayed: Pattern | null = null;

  get lastPattern(): Pattern | null {
    return this.lastPlayed;
  }

  get currentName(): string | null {
    return this.playingName;
  }

  /**
   * Play a pattern, replacing any pattern already playing. Steps fire
   * at their atMs offsets; playback state clears shortly after the
   * last step.
   */
  play(pattern: Pattern, dispatch: PatternDispatch): void {
    this.stop();
    this.lastPlayed = pattern;
    this.playingName = pattern.name;
    this.listener?.(pattern.name);
    for (const step of pattern.steps) {
      const timer = setTimeout(() => {
        try {
          dispatch(step);
        } catch {
          // A failing step is dropped; playback and the canvas go on.
        }
      }, Math.max(0, step.atMs));
      this.timers.push(timer);
    }
    const total = Math.min(pattern.durationMs, MAX_PATTERN_DURATION_MS) + 250;
    this.timers.push(setTimeout(() => this.finish(), total));
  }

  /** Global stop: cancel every pending step and clear playing state. */
  stop(): void {
    this.clearTimers();
    if (this.playingName !== null) {
      this.playingName = null;
      this.listener?.(null);
    }
  }

  private finish(): void {
    this.clearTimers();
    this.playingName = null;
    this.listener?.(null);
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}

/** The one shared player: a single pattern plays at a time, globally. */
export const patternPlayer = new PatternPlayer();
