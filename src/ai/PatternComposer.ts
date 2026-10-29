/**
 * PatternComposer — Muse Spark pattern composer (Slice 4).
 *
 * Turns a plain-language feeling ("gentle rain on a tin roof") into a
 * Pattern: an ordered list of timed steps (sensory verbs, fluid splats,
 * haptic pulses) that PatternPlayer dispatches through the canvas's
 * existing sendInteraction path, so every device in the session renders
 * the same pattern through the normal remote-interaction path.
 *
 * Discipline matches the ghost's LLM link exactly:
 * - The model is asked for strict JSON only; the reply is parsed
 *   defensively (code fences / surrounding prose stripped) and EVERY
 *   field is validated against allowlists and ranges. One invalid step
 *   invalidates the whole pattern.
 * - One repair retry with a corrective prompt, then give up.
 * - Any failure — no cloud model resolved, network error, invalid
 *   output — resolves to null or a built-in pattern. This module
 *   never throws into UI code.
 * - Which cloud model answers is a RESOLUTION, never a user chore
 *   (Cleanup 2, Terrell's standing rule: the demo never asks anyone
 *   for a key). loadLLMConfig resolves in order:
 *   1. the user's own saved AI Services config
 *      (`fabric_ai_config_v1`, the same shape the ghost poll reads),
 *      when it is enabled and carries a key;
 *   2. Fanalogy's built-in cloud, locked in at build time through
 *      the EXPO_PUBLIC_FANALOGY_LLM_* env vars (see docs/AI.md) —
 *      the demo's cloud, already connected out of the box;
 *   3. no cloud at all: the in-browser built-ins below answer.
 *   The in-browser model is the product default and is presented
 *   that way everywhere; the cloud tiers are upgrades, not gates.
 *
 * Offline: with no cloud resolved, three built-in patterns (rain,
 * heartbeat, ocean) are matched by keyword so the feature still demos.
 * If a cloud model is resolved but unreachable/invalid, the same
 * built-in match is tried before returning null.
 *
 * Spark note: Muse Spark reasons before it answers, so the request
 * uses a generous maxTokens (2048) — a small cap can return empty
 * content after the reasoning budget is spent.
 *
 * Powered by Nirvana
 */

import { getJSON } from "../../app/utils/storage";
import { getLLMService, type LLMConfig } from "../services/LLMService";
import { SENSORY_VERBS } from "../sensory/verbs";

/** HUD -> canvas: compose this prompt (detail: string). */
export const FABRIC_COMPOSE_EVENT = "fabric:compose";
/** HUD -> canvas: stop any playing pattern. */
export const FABRIC_COMPOSE_STOP_EVENT = "fabric:compose-stop";
/** Canvas -> HUD: playback state (detail: pattern name or null). */
export const FABRIC_COMPOSE_STATE_EVENT = "fabric:compose-state";
/**
 * Any UI -> canvas: play this already-composed Pattern now (detail:
 * Pattern). Slice 5's "Share live" uses it to play a pattern into a
 * shared room through the exact dispatch path the composer uses —
 * verb/splat steps broadcast via sendInteraction, so session mode
 * enforcement applies to shared playback exactly as to live input.
 */
export const FABRIC_PLAY_PATTERN_EVENT = "fabric:play-pattern";

const AI_CONFIG_KEY = "fabric_ai_config_v1";

export const MAX_PATTERN_STEPS = 64;
export const MAX_PATTERN_DURATION_MS = 20_000;

/** Human-sendable verb ids (ghost-only PURR is deliberately excluded). */
const VERB_IDS: readonly string[] = SENSORY_VERBS.map((v) => v.id);

/**
 * Named local vibration patterns a haptic step can reference. Haptic
 * steps are felt on the composing device only: the transport payload
 * (FluidInteraction) has no haptic-only channel, and a verb-less splat
 * would paint dye on peers. Verbs are the broadcast haptic channel —
 * their vibration patterns already reach every device.
 */
export const HAPTIC_PATTERNS: Record<string, number[]> = {
  tap: [45],
  "double-tap": [45, 60, 45],
  heartbeat: [120, 80, 220],
  wave: [40, 40, 80, 40, 140],
  buzz: [220],
};
export const HAPTIC_IDS: readonly string[] = Object.keys(HAPTIC_PATTERNS);

export function getHapticPattern(id?: string | null): number[] | undefined {
  if (!id) return undefined;
  return HAPTIC_PATTERNS[id];
}

export type PatternStepKind = "verb" | "splat" | "haptic";

export interface PatternStep {
  /** Offset from pattern start, ms (0..MAX_PATTERN_DURATION_MS). */
  atMs: number;
  kind: PatternStepKind;
  /** kind === "verb": id from src/sensory/verbs SENSORY_VERBS. */
  verbId?: string;
  /** kind === "splat": normalized canvas position (0..1). */
  x?: number;
  y?: number;
  /** kind === "splat": bloom size 0.05..1. */
  radius?: number;
  /** kind === "splat": dye hue 0..360. */
  hue?: number;
  /** All kinds: 0..1. */
  intensity: number;
  /** kind === "haptic": id from HAPTIC_PATTERNS. */
  hapticId?: string;
}

export interface Pattern {
  name: string;
  steps: PatternStep[];
  /** atMs of the last step. */
  durationMs: number;
  source: "llm" | "builtin";
}

/** HSV -> RGB floats 0..1 in the FluidInteraction color shape. */
export function hueToRgb(
  hue: number,
  intensity = 0.8
): { r: number; g: number; b: number } {
  const h = ((((hue % 360) + 360) % 360) / 60) as number;
  const s = 0.85;
  const v = 0.35 + 0.65 * Math.min(1, Math.max(0, intensity));
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}

// ---------------------------------------------------------------------------
// Validation — strict, total: any violation invalidates the whole pattern.
// ---------------------------------------------------------------------------

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateStep(raw: unknown): PatternStep | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!isNum(s.atMs)) return null;
  const atMs = Math.round(s.atMs);
  if (atMs < 0 || atMs > MAX_PATTERN_DURATION_MS) return null;
  const intensity = s.intensity === undefined ? 0.8 : s.intensity;
  if (!isNum(intensity) || intensity < 0 || intensity > 1) return null;

  if (s.kind === "verb") {
    if (typeof s.verbId !== "string" || !VERB_IDS.includes(s.verbId)) {
      return null;
    }
    return { atMs, kind: "verb", verbId: s.verbId, intensity };
  }
  if (s.kind === "splat") {
    if (!isNum(s.x) || s.x < 0 || s.x > 1) return null;
    if (!isNum(s.y) || s.y < 0 || s.y > 1) return null;
    if (!isNum(s.radius) || s.radius < 0.05 || s.radius > 1) return null;
    if (!isNum(s.hue) || s.hue < 0 || s.hue > 360) return null;
    return {
      atMs,
      kind: "splat",
      x: s.x,
      y: s.y,
      radius: s.radius,
      hue: s.hue,
      intensity,
    };
  }
  if (s.kind === "haptic") {
    if (typeof s.hapticId !== "string" || !HAPTIC_IDS.includes(s.hapticId)) {
      return null;
    }
    return { atMs, kind: "haptic", hapticId: s.hapticId, intensity };
  }
  return null;
}

export function validatePattern(
  raw: unknown,
  source: Pattern["source"]
): Pattern | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.steps)) return null;
  if (obj.steps.length === 0 || obj.steps.length > MAX_PATTERN_STEPS) {
    return null;
  }
  const steps: PatternStep[] = [];
  for (const rawStep of obj.steps) {
    const step = validateStep(rawStep);
    if (!step) return null;
    steps.push(step);
  }
  steps.sort((a, b) => a.atMs - b.atMs);
  const durationMs = steps[steps.length - 1].atMs;
  if (durationMs > MAX_PATTERN_DURATION_MS) return null;
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 48)
      : "Pattern";
  return { name, steps, durationMs, source };
}

/** Extract and JSON-parse a pattern object from raw model text. */
export function parsePatternJson(text: string): unknown | null {
  if (!text) return null;
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Built-in offline patterns (validated through the same gate as LLM output).
// ---------------------------------------------------------------------------

function builtin(raw: unknown): Pattern | null {
  return validatePattern(raw, "builtin");
}

const RAIN_SPOTS: Array<[number, number]> = [
  [0.12, 0.2], [0.34, 0.12], [0.58, 0.26], [0.81, 0.16], [0.22, 0.44],
  [0.47, 0.36], [0.7, 0.48], [0.9, 0.4], [0.15, 0.66], [0.39, 0.58],
  [0.62, 0.7], [0.84, 0.62], [0.28, 0.84], [0.52, 0.8], [0.75, 0.88],
  [0.95, 0.78],
];

function rainPattern(): Pattern | null {
  const steps: unknown[] = [];
  RAIN_SPOTS.forEach(([x, y], i) => {
    steps.push({
      atMs: i * 340,
      kind: "splat",
      x,
      y,
      radius: 0.14 + (i % 4) * 0.05,
      hue: 205 + (i % 3) * 8,
      intensity: 0.45 + (i % 3) * 0.15,
    });
  });
  [0, 1500, 3100, 4600].forEach((atMs) =>
    steps.push({ atMs, kind: "haptic", hapticId: "tap", intensity: 0.5 })
  );
  return builtin({ name: "Rain", steps });
}

function heartbeatPattern(): Pattern | null {
  const steps: unknown[] = [];
  for (let t = 0; t <= 5500; t += 1100) {
    steps.push({ atMs: t, kind: "verb", verbId: "heart", intensity: 0.9 });
    steps.push({ atMs: t, kind: "haptic", hapticId: "heartbeat", intensity: 0.9 });
  }
  return builtin({ name: "Heartbeat", steps });
}

function oceanPattern(): Pattern | null {
  const steps: unknown[] = [
    { atMs: 0, kind: "haptic", hapticId: "wave", intensity: 0.6 },
  ];
  for (let i = 0; i < 6; i++) {
    steps.push({
      atMs: 400 + i * 1500,
      kind: "splat",
      x: 0.15 + i * 0.14,
      y: 0.55 + (i % 2 === 0 ? -0.08 : 0.08),
      radius: 0.7 + (i % 3) * 0.1,
      hue: 188 + (i % 3) * 6,
      intensity: 0.55,
    });
  }
  steps.push({ atMs: 4900, kind: "haptic", hapticId: "wave", intensity: 0.6 });
  return builtin({ name: "Ocean", steps });
}

const BUILTINS: Array<{ keywords: string[]; make: () => Pattern | null }> = [
  {
    keywords: ["rain", "drizzle", "storm", "shower", "tin roof", "thunder"],
    make: rainPattern,
  },
  {
    keywords: ["heart", "heartbeat", "pulse", "love", "thump"],
    make: heartbeatPattern,
  },
  {
    keywords: ["ocean", "wave", "sea", "surf", "tide", "beach"],
    make: oceanPattern,
  },
];

export function matchBuiltinPattern(prompt: string): Pattern | null {
  const text = prompt.toLowerCase();
  for (const entry of BUILTINS) {
    if (entry.keywords.some((k) => text.includes(k))) {
      return entry.make();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// LLM composition via the existing LLMService + AI Settings config.
// ---------------------------------------------------------------------------

interface AIConfigShape {
  llm?: {
    provider: string;
    apiKey: string;
    endpoint: string;
    model: string;
    enabled: boolean;
  };
}

/** The user's own saved AI Services config, when it can serve. */
async function loadUserLLMConfig(): Promise<LLMConfig | null> {
  let config: AIConfigShape | null = null;
  try {
    config = await getJSON<AIConfigShape | null>(AI_CONFIG_KEY, null);
  } catch {
    return null;
  }
  const llm = config?.llm;
  if (!llm || !llm.enabled || llm.provider === "none" || !llm.apiKey) {
    return null; // not serving: resolution falls through
  }
  return {
    provider: llm.provider as LLMConfig["provider"],
    apiKey: llm["apiKey"],
    endpoint: llm.endpoint,
    model: llm.model,
  };
}

// ---------------------------------------------------------------------------
// Fanalogy's built-in cloud (Cleanup 2) — locked in at build time.
//
// The demo ships with Fanalogy's own Meta Model API key + model baked
// in through EXPO_PUBLIC_ env vars (set on the Vercel project; see
// docs/AI.md). EXPO_PUBLIC_ values are inlined into the shipped bundle
// and are therefore VISIBLE in it — acceptable for this demo key,
// which sits behind a hard spend cap on Fanalogy's side. That is
// Fanalogy's call, made deliberately; the release direction is
// Fanalogy-trained models running on device, with this cloud as an
// opt-in tier.
//
// IMPORTANT: the three reads below must stay literal
// `process.env.EXPO_PUBLIC_*` member accesses — Expo/Metro inlines
// EXPO_PUBLIC_ variables at build time only in that exact shape.
// Dynamic key access would ship unfilled.
// ---------------------------------------------------------------------------

export const BUILTIN_CLOUD_BASE_URL_DEFAULT = "https://api.meta.ai/v1";
export const BUILTIN_CLOUD_MODEL_DEFAULT = "muse-spark-1.3";

function envTrimmed(direct: string | undefined): string {
  return typeof direct === "string" ? direct.trim() : "";
}

export function getBuiltinCloudConfig(): LLMConfig | null {
  let apiKey = "";
  let baseUrl = "";
  let model = "";
  try {
    apiKey = envTrimmed(process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY);
    baseUrl = envTrimmed(process.env.EXPO_PUBLIC_FANALOGY_LLM_BASE_URL);
    model = envTrimmed(process.env.EXPO_PUBLIC_FANALOGY_LLM_MODEL);
  } catch {
    // No process global at all (bare native runtime): no built-in cloud.
    return null;
  }
  if (!apiKey) return null;
  return {
    // Meta's Model API is OpenAI-compatible; LLMService's "custom"
    // provider appends /chat/completions and sends the Bearer key.
    provider: "custom",
    apiKey,
    endpoint: baseUrl || BUILTIN_CLOUD_BASE_URL_DEFAULT,
    model: model || BUILTIN_CLOUD_MODEL_DEFAULT,
  };
}

/** True when this build carries Fanalogy's locked-in cloud key. */
export function hasBuiltinCloud(): boolean {
  return getBuiltinCloudConfig() !== null;
}

export interface LLMConfigResolution {
  config: LLMConfig | null;
  /** Where the cloud config came from — "none" means on-device only. */
  source: "user" | "builtin-cloud" | "none";
}

/**
 * The one resolution every intelligence path reads (composer, ghost
 * brain, SAM): user's saved model first, then the built-in cloud,
 * then no cloud — in which case the in-browser model is the answer,
 * not an error. Never throws.
 */
export async function resolveLLMConfig(): Promise<LLMConfigResolution> {
  const user = await loadUserLLMConfig();
  if (user) return { config: user, source: "user" };
  const builtin = getBuiltinCloudConfig();
  if (builtin) return { config: builtin, source: "builtin-cloud" };
  return { config: null, source: "none" };
}

export async function loadLLMConfig(): Promise<LLMConfig | null> {
  return (await resolveLLMConfig()).config;
}

const SYSTEM_PROMPT = [
  "You compose sensory patterns for Fabric, a shared touch canvas where",
  "people feel each other's touch as fluid motion, vibration and sound.",
  "Reply with ONLY one JSON object — no prose, no code fences:",
  '{"name": string, "steps": [step, ...]}',
  'Each step: {"atMs": integer 0..16000, "kind": "verb"|"splat"|"haptic", "intensity": 0..1} plus, per kind:',
  '- verb: "verbId", one of: heart, cheer, tickle',
  '- splat: "x" 0..1, "y" 0..1, "radius" 0.05..1, "hue" 0..360 (0=red, 120=green, 210=blue, 280=violet)',
  '- haptic: "hapticId", one of: tap, double-tap, heartbeat, wave, buzz',
  "At most 24 steps. Order steps by atMs. Let timing, spacing, color and",
  "rhythm express the requested feeling — a pattern is choreography,",
  "not a list of guesses.",
].join("\n");

/**
 * Compose a pattern for a plain-language prompt. LLM first when a
 * cloud model resolves (with one repair retry); built-in keyword
 * match otherwise — and also as the degradation path when the LLM fails.
 * Returns null when nothing valid can be produced. Never throws.
 */
export async function composePattern(
  userPrompt: string
): Promise<Pattern | null> {
  const prompt = (userPrompt || "").trim();
  if (!prompt) return null;

  const config = await loadLLMConfig();
  if (config) {
    try {
      const service = getLLMService(config);
      const first = await service.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Compose a pattern for: ${prompt}` },
        ],
        { temperature: 0.3, maxTokens: 2048 }
      );
      let pattern = validatePattern(parsePatternJson(first.text), "llm");
      if (!pattern) {
        const repair = await service.chat(
          [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `Compose a pattern for: ${prompt}\n` +
                "Your previous reply was not valid pattern JSON. Reply with ONLY the JSON object, exactly matching the schema.",
            },
          ],
          { temperature: 0.2, maxTokens: 2048 }
        );
        pattern = validatePattern(parsePatternJson(repair.text), "llm");
      }
      if (pattern) return pattern;
    } catch {
      // LLM unreachable/misconfigured: degrade to built-ins below.
    }
  }

  return matchBuiltinPattern(prompt);
}
