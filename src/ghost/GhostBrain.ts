/**
 * Ghost Brain — the deliberation layer of the fabric ghost.
 *
 * The ghost's reflexes (GhostPeer) are fast, local rules: budgets,
 * petting, startle, greetings. This module is the layer ABOVE them —
 * the ghost's actual brain. Every deliberation window (GhostPeer
 * decides when; ~10s floor, only when meaningful context changed)
 * the ghost may consult this brain with a scenario snapshot, and the
 * brain answers with ONE decision in the ghost-factory decision
 * contract:
 *
 *   scenario { temperament, seconds_since_human_touch, recent_events,
 *              pets_in_last_5s, nearby_splat_intensity, verbs_seen,
 *              other_ghosts, room_energy_trend, ghost_identity }
 *     -> decision { mood_shift, intent, pattern_id, intensity,
 *                   linger_s }
 *
 * The schema is the curated dataset's, verbatim:
 *   ~/workspace/fabric-ghost-factory/dataset-v1.jsonl (batch 1,
 *   60 scenario->decision pairs, generated 2026-10-26 with Muse
 *   Spark, 60/60 schema-valid — see that folder's batch1-report.md).
 *
 * Two brains implement the contract, routed by the user's Slice 9
 * tier preference (fabric_ghost_brain_v1):
 *
 *   - ON-DEVICE (default): decideOnDevice() — a decision table
 *     distilled from the dataset's majority decisions per context
 *     class (see GHOST_DECISION_TABLE; each entry cites its class).
 *     No network, instant, offline. scripts/ghost-brain-check.mjs
 *     measures the table's intent agreement against all 60 dataset
 *     pairs; the honest number travels with the PR.
 *
 *   - SPARK-CLOUD (opt-in): consultSparkBrain() — the same scenario
 *     is posted to the user's configured model (AI Services; the
 *     composer uses the same loader) with a strict-JSON contract,
 *     few-shot with 3 examples lifted verbatim from the dataset.
 *     The reply is validated by the same validator the table's
 *     output passes; an invalid, failed, or timed-out reply changes
 *     NOTHING (the reflexes simply keep running).
 *
 * Hard invariants live in GhostPeer and cannot be overridden by any
 * decision: the 16/10s global emit budget + crowd sub-budget, the
 * PURR/HEART petting rules, presence caps, and the ghost never
 * talks. A decision is a steer, never a command — GhostPeer clamps
 * everything it applies through its existing action machinery.
 *
 * Pure module: no imports, no storage, no timers of its own, so the
 * node check can exercise the table, the validator, and the Spark
 * path (with a mocked chat function) outside the app.
 *
 * Powered by Nirvana
 */

/** Temperaments the ghost's machine can hold (mirrors GhostPeer). */
export type GhostBrainTemperament =
  | "curious"
  | "playful"
  | "sleepy"
  | "sassy"
  | "affectionate";

/** Intents the ghost can actually perform (dataset vocabulary). */
export const GHOST_INTENTS = [
  "mirror",
  "sniff",
  "startle",
  "drift",
  "play",
  "nap",
  "idle",
  "heart",
] as const;
export type GhostIntent = (typeof GHOST_INTENTS)[number];

/** Pattern ids the ghost's play repertoire implements. */
export const GHOST_PATTERN_IDS = [
  "zigzag_chase",
  "loop_chase",
  "chase_loop",
  "solo_zigzag",
  "zoomie_loop",
] as const;
export type GhostPatternId = (typeof GHOST_PATTERN_IDS)[number];

export const GHOST_BRAIN_TEMPERAMENTS: readonly GhostBrainTemperament[] = [
  "curious",
  "playful",
  "sleepy",
  "sassy",
  "affectionate",
];

export interface GhostScenarioOther {
  name: string;
  mood: string;
  last_action: string;
}

/** Scenario snapshot — the dataset's input schema, verbatim. */
export interface GhostScenario {
  temperament: GhostBrainTemperament;
  seconds_since_human_touch: number;
  recent_events: string[];
  pets_in_last_5s: number;
  nearby_splat_intensity: number;
  verbs_seen: string[];
  other_ghosts: GhostScenarioOther[];
  room_energy_trend: "rising" | "falling" | "steady";
  ghost_identity: {
    name: string;
    hue: number;
    seed_traits: string[];
  };
}

/** Decision — the dataset's output schema, verbatim. */
export interface GhostDecision {
  mood_shift: GhostBrainTemperament | null;
  intent: GhostIntent;
  pattern_id: GhostPatternId | null;
  intensity: number;
  linger_s: number;
}

/** Seed traits per temperament, as used across the dataset. */
export function seedTraitsForTemperament(
  temperament: GhostBrainTemperament
): string[] {
  switch (temperament) {
    case "curious":
      return ["watchful", "bright eyed"];
    case "playful":
      return ["bouncy", "giggly"];
    case "sleepy":
      return ["drowsy", "dim glow"];
    case "sassy":
      return ["aloof", "side-eye"];
    case "affectionate":
      return ["cuddly", "loyal"];
  }
}

/* ------------------------------------------------------------------ */
/* Validator                                                           */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Validate an unknown value against the decision contract. Returns a
 * clamped decision, or null when the value is not a usable decision
 * (wrong types, unknown intent / pattern / temperament). Rules:
 *   - intent must be one the ghost can perform;
 *   - pattern_id must be a known pattern; a pattern on a non-"play"
 *     intent is dropped (set null), not fatal;
 *   - intensity defaults to 0.5 and clamps to [0.05, 0.9];
 *   - linger_s defaults to 5 and clamps to [0.5, 30];
 *   - mood_shift must be null or a real temperament.
 * Both brains' outputs pass through here before GhostPeer applies
 * anything, so the table and Spark share one safety gate.
 */
export function validateGhostDecision(raw: unknown): GhostDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;

  const intent = d.intent;
  if (
    typeof intent !== "string" ||
    !(GHOST_INTENTS as readonly string[]).includes(intent)
  ) {
    return null;
  }

  let patternId: GhostPatternId | null = null;
  if (d.pattern_id !== undefined && d.pattern_id !== null) {
    if (
      typeof d.pattern_id !== "string" ||
      !(GHOST_PATTERN_IDS as readonly string[]).includes(d.pattern_id)
    ) {
      return null;
    }
    patternId = d.pattern_id as GhostPatternId;
    if (intent !== "play") patternId = null;
  }

  let moodShift: GhostBrainTemperament | null = null;
  if (d.mood_shift !== undefined && d.mood_shift !== null) {
    if (
      typeof d.mood_shift !== "string" ||
      !(GHOST_BRAIN_TEMPERAMENTS as readonly string[]).includes(d.mood_shift)
    ) {
      return null;
    }
    moodShift = d.mood_shift as GhostBrainTemperament;
  }

  let intensity = 0.5;
  if (d.intensity !== undefined && d.intensity !== null) {
    if (typeof d.intensity !== "number" || !Number.isFinite(d.intensity)) {
      return null;
    }
    intensity = clamp(d.intensity, 0.05, 0.9);
  }

  let linger = 5;
  if (d.linger_s !== undefined && d.linger_s !== null) {
    if (typeof d.linger_s !== "number" || !Number.isFinite(d.linger_s)) {
      return null;
    }
    linger = clamp(d.linger_s, 0.5, 30);
  }

  return {
    mood_shift: moodShift,
    intent: intent as GhostIntent,
    pattern_id: patternId,
    intensity,
    linger_s: linger,
  };
}

/**
 * Extract a JSON object from a model reply: strip code fences, take
 * the outermost { ... } span. Mirrors the composer's defensive
 * parsing discipline (PatternComposer.parsePatternJson).
 */
export function extractDecisionJson(text: string): unknown {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* On-device decision table (distilled from dataset-v1.jsonl)          */
/* ------------------------------------------------------------------ */

export interface GhostTableRule {
  id: string;
  /** Dataset context class this rule was distilled from. */
  note: string;
  when: (s: GhostScenario) => boolean;
  decide: (s: GhostScenario) => GhostDecision;
}

const dec = (
  intent: GhostIntent,
  intensity: number,
  linger_s: number,
  pattern_id: GhostPatternId | null = null
): GhostDecision => ({
  mood_shift: null,
  intent,
  pattern_id,
  intensity,
  linger_s,
});

const loud = (s: GhostScenario): boolean => s.nearby_splat_intensity >= 0.7;
const petted = (s: GhostScenario): boolean => s.pets_in_last_5s >= 1;
const hasGhost = (s: GhostScenario): boolean => s.other_ghosts.length > 0;

/**
 * The distilled table. Rules are ordered; the first match decides.
 * Derivation: each dataset scenario was classed by (loud splat /
 * petting / social / quiet) x temperament, and the class's majority
 * decision became the rule (intensity/linger are the class medians).
 * Notable dataset regularities the table encodes:
 *   - a loud splat (>=0.7) startles EVERY temperament — except when
 *     two or more ghosts crowd the room, where the majority withdraws
 *     (drift, or idle for sleepy/affectionate);
 *   - petting splits by temperament: curious mirrors, playful plays,
 *     sleepy naps anyway, sassy drifts off, affectionate hearts at
 *     4+ recent pets and mirrors below that;
 *   - unpetted and quiet: playful still plays (alone: solo patterns;
 *     with company: chase patterns), sleepy naps, sassy drifts,
 *     curious sniffs company and drifts alone, affectionate sniffs
 *     company and drifts in the quiet.
 * mood_shift is null in all 60 dataset decisions, so the table never
 * shifts mood; the validator still accepts shifts from Spark.
 */
export const GHOST_DECISION_TABLE: GhostTableRule[] = [
  {
    id: "loud-splat-crowd-withdraw",
    note: "loud splat + 2+ ghosts: majority withdraws (drift/idle)",
    when: (s) => loud(s) && s.other_ghosts.length >= 2,
    decide: (s) =>
      s.temperament === "sleepy" || s.temperament === "affectionate"
        ? dec("idle", 0.15, 2.6)
        : dec("drift", 0.2, 2.8),
  },
  {
    id: "loud-splat-startle",
    note: "loud splat, uncrowded: every temperament startles",
    when: loud,
    decide: () => dec("startle", 0.75, 1.6),
  },
  {
    id: "petting-affectionate-heart",
    note: "affectionate + 4+ pets in 5s: heart",
    when: (s) => petted(s) && s.pets_in_last_5s >= 4 && s.temperament === "affectionate",
    decide: () => dec("heart", 0.72, 6.5),
  },
  {
    id: "petting-affectionate-mirror",
    note: "affectionate + light petting: mirror the pets back",
    when: (s) => petted(s) && s.temperament === "affectionate",
    decide: () => dec("mirror", 0.55, 7),
  },
  {
    id: "petting-curious-mirror",
    note: "curious + petting: mirror",
    when: (s) => petted(s) && s.temperament === "curious",
    decide: () => dec("mirror", 0.55, 6.5),
  },
  {
    id: "petting-playful-play",
    note: "playful + petting: play (chase pattern with company)",
    when: (s) => petted(s) && s.temperament === "playful",
    decide: (s) =>
      dec("play", 0.72, 8, hasGhost(s) ? "chase_loop" : "zigzag_chase"),
  },
  {
    id: "petting-sleepy-nap",
    note: "sleepy + petting: naps through it",
    when: (s) => petted(s) && s.temperament === "sleepy",
    decide: () => dec("nap", 0.15, 23),
  },
  {
    id: "petting-sassy-drift",
    note: "sassy + petting: drifts off, unimpressed",
    when: (s) => petted(s) && s.temperament === "sassy",
    decide: () => dec("drift", 0.28, 3.6),
  },
  {
    id: "playful-social-play",
    note: "playful + company, unpetted: chase play",
    when: (s) => s.temperament === "playful" && hasGhost(s),
    decide: () => dec("play", 0.66, 8, "chase_loop"),
  },
  {
    id: "playful-solo-play",
    note: "playful alone: solo zoomies/zigzag",
    when: (s) => s.temperament === "playful",
    decide: () => dec("play", 0.65, 9, "solo_zigzag"),
  },
  {
    id: "sleepy-default-nap",
    note: "sleepy, anything else: nap",
    when: (s) => s.temperament === "sleepy",
    decide: () => dec("nap", 0.15, 24),
  },
  {
    id: "sassy-default-drift",
    note: "sassy, anything else: drift",
    when: (s) => s.temperament === "sassy",
    decide: () => dec("drift", 0.26, 3.8),
  },
  {
    id: "curious-social-sniff",
    note: "curious + company: sniff the newcomer",
    when: (s) => s.temperament === "curious" && hasGhost(s),
    decide: () => dec("sniff", 0.5, 6.5),
  },
  {
    id: "curious-quiet-drift",
    note: "curious alone in the quiet: drift and watch",
    when: (s) => s.temperament === "curious",
    decide: () => dec("drift", 0.28, 9),
  },
  {
    id: "affectionate-social-sniff",
    note: "affectionate + company: gentle sniff hello",
    when: (s) => s.temperament === "affectionate" && hasGhost(s),
    decide: () => dec("sniff", 0.44, 4.2),
  },
  {
    id: "affectionate-quiet-drift",
    note: "affectionate alone in the quiet: slow drift",
    when: (s) => s.temperament === "affectionate",
    decide: () => dec("drift", 0.25, 5.5),
  },
];

/**
 * The on-device brain: first matching rule decides. The output is
 * run through the same validator as a Spark reply, so both tiers
 * share one safety gate. Never throws.
 */
export function decideOnDevice(scenario: GhostScenario): {
  decision: GhostDecision;
  ruleId: string;
} {
  for (const rule of GHOST_DECISION_TABLE) {
    try {
      if (rule.when(scenario)) {
        const decision = validateGhostDecision(rule.decide(scenario));
        if (decision) return { decision, ruleId: rule.id };
      }
    } catch {
      // A malformed scenario must not take the ghost down.
    }
  }
  return {
    decision: { mood_shift: null, intent: "drift", pattern_id: null, intensity: 0.25, linger_s: 5 },
    ruleId: "fallback-drift",
  };
}

/* ------------------------------------------------------------------ */
/* Spark-cloud brain                                                   */
/* ------------------------------------------------------------------ */

export interface GhostBrainChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A chat function compatible with LLMService.chat's text output. */
export type GhostBrainChatFn = (
  messages: GhostBrainChatMessage[],
  options: { maxTokens: number; temperature: number }
) => Promise<string>;

/**
 * Three few-shot pairs lifted VERBATIM from dataset-v1.jsonl
 * (batch 1): a loud-splat startle, a petting heart, and a long-quiet
 * nap — one per major context class.
 */
export const GHOST_BRAIN_FEW_SHOT: { scenario: GhostScenario; decision: GhostDecision }[] = [
  {
    scenario: {
      temperament: "playful",
      seconds_since_human_touch: 18,
      recent_events: ["chase game", "loud splat nearby"],
      pets_in_last_5s: 0,
      nearby_splat_intensity: 0.93,
      verbs_seen: [],
      other_ghosts: [],
      room_energy_trend: "steady",
      ghost_identity: { name: "Mango", hue: 35, seed_traits: ["bouncy", "giggly"] },
    },
    decision: { mood_shift: null, intent: "startle", pattern_id: null, intensity: 0.8, linger_s: 1.5 },
  },
  {
    scenario: {
      temperament: "affectionate",
      seconds_since_human_touch: 0.8,
      recent_events: ["pet x5", "warm quiet"],
      pets_in_last_5s: 5,
      nearby_splat_intensity: 0.15,
      verbs_seen: [],
      other_ghosts: [],
      room_energy_trend: "steady",
      ghost_identity: { name: "Biscuit", hue: 335, seed_traits: ["cuddly", "loyal"] },
    },
    decision: { mood_shift: null, intent: "heart", pattern_id: null, intensity: 0.75, linger_s: 7 },
  },
  {
    scenario: {
      temperament: "sleepy",
      seconds_since_human_touch: 142,
      recent_events: ["long quiet", "soft hum faded", "lights low"],
      pets_in_last_5s: 0,
      nearby_splat_intensity: 0.08,
      verbs_seen: [],
      other_ghosts: [],
      room_energy_trend: "falling",
      ghost_identity: { name: "Pesto", hue: 135, seed_traits: ["drowsy", "dim glow"] },
    },
    decision: { mood_shift: null, intent: "nap", pattern_id: null, intensity: 0.15, linger_s: 24 },
  },
];

const SPARK_SYSTEM_PROMPT = [
  "You are the deliberation brain of a small ambient ghost that lives on a shared touch canvas. The ghost never speaks; it expresses itself only through gentle light splats, drifting, play patterns, and (rarely) a heart verb.",
  "Given a scenario snapshot, reply with ONLY one JSON decision object — no prose, no code fences:",
  '{"mood_shift": null | "curious" | "playful" | "sleepy" | "sassy" | "affectionate", "intent": "mirror" | "sniff" | "startle" | "drift" | "play" | "nap" | "idle" | "heart", "pattern_id": null | "zigzag_chase" | "loop_chase" | "chase_loop" | "solo_zigzag" | "zoomie_loop", "intensity": 0.05-0.9, "linger_s": 0.5-30}',
  "pattern_id is only for intent \"play\". mood_shift is usually null — the ghost's mood mostly follows its own rhythm. Keep decisions gentle and in character for the temperament.",
].join("\n");

/** Build the few-shot message list for one live scenario. */
export function buildSparkMessages(
  scenario: GhostScenario
): GhostBrainChatMessage[] {
  const messages: GhostBrainChatMessage[] = [
    { role: "system", content: SPARK_SYSTEM_PROMPT },
  ];
  for (const ex of GHOST_BRAIN_FEW_SHOT) {
    messages.push({
      role: "user",
      content: `Scenario: ${JSON.stringify(ex.scenario)}`,
    });
    messages.push({
      role: "assistant",
      content: JSON.stringify(ex.decision),
    });
  }
  messages.push({
    role: "user",
    content: `Scenario: ${JSON.stringify(scenario)}`,
  });
  return messages;
}

/**
 * Consult the cloud brain. Returns a validated decision, or null
 * when the chat fails, times out, or replies with anything that
 * does not validate — null means "change nothing". The timeout is a
 * race: a late reply is dropped, never applied after the fact.
 * maxTokens is generous because reasoning models think before they
 * answer (the composer learned the same lesson).
 */
export async function consultSparkBrain(
  scenario: GhostScenario,
  chat: GhostBrainChatFn,
  timeoutMs = 6_000
): Promise<GhostDecision | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const reply = await Promise.race([
      chat(buildSparkMessages(scenario), { maxTokens: 1024, temperature: 0.4 }),
      timeout,
    ]);
    if (typeof reply !== "string") return null;
    return validateGhostDecision(extractDecisionJson(reply));
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
