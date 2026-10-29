/**
 * Ghostie vitals — Health / Stamina / Vigor (Slice 22, "ID Cards").
 *
 * Terrell, Oct 29: the ghostie card shows vitals — "health,
 * stamina, vigor, etc (yes that's new but it's fun and engaging)".
 * Fun, but not slot-machine noise: every number here is COMPUTED
 * from the ghost's real state at render time, and every bar
 * carries a one-line WHY naming the driver, because numbers
 * without reasons are noise and reasons make it a pet.
 *
 * - HEALTH — fDNA vitality: how steady the ghostie's Game-of-Life
 *   lineage runs (this module simulates its grid from the seed and
 *   measures the population's stability), nourished by pets and
 *   verbs received lately, faded by long neglect (nobody touching
 *   the canvas at all).
 * - STAMINA — energy: spent by doing — emitting, deliberating,
 *   performing — and restored by rest (sleeping presence). A
 *   drained ghostie's deliberation gains a legible rest bias
 *   (GhostBrain.applyStaminaBias), so the number is honest in
 *   both directions: it reads low BECAUSE the ghost worked, and
 *   the ghost rests BECAUSE it reads low.
 * - VIGOR — expressiveness right now: the same arousal composite
 *   that already drives the ghost's heartbeat tempo and its
 *   Dancer Stage body (GhostPeer.heartbeatBpm). What you see on
 *   the Stage is vigor, visible.
 *
 * Vitals are computed, never persisted — there is no record to
 * corrupt, and a reading can always be re-derived from the state
 * that produced it. Pure module (fdna only) so the check
 * exercises every derivation headlessly.
 *
 * Powered by Nirvana
 */

import {
  countLiveCells,
  seedFdnaGrid,
  stepFdnaGrid,
} from "../identity/fdna";

/** Raw state the derivations read. GhostPeer.getVitalsSnapshot fills it live. */
export interface GhostVitalsInput {
  /** The ghost's seed — its fDNA lineage root. */
  ghostSeed: number;
  /** Current heartbeat tempo (GhostPeer.heartbeatBpm). */
  bpm: number;
  /** Pets that LANDED on this ghost in the last 30 minutes. */
  petsReceived30m: number;
  /** Verbs this ghost has seen in the last 30 minutes. */
  verbsReceived30m: number;
  /** Seconds since any human touch reached the ghost. */
  secondsSinceHumanTouch: number;
  /** Ghost emissions in the last 10 minutes (its work output). */
  emits10m: number;
  /** Deliberations run in the last 30 minutes (its thinking). */
  deliberations30m: number;
  /** Seconds in the current unbroken sleeping-presence stretch. */
  restSeconds: number;
}

export interface GhostVitals {
  health: number;
  stamina: number;
  vigor: number;
  /** One line per bar, naming the driver — the reason it reads so. */
  why: {
    health: string;
    stamina: string;
    vigor: string;
  };
}

const clamp100 = (v: number): number =>
  Math.round(Math.min(100, Math.max(0, v)));

/* ------------------------------------------------------------------ */
/* fDNA vitality — the lineage's steadiness                            */
/* ------------------------------------------------------------------ */

const VITALITY_GENERATIONS = 120;
const VITALITY_SETTLED_FROM = 60;

const vitalityCache = new Map<number, number>();

/**
 * Simulate the ghostie's Game-of-Life lineage from its seed and
 * measure how STEADY the population runs once settled: 1 minus
 * the coefficient of variation over the settled generations. A
 * lineage that settles into still lifes and gliders reads near
 * 1; a chaotic churn reads mid; an extinction reads near 0. The
 * same simulation the Home animates — the packet's actual life,
 * read as a vital sign. Deterministic per seed; cached.
 */
export function fdnaVitality(seed: number): number {
  const cached = vitalityCache.get(seed);
  if (cached !== undefined) return cached;
  let grid = seedFdnaGrid(seed);
  const settled: number[] = [];
  for (let g = 0; g < VITALITY_GENERATIONS; g++) {
    grid = stepFdnaGrid(grid);
    if (g >= VITALITY_SETTLED_FROM) settled.push(countLiveCells(grid));
  }
  const mean =
    settled.reduce((a, b) => a + b, 0) / Math.max(1, settled.length);
  let vitality: number;
  if (mean < 2) {
    // The lineage died (or all but died) — vitality is the ember.
    vitality = mean / 2;
  } else {
    const variance =
      settled.reduce((a, b) => a + (b - mean) * (b - mean), 0) /
      Math.max(1, settled.length);
    const cv = Math.sqrt(variance) / mean;
    vitality = Math.min(1, Math.max(0, 1 - cv));
  }
  vitalityCache.set(seed, vitality);
  return vitality;
}

/* ------------------------------------------------------------------ */
/* The readings                                                        */
/* ------------------------------------------------------------------ */

/**
 * Compute the three readings from live state. Pure: the same
 * state always yields the same card, on the primary's device and
 * in the check alike.
 */
export function computeGhostVitals(input: GhostVitalsInput): GhostVitals {
  /* ---- Health: lineage steadiness, fed or faded ---- */
  const vitality = fdnaVitality(input.ghostSeed);
  const nourish = Math.min(
    16,
    input.petsReceived30m * 2.5 + input.verbsReceived30m * 1.25
  );
  const neglect =
    input.secondsSinceHumanTouch <= 600
      ? 0
      : Math.min(22, (input.secondsSinceHumanTouch - 600) / 150);
  const health = clamp100(28 + 57 * vitality + nourish - neglect);
  const healthWhy =
    neglect >= 10
      ? "Fading — a long quiet leaves the fDNA underfed"
      : nourish >= 8
        ? "Thriving — pets and verbs lately feed the grid"
        : vitality >= 0.7
          ? "Thriving — the fDNA generations run steady"
          : health >= 40
            ? "Holding — the lineage churns, alive and unsettled"
            : "Frail — the fDNA lineage swings hard; company helps";

  /* ---- Stamina: spent by work, restored by rest ---- */
  const spend = Math.min(
    58,
    input.emits10m * 0.45 + input.deliberations30m * 1.6
  );
  const recovery = Math.min(34, input.restSeconds / 18);
  const stamina = clamp100(80 - spend + recovery);
  const staminaWhy =
    spend >= 35
      ? "Spent by a busy stretch of play and deliberation — due a nap"
      : recovery >= 12
        ? "Recovering — rest is refilling it"
        : stamina < 40
          ? "Low — a quiet spell would refill it"
          : "Paced gently — spending and resting in balance";

  /* ---- Vigor: the arousal composite, read straight ---- */
  const vigor = clamp100((input.bpm - 42) / 0.9);
  const vigorWhy =
    input.bpm >= 100
      ? `Running hot — heartbeat at ${input.bpm}bpm, stirred by pets and verbs`
      : input.bpm >= 70
        ? `Bright — heartbeat at ${input.bpm}bpm`
        : input.bpm >= 52
          ? `Gentle — heartbeat at ${input.bpm}bpm, little stirring it`
          : `Low and sleepy — heartbeat at ${input.bpm}bpm`;

  return {
    health,
    stamina,
    vigor,
    why: { health: healthWhy, stamina: staminaWhy, vigor: vigorWhy },
  };
}

/** The wire shape: three bare readings, clamped (sender-computed). */
export function vitalsWire(v: GhostVitals): { h: number; s: number; v: number } {
  return {
    h: clamp100(v.health),
    s: clamp100(v.stamina),
    v: clamp100(v.vigor),
  };
}
