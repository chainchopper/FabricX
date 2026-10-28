/**
 * RecipeCore — Slice 15 "Agent Shapes": the pure heart of Recipes.
 *
 * A Recipe is how an agent cooks with the pantry every Fabric
 * instance already carries (see the Recipes addendum in
 * ~/workspace/fabric-world-model.md): a compact, strictly validated
 * list of SHAPE steps — {shape, cx, cy, scale, hue?, durationMs,
 * style} — plus a seed. The host's agent emits the recipe (tiny);
 * every device renders it locally from its own ingredient library.
 * No pixels, no splat streams, no payload shipping.
 *
 * This module is deliberately dependency-free — types, validation,
 * shape geometry, the built-in recipes, and prompt intent detection
 * — so it can be exercised headlessly (scripts/recipe-check.mjs)
 * and imported from the transport layer without dragging the LLM
 * stack behind it. The LLM half lives in RecipeComposer.ts; the
 * timed renderer in RecipePlayer.ts.
 *
 * Validation discipline mirrors PatternComposer.validatePattern:
 * strict and total. Unknown shapes, out-of-range numbers, or an
 * over-long recipe invalidate the WHOLE recipe — a bad recipe can
 * never reach the renderer, from any source (model, wire, disk).
 *
 * The seed's job: every rendering decision the schema doesn't carry
 * (a line's angle, an arc's start, a spiral's handedness) is derived
 * from it with a seeded PRNG, so every device that receives the
 * same recipe draws the same picture.
 *
 * Powered by Nirvana
 */

export const RECIPE_VERSION = 2;
/** Recipe schema v1 remains readable; v2 adds the optional pulse. */
export const RECIPE_LEGACY_VERSION = 1;

/** Hard bounds — a recipe is a postcard, not a program. */
export const MAX_RECIPE_STEPS = 24;
export const MIN_STEP_DURATION_MS = 400;
export const MAX_STEP_DURATION_MS = 6_000;
export const MAX_RECIPE_DURATION_MS = 24_000;
/** Renderer bound: no step ever emits more splats than this. */
export const MAX_POINTS_PER_STEP = 48;

export type RecipeShapeId =
  | "ring"
  | "spiral"
  | "line"
  | "arc"
  | "burst"
  | "heart";

export const RECIPE_SHAPES: readonly RecipeShapeId[] = [
  "ring",
  "spiral",
  "line",
  "arc",
  "burst",
  "heart",
];

/**
 * How a step's smoke behaves while it lives:
 * - draw:  the path is traced progressively, like a hand drawing it.
 * - pulse: the whole shape appears fast, then is gently re-struck
 *          for its full duration — the shape HOLDS.
 * - burst: emission radiates outward from the step's center — the
 *          shape blooms instead of being drawn.
 */
export type RecipeStyle = "draw" | "pulse" | "burst";

export const RECIPE_STYLES: readonly RecipeStyle[] = [
  "draw",
  "pulse",
  "burst",
];

export interface RecipeStep {
  shape: RecipeShapeId;
  /** Normalized canvas position of the shape's center (0..1). */
  cx: number;
  cy: number;
  /** Shape radius/half-extent as a canvas fraction (0.05..0.5). */
  scale: number;
  /** Dye hue 0..360. Absent: the player's default (sender's hue). */
  hue?: number;
  durationMs: number;
  style: RecipeStyle;
}

/**
 * A performance-level rhythm, added by schema v2. The pulse does not
 * replace the drawn steps: it accents them with repeated strikes at
 * the first step's center. Older v1 clients validate the same recipe
 * and simply ignore this optional field, so the shapes still arrive.
 *
 * `grouping` is a phrase of strike clusters. For example [2, 1] is a
 * quick lub-dub pair, a rest, then one answering strike. Strikes in a
 * cluster are spaced 0.38 beat; clusters are separated by one beat.
 * A final beat of rest closes each cycle.
 */
export type PulseIntensityCurve =
  | "steady"
  | "swell"
  | "fade"
  | "sine"
  | "lub-dub";

export const PULSE_INTENSITY_CURVES: readonly PulseIntensityCurve[] = [
  "steady",
  "swell",
  "fade",
  "sine",
  "lub-dub",
];

export interface RecipePulse {
  /** Beats per minute, normalized to 30..180. */
  bpm: number;
  /** 1..4 strike clusters, each holding 1..4 strikes (max 12 total). */
  grouping: number[];
  /** Performance cycles, normalized to 1..16 and to the duration cap. */
  cycles: number;
  /** Peak strike strength, normalized to 0.05..1. */
  intensity: number;
  intensityCurve: PulseIntensityCurve;
}

export interface Recipe {
  version: 1 | 2;
  name: string;
  /** uint32 — rendering decisions not in the schema derive from it. */
  seed: number;
  steps: RecipeStep[];
  /** Optional v2 rhythm overlay; absent means a v1 performance. */
  pulse?: RecipePulse;
  /** Derived: max of the step total and the pulse performance. */
  durationMs: number;
  source: "llm" | "builtin";
}

// ---------------------------------------------------------------------------
// Seeded PRNG — the codebase's mulberry32 family (identity/ghost/ambient
// all use it), so a seed means the same thing everywhere in Fabric.
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Validation — strict, total: any violation invalidates the whole recipe.
// ---------------------------------------------------------------------------

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateStep(raw: unknown): RecipeStep | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (
    typeof s.shape !== "string" ||
    !RECIPE_SHAPES.includes(s.shape as RecipeShapeId)
  ) {
    return null;
  }
  if (!isNum(s.cx) || s.cx < 0 || s.cx > 1) return null;
  if (!isNum(s.cy) || s.cy < 0 || s.cy > 1) return null;
  if (!isNum(s.scale) || s.scale < 0.05 || s.scale > 0.5) return null;
  if (!isNum(s.durationMs)) return null;
  const durationMs = Math.round(s.durationMs);
  if (
    durationMs < MIN_STEP_DURATION_MS ||
    durationMs > MAX_STEP_DURATION_MS
  ) {
    return null;
  }
  let hue: number | undefined;
  if (s.hue !== undefined) {
    if (!isNum(s.hue) || s.hue < 0 || s.hue > 360) return null;
    hue = s.hue;
  }
  let style: RecipeStyle = "draw";
  if (s.style !== undefined) {
    if (
      typeof s.style !== "string" ||
      !RECIPE_STYLES.includes(s.style as RecipeStyle)
    ) {
      return null;
    }
    style = s.style as RecipeStyle;
  }
  return {
    shape: s.shape as RecipeShapeId,
    cx: s.cx,
    cy: s.cy,
    scale: s.scale,
    ...(hue !== undefined ? { hue } : {}),
    durationMs,
    style,
  };
}

const PULSE_CLUSTER_BEATS = 0.38;
const PULSE_CLUSTER_REST_BEATS = 1;
const PULSE_TRAILING_REST_BEATS = 1;

/** Beats in one complete pulse phrase, including its closing rest. */
export function pulsePhraseBeats(pulse: RecipePulse): number {
  const strikes = pulse.grouping.reduce((sum, n) => sum + n, 0);
  return (
    strikes * PULSE_CLUSTER_BEATS +
    Math.max(0, pulse.grouping.length - 1) * PULSE_CLUSTER_REST_BEATS +
    PULSE_TRAILING_REST_BEATS
  );
}

export function pulseDurationMs(pulse: RecipePulse): number {
  return Math.round(
    pulse.cycles * pulsePhraseBeats(pulse) * (60_000 / pulse.bpm)
  );
}

function clampNumber(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function validatePulse(raw: unknown): RecipePulse | null {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!isNum(p.bpm)) return null;
  if (!Array.isArray(p.grouping) || p.grouping.length === 0 || p.grouping.length > 4) {
    return null;
  }
  const grouping: number[] = [];
  let strikes = 0;
  for (const rawCount of p.grouping) {
    if (!isNum(rawCount)) return null;
    const count = Math.round(clampNumber(rawCount, 1, 4));
    grouping.push(count);
    strikes += count;
  }
  if (strikes > 12) return null;
  if (!isNum(p.cycles)) return null;
  const intensityRaw = p.intensity === undefined ? 0.75 : p.intensity;
  if (!isNum(intensityRaw)) return null;
  const curveRaw =
    p.intensityCurve === undefined ? "steady" : p.intensityCurve;
  if (
    typeof curveRaw !== "string" ||
    !PULSE_INTENSITY_CURVES.includes(curveRaw as PulseIntensityCurve)
  ) {
    return null;
  }
  const pulse: RecipePulse = {
    bpm: Math.round(clampNumber(p.bpm, 30, 180)),
    grouping,
    cycles: Math.round(clampNumber(p.cycles, 1, 16)),
    intensity: clampNumber(intensityRaw, 0.05, 1),
    intensityCurve: curveRaw as PulseIntensityCurve,
  };
  // Keep the whole performance inside the recipe duration cap by
  // reducing cycles, never by silently changing its tempo or rhythm.
  const phraseMs = pulsePhraseBeats(pulse) * (60_000 / pulse.bpm);
  if (phraseMs > MAX_RECIPE_DURATION_MS) return null;
  pulse.cycles = Math.max(
    1,
    Math.min(pulse.cycles, Math.floor(MAX_RECIPE_DURATION_MS / phraseMs))
  );
  return pulse;
}

export function validateRecipe(
  raw: unknown,
  source: Recipe["source"]
): Recipe | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    obj.version !== undefined &&
    obj.version !== RECIPE_VERSION &&
    obj.version !== RECIPE_LEGACY_VERSION
  ) {
    return null;
  }
  if (!Array.isArray(obj.steps)) return null;
  if (obj.steps.length === 0 || obj.steps.length > MAX_RECIPE_STEPS) {
    return null;
  }
  const steps: RecipeStep[] = [];
  let stepDurationMs = 0;
  for (const rawStep of obj.steps) {
    const step = validateStep(rawStep);
    if (!step) return null;
    steps.push(step);
    stepDurationMs += step.durationMs;
  }
  if (stepDurationMs > MAX_RECIPE_DURATION_MS) return null;
  const pulse = validatePulse(obj.pulse);
  if (obj.pulse !== undefined && !pulse) return null;
  const durationMs = Math.max(
    stepDurationMs,
    pulse ? pulseDurationMs(pulse) : 0
  );
  if (durationMs > MAX_RECIPE_DURATION_MS) return null;
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 48)
      : "Recipe";
  const seed = isNum(obj.seed) ? Math.floor(obj.seed) >>> 0 : 0;
  return {
    version: pulse ? RECIPE_VERSION : obj.version === RECIPE_VERSION ? 2 : 1,
    name,
    seed,
    steps,
    ...(pulse ? { pulse } : {}),
    durationMs,
    source,
  };
}

// ---------------------------------------------------------------------------
// Shape geometry — each shape is a path in normalized canvas space.
// A path point carries its position and its tangent (the direction of
// travel along the path), which the renderer turns into splat force
// so the smoke STREAMS along the shape instead of stamping dots.
// ---------------------------------------------------------------------------

export interface PathPoint {
  x: number;
  y: number;
  /** Tangent direction (not normalized — magnitude ~1). */
  tx: number;
  ty: number;
}

/**
 * Vertical squash for round shapes: canvas coordinates are square
 * but screens mostly aren't, and pattern splats have always lived
 * in this normalized space. A mild squash keeps a ring reading as
 * a ring on a portrait phone without breaking on landscape.
 */
const Y_SQUASH = 0.85;

const BURST_RAYS = 12;

function clampCanvas(v: number): number {
  return Math.min(0.98, Math.max(0.02, v));
}

/** How many splats a step emits — bounded, ~11/sec at the cap. */
export function pointsForStep(step: RecipeStep): number {
  return Math.min(
    MAX_POINTS_PER_STEP,
    Math.max(10, Math.round(step.durationMs / 90))
  );
}

function heartPoint(t: number): { x: number; y: number } {
  // The classic parametric heart, in curve units (~±17).
  const s = Math.sin(t);
  const x = 16 * s * s * s;
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return { x, y };
}

/**
 * Sample one step's path deterministically. Rotation, arc start,
 * and spiral handedness come from the recipe seed + step index —
 * every device sampling the same recipe gets the same points.
 */
export function sampleStepPath(
  step: RecipeStep,
  recipeSeed: number,
  stepIndex: number
): PathPoint[] {
  const n = pointsForStep(step);
  const rand = mulberry32(
    (recipeSeed ^ Math.imul(stepIndex + 1, 0x9e3779b9)) >>> 0
  );
  const rotation = rand() * Math.PI * 2;
  const flip = rand() < 0.5 ? -1 : 1;
  const { cx, cy, scale } = step;
  const pts: PathPoint[] = [];

  const push = (x: number, y: number, tx: number, ty: number) => {
    pts.push({ x: clampCanvas(x), y: clampCanvas(y), tx, ty });
  };

  switch (step.shape) {
    case "ring":
    case "arc": {
      const sweep =
        step.shape === "ring" ? Math.PI * 2 : (Math.PI * 4) / 3;
      const start = step.shape === "ring" ? 0 : rotation;
      for (let i = 0; i < n; i++) {
        const t = step.shape === "ring" ? i / n : i / (n - 1);
        const th = start + t * sweep;
        push(
          cx + Math.cos(th) * scale,
          cy + Math.sin(th) * scale * Y_SQUASH,
          -Math.sin(th),
          Math.cos(th) * Y_SQUASH
        );
      }
      break;
    }
    case "spiral": {
      const turns = 2.5;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const th = flip * t * Math.PI * 2 * turns;
        const r = scale * t;
        push(
          cx + Math.cos(th) * r,
          cy + Math.sin(th) * r * Y_SQUASH,
          -Math.sin(th) * flip,
          Math.cos(th) * flip * Y_SQUASH
        );
      }
      break;
    }
    case "line": {
      const dx = Math.cos(rotation);
      const dy = Math.sin(rotation);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1) - 0.5;
        push(cx + dx * t * 2 * scale, cy + dy * t * 2 * scale, dx, dy);
      }
      break;
    }
    case "burst": {
      // Round-robin across rays so the bloom grows evenly outward
      // instead of sweeping ray by ray.
      const perRay = Math.ceil(n / BURST_RAYS);
      for (let k = 0; k < n; k++) {
        const ray = k % BURST_RAYS;
        const frac = Math.floor(k / BURST_RAYS) / perRay;
        const th = rotation + (ray / BURST_RAYS) * Math.PI * 2;
        const r = scale * (0.15 + 0.85 * frac);
        push(
          cx + Math.cos(th) * r,
          cy + Math.sin(th) * r * Y_SQUASH,
          Math.cos(th),
          Math.sin(th)
        );
      }
      break;
    }
    case "heart": {
      let prev = heartPoint(0);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const p = heartPoint(t);
        const next = heartPoint(t + 0.05);
        push(
          cx + (p.x / 17) * scale,
          cy - (p.y / 17) * scale * 0.95,
          next.x - prev.x,
          -(next.y - prev.y)
        );
        prev = p;
      }
      break;
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Prompt intent — is this prompt asking for a DRAWING? Deterministic,
// so the offline demo behaves identically on every device. A shape
// word alone is not intent ("heartbeat" is a pattern, and \bheart\b
// doesn't match it anyway): the prompt needs a drawing verb, a
// "make a <shape>" phrase, or two shapes talking to each other
// ("a ring that bursts").
// ---------------------------------------------------------------------------

const SHAPE_WORDS: Array<[RecipeShapeId, RegExp]> = [
  ["spiral", /\bspirals?\b/i],
  ["heart", /\bheart\b/i],
  ["ring", /\b(rings?|circles?|halos?)\b/i],
  ["burst", /\b(bursts?|starbursts?|fireworks?|explosions?)\b/i],
  ["arc", /\b(arc|rainbow|crescent)\b/i],
  ["line", /\b(line|beam|streak)\b/i],
];

const DRAW_VERB =
  /\b(draw|drawing|sketch|trace|paint|shape|form|render)\b/i;

export function detectShapeIntent(prompt: string): RecipeShapeId | null {
  const text = prompt || "";
  const found: Array<{ shape: RecipeShapeId; at: number }> = [];
  for (const [shape, re] of SHAPE_WORDS) {
    const m = re.exec(text);
    if (m) found.push({ shape, at: m.index });
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a.at - b.at);
  const makePhrase = new RegExp(
    `\\bmake\\s+(a|an|the)\\s+\\w*\\s*(${found[0].shape}|ring|circle|spiral|heart|arc|line|burst)`,
    "i"
  );
  const hasIntent =
    DRAW_VERB.test(text) || found.length >= 2 || makePhrase.test(text);
  return hasIntent ? found[0].shape : null;
}

// ---------------------------------------------------------------------------
// Built-in recipes — authored in code, validated through the same
// gate as model output, so the feature demos with NO key configured.
// Labeled source:"builtin" wherever they surface.
// ---------------------------------------------------------------------------

function builtin(raw: unknown): Recipe | null {
  return validateRecipe(raw, "builtin");
}

export function builtinRecipeForShape(shape: RecipeShapeId): Recipe | null {
  switch (shape) {
    case "heart":
      return builtin({
        name: "Heart",
        seed: 0xfea17,
        steps: [
          {
            shape: "heart",
            cx: 0.5,
            cy: 0.48,
            scale: 0.3,
            hue: 345,
            durationMs: 2600,
            style: "draw",
          },
        ],
      });
    case "spiral":
      return builtin({
        name: "Spiral",
        seed: 0x5912a1,
        steps: [
          {
            shape: "spiral",
            cx: 0.5,
            cy: 0.5,
            scale: 0.34,
            hue: 265,
            durationMs: 3000,
            style: "draw",
          },
        ],
      });
    case "ring":
      return builtin({
        name: "Ring",
        seed: 0x2196,
        steps: [
          {
            shape: "ring",
            cx: 0.5,
            cy: 0.5,
            scale: 0.3,
            hue: 190,
            durationMs: 1800,
            style: "draw",
          },
        ],
      });
    case "burst":
      return builtin({
        name: "Burst",
        seed: 0xb12757,
        steps: [
          {
            shape: "burst",
            cx: 0.5,
            cy: 0.5,
            scale: 0.36,
            hue: 45,
            durationMs: 1600,
            style: "burst",
          },
        ],
      });
    case "arc":
      return builtin({
        name: "Arc",
        seed: 0xa2c,
        steps: [
          {
            shape: "arc",
            cx: 0.5,
            cy: 0.54,
            scale: 0.32,
            hue: 35,
            durationMs: 2000,
            style: "draw",
          },
        ],
      });
    case "line":
      return builtin({
        name: "Line",
        seed: 0x11e,
        steps: [
          {
            shape: "line",
            cx: 0.5,
            cy: 0.5,
            scale: 0.32,
            hue: 150,
            durationMs: 1600,
            style: "draw",
          },
        ],
      });
  }
}

/** The compound built-in: a ring that bursts — two steps, one breath. */
export function ringBurstRecipe(): Recipe | null {
  return builtin({
    name: "Ring Burst",
    seed: 0x2196b,
    steps: [
      {
        shape: "ring",
        cx: 0.5,
        cy: 0.5,
        scale: 0.28,
        hue: 190,
        durationMs: 1500,
        style: "draw",
      },
      {
        shape: "burst",
        cx: 0.5,
        cy: 0.5,
        scale: 0.4,
        hue: 45,
        durationMs: 1400,
        style: "burst",
      },
    ],
  });
}

/**
 * Slice 17 built-in performances. These are not the old fixed verb
 * macros: each template is parameterized from the request's words
 * and a prompt-derived seed, then passed through validateRecipe.
 * They are the offline floor. With a configured model, RecipeComposer
 * asks the model to invent a performance first and only degrades here.
 */
function promptSeed(prompt: string): number {
  let h = 0x51ce17;
  for (let i = 0; i < prompt.length; i++) {
    h = Math.imul(h ^ prompt.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const HUE_WORDS: Array<[RegExp, number]> = [
  [/\b(rose|pink|magenta)\b/i, 335],
  [/\bred\b/i, 0],
  [/\b(orange|amber)\b/i, 32],
  [/\b(gold|golden|yellow)\b/i, 45],
  [/\bgreen\b/i, 120],
  [/\b(teal|turquoise)\b/i, 174],
  [/\b(cyan|aqua)\b/i, 190],
  [/\b(blue|ocean|sea)\b/i, 210],
  [/\b(violet|purple|galaxy)\b/i, 265],
];

function promptHue(prompt: string, fallback: number): number {
  for (const [re, hue] of HUE_WORDS) if (re.test(prompt)) return hue;
  return fallback;
}

function promptTempo(
  prompt: string,
  base: number,
  calm: number,
  excited: number
): number {
  if (/\b(calm|slow|gentle|soft|sleepy|quiet|relax(?:ed|ing)?)\b/i.test(prompt)) {
    return calm;
  }
  if (/\b(excited|fast|wild|racing|frantic|intense|pounding)\b/i.test(prompt)) {
    return excited;
  }
  return base;
}

function promptIntensity(prompt: string, fallback: number): number {
  if (/\b(soft|gentle|quiet|faint|light)\b/i.test(prompt)) {
    return Math.min(fallback, 0.45);
  }
  if (/\b(wild|intense|strong|pounding|frantic)\b/i.test(prompt)) {
    return Math.max(fallback, 0.95);
  }
  return fallback;
}

function dynamicRecipe(raw: unknown): Recipe | null {
  return validateRecipe(raw, "builtin");
}

/** True when a request names one of the generative performance families. */
export function detectPerformanceIntent(prompt: string): string | null {
  const text = prompt || "";
  if (/\b(heart\s*beat|heartbeat|heart beat|pulse)\b/i.test(text)) return "heartbeat";
  if (/\b(breath(?:e|ing)?|inhale|exhale)\b/i.test(text)) return "breathing";
  if (/\b(rain|drizzle|downpour|tin roof)\b/i.test(text)) return "rain";
  if (/\b(galaxy|cosmos|nebula)\b/i.test(text)) return "galaxy";
  if (/\b(gallop|horses?|hoofbeats?)\b/i.test(text)) return "gallop";
  if (/\b(sparkles?|glitter|twinkles?)\b/i.test(text)) return "sparkle";
  if (/\btide\b/i.test(text)) return "tide";
  if (/\b(waves?|ocean|surf|swell)\b/i.test(text)) return "waves";
  return null;
}

export function matchBuiltinPerformance(prompt: string): Recipe | null {
  const kind = detectPerformanceIntent(prompt);
  if (!kind) return null;
  const seed = promptSeed(prompt.toLowerCase());
  const rand = mulberry32(seed);
  const intensity = promptIntensity(prompt, 0.72);

  switch (kind) {
    case "heartbeat": {
      const bpm = promptTempo(prompt, 76, 55, 110);
      return dynamicRecipe({
        version: 2,
        name: "Heartbeat — interpreted",
        seed,
        steps: [
          {
            shape: "heart",
            cx: 0.5,
            cy: 0.48,
            scale: 0.3,
            hue: promptHue(prompt, 345),
            durationMs: 2400,
            style: "pulse",
          },
        ],
        pulse: {
          bpm,
          grouping: [2, 1],
          cycles: 6,
          intensity: promptIntensity(prompt, 0.9),
          intensityCurve: "lub-dub",
        },
      });
    }
    case "breathing": {
      return dynamicRecipe({
        version: 2,
        name: "Breathing — interpreted",
        seed,
        steps: [
          {
            shape: "ring",
            cx: 0.5,
            cy: 0.5,
            scale: 0.31,
            hue: promptHue(prompt, 190),
            durationMs: 6000,
            style: "pulse",
          },
        ],
        pulse: {
          bpm: 30,
          grouping: [1],
          cycles: 6,
          intensity: promptIntensity(prompt, 0.5),
          intensityCurve: "sine",
        },
      });
    }
    case "rain": {
      const drops = Array.from({ length: 7 }, (_, i) => ({
        shape: "burst",
        cx: 0.14 + rand() * 0.72,
        cy: 0.14 + rand() * 0.68,
        scale: 0.1 + rand() * 0.09,
        hue: promptHue(prompt, 205) + (i % 3) * 5,
        durationMs: 950,
        style: "burst",
      }));
      return dynamicRecipe({
        version: 2,
        name: "Rain — interpreted",
        seed,
        steps: drops,
        pulse: {
          bpm: promptTempo(prompt, 116, 84, 152),
          grouping: [3, 2, 1],
          cycles: 3,
          intensity: promptIntensity(prompt, 0.42),
          intensityCurve: "steady",
        },
      });
    }
    case "galaxy": {
      return dynamicRecipe({
        version: 2,
        name: "Galaxy — interpreted",
        seed,
        steps: [
          {
            shape: "spiral",
            cx: 0.5,
            cy: 0.5,
            scale: 0.38,
            hue: promptHue(prompt, 265),
            durationMs: 5200,
            style: "draw",
          },
        ],
        pulse: {
          bpm: promptTempo(prompt, 38, 30, 62),
          grouping: [1],
          cycles: 5,
          intensity,
          intensityCurve: "swell",
        },
      });
    }
    case "gallop": {
      return dynamicRecipe({
        version: 2,
        name: "Gallop — interpreted",
        seed,
        steps: [0.34, 0.5, 0.66].map((cy, i) => ({
          shape: "arc",
          cx: 0.5,
          cy,
          scale: 0.28,
          hue: promptHue(prompt, 35) + i * 8,
          durationMs: 1300,
          style: "draw",
        })),
        pulse: {
          bpm: promptTempo(prompt, 132, 104, 164),
          grouping: [3],
          cycles: 7,
          intensity: promptIntensity(prompt, 0.82),
          intensityCurve: "steady",
        },
      });
    }
    case "sparkle": {
      const stars = Array.from({ length: 6 }, () => ({
        shape: "burst",
        cx: 0.16 + rand() * 0.68,
        cy: 0.16 + rand() * 0.64,
        scale: 0.11 + rand() * 0.1,
        hue: promptHue(prompt, 45),
        durationMs: 850,
        style: "burst",
      }));
      return dynamicRecipe({
        version: 2,
        name: "Sparkles — interpreted",
        seed,
        steps: stars,
        pulse: {
          bpm: promptTempo(prompt, 96, 68, 142),
          grouping: [2, 3],
          cycles: 4,
          intensity: promptIntensity(prompt, 0.68),
          intensityCurve: "swell",
        },
      });
    }
    case "tide":
    case "waves": {
      const steps = Array.from({ length: 5 }, (_, i) => ({
        shape: "line",
        cx: 0.5,
        cy: 0.3 + i * 0.11,
        scale: 0.34,
        hue: promptHue(prompt, 198) + i * 4,
        durationMs: 1500,
        style: "draw",
      }));
      return dynamicRecipe({
        version: 2,
        name: kind === "tide" ? "Tide — interpreted" : "Waves — interpreted",
        seed,
        steps,
        pulse: {
          bpm: promptTempo(prompt, kind === "tide" ? 32 : 42, 30, 72),
          grouping: [1],
          cycles: 6,
          intensity,
          intensityCurve: kind === "tide" ? "sine" : "swell",
        },
      });
    }
  }
}

/**
 * Offline match: a shape-intent prompt resolves to its built-in
 * recipe with no key and no network. Returns null when the prompt
 * carries no shape intent at all.
 */
export function matchBuiltinRecipe(prompt: string): Recipe | null {
  const shape = detectShapeIntent(prompt);
  if (!shape) return null;
  if (shape === "ring" && /\b(bursts?|starbursts?|fireworks?)\b/i.test(prompt)) {
    return ringBurstRecipe();
  }
  return builtinRecipeForShape(shape);
}

