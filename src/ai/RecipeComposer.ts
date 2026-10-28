/**
 * RecipeComposer — Slice 15 "Agent Shapes": Muse Spark, drawing.
 *
 * The composer's second vocabulary. PatternComposer turns a feeling
 * into timed verbs and splats; this module turns a drawing request
 * ("draw a heart", "make a spiral", "a ring that bursts") into a
 * Recipe — a compact list of shape steps every device renders from
 * its own ingredient library (RecipeCore). Same discipline as
 * Slice 4, unchanged:
 * - Strict JSON only from the model, parsed defensively, and EVERY
 *   field validated by validateRecipe. One invalid step kills the
 *   whole recipe — a bad recipe can never reach the renderer.
 * - One repair retry with a corrective prompt, then give up.
 * - The key only ever comes from the user's AI Settings config
 *   (PatternComposer.loadLLMConfig). No env vars, no secrets.
 * - Offline: built-in recipes (heart / spiral / ring-burst + the
 *   rest of the shape library) match deterministically by intent,
 *   so the feature demos with no key. Failures resolve to null or
 *   a built-in — this module never throws into UI code.
 *
 * composeWithShapes is the single entry the canvas calls: shape
 * intent routes here; everything else falls through to the
 * existing pattern path, byte-for-byte the Slice 4 behavior.
 *
 * Spark note: Spark reasons before it answers — generous
 * maxTokens (2048), exactly as the pattern composer learned.
 *
 * Powered by Nirvana
 */

import { getLLMService, type LLMConfig } from "../services/LLMService";
import {
  composePattern,
  loadLLMConfig,
  parsePatternJson,
  validatePattern,
  type Pattern,
} from "./PatternComposer";
import {
  detectShapeIntent,
  matchBuiltinPerformance,
  matchBuiltinRecipe,
  validateRecipe,
  type Recipe,
} from "./RecipeCore";

/**
 * Any UI -> canvas: play this already-validated Recipe now (detail:
 * Recipe). The shape sibling of FABRIC_PLAY_PATTERN_EVENT — Studio
 * replay and the menu's share-live hand recipes to the canvas
 * through it. Playback renders locally AND sends the one compact
 * recipe message through the session-gated transport path, so a
 * gated guest's replay stays on their own canvas exactly like a
 * gated pattern replay does.
 */
export const FABRIC_PLAY_RECIPE_EVENT = "fabric:play-recipe";

/**
 * Canvas -> ComposeBar: where the current answer came from
 * (detail: "llm" | "builtin" | "ghost"). Slice 17 honesty surface:
 * the bar captions built-in interpretations as built-ins instead of
 * letting a template masquerade as open-ended model intelligence.
 */
export const FABRIC_COMPOSE_SOURCE_EVENT = "fabric:compose-source";

const SYSTEM_PROMPT = [
  "You draw with smoke for Fabric, a shared touch canvas. Given a",
  "drawing request, reply with ONLY one JSON object — no prose,",
  "no code fences:",
  '{"name": string, "seed": integer, "steps": [step, ...]}',
  'Each step: {"shape": one of ring|spiral|line|arc|burst|heart,',
  '"cx": 0..1, "cy": 0..1 (canvas center is 0.5,0.5),',
  '"scale": 0.05..0.5 (shape radius as a canvas fraction),',
  '"hue": 0..360 (0=red, 45=gold, 120=green, 190=cyan, 265=violet, 345=rose),',
  '"durationMs": integer 400..6000,',
  '"style": "draw"|"pulse"|"burst"}',
  "At most 8 steps; steps play in order, one after another. Prefer",
  "1-3 steps that ARE the request over decoration. A heart that is",
  "asked for is a heart step — never approximate a shape with",
  "another shape.",
  "Examples:",
  'Request "draw a heart" -> {"name":"Heart","seed":1234,"steps":[{"shape":"heart","cx":0.5,"cy":0.48,"scale":0.3,"hue":345,"durationMs":2600,"style":"draw"}]}',
  'Request "a ring that bursts" -> {"name":"Ring Burst","seed":77,"steps":[{"shape":"ring","cx":0.5,"cy":0.5,"scale":0.28,"hue":190,"durationMs":1500,"style":"draw"},{"shape":"burst","cx":0.5,"cy":0.5,"scale":0.4,"hue":45,"durationMs":1400,"style":"burst"}]}',
].join("\n");

/**
 * Compose a recipe for a drawing prompt. LLM first when a key is
 * configured (one repair retry); the deterministic built-in match
 * otherwise — and also as the degradation path when the LLM fails.
 * Returns null when nothing valid can be produced. Never throws.
 */
export async function composeRecipe(
  userPrompt: string
): Promise<Recipe | null> {
  const prompt = (userPrompt || "").trim();
  if (!prompt) return null;

  const config = await loadLLMConfig();
  if (config) {
    try {
      const service = getLLMService(config);
      const first = await service.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Draw: ${prompt}` },
        ],
        { temperature: 0.3, maxTokens: 2048 }
      );
      let recipe = validateRecipe(parsePatternJson(first.text), "llm");
      if (!recipe) {
        const repair = await service.chat(
          [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `Draw: ${prompt}\n` +
                "Your previous reply was not valid recipe JSON. Reply with ONLY the JSON object, exactly matching the schema.",
            },
          ],
          { temperature: 0.2, maxTokens: 2048 }
        );
        recipe = validateRecipe(parsePatternJson(repair.text), "llm");
      }
      if (recipe) return recipe;
    } catch {
      // LLM unreachable/misconfigured: degrade to built-ins below.
    }
  }

  return matchBuiltinRecipe(prompt);
}

export type ComposedResult =
  | { kind: "pattern"; pattern: Pattern }
  | { kind: "recipe"; recipe: Recipe };

const PERFORMANCE_SYSTEM_PROMPT = [
  "You interpret free-form sensory requests for Fabric, a shared touch",
  "canvas. INVENT a performance that expresses what the person asked to",
  "feel or see. Do not keyword-match a canned macro. Reply with ONLY one",
  "JSON object — no prose, no code fences — in one of these two forms:",
  '{"kind":"recipe","recipe":{"version":2,"name":string,"seed":integer,"steps":[recipe-step],"pulse":pulse}}',
  '{"kind":"pattern","pattern":{"name":string,"steps":[pattern-step]}}',
  "Recipe step: {shape: ring|spiral|line|arc|burst|heart, cx:0..1,",
  "cy:0..1, scale:0.05..0.5, hue:0..360, durationMs:400..6000,",
  "style: draw|pulse|burst}. At most 8 recipe steps.",
  "Optional recipe pulse: {bpm:30..180, grouping:[clusters of 1..4",
  "strikes, e.g. [2,1] means a quick lub-dub pair, a rest, then one",
  "answering strike], cycles:1..16, intensity:0..1, intensityCurve:",
  "steady|swell|fade|sine|lub-dub}. Use pulse when rhythm IS the request.",
  "Pattern step: {atMs:0..16000, kind:verb|splat|haptic, intensity:0..1}",
  "plus verbId heart|cheer|tickle for verbs; x,y,radius,hue for splats;",
  "or hapticId tap|double-tap|heartbeat|wave|buzz for haptics.",
  "Vocabulary is a palette, not a menu: combine shapes, rhythm, tempo,",
  "spacing, hue and intensity to create the requested sensation.",
  "Examples:",
  'Request "lemme see your heartbeat" -> {"kind":"recipe","recipe":{"version":2,"name":"Heartbeat","seed":4102,"steps":[{"shape":"heart","cx":0.5,"cy":0.48,"scale":0.3,"hue":345,"durationMs":2400,"style":"pulse"}],"pulse":{"bpm":78,"grouping":[2,1],"cycles":6,"intensity":0.9,"intensityCurve":"lub-dub"}}}',
  'Request "rain on a tin roof" -> {"kind":"recipe","recipe":{"version":2,"name":"Rain on a Tin Roof","seed":88,"steps":[{"shape":"burst","cx":0.28,"cy":0.3,"scale":0.16,"hue":205,"durationMs":1100,"style":"burst"},{"shape":"burst","cx":0.64,"cy":0.52,"scale":0.18,"hue":212,"durationMs":1100,"style":"burst"}],"pulse":{"bpm":126,"grouping":[3,2,1],"cycles":3,"intensity":0.45,"intensityCurve":"steady"}}}',
  'Request "show me a galaxy" -> {"kind":"recipe","recipe":{"version":2,"name":"Galaxy","seed":907,"steps":[{"shape":"spiral","cx":0.5,"cy":0.5,"scale":0.38,"hue":265,"durationMs":5200,"style":"draw"}],"pulse":{"bpm":38,"grouping":[1],"cycles":5,"intensity":0.7,"intensityCurve":"swell"}}}',
].join("\n");

function parsePerformance(raw: unknown): ComposedResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === "recipe") {
    const recipe = validateRecipe(obj.recipe, "llm");
    return recipe ? { kind: "recipe", recipe } : null;
  }
  if (obj.kind === "pattern") {
    const pattern = validatePattern(obj.pattern, "llm");
    return pattern ? { kind: "pattern", pattern } : null;
  }
  // Tolerate a direct recipe or pattern object when the model omits
  // the wrapper; validation, not the wrapper, is the contract.
  const recipe = validateRecipe(obj, "llm");
  if (recipe) return { kind: "recipe", recipe };
  const pattern = validatePattern(obj, "llm");
  return pattern ? { kind: "pattern", pattern } : null;
}

async function composePerformanceWithModel(
  prompt: string,
  config: LLMConfig
): Promise<ComposedResult | null> {
  try {
    const service = getLLMService(config);
    const first = await service.chat(
      [
        { role: "system", content: PERFORMANCE_SYSTEM_PROMPT },
        { role: "user", content: `Interpret and perform: ${prompt}` },
      ],
      { temperature: 0.45, maxTokens: 2048 }
    );
    let result = parsePerformance(parsePatternJson(first.text));
    if (!result) {
      const repair = await service.chat(
        [
          { role: "system", content: PERFORMANCE_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Interpret and perform: ${prompt}\n` +
              "Your previous reply was not a valid performance JSON object. Reply with ONLY the JSON object, exactly matching one of the two schemas.",
          },
        ],
        { temperature: 0.25, maxTokens: 2048 }
      );
      result = parsePerformance(parsePatternJson(repair.text));
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * The canvas's one compose entry, upgraded by Slice 17 ("The Agent
 * Answers"). Any free-form request is a performance request:
 * - with a configured model, the model invents a pattern or a pulsed
 *   recipe from the full vocabulary (strictly validated, one repair);
 * - with no key (or after a failed model attempt), the generative
 *   built-in performance templates answer performance families
 *   (heartbeat, breathing, rain, waves, gallop, sparkle, tide, galaxy);
 * - drawing prompts then take the Slice 15 recipe path and all other
 *   prompts the original Slice 4 pattern path, preserving their own
 *   built-in fallbacks.
 */
export async function composeWithShapes(
  userPrompt: string
): Promise<ComposedResult | null> {
  const prompt = (userPrompt || "").trim();
  if (!prompt) return null;

  const config = await loadLLMConfig();
  if (config) {
    const invented = await composePerformanceWithModel(prompt, config);
    if (invented) return invented;
  }

  const performance = matchBuiltinPerformance(prompt);
  if (performance) return { kind: "recipe", recipe: performance };

  if (detectShapeIntent(prompt)) {
    const recipe = await composeRecipe(prompt);
    if (recipe) return { kind: "recipe", recipe };
  }
  const pattern = await composePattern(prompt);
  return pattern ? { kind: "pattern", pattern } : null;
}
