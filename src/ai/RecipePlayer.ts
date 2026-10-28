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
  mulberry32,
  pulsePhraseBeats,
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
    if (recipe.pulse) {
      this.schedulePulse(recipe, dispatch, opts);
    }
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

  /**
   * Schedule the v2 pulse overlay. Pulse strikes land around the
   * first step's center, leaving the step geometry itself intact:
   * a heart can be drawn once and then keep beating; a spiral can
   * keep swelling after its trace completes. Each strike is just a
   * recipe splat, so local rendering and activity semantics are the
   * same as every other recipe emission — pulses never travel as a
   * splat stream; receivers cook them from the validated pulse spec.
   */
  private schedulePulse(
    recipe: Recipe,
    dispatch: RecipeDispatch,
    opts?: { defaultHue?: number }
  ): void {
    const pulse = recipe.pulse;
    if (!pulse) return;
    const anchor = recipe.steps[0];
    const hue = anchor.hue ?? opts?.defaultHue ?? 205;
    const beatMs = 60_000 / pulse.bpm;
    const phraseMs = pulsePhraseBeats(pulse) * beatMs;
    const rand = mulberry32((recipe.seed ^ 0x9015e) >>> 0);

    const curveFactor = (cycle: number): number => {
      const progress = pulse.cycles <= 1 ? 1 : cycle / (pulse.cycles - 1);
      switch (pulse.intensityCurve) {
        case "swell":
          return 0.55 + 0.45 * Math.sin(Math.PI * progress);
        case "fade":
          return 1 - 0.55 * progress;
        case "sine":
          return 0.72 + 0.28 * Math.sin(progress * Math.PI * 2);
        case "lub-dub":
        case "steady":
        default:
          return 1;
      }
    };

    for (let cycle = 0; cycle < pulse.cycles; cycle++) {
      let cursorBeats = 0;
      pulse.grouping.forEach((count, groupIndex) => {
        for (let strike = 0; strike < count; strike++) {
          const atMs = cycle * phraseMs + cursorBeats * beatMs;
          const clusterFactor =
            pulse.intensityCurve === "lub-dub"
              ? strike === 0
                ? 1
                : 0.76
              : strike === 0
                ? 1
                : 0.82;
          const strength =
            pulse.intensity * curveFactor(cycle) * clusterFactor;
          const angle = rand() * Math.PI * 2;
          const ring = 0.012 + rand() * 0.018;
          const x = Math.min(0.98, Math.max(0.02, anchor.cx + Math.cos(angle) * ring));
          const y = Math.min(0.98, Math.max(0.02, anchor.cy + Math.sin(angle) * ring));
          this.timers.push(
            setTimeout(() => {
              try {
                dispatch({
                  x,
                  y,
                  forceX: Math.cos(angle) * (90 + 150 * strength),
                  forceY: Math.sin(angle) * (90 + 150 * strength),
                  hue,
                  radiusScale: 0.5 + 0.55 * strength,
                });
              } catch {
                // A failed pulse strike is dropped; the performance goes on.
              }
            }, Math.max(0, atMs))
          );
          cursorBeats += 0.38;
        }
        if (groupIndex < pulse.grouping.length - 1) cursorBeats += 1;
      });
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
