/**
 * StrokeBatcher — sender-side coalescing for live stroke points
 * (Hotfix 1.9, "sync takes a while").
 *
 * Before this module, every engine frame's stroke point became its
 * own transport message the instant it was produced: a fast scribble
 * at display rate is ~60 messages/sec per pointer, each a separate
 * JSON envelope, each waking the receiver's render path on its own.
 * The points themselves are tiny and ephemeral — what costs is the
 * per-message overhead on both ends.
 *
 * The batcher collects stroke points for a short window and emits
 * them together:
 * - WINDOW_MS (30ms): the collection window, started by the first
 *   point of a batch. At 60 points/sec this packs ~2 points per
 *   message — message count roughly halves on the fastest strokes.
 * - MAX_HOLD_MS (50ms): a hard cap. No point is ever held longer
 *   than this, so worst-case added latency stays under a blink even
 *   if the window logic above ever changes.
 * - MAX_POINTS (12): a storm cap for multi-pointer input, so a
 *   batch can never grow unbounded between windows.
 *
 * The batcher is deliberately dumb about transports and message
 * shapes: it emits arrays of points through a callback, and the
 * caller (useFluidMultiUser) decides the wire format — a lone point
 * rides the classic single-interaction envelope (fully understood
 * by older clients); 2+ points ride the additive batch envelope.
 * Timers and clock are injectable so the bench harness
 * (scripts/stroke-bench.mjs) can drive it deterministically.
 *
 * Pure module: no React, no DOM, no transport imports.
 */

export interface StrokePoint {
  position: { x: number; y: number };
  force: { x: number; y: number };
  pressure: number;
  color?: { r: number; g: number; b: number };
  /** Hotfix 1.8 nozzle geometry, when the emitter is not a finger. */
  radiusScale?: number;
  /** Sender-side stamp (Date.now at production time). */
  timestamp: number;
  /** Per-sender monotonic sequence (Hotfix 1.9 dedupe key). */
  seq: number;
}

export type StrokeBatchEmit = (points: StrokePoint[]) => void;

export interface StrokeBatcherOptions {
  windowMs?: number;
  maxHoldMs?: number;
  maxPoints?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const STROKE_BATCH_WINDOW_MS = 30;
export const STROKE_BATCH_MAX_HOLD_MS = 50;
export const STROKE_BATCH_MAX_POINTS = 12;

export class StrokeBatcher {
  private points: StrokePoint[] = [];
  private timer: unknown = null;
  private firstAt = 0;
  private readonly emit: StrokeBatchEmit;
  private readonly windowMs: number;
  private readonly maxHoldMs: number;
  private readonly maxPoints: number;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(emit: StrokeBatchEmit, opts: StrokeBatcherOptions = {}) {
    this.emit = emit;
    this.windowMs = opts.windowMs ?? STROKE_BATCH_WINDOW_MS;
    this.maxHoldMs = opts.maxHoldMs ?? STROKE_BATCH_MAX_HOLD_MS;
    this.maxPoints = opts.maxPoints ?? STROKE_BATCH_MAX_POINTS;
    this.now = opts.now ?? (() => Date.now());
    this.setTimer =
      opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown);
    this.clearTimer =
      opts.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** Queue one point. Emits synchronously when the storm cap hits. */
  push(point: StrokePoint): void {
    if (this.points.length === 0) {
      this.firstAt = this.now();
      // One timer per batch, armed for the window — but never past
      // the hard hold cap measured from this first point.
      const delay = Math.min(
        this.windowMs,
        Math.max(0, this.maxHoldMs - (this.now() - this.firstAt))
      );
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.flush();
      }, delay);
    }
    this.points.push(point);
    if (this.points.length >= this.maxPoints) {
      this.flush();
    }
  }

  /** Emit whatever is queued, right now. Safe to call when empty. */
  flush(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.points.length === 0) return;
    const out = this.points;
    this.points = [];
    this.emit(out);
  }

  /** Number of points currently held (diagnostics/tests). */
  get pending(): number {
    return this.points.length;
  }

  dispose(): void {
    this.flush();
  }
}
