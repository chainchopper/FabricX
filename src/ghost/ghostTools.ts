/**
 * Ghost Tools — the registry (Slice 23 "Ghostie Tools I").
 *
 * Terrell's shape for the ghostie (Oct 29): a small agent — a
 * deliberation loop, a harness, and TOOLS it uses coherently —
 * not a frontier model and not a pile of special cases. This
 * module is the harness seam: every capability the ghostie has
 * is declared ONCE, here, with the deliberation intents it
 * executes and the scenario requirements it answers to. The
 * router (useGhostPeer) resolves every brain decision through
 * this registry before GhostPeer applies it — deliberation ->
 * registry gate -> tool — so the next tools (gesture response,
 * SAM-aware acts, note playing) plug into the same path instead
 * of growing new branches through the brain.
 *
 * Two kinds of tools live here:
 *
 *   - DELIBERATION tools execute brain intents. "splat-play" is
 *     the dataset vocabulary performed as splats and verbs;
 *     "draw" is the first tool with a fabric requirement — the
 *     ghost may express itself in drawn shapes only where the
 *     fabric allows its side to draw, and the registry is where
 *     that refusal is named (the validator in GhostBrain refuses
 *     the same decision a layer earlier, on the Spark path).
 *
 *   - ASK tools execute the primary's direct requests, routed by
 *     the compose path (LegacyFluid), never by deliberation:
 *     "verb-perform" ("tickle, Boop") and "heartbeat-answer"
 *     (Slice 17). They are registered so the ghost's full
 *     capability surface is one list a reader — or a future
 *     tool-using brain — can see whole.
 *
 * The registry gates; it never performs. Performance stays in
 * GhostPeer, under its budgets and invariants, exactly as before.
 *
 * Powered by Nirvana
 */

import {
  fabricAllowsDraw,
  GHOST_DRAW_REFUSAL_TEXT,
  type GhostIntent,
  type GhostScenario,
} from "./GhostBrain";

export type GhostToolId =
  | "splat-play"
  | "draw"
  | "verb-perform"
  | "heartbeat-answer";

export interface GhostToolDef {
  id: GhostToolId;
  /** What this tool is, in one line — the harness's own docs. */
  blurb: string;
  /**
   * Deliberation intents this tool executes. Empty for ask-driven
   * tools, which no brain decision can select.
   */
  intents: readonly GhostIntent[];
  /**
   * The scenario requirement, when the tool has one: returns the
   * brain-line refusal text when the scenario forbids the tool,
   * or null when the tool may run. Absent = always allowed.
   */
  refusalFor?: (scenario: GhostScenario) => string | null;
}

export const GHOST_TOOL_REGISTRY: readonly GhostToolDef[] = [
  {
    id: "splat-play",
    blurb:
      "The dataset vocabulary performed as light: mirror, sniff, startle, drift, play patterns, nap, idle, and the heart — splats and verbs through the emit budget.",
    intents: [
      "mirror",
      "sniff",
      "startle",
      "drift",
      "play",
      "nap",
      "idle",
      "heart",
    ],
  },
  {
    id: "draw",
    blurb:
      "Self-expression in vector shapes: the ghost draws a ring, spiral, line, arc, burst, or heart at its body, shipped as one recipe performance. A drawing is an act — it spends emit budget like any performance.",
    intents: ["draw"],
    refusalFor: (scenario) =>
      fabricAllowsDraw(scenario) ? null : GHOST_DRAW_REFUSAL_TEXT,
  },
  {
    id: "verb-perform",
    blurb:
      "Ask-driven: the primary names a verb to their ghost ('tickle, Boop') and the ghost performs it as its own act, under the same verb clock and session rules as its deliberated verbs.",
    intents: [],
  },
  {
    id: "heartbeat-answer",
    blurb:
      "Ask-driven: a heartbeat request addressed to the ghost is answered with a generated lub-dub pulse at the ghost's live tempo (Slice 17).",
    intents: [],
  },
];

/** The tool that executes a deliberation intent, or null if none does. */
export function ghostToolForIntent(intent: GhostIntent): GhostToolDef | null {
  for (const tool of GHOST_TOOL_REGISTRY) {
    if (tool.intents.includes(intent)) return tool;
  }
  return null;
}

/**
 * THE TOOL GATE — the router's final step, after the personality
 * and stamina biases (chain: personality -> stamina -> tool
 * gate). Returns the refusal text when the intent's tool is
 * forbidden by this scenario, or null when the decision may be
 * applied. Intents with no registered tool are refused by
 * construction (a decision nothing can execute must not apply) —
 * unreachable while the validator's vocabulary and the registry
 * stay in step, which the tools check asserts.
 */
export function ghostToolRefusal(
  intent: GhostIntent,
  scenario: GhostScenario
): string | null {
  const tool = ghostToolForIntent(intent);
  if (!tool) return `no tool performs "${intent}" — decision refused`;
  return tool.refusalFor ? tool.refusalFor(scenario) : null;
}
