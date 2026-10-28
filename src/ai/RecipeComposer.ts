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

import { getLLMService } from "../services/LLMService";
import {
  composePattern,
  loadLLMConfig,
  parsePatternJson,
  type Pattern,
} from "./PatternComposer";
import {
  detectShapeIntent,
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

/**
 * The canvas's one compose entry (Slice 15): a prompt carrying
 * shape intent is answered with a recipe; anything else takes the
 * original Slice 4 pattern path untouched. When a shape prompt
 * somehow yields no recipe, the pattern path still gets its say
 * (its own built-ins may match) before the canvas reports failure.
 */
export async function composeWithShapes(
  userPrompt: string
): Promise<ComposedResult | null> {
  const prompt = (userPrompt || "").trim();
  if (!prompt) return null;

  if (detectShapeIntent(prompt)) {
    const recipe = await composeRecipe(prompt);
    if (recipe) return { kind: "recipe", recipe };
  }
  const pattern = await composePattern(prompt);
  return pattern ? { kind: "pattern", pattern } : null;
}
