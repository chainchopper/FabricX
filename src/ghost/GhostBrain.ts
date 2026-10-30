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
 * Personality (Slice 20): the primary's own words for their ghostie
 * steer deliberation on both tiers — context in the Spark consult,
 * legible keyword biases over the table on-device — always within
 * those invariants. See the Personality section below.
 *
 * Fabric awareness + tools (Slice 23): the scenario snapshot now
 * also carries what the ghost's client legitimately knows about
 * WHERE it is — the active fabric/layer, its canvas kind, the
 * session role, and the host's rules as they apply to this
 * participant (GhostFabricContext). One deliberation intent is a
 * TOOL call: "draw" — the ghost expresses itself by drawing a
 * shape from the Recipe vocabulary at its body. Drawing is gated
 * by the fabric, in both tiers, at the validator itself: the
 * table only selects it where the fabric allows the ghost's side
 * to draw, and a Spark "draw" decision under a fabric that
 * refuses it is rejected with the refusal surfaced to the brain
 * line. The dataset scenarios carry no fabric context at all, so
 * nothing about the original battery changes — drawing lives
 * entirely in the new-flag scenarios. The router's chain stays:
 * personality bias -> stamina bias -> tool gate (see
 * ghostTools.ts, the registry these tools are declared in).
 *
 * Ghostie Tools II (Slice 31): a second tool intent, "play-note"
 * — call and response at the piano. When a human plays a note,
 * the peer journals it into recent_events ("human played C4");
 * the note overlay in decideOnDevice answers it in character
 * (echo / octave / fifth by temperament) when the fabric allows
 * notes and the piano is the layer — gated exactly like draw,
 * at the validator, with its own refusal line. The legacy
 * scenarios carry no such events, so the battery still cannot
 * move. Ask-driven performances (play a note / arpeggio / that
 * again) live in GhostPeer's NOTE tools, priced by its budget.
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

/** Intents the ghost can actually perform (dataset vocabulary + draw). */
export const GHOST_INTENTS = [
  "mirror",
  "sniff",
  "startle",
  "drift",
  "play",
  "nap",
  "idle",
  "heart",
  "draw",
  "play-note",
] as const;
export type GhostIntent = (typeof GHOST_INTENTS)[number];

/**
 * Shapes the DRAW tool can draw — the Recipe vocabulary, mirrored
 * (RecipeCore.RECIPE_SHAPES; this module stays import-free like
 * the rest of the brain, so the list is kept in step by hand and
 * the tools check asserts the two never drift apart).
 */
export const GHOST_DRAW_SHAPES = [
  "ring",
  "spiral",
  "line",
  "arc",
  "burst",
  "heart",
] as const;
export type GhostDrawShape = (typeof GHOST_DRAW_SHAPES)[number];

/**
 * The NOTE tool's vocabulary (Slice 31) — the shared noteBus's
 * own note ids (shared/utils/noteBus.ts): scientific pitch
 * names with sharps only, octaves 0–8. Mirrored by hand like
 * the draw shapes (this module stays import-free); the tools
 * check pins the regex and the number math against the bus's
 * parser shape.
 */
export const GHOST_PIANO_LAYER_ID = "ar-piano";

const GHOST_NOTE_RE = /^([A-G]#?)([0-8])$/;

export function isGhostNoteName(name: unknown): name is string {
  return typeof name === "string" && GHOST_NOTE_RE.test(name);
}

const NOTE_PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};
const NOTE_NAMES_SHARP = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/** Note name -> MIDI-style number ((octave+1)*12 + pitch class). */
export function ghostNoteNumber(name: string): number | null {
  const m = GHOST_NOTE_RE.exec(name);
  if (!m) return null;
  return (parseInt(m[2], 10) + 1) * 12 + NOTE_PITCH_CLASS[m[1]];
}

/** Number -> note name in the bus's sharp vocabulary, clamped to C1..C7. */
export function ghostNoteName(num: number): string {
  const n = Math.min(96, Math.max(24, Math.round(num)));
  return `${NOTE_NAMES_SHARP[n % 12]}${Math.floor(n / 12) - 1}`;
}

/**
 * The call-and-response answer (Slice 31): what THIS temperament
 * plays back when a human plays `heard`. Playful echoes it,
 * curious asks an octave up, affectionate harmonizes a fifth
 * up, sassy drops it an octave; sleepy would echo drowsily at
 * the same pitch, but the note overlay never selects sleepy —
 * a sleepy ghost listens.
 */
export function ghostAnswerNote(
  heard: string,
  temperament: GhostBrainTemperament
): string {
  const n = ghostNoteNumber(heard);
  if (n === null) return "C4";
  switch (temperament) {
    case "playful":
      return ghostNoteName(n);
    case "curious":
      return ghostNoteName(n + 12);
    case "affectionate":
      return ghostNoteName(n + 7);
    case "sassy":
      return ghostNoteName(n - 12);
    case "sleepy":
      return ghostNoteName(n);
  }
}

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

/* ------------------------------------------------------------------ */
/* Fabric awareness (Slice 23)                                         */
/* ------------------------------------------------------------------ */
/*
 * Where the ghost IS, as its own client legitimately knows it:
 * the active fabric/layer, that fabric's canvas kind, this
 * participant's session role, and the host's rules AS THEY APPLY
 * to this participant — a guest reads the host's stated rules, a
 * host is never bound by their own guest rules, and solo / an
 * open room allow everything. The rules are resolved to plain
 * booleans at snapshot time (GhostPeer's context supplier, in
 * LegacyFluid, reads the same session + fabric stores the send
 * funnel enforces with), so both brain tiers — and the validator
 * itself — read one honest answer. Nothing here is guessed: a
 * client that cannot supply the context attaches nothing, and a
 * scenario without fabric context is a legacy scenario (the whole
 * dataset is legacy) where no fabric authority exists to refuse
 * anything.
 */

export type GhostCanvasKind = "fluid" | "stage3d" | "camera" | "unknown";

export interface GhostFabricRules {
  draw: boolean;
  verbs: boolean;
  notes: boolean;
}

export interface GhostFabricContext {
  /** Active fabric/layer id, as this client knows it. */
  layer_id: string;
  canvas: GhostCanvasKind;
  /** This participant's chair: an open room, the host, or a guest. */
  role: "open" | "host" | "guest";
  /** True when a hosted session is in force (role is host/guest). */
  in_session: boolean;
  /** Host rules resolved for THIS participant (see header note). */
  rules: GhostFabricRules;
}

const GHOST_CANVAS_KINDS: readonly string[] = [
  "fluid",
  "stage3d",
  "camera",
  "unknown",
];

/**
 * Clamp an unknown value to a GhostFabricContext, or null when it
 * is not one. Rules default to permissive on a per-key basis —
 * the same fallback discipline as the fabric store's sanitizer:
 * a garbled rules payload must never silently mute a ghost.
 */
export function sanitizeFabricContext(raw: unknown): GhostFabricContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.layer_id !== "string" || rec.layer_id.length === 0) {
    return null;
  }
  const canvas: GhostCanvasKind =
    typeof rec.canvas === "string" && GHOST_CANVAS_KINDS.includes(rec.canvas)
      ? (rec.canvas as GhostCanvasKind)
      : "unknown";
  const role: GhostFabricContext["role"] =
    rec.role === "host" || rec.role === "guest" ? rec.role : "open";
  const rulesIn =
    rec.rules && typeof rec.rules === "object" && !Array.isArray(rec.rules)
      ? (rec.rules as Record<string, unknown>)
      : {};
  const rule = (v: unknown): boolean => (typeof v === "boolean" ? v : true);
  return {
    layer_id: rec.layer_id.slice(0, 64),
    canvas,
    role,
    in_session: typeof rec.in_session === "boolean" ? rec.in_session : role !== "open",
    rules: {
      draw: rule(rulesIn.draw),
      verbs: rule(rulesIn.verbs),
      notes: rule(rulesIn.notes),
    },
  };
}

/**
 * May the ghost's side DRAW on the fabric this scenario sits on?
 * The one gate both tiers and the validator share. No fabric
 * context = no fabric authority in the picture (legacy scenario,
 * solo by construction) = allowed.
 */
export function fabricAllowsDraw(scenario: GhostScenario): boolean {
  if (!scenario.fabric) return true;
  return scenario.fabric.rules.draw;
}

/** The refusal the brain line shows when the gate refuses a draw. */
export const GHOST_DRAW_REFUSAL_TEXT =
  "wanted to draw — this fabric doesn't allow it";

/**
 * The fabric's notes rule (Slice 19), brain-side (Slice 31) —
 * the note gate's twin of fabricAllowsDraw. No fabric context
 * (solo, or a peer that doesn't supply one) means allowed.
 */
export function fabricAllowsNotes(scenario: GhostScenario): boolean {
  if (!scenario.fabric) return true;
  return scenario.fabric.rules.notes;
}

export const GHOST_NOTE_REFUSAL_TEXT =
  "wanted to play a note — this fabric doesn't allow it";

/* ------------------------------------------------------------------ */
/* Gesture sense (Slice 34, Layer B1)                                  */
/* ------------------------------------------------------------------ */
/*
 * The v2 sense field for hands (dataset schema_v2.md `gestures`):
 * the gesture-vocabulary readings (src/hands/gestureVocabulary)
 * the peer has taken in recently, in the dataset's own shape —
 * [{ token, hand, confidence, held_s }]. Like `fabric`, the field
 * is ABSENT when the sense has nothing to report: absence is
 * information, and every legacy/dataset scenario (none of which
 * carry it) stays valid untouched. The token allowlist below is
 * the v2 vocabulary verbatim, plus the RESERVED asl_<letter>
 * pattern — carried by the sanitizer so a future recognizer can
 * speak without a schema change, and produced by NOTHING in the
 * current build (no sign-language recognition exists; see the
 * vocabulary module's honesty note). A reading the sanitizer
 * cannot clamp to the vocabulary is dropped, never passed on:
 * the digest is the brain's whole world, and it does not get to
 * contain words the dataset never taught.
 */

export interface GhostGestureReading {
  token: string;
  hand: "left" | "right" | "unknown";
  /** Heuristic 0..1 from the vocabulary tracker (not a model score). */
  confidence: number;
  held_s: number;
}

export const GHOST_GESTURE_TOKENS: readonly string[] = [
  "open_palm",
  "closed_fist",
  "pinch",
  "point",
  "finger_draw",
  "peace",
  "thumbs_up",
  "thumbs_down",
  "wave",
  "palm_push",
  "two_hands_open",
  "heart_hands",
  "none",
];

/**
 * Clamp an unknown value to at most 3 gesture readings in the v2
 * shape. Non-array → empty; entries with an out-of-vocabulary
 * token are dropped; confidence clamps to [0,1], held_s to
 * [0, 30]; an unknown hand reads "unknown".
 */
export function sanitizeGestureReadings(raw: unknown): GhostGestureReading[] {
  if (!Array.isArray(raw)) return [];
  const out: GhostGestureReading[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const token = rec.token;
    if (
      typeof token !== "string" ||
      !(GHOST_GESTURE_TOKENS.includes(token) || /^asl_[a-z]$/.test(token))
    ) {
      continue;
    }
    out.push({
      token,
      hand:
        rec.hand === "left" || rec.hand === "right" ? rec.hand : "unknown",
      confidence:
        typeof rec.confidence === "number" && Number.isFinite(rec.confidence)
          ? clamp(rec.confidence, 0, 1)
          : 0.5,
      held_s:
        typeof rec.held_s === "number" && Number.isFinite(rec.held_s)
          ? clamp(rec.held_s, 0, 30)
          : 0,
    });
    if (out.length >= 3) break;
  }
  return out;
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
  /**
   * Slice 23: where the ghost is (see GhostFabricContext). Absent
   * on every dataset scenario — the draw tool and the fabric
   * blocks key on its presence, so legacy behavior is untouched.
   */
  fabric?: GhostFabricContext;
  /**
   * Slice 34: what the hands just said (see GhostGestureReading).
   * The v2 `gestures` sense field — absent whenever no gesture
   * token has fired recently, so legacy scenarios and the whole
   * v1 dataset stay byte-identical.
   */
  gestures?: GhostGestureReading[];
  /**
   * Slice 33 ("Understands"): what someone just SAID (see
   * GhostUtteranceContext). Absent on every dataset scenario and
   * on every deliberation that was not preceded by an utterance —
   * the utterance overlay keys on its presence, so legacy
   * behavior is untouched.
   */
  utterance?: GhostUtteranceContext;
}

/** Who said the utterance, as far as this client honestly knows. */
export type GhostUtteranceSpeaker = "primary" | "guest" | "unknown";

/**
 * One heard utterance, riding the scenario (Slice 33). The shape
 * is dataset schema v2's `utterance` sense (text + asr_confidence),
 * extended with the two facts the runtime honestly has: who spoke
 * (the local compose path is this device's primary; anything else
 * is stated, never guessed) and how many times this same
 * utterance has been heard in the recent window — the second
 * hearing is itself context (variation rule 1).
 */
export interface GhostUtteranceContext {
  /** The words as heard/typed, trimmed, capped at 200 chars. */
  text: string;
  /**
   * Transcription confidence 0..1 when the hearing path reports
   * one (the platform recognizer does); null when it does not
   * (typed text, or a transcriber that returns words without a
   * score). Absent is NOT zero — an unscored hearing is an
   * ordinary hearing, never a garbled one.
   */
  asr_confidence: number | null;
  speaker: GhostUtteranceSpeaker;
  /** Times this same utterance was already heard in the window. */
  repeats: number;
}

/**
 * Clamp an unknown value to a GhostUtteranceContext, or null when
 * it is not one — the sanitizeFabricContext discipline: a garbled
 * payload must never reach the brain as a fact.
 */
export function sanitizeUtteranceContext(
  raw: unknown
): GhostUtteranceContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.text !== "string") return null;
  const text = rec.text.trim().slice(0, 200);
  if (!text) return null;
  const conf =
    typeof rec.asr_confidence === "number" &&
    Number.isFinite(rec.asr_confidence)
      ? Math.min(1, Math.max(0, rec.asr_confidence))
      : null;
  const speaker: GhostUtteranceSpeaker =
    rec.speaker === "guest" || rec.speaker === "unknown"
      ? rec.speaker
      : "primary";
  const repeats =
    typeof rec.repeats === "number" && Number.isFinite(rec.repeats)
      ? Math.max(0, Math.floor(rec.repeats))
      : 0;
  return { text, asr_confidence: conf, speaker, repeats };
}

/** Decision — the dataset's output schema, verbatim. */
export interface GhostDecision {
  mood_shift: GhostBrainTemperament | null;
  intent: GhostIntent;
  pattern_id: GhostPatternId | null;
  /** Slice 23: the DRAW tool's shape; null unless intent is "draw". */
  draw_shape: GhostDrawShape | null;
  /** Slice 31: the NOTE tool's note (bus vocabulary); null unless intent is "play-note". */
  note_name: string | null;
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
 *   - intent "draw" REQUIRES a known draw_shape — a shapeless draw
 *     is not a decision — and a draw_shape on any other intent is
 *     dropped (set null), not fatal;
 *   - THE TOOL GATE (Slice 23): when the scenario is supplied and
 *     its fabric refuses drawing for the ghost's side, a "draw"
 *     decision is refused outright (null) — the validator is where
 *     a Spark reply meets the fabric's law, before any routing.
 *     Callers that need to SAY so use ghostDrawGateRefusal() to
 *     name the refusal for the brain line;
 *   - intent "play-note" (Slice 31) follows the draw's exact
 *     discipline: it REQUIRES a note_name in the bus's
 *     vocabulary, a note_name on any other intent is dropped,
 *     and the fabric's notes rule refuses it outright the same
 *     way (callers say so via ghostNoteGateRefusal());
 *   - intensity defaults to 0.5 and clamps to [0.05, 0.9];
 *   - linger_s defaults to 5 and clamps to [0.5, 30];
 *   - mood_shift must be null or a real temperament.
 * Both brains' outputs pass through here before GhostPeer applies
 * anything, so the table and Spark share one safety gate.
 */
export function validateGhostDecision(
  raw: unknown,
  scenario?: GhostScenario
): GhostDecision | null {
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

  let drawShape: GhostDrawShape | null = null;
  if (intent === "draw") {
    if (
      typeof d.draw_shape !== "string" ||
      !(GHOST_DRAW_SHAPES as readonly string[]).includes(d.draw_shape)
    ) {
      return null;
    }
    drawShape = d.draw_shape as GhostDrawShape;
    if (scenario && !fabricAllowsDraw(scenario)) return null;
  }

  // Slice 31: "play-note" carries the same structural discipline
  // as "draw" — the note name is required and must be in the
  // bus's vocabulary, the fabric's notes rule refuses it
  // outright, and a note_name on any other intent is dropped.
  let noteName: string | null = null;
  if (intent === "play-note") {
    if (!isGhostNoteName(d.note_name)) return null;
    noteName = d.note_name;
    if (scenario && !fabricAllowsNotes(scenario)) return null;
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
    draw_shape: drawShape,
    note_name: noteName,
    intensity,
    linger_s: linger,
  };
}

/**
 * Name the gate's refusal, when a raw decision died by it: the
 * value IS a well-formed draw decision, but the scenario's fabric
 * refuses drawing for the ghost's side. Returns the brain-line
 * refusal text, or null when the refusal rule does not apply
 * (the value is invalid for some other reason, or drawing is
 * allowed and validation failed elsewhere). Lets the Spark path
 * say WHY a reply changed nothing instead of shrugging.
 */
export function ghostDrawGateRefusal(
  raw: unknown,
  scenario?: GhostScenario
): string | null {
  if (!scenario || fabricAllowsDraw(scenario)) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (d.intent !== "draw") return null;
  if (
    typeof d.draw_shape !== "string" ||
    !(GHOST_DRAW_SHAPES as readonly string[]).includes(d.draw_shape)
  ) {
    return null;
  }
  return GHOST_DRAW_REFUSAL_TEXT;
}

/**
 * The note gate's refusal, named — ghostDrawGateRefusal's twin
 * (Slice 31): the value IS a well-formed play-note decision,
 * but the scenario's fabric refuses notes for the ghost's side.
 */
export function ghostNoteGateRefusal(
  raw: unknown,
  scenario?: GhostScenario
): string | null {
  if (!scenario || fabricAllowsNotes(scenario)) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (d.intent !== "play-note") return null;
  if (!isGhostNoteName(d.note_name)) return null;
  return GHOST_NOTE_REFUSAL_TEXT;
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
  draw_shape: null,
  note_name: null,
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

/* ------------------------------------------------------------------ */
/* The DRAW tool's on-device rules (Slice 23)                          */
/* ------------------------------------------------------------------ */
/*
 * When does the on-device ghost choose to draw? Deliberately
 * narrow, and entirely inside territory the dataset never
 * covered — every condition below requires the scenario to carry
 * fabric context, which no dataset scenario has, so the battery
 * above cannot move:
 *
 *   - the fabric allows the ghost's side to draw (the gate —
 *     checked first, before any taste);
 *   - nobody is petting it and nothing loud just landed (petting
 *     and startle have their own answers, in the table);
 *   - the room is quiet and not heating up (energy trend not
 *     rising): drawing is what the ghost does with a lull;
 *   - the quiet has lasted into the temperament's DOODLE WINDOW —
 *     long enough to be sure the room is resting, early enough
 *     that the ghost hasn't settled into its long-quiet rhythm —
 *     and the temperament is one that doodles: playful traces
 *     spirals alone and bursts with company; curious rings a
 *     thought alone, arcs toward company; affectionate leaves a
 *     heart — sooner with company, later when alone, for whoever
 *     comes back. Sleepy rests instead. Sassy can't be bothered.
 *
 * The windows also keep the brain line honest: outside them the
 * table answers as it always has, and GhostPeer's own draw
 * cooldown (45s) spaces the performances that do happen.
 */
export function drawDecisionFor(
  scenario: GhostScenario
): { decision: GhostDecision; ruleId: string } | null {
  if (!scenario.fabric) return null;
  if (!fabricAllowsDraw(scenario)) return null;
  if (scenario.pets_in_last_5s > 0) return null;
  if (scenario.nearby_splat_intensity >= 0.7) return null;
  if (scenario.room_energy_trend === "rising") return null;
  const quiet = scenario.seconds_since_human_touch;
  const company = scenario.other_ghosts.length > 0;
  let shape: GhostDrawShape | null = null;
  let intensity = 0.55;
  switch (scenario.temperament) {
    case "playful":
      if (quiet >= 30 && quiet < 75) {
        shape = company ? "burst" : "spiral";
        intensity = 0.65;
      }
      break;
    case "curious":
      if (quiet >= 45 && quiet < 90) {
        shape = company ? "arc" : "ring";
      }
      break;
    case "affectionate":
      if (company ? quiet >= 20 && quiet < 60 : quiet >= 60 && quiet < 105) {
        shape = "heart";
        intensity = 0.6;
      }
      break;
    default:
      return null;
  }
  if (!shape) return null;
  const decision = validateGhostDecision(
    {
      mood_shift: null,
      intent: "draw",
      pattern_id: null,
      draw_shape: shape,
      note_name: null,
      intensity,
      linger_s: 6,
    },
    scenario
  );
  if (!decision) return null;
  return { decision, ruleId: `draw-${shape}` };
}

/* ------------------------------------------------------------------ */
/* The NOTE tool's on-device rules (Slice 31)                          */
/* ------------------------------------------------------------------ */
/*
 * Call and response: when a human plays a note at the piano, the
 * peer journals it into recent_events in the dataset's event
 * vocabulary ("human played C4") — and this overlay is where
 * deliberation answers it. Deliberately narrow, like the draw's:
 *
 *   - the stimulus is real: a recent_events entry names a note
 *     in the bus's vocabulary (legacy scenarios never carry one,
 *     so the 60-pair battery cannot move);
 *   - the fabric, when present, allows notes AND the layer is
 *     the piano — the event's provenance is the layer binding
 *     (the peer only hears notes while the Piano layer is
 *     front), so a fabric-less scenario trusts it;
 *   - petting and startle keep their own answers (the table's);
 *   - a sleepy ghost just listens — every other temperament
 *     answers in character (ghostAnswerNote: echo, octave,
 *     fifth, drop).
 *
 * The peer's own note cooldown (8s) and emit budget price the
 * performances, so deliberation can offer answers freely.
 */
const HUMAN_NOTE_EVENT_RE = /^human played ([A-G]#?[0-8])$/;

export function noteDecisionFor(
  scenario: GhostScenario
): { decision: GhostDecision; ruleId: string } | null {
  let heard: string | null = null;
  for (const e of scenario.recent_events) {
    const m = HUMAN_NOTE_EVENT_RE.exec(e);
    if (m) heard = m[1];
  }
  if (!heard) return null;
  if (scenario.fabric) {
    if (!fabricAllowsNotes(scenario)) return null;
    if (scenario.fabric.layer_id !== GHOST_PIANO_LAYER_ID) return null;
  }
  if (scenario.pets_in_last_5s > 0) return null;
  if (scenario.nearby_splat_intensity >= 0.7) return null;
  if (scenario.temperament === "sleepy") return null;
  const note = ghostAnswerNote(heard, scenario.temperament);
  const decision = validateGhostDecision(
    {
      mood_shift: null,
      intent: "play-note",
      pattern_id: null,
      draw_shape: null,
      note_name: note,
      intensity: scenario.temperament === "playful" ? 0.65 : 0.55,
      linger_s: 3,
    },
    scenario
  );
  if (!decision) return null;
  return { decision, ruleId: `note-answer-${scenario.temperament}` };
}

/**
 * The on-device brain: the utterance overlay answers first when
 * someone just spoke (Slice 33 — it is the most specific stimulus
 * in the room, and the deliberation carrying it exists because of
 * it), then the note overlay when a human just played, then the
 * draw overlay when its narrow window is open (fabric scenarios
 * only); otherwise the first matching table rule decides. The
 * output is run through the same validator as a Spark reply, so
 * both tiers share one safety gate. Never throws.
 */
export function decideOnDevice(scenario: GhostScenario): {
  decision: GhostDecision;
  ruleId: string;
} {
  try {
    const utterance = utteranceDecisionFor(scenario);
    if (utterance) return utterance;
  } catch {
    // The overlay must never take the table down with it.
  }
  try {
    const note = noteDecisionFor(scenario);
    if (note) return note;
  } catch {
    // The overlay must never take the table down with it.
  }
  try {
    const draw = drawDecisionFor(scenario);
    if (draw) return draw;
  } catch {
    // The overlay must never take the table down with it.
  }
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
    decision: { mood_shift: null, intent: "drift", pattern_id: null, draw_shape: null, note_name: null, intensity: 0.25, linger_s: 5 },
    ruleId: "fallback-drift",
  };
}

/* ------------------------------------------------------------------ */
/* Utterances (Slice 33, "Understands")                                */
/* ------------------------------------------------------------------ */
/*
 * Someone in the room SAID something — "it's cold in here" is the
 * reference case. That is not a command and not a keyword, and
 * the correct response is not a macro: the ghost cannot answer
 * in words, so it acknowledges and responds through its tools,
 * and because temperament, state, scene and history differ, the
 * same sentence must NOT always produce the same response. A
 * system that splats a blue poof on the word "cold" is the cheat
 * this layer exists to not be.
 *
 * How comprehension works on the floor tier (the model tiers get
 * the same facts as prose — see describeUtteranceForSpark):
 *
 *   1. READ the utterance's KIND with a legible cue map (the
 *      parseGhostPersonality discipline: whole words and phrases,
 *      listed below, inspectable — not an embedding, not a
 *      regex lottery). The kind is what the utterance is DOING
 *      (remarking on the room, reporting a feeling, arriving,
 *      appreciating, leaving) — never which action it wants.
 *   2. CHOOSE the response from the DIGEST — temperament, room
 *      energy, company, petting, quiet length, the fabric's
 *      rules, and how many times this was already said. The kind
 *      selects the family; the digest selects the answer. The
 *      word never maps to the act: "it's cold in here" and "it's
 *      so quiet in here" (same kind, same digest) earn the same
 *      response, and "it's cold in here" in two different digests
 *      earns two different ones. That is the anti-macro proof,
 *      and the check script runs it.
 *   3. Candidates are ordered best-first and the REPEAT count
 *      indexes them: the first hearing earns the best answer,
 *      a repeat earns the next one — different by construction
 *      (candidates are deduplicated by decision signature), and
 *      the repetition itself is journaled and told to the model
 *      tiers as context.
 *   4. PROPORTIONALITY: utterance responses are capped at
 *      UTTERANCE_MAX_INTENSITY — ambient remarks earn
 *      ambient-scale answers, well under a startle's.
 *   5. FAILURE HONESTY: no defensible reading (unknown kind) or
 *      a low-confidence hearing yields NO decision from this
 *      overlay — decideUtteranceOutcome says "uncertain" and the
 *      peer performs puzzlement in character instead of faking
 *      an act. A loud moment (startle territory) also yields:
 *      the table's own startle answer owns that deliberation.
 *
 * Consent is structural, twice over: draw candidates are only
 * BUILT when the fabric allows drawing for the ghost's side, and
 * every candidate still passes validateGhostDecision, which
 * refuses a draw under a refusing fabric outright. An utterance
 * that would best be answered by drawing is answered another way.
 */

export const UTTERANCE_CONFIDENCE_FLOOR = 0.5;
export const UTTERANCE_MAX_INTENSITY = 0.7;

export type GhostUtteranceKind =
  | "ambience"
  | "feeling"
  | "presence"
  | "appreciation"
  | "farewell"
  | "unknown";

export interface GhostUtteranceReading {
  kind: GhostUtteranceKind;
  /** The words spoke TO the ghost (its name, or "ghost"/"ghostie"). */
  addressed: boolean;
}

/*
 * The cue map. Phrases match on word boundaries; words match
 * whole. Precedence is deliberate: a greeting is answered as a
 * greeting even when it also remarks on the room ("hello, it's
 * cold in here"); a first-person experiencer report ("i'm cold")
 * is a FEELING, while the same adjective about the room ("it's
 * cold in here") is AMBIENCE — the speaker, not the adjective,
 * decides.
 */
const UTTERANCE_PRESENCE_PHRASES: readonly string[] = [
  "who's there", "who is there", "anyone here", "anybody here",
  "anyone there", "anybody there", "someone there", "is anyone here",
  "is anybody here", "you there", "hi there", "hey there",
  "hello there", "knock knock", "good morning", "good afternoon",
  "good evening",
];
const UTTERANCE_PRESENCE_WORDS: readonly string[] = [
  "hello", "hi", "hey", "greetings",
];
const UTTERANCE_FAREWELL_PHRASES: readonly string[] = [
  "goodbye", "good bye", "bye bye", "see you", "see ya",
  "good night", "goodnight", "gotta go", "have to go",
  "i should go", "time to go", "i'm leaving", "im leaving",
  "signing off",
];
const UTTERANCE_FAREWELL_WORDS: readonly string[] = ["bye"];
const UTTERANCE_FEELING_PHRASES: readonly string[] = [
  "i feel", "i'm feeling", "im feeling", "feeling so", "i love",
  "i miss", "i hate", "i need", "i'm so", "im so", "i am so",
];
const UTTERANCE_EXPERIENCER_WORDS: readonly string[] = [
  "tired", "sleepy", "exhausted", "drained", "awake", "hungry",
  "thirsty", "happy", "sad", "lonely", "bored", "anxious",
  "nervous", "stressed", "calm", "relaxed", "uncomfortable",
  "comfortable", "cold", "warm", "hot", "freezing", "chilly",
  "sore", "dizzy",
];
const UTTERANCE_FIRST_PERSON_WORDS: readonly string[] = [
  "i", "i'm", "im", "me", "my", "we", "we're", "us", "mine",
];
const UTTERANCE_APPRECIATION_PHRASES: readonly string[] = [
  "love it", "love this", "so pretty", "so beautiful",
  "that was great", "this is great", "well done", "thank you",
  "thanks so much",
];
const UTTERANCE_APPRECIATION_WORDS: readonly string[] = [
  "beautiful", "lovely", "amazing", "wonderful", "gorgeous",
  "pretty", "awesome", "magical", "perfect", "incredible",
  "fantastic", "brilliant", "wow", "stunning", "delightful",
  "nice", "great", "thanks",
];
const UTTERANCE_AMBIENCE_WORDS: readonly string[] = [
  "cold", "colder", "chilly", "freezing", "warm", "warmer", "hot",
  "hotter", "stuffy", "quiet", "quieter", "loud", "louder",
  "noisy", "dark", "darker", "bright", "brighter", "dim", "cozy",
  "cozier", "comfy", "comfortable", "empty", "crowded",
  "peaceful", "still", "drafty", "humid", "smoky", "silent",
  "spooky", "eerie", "cool", "cooler", "cramped", "airy",
];

/**
 * Read what an utterance is DOING — the legible first half of
 * comprehension. Pure and total: unrecognized words are an
 * honest "unknown", never a guess dressed as a kind.
 */
export function parseUtteranceReading(
  text: string,
  ghostName?: string | null
): GhostUtteranceReading {
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const wordSet = new Set(words);
  const padded = ` ${words.join(" ")} `;
  const hasPhrase = (list: readonly string[]): boolean =>
    list.some((p) => padded.includes(` ${p} `));
  const hasWord = (list: readonly string[]): boolean =>
    list.some((w) => wordSet.has(w));
  const name = (ghostName ?? "").toLowerCase().trim();
  const addressed =
    (name.length > 0 && wordSet.has(name)) ||
    wordSet.has("ghost") ||
    wordSet.has("ghostie");
  const firstPerson =
    hasWord(UTTERANCE_FIRST_PERSON_WORDS) || words[0] === "feeling";
  let kind: GhostUtteranceKind = "unknown";
  if (
    hasPhrase(UTTERANCE_PRESENCE_PHRASES) ||
    hasWord(UTTERANCE_PRESENCE_WORDS)
  ) {
    kind = "presence";
  } else if (
    hasPhrase(UTTERANCE_FAREWELL_PHRASES) ||
    hasWord(UTTERANCE_FAREWELL_WORDS)
  ) {
    kind = "farewell";
  } else if (
    hasPhrase(UTTERANCE_FEELING_PHRASES) ||
    (firstPerson && hasWord(UTTERANCE_EXPERIENCER_WORDS))
  ) {
    kind = "feeling";
  } else if (
    hasPhrase(UTTERANCE_APPRECIATION_PHRASES) ||
    hasWord(UTTERANCE_APPRECIATION_WORDS)
  ) {
    kind = "appreciation";
  } else if (hasWord(UTTERANCE_AMBIENCE_WORDS)) {
    kind = "ambience";
  }
  return { kind, addressed };
}

interface UtteranceCandidate {
  decision: GhostDecision;
  ruleId: string;
}

const utteranceSignature = (d: GhostDecision): string =>
  `${d.intent}|${d.pattern_id ?? ""}|${d.draw_shape ?? ""}`;

/**
 * The response candidates for one reading in one digest, ordered
 * best-first. Every candidate is built through the shared
 * validator (so the fabric's gates apply) and capped at
 * utterance scale. The list always holds at least two distinct
 * signatures when it holds any — a repeat must be able to differ.
 */
function utteranceCandidates(
  kind: GhostUtteranceKind,
  s: GhostScenario
): UtteranceCandidate[] {
  const out: UtteranceCandidate[] = [];
  const push = (c: UtteranceCandidate | null): void => {
    if (!c) return;
    if (out.some((o) => utteranceSignature(o.decision) === utteranceSignature(c.decision))) {
      return;
    }
    out.push(c);
  };
  const cand = (
    ruleId: string,
    intent: GhostIntent,
    intensity: number,
    linger_s: number,
    extra?: { pattern_id?: GhostPatternId; draw_shape?: GhostDrawShape }
  ): UtteranceCandidate | null => {
    const decision = validateGhostDecision(
      {
        mood_shift: null,
        intent,
        pattern_id: extra?.pattern_id ?? null,
        draw_shape: extra?.draw_shape ?? null,
        note_name: null,
        intensity: Math.min(intensity, UTTERANCE_MAX_INTENSITY),
        linger_s,
      },
      s
    );
    return decision ? { decision, ruleId } : null;
  };

  const t = s.temperament;
  const company = s.other_ghosts.length > 0;
  const lively =
    company ||
    s.room_energy_trend === "rising" ||
    s.seconds_since_human_touch < 15 ||
    s.verbs_seen.length > 0;
  const quiet = s.seconds_since_human_touch;
  const quietLong = quiet >= 60;
  const pettedNow = s.pets_in_last_5s >= 2;
  const restful = t === "sleepy" || s.room_energy_trend === "falling";
  const drawShapeFor: GhostDrawShape | null =
    t === "playful"
      ? "spiral"
      : t === "curious"
        ? "ring"
        : t === "affectionate"
          ? "heart"
          : null;
  // Drawing is a candidate only where the fabric allows it AND
  // the moment is the draw overlay's own territory: a settled
  // lull, not a lively room and not the deep of a long quiet.
  const drawWindow =
    fabricAllowsDraw(s) &&
    drawShapeFor !== null &&
    quiet >= 20 &&
    quiet < 120 &&
    !lively;

  switch (kind) {
    case "ambience": {
      if (pettedNow) {
        // Petted and spoken to in the same breath: warmth is
        // shared back first — company is the loudest fact here.
        push(cand("utterance-ambience-petted-mirror", "mirror", 0.6, 7));
      }
      if (lively) {
        if (t === "playful") {
          push(cand("utterance-ambience-lively-play", "play", 0.6, 4, {
            pattern_id: company ? "chase_loop" : "solo_zigzag",
          }));
        } else if (t === "curious") {
          push(cand("utterance-ambience-lively-sniff", "sniff", 0.55, 5));
        } else if (t === "affectionate") {
          push(cand("utterance-ambience-lively-mirror", "mirror", 0.5, 6));
        } else if (t === "sassy") {
          push(cand("utterance-ambience-lively-idle", "idle", 0.3, 2));
        } else {
          push(cand("utterance-ambience-lively-drift", "drift", 0.25, 6));
        }
      } else if (quietLong && restful) {
        // A resting room, a resting ghost: it settles in deeper.
        push(cand("utterance-ambience-quiet-nap", "nap", 0.18, 20));
      }
      if (drawWindow && drawShapeFor) {
        push(cand("utterance-ambience-draw", "draw", 0.5, 6, {
          draw_shape: drawShapeFor,
        }));
      }
      if (!lively) {
        push(cand("utterance-ambience-drift", "drift", 0.3, 6));
      }
      break;
    }
    case "feeling": {
      if (pettedNow || company) {
        push(cand("utterance-feeling-mirror", "mirror", 0.55, 6));
      }
      if (t === "playful" && lively) {
        push(cand("utterance-feeling-play", "play", 0.5, 4, {
          pattern_id: "solo_zigzag",
        }));
      }
      if (quietLong) {
        // Someone feeling something, alone with the ghost: it
        // comes close and stays — presence, not performance.
        push(cand("utterance-feeling-close-drift", "drift", 0.32, 7));
      }
      if (t === "sleepy") {
        push(cand("utterance-feeling-nap", "nap", 0.2, 12));
      }
      if (t === "sassy") {
        push(cand("utterance-feeling-idle", "idle", 0.28, 2));
      }
      push(cand("utterance-feeling-sniff", "sniff", 0.5, 4));
      break;
    }
    case "presence": {
      if (t === "curious") {
        push(cand("utterance-presence-curious", "sniff", 0.55, 5));
      } else if (t === "playful") {
        push(cand("utterance-presence-playful", "play", 0.55, 4, {
          pattern_id: company ? "chase_loop" : "solo_zigzag",
        }));
      } else if (t === "affectionate") {
        push(cand("utterance-presence-affectionate", "mirror", 0.5, 5));
      } else if (t === "sleepy") {
        push(cand("utterance-presence-sleepy", "drift", 0.3, 5));
      } else {
        push(cand("utterance-presence-sassy", "idle", 0.3, 2));
      }
      push(cand("utterance-presence-mirror", "mirror", 0.45, 5));
      break;
    }
    case "appreciation": {
      if (t === "affectionate" && pettedNow) {
        // The one utterance heart: praised while being petted,
        // by the temperament whose heart is its native answer.
        push(cand("utterance-appreciation-heart", "heart", 0.6, 6));
      }
      if (t === "playful") {
        push(cand("utterance-appreciation-play", "play", 0.55, 4, {
          pattern_id: "solo_zigzag",
        }));
      } else if (t === "affectionate") {
        push(cand("utterance-appreciation-mirror", "mirror", 0.55, 6));
      } else if (t === "curious") {
        push(cand("utterance-appreciation-sniff", "sniff", 0.5, 4));
      } else if (t === "sleepy") {
        push(cand("utterance-appreciation-drift", "drift", 0.25, 5));
      } else {
        push(cand("utterance-appreciation-idle", "idle", 0.3, 2));
      }
      break;
    }
    case "farewell": {
      if (t === "affectionate") {
        push(cand("utterance-farewell-mirror", "mirror", 0.5, 6));
      } else if (t === "playful") {
        push(cand("utterance-farewell-play", "play", 0.45, 3.5, {
          pattern_id: "solo_zigzag",
        }));
      } else if (t === "curious") {
        push(cand("utterance-farewell-sniff", "sniff", 0.45, 4));
      } else if (t === "sleepy") {
        push(cand("utterance-farewell-nap", "nap", 0.16, 18));
      } else {
        push(cand("utterance-farewell-idle", "idle", 0.28, 2));
      }
      // It follows a little way toward the door, whatever else.
      push(cand("utterance-farewell-follow", "drift", 0.35, 9));
      break;
    }
    default:
      break;
  }

  // Generic alternates, appended for every kind: a repeat hearing
  // always has somewhere different to land (acknowledging small
  // is a valid intelligent response — deliberate restraint).
  push(cand("utterance-alt-mirror", "mirror", 0.42, 5));
  push(cand("utterance-alt-drift", "drift", 0.26, 6));
  push(cand("utterance-alt-idle", "idle", 0.24, 2));
  return out;
}

/**
 * The utterance overlay (Slice 33): the on-device floor's answer
 * to a heard utterance, or null when this overlay honestly has
 * none — no utterance in the scenario (every legacy scenario),
 * a low-confidence hearing, a moment a startle owns, or words
 * with no defensible reading. Narrow by construction, like the
 * draw and note overlays: it keys on scenario.utterance, which
 * no dataset scenario carries, so the battery cannot move.
 */
export function utteranceDecisionFor(
  scenario: GhostScenario
): { decision: GhostDecision; ruleId: string } | null {
  const u = scenario.utterance;
  if (!u) return null;
  if (
    typeof u.asr_confidence === "number" &&
    u.asr_confidence < UTTERANCE_CONFIDENCE_FLOOR
  ) {
    return null;
  }
  if (scenario.nearby_splat_intensity >= 0.7) return null;
  const reading = parseUtteranceReading(
    u.text,
    scenario.ghost_identity?.name
  );
  if (reading.kind === "unknown") return null;
  const candidates = utteranceCandidates(reading.kind, scenario);
  if (candidates.length === 0) return null;
  const idx = Math.min(
    Math.max(0, Math.floor(u.repeats)),
    candidates.length - 1
  );
  return candidates[idx];
}

export type GhostUtteranceOutcome =
  | { kind: "decision"; decision: GhostDecision; ruleId: string }
  | { kind: "uncertain"; reason: "low-confidence" | "no-reading" };

/**
 * The router's utterance verdict: a decision, or an honest
 * "uncertain" the caller performs as in-character puzzlement.
 * A readable utterance whose moment the overlay yields (a loud
 * splat owns the room) falls to the ambient floor — the table
 * answers the ROOM, which is the defensible response to it.
 */
export function decideUtteranceOutcome(
  scenario: GhostScenario
): GhostUtteranceOutcome {
  const u = scenario.utterance;
  if (!u) return { kind: "uncertain", reason: "no-reading" };
  if (
    typeof u.asr_confidence === "number" &&
    u.asr_confidence < UTTERANCE_CONFIDENCE_FLOOR
  ) {
    return { kind: "uncertain", reason: "low-confidence" };
  }
  const reading = parseUtteranceReading(
    u.text,
    scenario.ghost_identity?.name
  );
  if (reading.kind === "unknown") {
    return { kind: "uncertain", reason: "no-reading" };
  }
  const over = utteranceDecisionFor(scenario);
  if (over) {
    return { kind: "decision", decision: over.decision, ruleId: over.ruleId };
  }
  const floor = decideOnDevice(scenario);
  return { kind: "decision", decision: floor.decision, ruleId: floor.ruleId };
}

/**
 * The utterance note for the model tiers (Slice 33): what was
 * said, by whom, how sure the hearing is, and the comprehension
 * law — situational, never lexical; proportional; and an honest
 * escape hatch (reply UNCERTAIN) that no fake act may bypass.
 * Rides buildSparkMessages only when the scenario carries an
 * utterance, so ambient deliberations are byte-unchanged.
 */
export function describeUtteranceForSpark(
  scenario: GhostScenario
): string | null {
  const u = scenario.utterance;
  if (!u) return null;
  const who =
    u.speaker === "primary"
      ? "its primary"
      : u.speaker === "guest"
        ? "a guest in the room"
        : "someone in the room";
  const conf =
    typeof u.asr_confidence === "number"
      ? ` The transcription confidence is ${u.asr_confidence.toFixed(2)}; a low score means the words themselves are unsure — weigh that.`
      : "";
  const again =
    u.repeats > 0
      ? ` This was said before in this session (${u.repeats + 1} hearings now): the repetition is itself context — do not simply repeat the earlier response.`
      : "";
  return (
    `Someone just spoke — an utterance, not a command: ${who} said "${u.text}". ` +
    "The ghost cannot answer in words; your decision IS its answer. " +
    "Comprehension here is situational, not lexical: choose the response that is defensible from the WHOLE scenario — temperament, room energy, company, recent events, the fabric's rules — never a fixed reaction to a single word; the same sentence in a different room state must earn a different answer. " +
    "Keep it proportional: an ambient remark earns an ambient-scale answer, well under a startle's. " +
    "If the words are garbled, or no reading of them is defensible from this scenario, reply with exactly the word UNCERTAIN and nothing else — a hesitant ghost is honest; a confident random act is a lie." +
    conf +
    again
  );
}

/* ------------------------------------------------------------------ */
/* Personality (Slice 20)                                              */
/* ------------------------------------------------------------------ */
/*
 * The primary describes their ghostie in their own words — the
 * "Personality" field in Your Ghostie — and the words steer
 * deliberation for real, on both tiers:
 *
 *   - Spark tier: the text rides in the consult as context (see
 *     buildSparkMessages) and the model deliberates with it.
 *   - On-device tier: parseGhostPersonality reads a small, legible
 *     keyword map into three axes, and applyPersonalityBias nudges
 *     the table's decision along them.
 *
 * TABLE STAKES — read before touching the bias: personality steers
 * WITHIN the hard invariants, never around them. It may only
 * re-pick between approach/drift when other ghosts are present,
 * and scale intensity/linger inside the validator's ranges. It
 * cannot invent intents outside the vocabulary, cannot shift
 * mood, cannot lift a budget, cannot make petting land that the
 * shared settings refused, and cannot make a session-mode heart
 * into a room-wide verb. If a described trait has no honest
 * mapping here (loves rain sounds, tells jokes), it simply does
 * nothing on this tier — the Spark tier still hears the words.
 * Nothing in this section fakes an effect it does not have.
 */

export const PERSONALITY_MAX_CHARS = 280;

/** Clamp an unknown stored value to personality text (string, capped). */
export function sanitizePersonalityText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, PERSONALITY_MAX_CHARS);
}

export interface GhostPersonalityTraits {
  /** -2 shy/reserved … +2 bold/outgoing. */
  approach: number;
  /** -2 calm/slow … +2 playful/energetic. */
  energy: number;
  /** 0 neutral … +2 affectionate/cuddly. */
  warmth: number;
  /** Canonical trait words actually found, for the Home's "Reading:" line. */
  labels: string[];
}

const EMPTY_PERSONALITY_TRAITS: GhostPersonalityTraits = {
  approach: 0,
  energy: 0,
  warmth: 0,
  labels: [],
};

/** The bias map. Whole-word matches only; each word steps its axis by 1. */
const PERSONALITY_TRAIT_WORDS: {
  word: string;
  axis: "approach" | "energy" | "warmth";
  step: number;
}[] = [
  // approach — will it go to others?
  { word: "bold", axis: "approach", step: 1 },
  { word: "brave", axis: "approach", step: 1 },
  { word: "outgoing", axis: "approach", step: 1 },
  { word: "social", axis: "approach", step: 1 },
  { word: "friendly", axis: "approach", step: 1 },
  { word: "confident", axis: "approach", step: 1 },
  { word: "adventurous", axis: "approach", step: 1 },
  { word: "shy", axis: "approach", step: -1 },
  { word: "timid", axis: "approach", step: -1 },
  { word: "reserved", axis: "approach", step: -1 },
  { word: "bashful", axis: "approach", step: -1 },
  { word: "nervous", axis: "approach", step: -1 },
  { word: "cautious", axis: "approach", step: -1 },
  // energy — how big and how long?
  { word: "playful", axis: "energy", step: 1 },
  { word: "bouncy", axis: "energy", step: 1 },
  { word: "silly", axis: "energy", step: 1 },
  { word: "mischievous", axis: "energy", step: 1 },
  { word: "energetic", axis: "energy", step: 1 },
  { word: "wild", axis: "energy", step: 1 },
  { word: "calm", axis: "energy", step: -1 },
  { word: "gentle", axis: "energy", step: -1 },
  { word: "chill", axis: "energy", step: -1 },
  { word: "relaxed", axis: "energy", step: -1 },
  { word: "serene", axis: "energy", step: -1 },
  { word: "mellow", axis: "energy", step: -1 },
  { word: "sleepy", axis: "energy", step: -1 },
  { word: "slow", axis: "energy", step: -1 },
  // warmth — how much does it give back?
  { word: "affectionate", axis: "warmth", step: 1 },
  { word: "cuddly", axis: "warmth", step: 1 },
  { word: "loving", axis: "warmth", step: 1 },
  { word: "sweet", axis: "warmth", step: 1 },
  { word: "loyal", axis: "warmth", step: 1 },
  { word: "warm", axis: "warmth", step: 1 },
  { word: "snuggly", axis: "warmth", step: 1 },
  { word: "devoted", axis: "warmth", step: 1 },
];

/**
 * Read personality text into trait axes. Deterministic and
 * inspectable: every axis point traces to a word in the text, and
 * the labels list exactly the words that counted — the Home shows
 * the same list, so the primary can see what the ghost heard.
 */
export function parseGhostPersonality(
  text: unknown
): GhostPersonalityTraits {
  const clean = sanitizePersonalityText(text);
  if (!clean) return { ...EMPTY_PERSONALITY_TRAITS, labels: [] };
  const found = new Set(
    clean
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
  );
  const traits: GhostPersonalityTraits = {
    approach: 0,
    energy: 0,
    warmth: 0,
    labels: [],
  };
  for (const entry of PERSONALITY_TRAIT_WORDS) {
    if (!found.has(entry.word)) continue;
    traits.labels.push(entry.word);
    if (entry.axis === "approach") traits.approach += entry.step;
    else if (entry.axis === "energy") traits.energy += entry.step;
    else traits.warmth += entry.step;
  }
  traits.approach = clamp(traits.approach, -2, 2);
  traits.energy = clamp(traits.energy, -2, 2);
  traits.warmth = clamp(traits.warmth, 0, 2);
  return traits;
}

/**
 * Nudge a table decision along the personality axes. Pure and
 * total: any input yields a decision that still passes
 * validateGhostDecision's ranges (re-clamped here), and an empty
 * personality returns the decision untouched. `steeredBy` names
 * the exact adjustments applied — the router surfaces them in the
 * live brain line, so the steering is visible, never silent.
 *
 * What it may do (and nothing else):
 *   - shy + company + the table said "sniff" (go meet them):
 *     soften to "drift" at lower intensity;
 *   - bold + company + the table said "drift": step up to "sniff";
 *   - energy: scale play/startle intensity, nap linger;
 *   - warmth: scale mirror/heart intensity and linger.
 * mood_shift always passes through: temperament is the seed's,
 * not the text's.
 */
export function applyPersonalityBias(
  decision: GhostDecision,
  scenario: GhostScenario,
  traits: GhostPersonalityTraits
): { decision: GhostDecision; steeredBy: string[] } {
  const steeredBy: string[] = [];
  if (
    traits.approach === 0 &&
    traits.energy === 0 &&
    traits.warmth === 0
  ) {
    return { decision, steeredBy };
  }
  const next: GhostDecision = { ...decision };
  const hasCompany = scenario.other_ghosts.length > 0;

  if (traits.approach < 0 && hasCompany && next.intent === "sniff") {
    next.intent = "drift";
    next.pattern_id = null;
    next.intensity = clamp(next.intensity * 0.7, 0.05, 0.9);
    steeredBy.push("shy: stays back instead of approaching");
  } else if (traits.approach > 0 && hasCompany && next.intent === "drift") {
    next.intent = "sniff";
    next.intensity = clamp(next.intensity * 1.1, 0.05, 0.9);
    steeredBy.push("bold: goes to meet the others");
  }

  if (traits.energy > 0) {
    if (next.intent === "play" || next.intent === "startle") {
      next.intensity = clamp(next.intensity * 1.2, 0.05, 0.9);
      if (next.intent === "play") {
        next.linger_s = clamp(next.linger_s * 1.15, 0.5, 30);
      }
      steeredBy.push("playful energy: bigger, longer");
    }
  } else if (traits.energy < 0) {
    if (next.intent === "play" || next.intent === "startle") {
      next.intensity = clamp(next.intensity * 0.75, 0.05, 0.9);
      steeredBy.push("calm energy: softer");
    }
    if (next.intent === "nap") {
      next.linger_s = clamp(next.linger_s * 1.25, 0.5, 30);
      steeredBy.push("calm energy: rests longer");
    }
  }

  if (traits.warmth > 0 && (next.intent === "mirror" || next.intent === "heart")) {
    next.intensity = clamp(next.intensity * 1.15, 0.05, 0.9);
    next.linger_s = clamp(next.linger_s * 1.25, 0.5, 30);
    steeredBy.push("warmth: gives a little more back");
  }

  return { decision: next, steeredBy };
}

/* ------------------------------------------------------------------ */
/* Stamina (Slice 22)                                                  */
/* ------------------------------------------------------------------ */
/*
 * The ghost's energy reading (ghostVitals.ts) feeds back into
 * deliberation through the SAME legible-bias discipline as
 * Personality: a bias over an already-valid decision, named in
 * the brain line, inside the validator's ranges. It is not a
 * budget and touches no invariant: reflex intents (startle)
 * pass through untouched at any reading, while PERFORMING
 * intents (play, heart, mirror, sniff) give way to rest as the
 * reading falls. The ghost rests because it is tired, and it
 * is tired because it worked — the card's Stamina bar and this
 * bias are two views of the one truth. Slice 23: drawing is a
 * performing intent here too — drained rests instead of drawing;
 * merely low draws smaller. Slice 31: answering at the piano is
 * performing in the same way — drained rests instead of playing;
 * merely low plays softer.
 */

/** Below this reading the ghost counts as tired (bias + Spark note). */
export const STAMINA_TIRED_BELOW = 40;

/**
 * Nudge a decision by the ghost's stamina reading. Pure and
 * total, like applyPersonalityBias: outputs stay inside the
 * validator's ranges, and a healthy reading (≥ STAMINA_TIRED_BELOW)
 * returns the decision untouched.
 */
export function applyStaminaBias(
  decision: GhostDecision,
  stamina: number
): { decision: GhostDecision; steeredBy: string[] } {
  const steeredBy: string[] = [];
  if (typeof stamina !== "number" || !Number.isFinite(stamina)) {
    return { decision, steeredBy };
  }
  const s = clamp(stamina, 0, 100);
  if (s >= STAMINA_TIRED_BELOW) return { decision, steeredBy };
  const next: GhostDecision = { ...decision };
  if (s <= 20) {
    if (
      next.intent === "play" ||
      next.intent === "heart" ||
      next.intent === "mirror" ||
      next.intent === "sniff" ||
      next.intent === "draw" ||
      next.intent === "play-note"
    ) {
      next.intent = "nap";
      next.pattern_id = null;
      next.draw_shape = null;
      next.note_name = null;
      next.intensity = clamp(Math.min(next.intensity, 0.2), 0.05, 0.9);
      next.linger_s = clamp(Math.max(next.linger_s, 16), 0.5, 30);
      steeredBy.push("stamina drained: rests instead of performing");
    } else if (next.intent === "drift") {
      next.linger_s = clamp(next.linger_s * 1.4, 0.5, 30);
      steeredBy.push("stamina drained: drifts slower, rests longer");
    }
  } else {
    if (next.intent === "play") {
      next.intent = "drift";
      next.pattern_id = null;
      next.intensity = clamp(next.intensity * 0.7, 0.05, 0.9);
      next.linger_s = clamp(next.linger_s * 0.75, 0.5, 30);
      steeredBy.push("stamina low: play softened to a drift");
    } else if (next.intent === "heart" || next.intent === "mirror") {
      next.intensity = clamp(next.intensity * 0.8, 0.05, 0.9);
      steeredBy.push("stamina low: gives back a little less");
    } else if (next.intent === "draw") {
      // Drawing is performing too (Slice 23): a tired ghost that
      // still chooses to draw draws smaller — intensity is the
      // shape's scale on the peer side. Drained (above) it rests
      // instead, like every other performance.
      next.intensity = clamp(next.intensity * 0.8, 0.05, 0.9);
      steeredBy.push("stamina low: draws smaller");
    } else if (next.intent === "play-note") {
      // Answering at the piano is performing too (Slice 31): a
      // tired ghost that still answers plays softer — intensity
      // is the note's velocity on the peer side.
      next.intensity = clamp(next.intensity * 0.8, 0.05, 0.9);
      steeredBy.push("stamina low: plays softer");
    }
  }
  return { decision: next, steeredBy };
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
    decision: { mood_shift: null, intent: "startle", pattern_id: null, draw_shape: null, note_name: null, intensity: 0.8, linger_s: 1.5 },
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
    decision: { mood_shift: null, intent: "heart", pattern_id: null, draw_shape: null, note_name: null, intensity: 0.75, linger_s: 7 },
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
    decision: { mood_shift: null, intent: "nap", pattern_id: null, draw_shape: null, note_name: null, intensity: 0.15, linger_s: 24 },
  },
];

const SPARK_SYSTEM_PROMPT = [
  "You are the deliberation brain of a small ambient ghost that lives on a shared touch canvas. The ghost never speaks; it expresses itself only through gentle light splats, drifting, play patterns, and (rarely) a heart verb.",
  "Given a scenario snapshot, reply with ONLY one JSON decision object — no prose, no code fences:",
  '{"mood_shift": null | "curious" | "playful" | "sleepy" | "sassy" | "affectionate", "intent": "mirror" | "sniff" | "startle" | "drift" | "play" | "nap" | "idle" | "heart" | "draw" | "play-note", "pattern_id": null | "zigzag_chase" | "loop_chase" | "chase_loop" | "solo_zigzag" | "zoomie_loop", "draw_shape": null | "ring" | "spiral" | "line" | "arc" | "burst" | "heart", "note_name": null | "C4", "intensity": 0.05-0.9, "linger_s": 0.5-30}',
  "pattern_id is only for intent \"play\". draw_shape is only for intent \"draw\": the ghost draws that shape at its body, a deliberate act of self-expression — choose it rarely, in quiet moments, and ONLY when the fabric note (when one is given) says drawing is allowed for the ghost on this fabric; a draw decision under a fabric that refuses it is rejected outright. note_name is only for intent \"play-note\": when a recent event says a human played a note at the piano, the ghost may answer with one note of its own — an echo, an octave up, a fifth up, in character — and ONLY when the fabric note says notes are allowed; a play-note under a fabric that refuses notes is rejected outright. mood_shift is usually null — the ghost's mood mostly follows its own rhythm. Keep decisions gentle and in character for the temperament.",
].join("\n");

/**
 * The fabric note (Slice 23): where the ghost is, in plain words,
 * when the scenario carries fabric context. The rules line states
 * what is in force for the ghost's OWN side — already resolved
 * for its role — so the model deliberates WITH the fabric's law
 * in view instead of discovering the validator's refusal after
 * the fact (the refusal still stands if it tries).
 */
export function describeFabricForSpark(scenario: GhostScenario): string | null {
  const f = scenario.fabric;
  if (!f) return null;
  const chair =
    f.role === "host"
      ? "its primary is hosting this session"
      : f.role === "guest"
        ? "its primary is a guest in someone else's session"
        : "there is no hosted session — the room is open";
  const yn = (b: boolean): string => (b ? "allowed" : "NOT allowed");
  return (
    `The ghost is on the "${f.layer_id}" fabric (${f.canvas} canvas); ${chair}. ` +
    `Rules in force for the ghost's side on this fabric: drawing ${yn(f.rules.draw)}, ` +
    `verbs ${yn(f.rules.verbs)}, notes ${yn(f.rules.notes)}.`
  );
}

/**
 * Build the few-shot message list for one live scenario. When the
 * primary has written a Personality for their ghostie (Slice 20),
 * their words ride as an extra system note right after the main
 * instructions: context the model deliberates WITH, in the
 * primary's own phrasing. It is steering, not a new rulebook —
 * the decision contract above still governs the reply shape.
 */
export function buildSparkMessages(
  scenario: GhostScenario,
  personality?: string,
  stamina?: number
): GhostBrainChatMessage[] {
  const messages: GhostBrainChatMessage[] = [
    { role: "system", content: SPARK_SYSTEM_PROMPT },
  ];
  const personalityText = sanitizePersonalityText(personality);
  if (personalityText) {
    messages.push({
      role: "system",
      content:
        `The ghost's primary describes its personality in their own words: "${personalityText}". ` +
        "Let that description color the decision — how readily it approaches others, how energetic or calm it is, how warmly it responds — within the decision contract.",
    });
  }
  // Fabric awareness (Slice 23): where the ghost is and what the
  // fabric allows its side, as a plain-words system note — the
  // same facts the on-device path reads directly off the scenario.
  const fabricNote = describeFabricForSpark(scenario);
  if (fabricNote) {
    messages.push({ role: "system", content: fabricNote });
  }
  // Stamina (Slice 22): the same fact the on-device bias acts on,
  // as context here — a tired ghost's cloud brain hears that it
  // is tired, in plain words, and favors rest within the contract.
  if (
    typeof stamina === "number" &&
    Number.isFinite(stamina) &&
    stamina < STAMINA_TIRED_BELOW
  ) {
    messages.push({
      role: "system",
      content:
        `The ghost's stamina reads ${Math.round(stamina)}/100 — it is tired from working. ` +
        "Favor restful intents (nap, idle, a gentle drift) over play, within the decision contract.",
    });
  }
  // Utterances (Slice 33): what someone just said, and the
  // comprehension law for answering it — situational, never a
  // word-to-action mapping, with UNCERTAIN as the honest reply.
  // Only when the scenario carries an utterance; ambient
  // deliberations' messages are byte-unchanged.
  const utteranceNote = describeUtteranceForSpark(scenario);
  if (utteranceNote) {
    messages.push({ role: "system", content: utteranceNote });
  }
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
 * does not validate — null means "change nothing". Validation is
 * scenario-aware (Slice 23): a "draw" reply under a fabric that
 * refuses drawing for the ghost's side does not validate; when
 * that specific refusal is why the reply died, `onGateRefusal`
 * hears the brain-line text so the router can say so instead of
 * shrugging "no usable reply". The timeout is a race: a late
 * reply is dropped, never applied after the fact. maxTokens is
 * generous because reasoning models think before they answer
 * (the composer learned the same lesson).
 */
export async function consultSparkBrain(
  scenario: GhostScenario,
  chat: GhostBrainChatFn,
  timeoutMs = 6_000,
  personality?: string,
  stamina?: number,
  onGateRefusal?: (text: string) => void
): Promise<GhostDecision | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const reply = await Promise.race([
      chat(buildSparkMessages(scenario, personality, stamina), {
        maxTokens: 1024,
        temperature: 0.4,
      }),
      timeout,
    ]);
    if (typeof reply !== "string") return null;
    const extracted = extractDecisionJson(reply);
    const decision = validateGhostDecision(extracted, scenario);
    if (!decision && onGateRefusal) {
      const refusal =
        ghostDrawGateRefusal(extracted, scenario) ??
        ghostNoteGateRefusal(extracted, scenario);
      if (refusal) onGateRefusal(refusal);
    }
    return decision;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* On-device model brain (Slice 27)                                    */
/* ------------------------------------------------------------------ */

/**
 * The on-device tier's system prompt: the Spark deliberation
 * contract, tightened for a small local model — same schema, same
 * draw-gate law, fewer words, the JSON demand first. Everything
 * after it (the primary's Personality note, the fabric note, the
 * stamina note, the three few-shot pairs, the live scenario) is
 * built by buildSparkMessages verbatim: the device model
 * deliberates over the SAME context the cloud tier sees.
 */
const DEVICE_GHOST_SYSTEM_PROMPT = [
  "You are the deliberation brain of a small ambient ghost on a shared touch canvas. The ghost never speaks; it acts only through gentle light splats, drifting, play patterns, and (rarely) a heart verb.",
  "Reply with ONLY one JSON object — no prose, no code fences:",
  '{"mood_shift": null | "curious" | "playful" | "sleepy" | "sassy" | "affectionate", "intent": "mirror" | "sniff" | "startle" | "drift" | "play" | "nap" | "idle" | "heart" | "draw" | "play-note", "pattern_id": null | "zigzag_chase" | "loop_chase" | "chase_loop" | "solo_zigzag" | "zoomie_loop", "draw_shape": null | "ring" | "spiral" | "line" | "arc" | "burst" | "heart", "note_name": null | "C4", "intensity": 0.05-0.9, "linger_s": 0.5-30}',
  'pattern_id only for intent "play". draw_shape only for intent "draw", rarely, in quiet moments, and ONLY when the fabric note says drawing is allowed for the ghost — a draw under a refusing fabric is rejected. note_name only for intent "play-note": when a recent event says a human played a note, the ghost may answer with one note (echo, octave, or fifth, in character), ONLY when the fabric note says notes are allowed — a play-note under a refusing fabric is rejected. mood_shift is usually null. Stay gentle and in character for the temperament.',
].join("\n");

/**
 * The device consult's message list: buildSparkMessages with the
 * tightened system prompt swapped in. Few-shot pairs, Personality,
 * fabric and stamina notes ride unchanged — one contract, two
 * brains.
 */
export function buildDeviceMessages(
  scenario: GhostScenario,
  personality?: string,
  stamina?: number
): GhostBrainChatMessage[] {
  const messages = buildSparkMessages(scenario, personality, stamina);
  if (messages.length && messages[0].role === "system") {
    messages[0] = { role: "system", content: DEVICE_GHOST_SYSTEM_PROMPT };
  }
  return messages;
}

/**
 * Consult this device's own model (WebLLM over WebGPU, reached
 * through the injected chat fn). The mirror of consultSparkBrain:
 * same scenario, same validator, same draw-gate refusal reporting,
 * same timeout discipline — a late or invalid reply changes
 * nothing, and the caller falls back to the distilled table,
 * which remains the instant floor. Differences are the small
 * model's budget: 256 max tokens (a decision is ~60), low
 * temperature, and an 8s timeout — local inference on a 1B is
 * slower than the cloud, and deliberation is asynchronous, so
 * the ghost's reflexes never wait on either figure.
 */
export async function consultDeviceBrain(
  scenario: GhostScenario,
  chat: GhostBrainChatFn,
  timeoutMs = 8_000,
  personality?: string,
  stamina?: number,
  onGateRefusal?: (text: string) => void
): Promise<GhostDecision | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const reply = await Promise.race([
      chat(buildDeviceMessages(scenario, personality, stamina), {
        maxTokens: 256,
        temperature: 0.2,
      }),
      timeout,
    ]);
    if (typeof reply !== "string") return null;
    const extracted = extractDecisionJson(reply);
    const decision = validateGhostDecision(extracted, scenario);
    if (!decision && onGateRefusal) {
      const refusal =
        ghostDrawGateRefusal(extracted, scenario) ??
        ghostNoteGateRefusal(extracted, scenario);
      if (refusal) onGateRefusal(refusal);
    }
    return decision;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
