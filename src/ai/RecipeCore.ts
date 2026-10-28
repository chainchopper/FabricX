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

export const RECIPE_VERSION = 1;

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

export interface Recipe {
  version: 1;
  name: string;
  /** uint32 — rendering decisions not in the schema derive from it. */
  seed: number;
  steps: RecipeStep[];
  /** Derived: sum of step durations. */
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

export function validateRecipe(
  raw: unknown,
  source: Recipe["source"]
): Recipe | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== undefined && obj.version !== RECIPE_VERSION) {
    return null;
  }
  if (!Array.isArray(obj.steps)) return null;
  if (obj.steps.length === 0 || obj.steps.length > MAX_RECIPE_STEPS) {
    return null;
  }
  const steps: RecipeStep[] = [];
  let durationMs = 0;
  for (const rawStep of obj.steps) {
    const step = validateStep(rawStep);
    if (!step) return null;
    steps.push(step);
    durationMs += step.durationMs;
  }
  if (durationMs > MAX_RECIPE_DURATION_MS) return null;
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 48)
      : "Recipe";
  const seed = isNum(obj.seed) ? Math.floor(obj.seed) >>> 0 : 0;
  return { version: RECIPE_VERSION, name, seed, steps, durationMs, source };
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
