/**
 * RecipePlayer — Slice 15 "Agent Shapes": timed rendering for
 * recipes, the shape sibling of PatternPlayer.
 *
 * The player owns timing and geometry only: it samples each step's
 * path (RecipeCore) and schedules splats against a dispatch callback
 * supplied by the canvas, which turns each splat into a local
 * engine.splatAt. It owns NO transport: broadcasting a recipe is a
 * single compact message sent once by the caller (the transport's
 * fabric-recipe kind), never a stream of the splats rendered here —
 * every device cooks its own copy from the same recipe + seed.
 *
 * Splat budget: a step emits at most MAX_POINTS_PER_STEP splats
 * (48), so the absolute worst case — a maximal 24-step recipe —
 * is 1,152 splats spread over up to 24 seconds (~48/sec average,
 * the cost of one fast finger). Typical steps emit ~20–35.
 *
 * Force follows the path tangent, so the smoke STREAMS along the
 * shape's direction of travel instead of blooming as disconnected
 * dots; a burst step's force points radially outward. Steps end
 * and the fluid's own dissipation is the poof — nothing force-
 * clears the canvas, so a finished shape melts back into smoke
 * exactly the way the world model describes.
 *
 * Powered by Nirvana
 */

import {
  sampleStepPath,
  type Recipe,
  type RecipeStep,
} from "./RecipeCore";

export interface RecipeSplat {
  x: number;
  y: number;
  forceX: number;
  forceY: number;
  /** Resolved dye hue (step hue, else the play call's default). */
  hue: number;
  radiusScale: number;
}

export type RecipeDispatch = (splat: RecipeSplat) => void;
export type RecipeStateListener = (playingName: string | null) => void;

/** Tangent force magnitude — in the range pattern splats already use. */
const DRAW_FORCE = 200;
/** Narrower than a finger: a drawn line, not a thumbprint. */
const RECIPE_RADIUS_SCALE = 0.8;

export class RecipePlayer {
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private playingName: string | null = null;
  private listener: RecipeStateListener | null = null;
  private lastPlayed: Recipe | null = null;
  private lastPlayedAtMs = 0;

  setStateListener(listener: RecipeStateListener | null): void {
    this.listener = listener;
  }

  get isPlaying(): boolean {
    return this.playingName !== null;
  }

  /** The most recent recipe handed to play() — Studio's save source. */
  get lastRecipe(): Recipe | null {
    return this.lastPlayed;
  }

  /** When it was handed over (Studio saves whichever played last). */
  get lastPlayedAt(): number {
    return this.lastPlayedAtMs;
  }

  get currentName(): string | null {
    return this.playingName;
  }

  /**
   * Play a recipe, replacing any recipe already playing. Steps run
   * sequentially — a step starts when the previous one ends — and
   * playback state clears shortly after the last step.
   */
  play(
    recipe: Recipe,
    dispatch: RecipeDispatch,
    opts?: { defaultHue?: number }
  ): void {
    this.stop();
    this.lastPlayed = recipe;
    this.lastPlayedAtMs = Date.now();
    this.playingName = recipe.name;
    this.listener?.(recipe.name);
    let stepStart = 0;
    recipe.steps.forEach((step, idx) => {
      this.scheduleStep(step, recipe.seed, idx, stepStart, dispatch, opts);
      stepStart += step.durationMs;
    });
    this.timers.push(
      setTimeout(() => this.finish(), recipe.durationMs + 250)
    );
  }

  /** Global stop: cancel every pending splat and clear state. */
  stop(): void {
    this.clearTimers();
    if (this.playingName !== null) {
      this.playingName = null;
      this.listener?.(null);
    }
  }

  private scheduleStep(
    step: RecipeStep,
    seed: number,
    stepIndex: number,
    startMs: number,
    dispatch: RecipeDispatch,
    opts?: { defaultHue?: number }
  ): void {
    const pts = sampleStepPath(step, seed, stepIndex);
    const hue = step.hue ?? opts?.defaultHue ?? 205;
    const n = pts.length;
    const emit = (atMs: number, s: RecipeSplat) => {
      this.timers.push(
        setTimeout(() => {
          try {
            dispatch(s);
          } catch {
            // A failing splat is dropped; the shape goes on.
          }
        }, Math.max(0, atMs))
      );
    };

    if (step.style === "pulse") {
      // The whole shape lands in the first 30% of the step, then is
      // re-struck sparsely so it HOLDS instead of melting — the
      // smoke is reminded of the shape until the step ends.
      pts.forEach((p, i) => {
        emit(startMs + (i / n) * step.durationMs * 0.3, {
          x: p.x,
          y: p.y,
          forceX: p.tx * DRAW_FORCE,
          forceY: p.ty * DRAW_FORCE,
          hue,
          radiusScale: RECIPE_RADIUS_SCALE,
        });
      });
      for (
        let t = startMs + step.durationMs * 0.4;
        t < startMs + step.durationMs;
        t += 500
      ) {
        pts.forEach((p, i) => {
          if (i % 3 !== 0) return;
          emit(t + (i % 5) * 20, {
            x: p.x,
            y: p.y,
            forceX: p.tx * DRAW_FORCE * 0.5,
            forceY: p.ty * DRAW_FORCE * 0.5,
            hue,
            radiusScale: RECIPE_RADIUS_SCALE,
          });
        });
      }
      return;
    }

    if (step.style === "burst") {
      // Emission time follows distance from the center — the shape
      // blooms outward. Force is radial, away from the center.
      const dist = pts.map((p) =>
        Math.hypot(p.x - step.cx, p.y - step.cy)
      );
      const maxDist = Math.max(0.0001, ...dist);
      pts.forEach((p, i) => {
        const at = startMs + (dist[i] / maxDist) * step.durationMs * 0.8;
        const rx = p.x - step.cx;
        const ry = p.y - step.cy;
        const len = Math.max(0.0001, Math.hypot(rx, ry));
        emit(at, {
          x: p.x,
          y: p.y,
          forceX: (rx / len) * 260,
          forceY: (ry / len) * 260,
          hue,
          radiusScale: RECIPE_RADIUS_SCALE,
        });
      });
      return;
    }

    // draw: trace the path in order, force along the tangent.
    pts.forEach((p, i) => {
      emit(startMs + (i / n) * step.durationMs, {
        x: p.x,
        y: p.y,
        forceX: p.tx * DRAW_FORCE,
        forceY: p.ty * DRAW_FORCE,
        hue,
        radiusScale: RECIPE_RADIUS_SCALE,
      });
    });
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

/** The one shared player: a single recipe plays at a time, globally. */
export const recipePlayer = new RecipePlayer();

// ---------------------------------------------------------------------------
// Remote recipe bus — the noteBus precedent (Hotfix 1.7): the
// transport hook hands an inbound, ALREADY VALIDATED recipe to
// whoever renders recipes (LegacyFluid), tagged with its sender so
// the renderer can resolve the sender's hue. Receiving is never
// gated; only sending is (see useFluidMultiUser.sendRecipe).
// ---------------------------------------------------------------------------

export type RemoteRecipeListener = (recipe: Recipe, from: string) => void;

class RecipeBus {
  private listeners = new Set<RemoteRecipeListener>();

  subscribe(fn: RemoteRecipeListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emitRemote(recipe: Recipe, from: string): void {
    this.listeners.forEach((fn) => {
      try {
        fn(recipe, from);
      } catch {
        // A listener's failure never reaches the transport.
      }
    });
  }
}

export const recipeBus = new RecipeBus();
