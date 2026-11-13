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
 * participant (GhostFabricContext). Slice 47 extends that
 * context with the fabric's TOOL MANIFEST (see the manifest
 * section below): the scenario now also carries WHICH tools the
 * loaded fabric offers at all, the validator refuses any intent
 * whose tool the fabric doesn't offer, both model tiers see the
 * tool list in the fabric note, and the Home shows the same list
 * read-only. One deliberation intent is a
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
  "compose",
  "play-music",
  // Slice B (the Forge): the scene-building intents, one per
  // forge tool — decision-shaped like draw/compose before them.
  // They exist ONLY on the Forge fabric (the manifest is their
  // law) and each REQUIRES its forge_spec payload.
  "forge-summon",
  "forge-banish",
  "forge-move",
  "forge-recolor",
  "forge-reshape",
  "forge-relight",
  "forge-camera",
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

/**
 * Slice 53: the layers where the ghost's NOTE tools exist. The
 * Piano was the only one (Slice 31) because it was the only
 * fabric with a note surface — the bus, the synth, a key strip.
 * The Ghostie Playground joins it by the same title: its layer
 * mounts the note pipeline (ToneEngine + useMIDIFluid) and its
 * own key strip on the same bus, so a note there is a real note
 * — sounded, streamed, broadcast — not a pretense. Every note
 * gate (the deliberated answer below, the peer's ask gate, the
 * canvas's ask route and human-note forwarder, the info panel's
 * tool list) asks THIS question, so the set lives in one place.
 */
export const GHOST_NOTE_LAYER_IDS = [
  GHOST_PIANO_LAYER_ID,
  "ghostie-playground",
] as const;

export function isGhostNoteLayer(
  layerId: string | null | undefined
): boolean {
  return (
    layerId != null &&
    (GHOST_NOTE_LAYER_IDS as readonly string[]).includes(layerId)
  );
}

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

/* ------------------------------------------------------------------ */
/* Sound-craft (Slice 52)                                              */
/* ------------------------------------------------------------------ */
/*
 * Terrell spoke to the live ghost — "make some sounds" — and it
 * answered, but with the same two redundant sounds: the voice
 * Slice 47 built articulates a fixed family vocabulary, and the
 * ghost had no SYNTHESIS in its arsenal — nothing it could build
 * a NEW sound from. His diagnosis, verbatim in spirit: it should
 * have waveform functions the way a pygame-style toolkit does —
 * sine, square, and friends — and compose with them.
 *
 * The "compose" intent is that arsenal, as a decision: the brain
 * authors a short sequence of tones — each note a WAVEFORM, a
 * pitch (a ratio over the ghost's own base frequency, with an
 * optional sweep target — the pitch contour), an onset, a
 * duration, a gain, and an ENVELOPE — and the voice layer renders
 * exactly that composition (ghostSound.ts), with only the small
 * seeded jitter the variation law allows (waveform, envelope and
 * note count are the composition; they never jitter). The fixed
 * family cues remain what they are — the ghost's everyday voice;
 * a composition is a deliberate act, priced like one in the
 * peer's performance budget.
 *
 * The schema law here mirrors draw/note exactly: the intent
 * REQUIRES its payload (a compose without a valid sound_spec is
 * not a decision), the payload on any other intent is dropped,
 * and the fabric's manifest decides whether the tool exists
 * there at all — the fluid and the ghostie's own playground
 * offer sound-craft; a piano or a stage does not, and an ask
 * that lands there is answered another way, never faked.
 */

/** The waveforms a composition may be built from. */
export const GHOST_WAVEFORMS = [
  "sine",
  "square",
  "triangle",
  "sawtooth",
  "noise",
] as const;
export type GhostWaveform = (typeof GHOST_WAVEFORMS)[number];

/** The envelope shapes a composed note may carry. */
export const GHOST_SOUND_ENVS = ["soft", "pluck", "swell"] as const;
export type GhostSoundEnv = (typeof GHOST_SOUND_ENVS)[number];

/** One composed tone, in the decision's own (wire) shape. */
export interface GhostSoundNote {
  wave: GhostWaveform;
  /** Pitch multiplier over the ghost's base frequency. */
  ratio: number;
  /** Pitch contour: the sweep target reached by the note's end. */
  ratio_end?: number;
  /** Onset offset within the sequence, ms. */
  delay_ms: number;
  dur_ms: number;
  /** Relative gain, 0..1 (the voice's master ceiling still rules). */
  gain: number;
  env: GhostSoundEnv;
}

/** A composed sound: a short sequence of waveform tones. */
export interface GhostSoundSpec {
  notes: GhostSoundNote[];
}

export const GHOST_SOUND_MAX_NOTES = 8;
/** A composition is a moment, not a song: last note ends by here. */
export const GHOST_SOUND_MAX_END_MS = 4800;
const GHOST_SOUND_MIN_RATIO = 0.25;
/** 660 Hz (highest hue base) x 3.5 stays under the voice's proven squeak cap. */
const GHOST_SOUND_MAX_RATIO = 3.5;

/**
 * Clamp an unknown value to a GhostSoundSpec, or null when it is
 * not one — the sanitizer discipline, with the validator's split:
 * categorical damage (no notes, too many notes, an unknown
 * waveform or envelope, a non-finite number) makes the whole
 * spec unusable, because a composition is ONE authored object —
 * silently repairing half of it would perform a different sound
 * than the brain composed. In-range numbers clamp.
 */
export function sanitizeGhostSoundSpec(raw: unknown): GhostSoundSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.notes)) return null;
  if (rec.notes.length === 0 || rec.notes.length > GHOST_SOUND_MAX_NOTES) {
    return null;
  }
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const notes: GhostSoundNote[] = [];
  for (const item of rec.notes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const n = item as Record<string, unknown>;
    if (
      typeof n.wave !== "string" ||
      !(GHOST_WAVEFORMS as readonly string[]).includes(n.wave)
    ) {
      return null;
    }
    const env =
      n.env === undefined || n.env === null ? "soft" : n.env;
    if (
      typeof env !== "string" ||
      !(GHOST_SOUND_ENVS as readonly string[]).includes(env)
    ) {
      return null;
    }
    const ratio = num(n.ratio);
    const delay = num(n.delay_ms);
    const dur = num(n.dur_ms);
    const gain = num(n.gain);
    if (ratio === null || delay === null || dur === null || gain === null) {
      return null;
    }
    let ratioEnd: number | undefined;
    if (n.ratio_end !== undefined && n.ratio_end !== null) {
      const re = num(n.ratio_end);
      if (re === null) return null;
      ratioEnd = Math.min(
        GHOST_SOUND_MAX_RATIO,
        Math.max(GHOST_SOUND_MIN_RATIO, re)
      );
    }
    const delayMs = Math.min(GHOST_SOUND_MAX_END_MS, Math.max(0, delay));
    const durMs = Math.min(
      1200,
      Math.max(30, dur),
      GHOST_SOUND_MAX_END_MS - delayMs
    );
    if (durMs < 30) return null;
    notes.push({
      wave: n.wave as GhostWaveform,
      ratio: Math.min(
        GHOST_SOUND_MAX_RATIO,
        Math.max(GHOST_SOUND_MIN_RATIO, ratio)
      ),
      ratio_end: ratioEnd,
      delay_ms: Math.round(delayMs),
      dur_ms: Math.round(durMs),
      gain: Math.min(1, Math.max(0.05, gain)),
      env: env as GhostSoundEnv,
    });
  }
  return { notes };
}

/** A spec's compact identity — its waveforms + rounded ratios. */
export function ghostSoundSignature(spec: GhostSoundSpec): string {
  return spec.notes
    .map((n) => `${n.wave}:${Math.round(n.ratio * 20)}`)
    .join(">");
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

export type GhostCanvasKind =
  | "fluid"
  | "stage3d"
  | "camera"
  // Slice B: the Forge's own canvas kind — the ghost's fabric
  // context names the 67js scene canvas honestly instead of
  // borrowing "fluid" (Slice A disclosed the borrowed read).
  | "forge67"
  | "unknown";

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
  /**
   * Slice 47: the loaded fabric's TOOL MANIFEST — the tool ids
   * (ghostTools vocabulary) this fabric offers the ghost at all.
   * sanitizeFabricContext always populates it: a supplied list is
   * clamped to the known tool vocabulary; an absent one derives
   * from the built-in manifest table by layer_id (an undeclared
   * fabric offers the full registry — no declaration, no
   * authority to refuse). Decisions whose intent maps to a tool
   * outside this list are refused by the validator, so the brain
   * can only reach for acts the loaded fabric actually has.
   * Optional in the type only so pre-47 literal constructions
   * stay valid; every sanitized context carries it.
   */
  tools?: readonly string[];
  /** ghostManifestHash(tools) — the manifest's compact identity. */
  tools_hash?: string;
}

const GHOST_CANVAS_KINDS: readonly string[] = [
  "fluid",
  "stage3d",
  "camera",
  "forge67",
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
  const layerId = rec.layer_id.slice(0, 64);
  // Slice 47: the tool manifest rides every sanitized context.
  // A supplied list is clamped to the known tool vocabulary (an
  // empty result falls back to the layer's declared manifest —
  // a garbled list must never silently disarm the ghost); an
  // absent list derives from the manifest table by layer id.
  let tools: readonly string[] | null = null;
  if (Array.isArray(rec.tools)) {
    const clamped = rec.tools.filter(
      (t): t is string =>
        typeof t === "string" &&
        (GHOST_TOOL_IDS as readonly string[]).includes(t)
    );
    if (clamped.length > 0) tools = [...new Set(clamped)];
  }
  if (!tools) tools = fabricManifestFor(layerId);
  return {
    layer_id: layerId,
    canvas,
    role,
    in_session: typeof rec.in_session === "boolean" ? rec.in_session : role !== "open",
    rules: {
      draw: rule(rulesIn.draw),
      verbs: rule(rulesIn.verbs),
      notes: rule(rulesIn.notes),
    },
    tools,
    tools_hash: ghostManifestHash(tools),
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
/* Fabric tool manifest (Slice 47, Part B)                             */
/* ------------------------------------------------------------------ */
/*
 * Terrell's direction (Oct 29, restated Nov 3): fabric rules sit
 * in the ghost's decision stack, and the ghost "should have
 * awareness of what it can do tool wise depending on what fabric
 * is loaded currently." The Slice 23 rules answer three yes/no
 * questions (draw? verbs? notes?) for a HOSTED session; they do
 * not say what a fabric OFFERS. The manifest does: per fabric,
 * the tool ids (the ghostTools registry's vocabulary, mirrored
 * below — ghostvoice-check asserts the mirror never drifts) the
 * ghost may reach for while that fabric is loaded. A ghost on
 * the Piano reaches for piano-shaped acts; on the Stage it
 * dances to the note bus instead of splatting a canvas that
 * isn't there; nowhere does it attempt a tool the loaded fabric
 * doesn't offer.
 *
 * The manifest composes with the rules, never replaces them:
 * the rules gates (host authority over a session) still fire
 * first in the validator; the manifest gate refuses what the
 * fabric doesn't have at all. An UNDECLARED fabric id offers the
 * full registry — the codebase's standing discipline (a garbled
 * or absent declaration is no authority to refuse, the same
 * reason garbled rules default permissive) — and a scenario with
 * no fabric context at all stays a legacy scenario, ungated,
 * exactly as the dataset requires.
 */

/** The tool vocabulary, mirrored from ghostTools.ts by hand. */
export const GHOST_TOOL_IDS = [
  "splat-play",
  "draw",
  "play-note",
  "verb-perform",
  "heartbeat-answer",
  "note-perform",
  "sound-craft",
  "play-music",
  // Slice B: the Forge scene tools (ghostTools.ts declares them;
  // ghostvoice-check asserts this mirror never drifts).
  "forge-summon",
  "forge-banish",
  "forge-move",
  "forge-recolor",
  "forge-reshape",
  "forge-relight",
  "forge-camera",
] as const;

/**
 * Slice B: the Forge's tool set — the seven scene tools, and
 * only those. The Forge canvas has no splat surface, no note
 * bus and no ghost body to perform with yet (no peer is hosted
 * on it in this slice), so the manifest claims exactly what the
 * ghost can really do there: shape the scene itself. Presence
 * tools join this list when a slice gives the ghost a body on
 * the Forge — not before.
 */
export const GHOST_FORGE_TOOL_IDS = [
  "forge-summon",
  "forge-banish",
  "forge-move",
  "forge-recolor",
  "forge-reshape",
  "forge-relight",
  "forge-camera",
] as const;

/**
 * What each built-in fabric offers the ghost. Keyed by the
 * ExperienceContext layer ids. Deliberation tools (splat-play,
 * draw, play-note) and ask tools (verb-perform, heartbeat-answer,
 * note-perform) alike: the manifest is the fabric's whole
 * capability surface for the ghost.
 */
export const GHOST_FABRIC_TOOL_MANIFEST: Record<
  string,
  readonly string[]
> = {
  // The fluid: splats and free drawing are its native acts —
  // and, since Slice 52, sound-craft: the fluid is the ghost's
  // home canvas, where composing a sound from raw waveforms is
  // a native act too.
  "default-fluid": [
    "splat-play",
    "draw",
    "verb-perform",
    "heartbeat-answer",
    "sound-craft",
    "play-music",
  ],
  // The ghostie's own playground (its test fabric): the whole
  // bench is out — every tool the registry holds, sound-craft
  // included, so its primary can put any of them through their
  // paces in one place.
  "ghostie-playground": [
    "splat-play",
    "draw",
    "play-note",
    "verb-perform",
    "heartbeat-answer",
    "note-perform",
    "sound-craft",
    // Slice 68: the bench holds every tool the registry holds —
    // play-music included. It can still only FIRE under a
    // standing request with a due phrase clock, which only the
    // fluid's Generative-music toggle creates; the playground
    // offers the tool, the request never stands there.
    "play-music",
  ],
  // The piano: the full music surface — the note bus is its own.
  "ar-piano": [
    "splat-play",
    "draw",
    "play-note",
    "note-perform",
    "verb-perform",
    "heartbeat-answer",
  ],
  // The Fold: presence and annotation on the shared canvas; the
  // fold-shaped acts ride the genx overlay (its "play" intent),
  // and there is no note bus here.
  "genx-fold": ["splat-play", "draw", "verb-perform", "heartbeat-answer"],
  // See: the ghost points and circles what it finds (draw), and
  // answers through the shared presence acts.
  "sam-see": ["splat-play", "draw", "verb-perform", "heartbeat-answer"],
  // The Dancer Stage: the dancer IS the ghost's body — there is
  // no fluid to splat and no canvas to draw on. It performs, it
  // answers, and it dances to the note bus (note-perform); it
  // does not play notes itself.
  "dancer-stage": ["verb-perform", "heartbeat-answer", "note-perform"],
  // Camera effects: the filters react to presence and verbs;
  // no draw surface, no note bus.
  "camera-effects": ["splat-play", "verb-perform", "heartbeat-answer"],
  // The Forge (Slice B): the ghost builds in 3D — scene tools
  // only (see GHOST_FORGE_TOOL_IDS on why the list is exactly
  // these seven).
  forge: GHOST_FORGE_TOOL_IDS,
};

/**
 * The manifest a layer id declares — or the FULL registry for an
 * undeclared fabric (no declaration, no authority to refuse).
 */
export function fabricManifestFor(layerId: string): readonly string[] {
  return GHOST_FABRIC_TOOL_MANIFEST[layerId] ?? GHOST_TOOL_IDS;
}

/** A manifest's compact identity (djb2 over the sorted tool list). */
export function ghostManifestHash(tools: readonly string[]): string {
  const key = [...tools].sort().join(",");
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Which tool each deliberation intent reaches for. */
export const GHOST_INTENT_TOOL: Record<GhostIntent, string> = {
  mirror: "splat-play",
  sniff: "splat-play",
  startle: "splat-play",
  drift: "splat-play",
  play: "splat-play",
  nap: "splat-play",
  idle: "splat-play",
  heart: "splat-play",
  draw: "draw",
  "play-note": "play-note",
  compose: "sound-craft",
  "play-music": "play-music",
  // Slice B: each forge intent reaches for the forge tool of
  // the same name (the draw precedent — one intent, one tool).
  "forge-summon": "forge-summon",
  "forge-banish": "forge-banish",
  "forge-move": "forge-move",
  "forge-recolor": "forge-recolor",
  "forge-reshape": "forge-reshape",
  "forge-relight": "forge-relight",
  "forge-camera": "forge-camera",
};

/**
 * The tool set in force for a scenario: the context's own
 * (sanitized) manifest when it carries one, else the manifest
 * its layer id declares. Null when the scenario has no fabric
 * context at all (legacy — no fabric authority in the picture).
 */
export function fabricToolsFor(
  scenario: GhostScenario
): readonly string[] | null {
  if (!scenario.fabric) return null;
  if (scenario.fabric.tools && scenario.fabric.tools.length > 0) {
    return scenario.fabric.tools;
  }
  return fabricManifestFor(scenario.fabric.layer_id);
}

/** May this intent's tool be used on the scenario's fabric? */
export function fabricAllowsIntent(
  scenario: GhostScenario,
  intent: GhostIntent
): boolean {
  const tools = fabricToolsFor(scenario);
  if (!tools) return true;
  return tools.includes(GHOST_INTENT_TOOL[intent]);
}

/**
 * The same question at the CONTEXT level (GhostPeer's own gates
 * hold a fabric context, not a scenario): the context's manifest
 * when it carries one, else its layer id's declared manifest.
 */
export function fabricContextAllowsIntent(
  fabric: GhostFabricContext,
  intent: GhostIntent
): boolean {
  const tools =
    fabric.tools && fabric.tools.length > 0
      ? fabric.tools
      : fabricManifestFor(fabric.layer_id);
  return tools.includes(GHOST_INTENT_TOOL[intent]);
}

/** The refusal the brain line shows when the manifest refuses. */
export const GHOST_MANIFEST_REFUSAL_TEXT =
  "wanted to use a tool this fabric doesn't offer";

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
  /**
   * Slice 36: what the room's compute field is doing (see
   * GhostGenxContext). Absent whenever the Fold is not the
   * loaded fabric or the field has nothing to report, so every
   * legacy scenario and the whole v1 dataset stay byte-identical.
   */
  genx?: GhostGenxContext;
  /**
   * Slice 68: the standing Generative-music request (see
   * GhostMusicContext). Present only while the fluid's music
   * toggle is on and the host feeds the peer a standing
   * request — absent on every legacy scenario, so the music
   * overlay never fires anywhere else.
   */
  music?: GhostMusicContext;
  /**
   * Slice C (Forge presence): the Forge scene as a sense (see
   * GhostForgeSceneContext) — the nodes the ghost is standing
   * among, with the scene's revision. Absent whenever the Forge
   * is not the loaded fabric or no scene summary has been fed,
   * so every legacy scenario and the whole v1 dataset stay
   * byte-identical.
   */
  forge_scene?: GhostForgeSceneContext;
  /**
   * Slice D (Checkers on the Forge): the live checkers game
   * (see GhostForgeGameContext) — the position, the side to
   * move, and, on the ghost's turn, the ENUMERATED legal moves
   * it may choose among. Absent whenever no game is live on
   * the Forge, so every legacy scenario and the whole v1
   * dataset stay byte-identical.
   */
  forge_game?: GhostForgeGameContext;
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

/* ------------------------------------------------------------------ */
/* GenX sense (Slice 36, "The Fold")                                   */
/* ------------------------------------------------------------------ */
/*
 * The v2 sense field for the distributed-compute fabric (dataset
 * schema v2 gains `genx` in this change): the ghost's digest of
 * the room's compute field — how many contributors are in it,
 * how much of the joined power is mid-shard, the active fold's
 * verified progress, whether a bridged GenX node's Folding@home
 * is online (the node's own report), and how many shards have
 * gone quiet past the stall window. Every number is derived from
 * the field state (src/genx/fieldState.senseSnapshotOf): counts
 * and ratios of real events, never impressions.
 *
 * Like `fabric`, `gestures` and `utterance`, the field is ABSENT
 * whenever the sense has nothing to report — which is every
 * legacy/dataset scenario and every room where the Fold is not
 * the loaded fabric — so absence changes nothing, anywhere.
 *
 * The two one-shot flags are the peer's transition marks
 * (GhostPeer.noteGenx sets them on the completion / stall-onset
 * transitions and buildScenario consumes them exactly once):
 * they let the on-device overlay answer an EVENT (the fold just
 * finished; a shard just stalled) instead of re-answering a
 * state on every deliberation while it holds.
 */
export interface GhostGenxContext {
  /** Contributors in the field: joined devices + a reporting node. */
  nodes_online: number;
  /** 0..1 — share of joined devices currently mid-shard. */
  field_load: number;
  /** 0..1 — verified shards / total shards of the active fold. */
  mission_progress: number;
  shards_done: number;
  shards_total: number;
  /** A bridged GenX node's FAH reports ONLINE. */
  fah_online: boolean;
  /** Shards silent past the stall window right now. */
  stalled: number;
  /** One-shot: the fold completed since the last deliberation. */
  fold_just_completed: boolean;
  /** One-shot: a shard crossed into stalled since the last deliberation. */
  shard_just_stalled: boolean;
}

/**
 * Clamp an unknown value to a GhostGenxContext, or null when it
 * is not one — the sanitizeFabricContext discipline: garbled
 * field data must never reach the brain as fact. Counts clamp
 * to sane ranges, ratios to [0,1], done never exceeds total,
 * and the one-shot flags pass only as strict booleans.
 */
export function sanitizeGenxContext(
  raw: unknown
): GhostGenxContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const int = (v: unknown, hi: number): number =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(hi, Math.max(0, Math.floor(v)))
      : 0;
  const ratio = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(1, Math.max(0, v))
      : 0;
  const shardsTotal = int(rec.shards_total, 4096);
  return {
    nodes_online: int(rec.nodes_online, 256),
    field_load: ratio(rec.field_load),
    mission_progress: ratio(rec.mission_progress),
    shards_done: Math.min(int(rec.shards_done, 4096), shardsTotal),
    shards_total: shardsTotal,
    fah_online: rec.fah_online === true,
    stalled: int(rec.stalled, 4096),
    fold_just_completed: rec.fold_just_completed === true,
    shard_just_stalled: rec.shard_just_stalled === true,
  };
}

/* ------------------------------------------------------------------ */
/* Forge scene sense (Slice C — Forge presence)                        */
/* ------------------------------------------------------------------ */
/*
 * The scene the ghostie is standing in, as a sense — the genx
 * precedent (GhostGenxContext) applied to the Forge: the host
 * (ForgeLayer) summarizes the live agent-scene — its nodes with
 * geometry kind and hex color, plus the scene's revision — and
 * the peer's scenario carries the summary while it is fresh, so
 * deliberation on the Forge is about the ACTUAL scene: a brain
 * that wants to move or recolor a node can see which nodes
 * exist. Bounded hard: at most FORGE_SCENE_SUMMARY_MAX_NODES
 * nodes, ids through the forge node-id law, colors as #rrggbb
 * or null (unreadable), geometry kinds clamped to the forge
 * vocabulary with anything unrecognized reported as "other".
 * Like every sense field it is ABSENT whenever the Forge is not
 * the loaded fabric — absence changes nothing, anywhere.
 */

/** One node of the Forge scene, as the sense reports it. */
export interface GhostForgeSceneNode {
  /** The scene node id (the forge node-id law). */
  id: string;
  /** Geometry kind: a forge geometry, or "other" when unrecognized. */
  geometry: GhostForgeGeometry | "other";
  /** The node's material color as #rrggbb, or null when unreadable. */
  color: string | null;
}

/** The Forge scene summary a scenario may carry. */
export interface GhostForgeSceneContext {
  /** The agent-scene revision the summary was taken at. */
  revision: number;
  /** The scene's nodes, capped at FORGE_SCENE_SUMMARY_MAX_NODES. */
  nodes: GhostForgeSceneNode[];
}

/** Hard cap on the nodes a scene summary may carry. */
export const FORGE_SCENE_SUMMARY_MAX_NODES = 24;

/**
 * Clamp an unknown value to a GhostForgeSceneContext, or null
 * when it is not one — the sanitizeGenxContext discipline:
 * garbled scene data must never reach the brain as fact. The
 * revision clamps to a non-negative integer; node ids pass the
 * forge node-id law (sanitizeForgeNodeId) or the node is
 * dropped; geometry clamps to the forge vocabulary, else
 * "other"; color passes the forge color law, else null.
 */
export function sanitizeForgeSceneContext(
  raw: unknown
): GhostForgeSceneContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const revision =
    typeof rec.revision === "number" && Number.isFinite(rec.revision)
      ? Math.max(0, Math.floor(rec.revision))
      : 0;
  const rawNodes = Array.isArray(rec.nodes) ? rec.nodes : [];
  const nodes: GhostForgeSceneNode[] = [];
  for (const entry of rawNodes) {
    if (nodes.length >= FORGE_SCENE_SUMMARY_MAX_NODES) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const n = entry as Record<string, unknown>;
    const id = sanitizeForgeNodeId(n.id);
    if (!id) continue;
    const geometry = (GHOST_FORGE_GEOMETRIES as readonly string[]).includes(
      n.geometry as string
    )
      ? (n.geometry as GhostForgeGeometry)
      : "other";
    nodes.push({ id, geometry, color: sanitizeForgeColor(n.color) });
  }
  return { revision, nodes };
}

/**
 * The summary's change signature — the peer's dirty gate keys
 * on it: two summaries with the same signature are the same
 * room, and feeding one must not re-arm deliberation. Pure and
 * total over sanitized contexts.
 */
export function forgeSceneSignature(ctx: GhostForgeSceneContext): string {
  return (
    `${ctx.revision}|` +
    ctx.nodes.map((n) => `${n.id}:${n.geometry}:${n.color ?? "-"}`).join(",")
  );
}

/* ------------------------------------------------------------------ */
/* The checkers game sense (Slice D, "Checkers on the Forge")          */
/* ------------------------------------------------------------------ */
/*
 * A game of checkers is live on the Forge board, and the
 * ghostie is one of its players. The sense is the game's truth
 * as the referee (checkersGame, over the pure checkersEngine)
 * states it: the position, the side to move, and — only on the
 * ghost's turn — the legal moves ENUMERATED by the rules
 * engine, each carrying its destination as a scene position
 * (the forge-move payload) and the facts an honest chooser
 * needs (how much it captures, whether it crowns, whether the
 * moved piece hangs). The ghost PICKS a move; it never invents
 * one — the referee refuses anything not enumerated, exactly
 * as the manifest refuses tools a fabric doesn't offer.
 *
 * The on-device floor answers a game turn through the
 * heuristic evaluator below (checkersDecisionFor): capture
 * value, crowning, advancement, and the hanging flag, weighted
 * by temperament — a decision-table tier in this file's own
 * tradition (draw/note/genx/music overlays), deterministic in
 * the position + the ghost's identity, so the same ghost in
 * the same position makes the same choice. The model tiers
 * get the same facts as prose (describeForgeGameForSpark).
 * The trained ghost-v5 model has never seen a game either —
 * until a dataset revision teaches it, the game is carried by
 * the in-browser brain + this floor, and nothing claims more.
 */

/** The two checkers sides (the Forge palette's piece colors). */
export type GhostForgeGameSide = "coral" | "teal";

/** One piece on the board, as the game sense reports it. */
export interface GhostForgeGamePiece {
  /** The scene node id of the piece (checkers-pc-<piece id>). */
  node: string;
  side: GhostForgeGameSide;
  king: boolean;
}

/** One enumerated legal move on the ghost's turn. */
export interface GhostForgeGameMoveOption {
  /** The scene node id of the piece to move. */
  node: string;
  /** The destination as a scene position (the forge-move payload). */
  position: [number, number, number];
  /** Pieces this move captures, chain total (0 for a quiet move). */
  captures: number;
  /** True when any captured piece is a king. */
  captures_king: boolean;
  /** True when this move crowns the piece. */
  kinging: boolean;
  /** True when the moved piece can be captured right back. */
  exposes: boolean;
  /** Rows advanced toward the crowning rank (men); 0 for kings. */
  advance: number;
}

/** The live checkers game a scenario may carry. */
export interface GhostForgeGameContext {
  /** The side the GHOST plays in this game. */
  ghost_side: GhostForgeGameSide;
  /** The side to move. */
  to_move: GhostForgeGameSide;
  /** True when the side to move is the ghost's. */
  ghost_to_move: boolean;
  /** Half-moves played so far. */
  move_number: number;
  /** The position, capped at FORGE_GAME_MAX_PIECES. */
  pieces: GhostForgeGamePiece[];
  /** The ghost's enumerated legal moves (its turn only). */
  legal_moves: GhostForgeGameMoveOption[];
  /** The last completed move's headline event, if any. */
  last_event: "capture" | "kinging" | "win" | null;
  /** A one-shot referee note (e.g. a refused illegal move). */
  referee_note: string | null;
}

export const FORGE_GAME_MAX_PIECES = 24;
export const FORGE_GAME_MAX_MOVES = 48;

function sanitizeForgeGameSide(raw: unknown): GhostForgeGameSide | null {
  return raw === "coral" || raw === "teal" ? raw : null;
}

function sanitizeForgeGamePosition(
  raw: unknown
): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out.push(Math.max(-12, Math.min(12, v)));
  }
  return [out[0], out[1], out[2]];
}

/**
 * Clamp an unknown value to a GhostForgeGameContext, or null
 * when it is not one — the sense discipline of its siblings:
 * garbled game data must never reach the brain as fact. Sides
 * clamp to the two real sides; node ids pass the forge
 * node-id law or the entry drops; positions clamp to the
 * forge position limit; lists cap at the sense's bounds.
 * A context whose ghost_side/to_move don't parse is not a
 * game at all and reads as null.
 */
export function sanitizeForgeGameContext(
  raw: unknown
): GhostForgeGameContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const ghostSide = sanitizeForgeGameSide(rec.ghost_side);
  const toMove = sanitizeForgeGameSide(rec.to_move);
  if (!ghostSide || !toMove) return null;
  const pieces: GhostForgeGamePiece[] = [];
  for (const entry of Array.isArray(rec.pieces) ? rec.pieces : []) {
    if (pieces.length >= FORGE_GAME_MAX_PIECES) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const p = entry as Record<string, unknown>;
    const node = sanitizeForgeNodeId(p.node);
    const side = sanitizeForgeGameSide(p.side);
    if (!node || !side) continue;
    pieces.push({ node, side, king: p.king === true });
  }
  const legalMoves: GhostForgeGameMoveOption[] = [];
  for (const entry of Array.isArray(rec.legal_moves) ? rec.legal_moves : []) {
    if (legalMoves.length >= FORGE_GAME_MAX_MOVES) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const m = entry as Record<string, unknown>;
    const node = sanitizeForgeNodeId(m.node);
    const position = sanitizeForgeGamePosition(m.position);
    if (!node || !position) continue;
    legalMoves.push({
      node,
      position,
      captures:
        typeof m.captures === "number" && Number.isFinite(m.captures)
          ? Math.max(0, Math.floor(m.captures))
          : 0,
      captures_king: m.captures_king === true,
      kinging: m.kinging === true,
      exposes: m.exposes === true,
      advance:
        typeof m.advance === "number" && Number.isFinite(m.advance)
          ? Math.max(0, Math.min(7, Math.floor(m.advance)))
          : 0,
    });
  }
  const lastEvent =
    rec.last_event === "capture" ||
    rec.last_event === "kinging" ||
    rec.last_event === "win"
      ? rec.last_event
      : null;
  return {
    ghost_side: ghostSide,
    to_move: toMove,
    ghost_to_move: rec.ghost_to_move === true && toMove === ghostSide,
    move_number:
      typeof rec.move_number === "number" && Number.isFinite(rec.move_number)
        ? Math.max(0, Math.floor(rec.move_number))
        : 0,
    pieces,
    legal_moves: legalMoves,
    last_event: lastEvent,
    referee_note:
      typeof rec.referee_note === "string" && rec.referee_note.length > 0
        ? rec.referee_note.slice(0, 200)
        : null,
  };
}

/**
 * The game sense's change signature — the peer's dirty gate
 * keys on it: a changed position (or a changed turn) is a
 * changed room; an identical re-feed never re-arms.
 */
export function forgeGameSignature(ctx: GhostForgeGameContext): string {
  return (
    `${ctx.move_number}|${ctx.to_move}|${ctx.ghost_to_move ? 1 : 0}|` +
    ctx.pieces.map((p) => `${p.node}:${p.king ? "K" : "m"}`).join(",") +
    "|" +
    ctx.legal_moves
      .map((m) => `${m.node}>${m.position.map((v) => v.toFixed(2)).join("/")}`)
      .join(",") +
    `|${ctx.last_event ?? "-"}|${ctx.referee_note ?? "-"}`
  );
}

/**
 * The on-device floor's answer to a game turn (Slice D): a
 * heuristic evaluator over the ENUMERATED legal moves — the
 * distilled decision-table tier playing checkers, in the
 * overlay tradition of this file. Scores capture value (a
 * king is worth more), crowning, advancement toward the crown
 * rank, and the hanging flag; temperament tilts the weights
 * (playful/sassy hunt, curious crowns, affectionate guards its
 * pieces, sleepy takes the quiet road); ties break by a
 * rotation seeded from the ghost's own hue, so the choice is
 * deterministic in the position + the ghost — the same ghost
 * in the same position plays the same move, and a different
 * ghost may differ. Returns a validated forge-move decision,
 * or null when it is not the ghost's turn (the sense is then
 * just a room it is watching).
 */
export function checkersDecisionFor(
  scenario: GhostScenario
): { decision: GhostDecision; ruleId: string } | null {
  const game = scenario.forge_game;
  if (!game || !game.ghost_to_move) return null;
  if (game.legal_moves.length === 0) return null;
  const weights = {
    capture: 100,
    captureKing: 50,
    kinging: 80,
    advance: 6,
    exposes: -55,
  };
  switch (scenario.temperament) {
    case "playful":
    case "sassy":
      weights.capture *= 1.5;
      weights.advance *= 1.25;
      break;
    case "curious":
      weights.kinging *= 1.5;
      weights.advance *= 1.2;
      break;
    case "affectionate":
      weights.exposes *= 1.6;
      break;
    case "sleepy":
      weights.capture *= 0.7;
      weights.exposes *= 1.4;
      weights.kinging *= 0.8;
      break;
    default:
      break;
  }
  const scored = game.legal_moves.map((m) => ({
    move: m,
    score:
      m.captures * weights.capture +
      (m.captures_king ? weights.captureKing : 0) +
      (m.kinging ? weights.kinging : 0) +
      m.advance * weights.advance +
      (m.exposes ? weights.exposes : 0),
  }));
  const best = Math.max(...scored.map((s) => s.score));
  const tied = scored.filter((s) => s.score >= best - 3);
  const hue = Math.round(scenario.ghost_identity?.hue ?? 0);
  const pick = tied[Math.abs(hue) % tied.length].move;
  const decision = validateGhostDecision(
    {
      mood_shift: null,
      intent: "forge-move",
      pattern_id: null,
      draw_shape: null,
      note_name: null,
      sound_spec: null,
      music_phrase: null,
      forge_spec: { node: pick.node, position: [...pick.position] },
      intensity: 0.55,
      linger_s: 3,
    },
    scenario
  );
  if (!decision) return null;
  return { decision, ruleId: "checkers-move" };
}

/**
 * The game note for the model tiers (Slice D): the position
 * and — on the ghost's turn — the enumerated legal moves, with
 * the referee law stated plainly. Rides buildSparkMessages
 * only when the scenario carries a game, so deliberations
 * anywhere else are byte-unchanged.
 */
export function describeForgeGameForSpark(
  scenario: GhostScenario
): string | null {
  const g = scenario.forge_game;
  if (!g) return null;
  const mine = g.pieces.filter((p) => p.side === g.ghost_side).length;
  const theirs = g.pieces.length - mine;
  let text =
    `A checkers game is live on the Forge board. You play the ${g.ghost_side} pieces ` +
    `(${mine} of yours on the board, ${theirs} opposing), move ${g.move_number} played, ` +
    `${g.to_move} to move.`;
  if (g.last_event === "capture") {
    text += " The last move captured a piece.";
  } else if (g.last_event === "kinging") {
    text += " The last move crowned a king.";
  } else if (g.last_event === "win") {
    text += " The game has been decided.";
  }
  if (g.referee_note) {
    text += ` Referee: ${g.referee_note}`;
  }
  if (g.ghost_to_move) {
    const list = g.legal_moves
      .map(
        (m) =>
          `${m.node} -> [${m.position.join(", ")}]` +
          (m.captures > 0 ? ` (captures ${m.captures}${m.captures_king ? ", including a king" : ""})` : "") +
          (m.kinging ? " (crowns a king)" : "") +
          (m.exposes ? " (the piece can be captured back)" : "")
      )
      .join("; ");
    text +=
      ` It is YOUR turn. Your legal moves are exactly these — answer ` +
      `forge-move with one listed node id and its position, nothing else is legal: ${list}.`;
  } else {
    text += " It is not your turn — watch the board; do not move.";
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Forge scene tools (Slice B)                                         */
/* ------------------------------------------------------------------ */
/*
 * The Forge fabric's ghost tools: seven intents that shape the
 * 67.js scene the ghostie is standing in — summon, banish, move,
 * recolor, reshape, relight, and a camera drift. Each intent
 * carries ONE payload, forge_spec, and follows the schema law
 * draw/note/compose set before it: the intent REQUIRES a valid
 * payload (a forge act without one is not a decision), a
 * forge_spec on any other intent is dropped, and the fabric
 * manifest is the tools' only fabric law — they are offered on
 * the Forge and nowhere else (GHOST_FORGE_TOOL_IDS).
 *
 * The vocabularies below are the PERFORMER's vocabulary mirrored
 * by hand (this module stays import-free): the geometry kinds
 * name the starter scene's shared geometries in
 * src/components/forge/forgeScene.ts, the light presets and
 * camera directions name the translations in
 * src/components/forge/forgePerformer.ts. forge-tools-check
 * asserts the mirrors never drift apart.
 *
 * Honesty note: the trained ghost model (ghost-v5) has never
 * seen these intents — its dataset predates the Forge. Until a
 * dataset revision teaches it, the forge intents are reachable
 * only through the in-browser brain (whose prompts carry the
 * contract below) and the harness manifest, never claimed for
 * the trained model.
 */

/** Geometry kinds a forge act may name — the starter geometries. */
export const GHOST_FORGE_GEOMETRIES = [
  "box",
  "sphere",
  "cylinder",
  "torus",
] as const;
export type GhostForgeGeometry = (typeof GHOST_FORGE_GEOMETRIES)[number];

/** Lighting presets a relight may name (performer translations). */
export const GHOST_FORGE_LIGHT_PRESETS = [
  "studio",
  "warm",
  "dusk",
  "cool",
  "bright",
] as const;
export type GhostForgeLightPreset =
  (typeof GHOST_FORGE_LIGHT_PRESETS)[number];

/** Camera drifts a forge-camera act may name. */
export const GHOST_FORGE_CAMERA_DIRECTIONS = [
  "orbit-left",
  "orbit-right",
  "rise",
  "sink",
  "closer",
  "wider",
] as const;
export type GhostForgeCameraDirection =
  (typeof GHOST_FORGE_CAMERA_DIRECTIONS)[number];

/** The forge intents, as a set the gates can ask about. */
export const GHOST_FORGE_INTENTS = [
  "forge-summon",
  "forge-banish",
  "forge-move",
  "forge-recolor",
  "forge-reshape",
  "forge-relight",
  "forge-camera",
] as const;

export function isGhostForgeIntent(intent: unknown): boolean {
  return (
    typeof intent === "string" &&
    (GHOST_FORGE_INTENTS as readonly string[]).includes(intent)
  );
}

/**
 * One forge act's payload, in the decision's own (wire) shape.
 * Only the fields the act's intent names are present — the
 * sanitizer returns exactly the act's own fields, nothing else.
 */
export interface GhostForgeSpec {
  /** summon + reshape: the geometry kind to bring in / become. */
  geometry?: GhostForgeGeometry;
  /** summon + recolor: an sRGB hex color, "#rrggbb". */
  color?: string;
  /** banish/move/recolor/reshape: the scene node id acted on. */
  node?: string;
  /** summon + move: authored position [x, y, z], clamped below. */
  position?: [number, number, number];
  /** relight: the lighting preset to move the scene to. */
  preset?: GhostForgeLightPreset;
  /** camera: the drift to apply to the scene's camera. */
  direction?: GhostForgeCameraDirection;
}

/** Node ids are recipe ids: word characters, dashes, underscores. */
const GHOST_FORGE_NODE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const GHOST_FORGE_HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** Authored positions stay near the stage the starter scene sets. */
const GHOST_FORGE_POSITION_LIMIT = 12;

function sanitizeForgeNodeId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (id.length === 0 || id.length > 64) return null;
  return GHOST_FORGE_NODE_ID_RE.test(id) ? id : null;
}

function sanitizeForgePosition(
  raw: unknown
): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out.push(
      Math.min(
        GHOST_FORGE_POSITION_LIMIT,
        Math.max(-GHOST_FORGE_POSITION_LIMIT, v)
      )
    );
  }
  return [out[0], out[1], out[2]];
}

function sanitizeForgeColor(raw: unknown): string | null {
  if (typeof raw !== "string" || !GHOST_FORGE_HEX_RE.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}

/**
 * Clamp an unknown value to the forge_spec the intent requires,
 * or null when it is not one — the sanitizeGhostSoundSpec
 * discipline: per-intent required fields, values clamped to the
 * vocabularies, and nothing beyond the act's own fields carried.
 */
export function sanitizeForgeSpec(
  intent: GhostIntent,
  raw: unknown
): GhostForgeSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  switch (intent) {
    case "forge-summon": {
      const geometry = rec.geometry;
      if (
        typeof geometry !== "string" ||
        !(GHOST_FORGE_GEOMETRIES as readonly string[]).includes(geometry)
      ) {
        return null;
      }
      const color = sanitizeForgeColor(rec.color);
      if (!color) return null;
      const spec: GhostForgeSpec = {
        geometry: geometry as GhostForgeGeometry,
        color,
      };
      if (rec.position !== undefined && rec.position !== null) {
        const position = sanitizeForgePosition(rec.position);
        if (!position) return null;
        spec.position = position;
      }
      return spec;
    }
    case "forge-banish": {
      const node = sanitizeForgeNodeId(rec.node);
      return node ? { node } : null;
    }
    case "forge-move": {
      const node = sanitizeForgeNodeId(rec.node);
      const position = sanitizeForgePosition(rec.position);
      return node && position ? { node, position } : null;
    }
    case "forge-recolor": {
      const node = sanitizeForgeNodeId(rec.node);
      const color = sanitizeForgeColor(rec.color);
      return node && color ? { node, color } : null;
    }
    case "forge-reshape": {
      const node = sanitizeForgeNodeId(rec.node);
      const geometry = rec.geometry;
      if (
        !node ||
        typeof geometry !== "string" ||
        !(GHOST_FORGE_GEOMETRIES as readonly string[]).includes(geometry)
      ) {
        return null;
      }
      return { node, geometry: geometry as GhostForgeGeometry };
    }
    case "forge-relight": {
      const preset = rec.preset;
      if (
        typeof preset !== "string" ||
        !(GHOST_FORGE_LIGHT_PRESETS as readonly string[]).includes(preset)
      ) {
        return null;
      }
      return { preset: preset as GhostForgeLightPreset };
    }
    case "forge-camera": {
      const direction = rec.direction;
      if (
        typeof direction !== "string" ||
        !(GHOST_FORGE_CAMERA_DIRECTIONS as readonly string[]).includes(
          direction
        )
      ) {
        return null;
      }
      return { direction: direction as GhostForgeCameraDirection };
    }
    default:
      return null;
  }
}

/**
 * A forge decision in plain words — the journal / performance
 * line the peer speaks for the act (GhostPeer's forge
 * performance; the performer's own outcomes stay structured).
 */
export function ghostForgeActLabel(decision: GhostDecision): string {
  const spec = decision.forge_spec;
  switch (decision.intent) {
    case "forge-summon":
      return `summoned a ${spec?.geometry ?? "shape"} into the scene`;
    case "forge-banish":
      return `banished ${spec?.node ?? "a shape"} from the scene`;
    case "forge-move":
      return `moved ${spec?.node ?? "a shape"}`;
    case "forge-recolor":
      return `recolored ${spec?.node ?? "a shape"}`;
    case "forge-reshape":
      return `reshaped ${spec?.node ?? "a shape"} into a ${spec?.geometry ?? "shape"}`;
    case "forge-relight":
      return `relit the scene — ${spec?.preset ?? "studio"} light`;
    case "forge-camera":
      return `drifted the camera ${spec?.direction ?? ""}`.trim();
    default:
      return decision.intent;
  }
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
  /** Slice 52: the SOUND-CRAFT tool's composition; null unless intent is "compose". */
  sound_spec: GhostSoundSpec | null;
  /** Slice 68: the PLAY-MUSIC tool's authored phrase; null unless intent is "play-music". */
  music_phrase: GhostMusicPhrase | null;
  /** Slice B: the FORGE tools' act spec; null unless the intent is a forge intent. */
  forge_spec: GhostForgeSpec | null;
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
 *   - the FORGE intents (Slice B) follow the same discipline
 *     again: each REQUIRES a forge_spec that sanitizes for its
 *     own act, a forge_spec on any other intent is dropped, and
 *     their only fabric law is the manifest gate above (the
 *     Forge offers them; every other declared fabric refuses
 *     the intent before this point is reached);
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

  // Slice 47: the fabric manifest gate. The intent's TOOL must
  // be one the loaded fabric offers — a piano ghost reaches for
  // piano-shaped acts, a stage ghost never splats. The host
  // rules gates below still apply on top (manifest = what the
  // fabric HAS; rules = what the host ALLOWS this session).
  if (scenario && !fabricAllowsIntent(scenario, intent as GhostIntent)) {
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

  // Slice 52: "compose" carries the same structural discipline
  // again — the sound_spec is required and must sanitize to a
  // real composition, and a sound_spec on any other intent is
  // dropped. Its fabric law is the manifest gate above (the
  // fluid and the playground offer sound-craft; other declared
  // fabrics refuse the intent before this point is reached).
  let soundSpec: GhostSoundSpec | null = null;
  if (intent === "compose") {
    soundSpec = sanitizeGhostSoundSpec(d.sound_spec);
    if (!soundSpec) return null;
  }

  // Slice 68: "play-music" carries the same structural
  // discipline again — the music_phrase is required and must
  // sanitize to a real authored phrase — PLUS the standing-
  // request law: the intent validates only when the scenario
  // carries a DUE music request. The Generative-music toggle
  // is the human's standing ask; no tier may invent music
  // nobody asked for, and a phrase on any other intent is
  // dropped, never fatal.
  let musicPhrase: GhostMusicPhrase | null = null;
  if (intent === "play-music") {
    musicPhrase = sanitizeGhostMusicPhrase(d.music_phrase);
    if (!musicPhrase) return null;
    if (scenario && scenario.music?.due !== true) return null;
  }

  // Slice B: the forge intents carry the same structural
  // discipline again — the forge_spec is required and must
  // sanitize for the act named, and a forge_spec on any other
  // intent is dropped. Their fabric law is the manifest gate
  // above: the Forge offers the forge tools, and every other
  // declared fabric refuses these intents before this point.
  let forgeSpec: GhostForgeSpec | null = null;
  if (isGhostForgeIntent(intent)) {
    forgeSpec = sanitizeForgeSpec(intent as GhostIntent, d.forge_spec);
    if (!forgeSpec) return null;
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
    sound_spec: soundSpec,
    music_phrase: musicPhrase,
    forge_spec: forgeSpec,
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
 * The manifest gate's refusal, named — the draw/note namers'
 * sibling (Slice 47): the value IS a well-formed decision, but
 * its intent's tool is not one the scenario's fabric offers.
 * Consult paths ask the draw/note namers first (a host rule
 * refusal is the more specific story); this namer fires only
 * when the manifest is the gate that refused.
 */
export function ghostManifestRefusal(
  raw: unknown,
  scenario?: GhostScenario
): string | null {
  if (!scenario || !scenario.fabric) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (
    typeof d.intent !== "string" ||
    !(GHOST_INTENTS as readonly string[]).includes(d.intent)
  ) {
    return null;
  }
  const intent = d.intent as GhostIntent;
  if (fabricAllowsIntent(scenario, intent)) return null;
  // A malformed payload is invalid on its own, not gate-refused.
  if (intent === "draw") {
    if (
      typeof d.draw_shape !== "string" ||
      !(GHOST_DRAW_SHAPES as readonly string[]).includes(d.draw_shape)
    ) {
      return null;
    }
  }
  if (intent === "play-note" && !isGhostNoteName(d.note_name)) return null;
  if (intent === "compose" && !sanitizeGhostSoundSpec(d.sound_spec)) {
    return null;
  }
  // Slice B: a forge intent with a malformed forge_spec died on
  // its own shape, not on the manifest — the same discipline.
  if (
    isGhostForgeIntent(intent) &&
    !sanitizeForgeSpec(intent, d.forge_spec)
  ) {
    return null;
  }
  return `${GHOST_MANIFEST_REFUSAL_TEXT} (${GHOST_INTENT_TOOL[intent]} on ${scenario.fabric.layer_id})`;
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
  sound_spec: null,
  music_phrase: null,
  forge_spec: null,
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
    if (!isGhostNoteLayer(scenario.fabric.layer_id)) return null;
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

/* ------------------------------------------------------------------ */
/* The GenX overlay (Slice 36)                                         */
/* ------------------------------------------------------------------ */
/*
 * The ghost does not compute and does not allocate — it NOTICES
 * the field, the way it notices a hand or a voice. This overlay
 * answers only the two discrete events the peer marks one-shot
 * on the scenario:
 *
 *   - the fold just completed (every shard the room was working
 *     on reached its verdict): the ghost celebrates with the
 *     room — a play, in its own hue, through the ordinary emit
 *     budgets. A completion with failed shards still celebrates
 *     the verified work; the ledger, not the ghost, keeps the
 *     exact count.
 *   - a shard just stalled (its device went quiet mid-work):
 *     the ghost attends — a sniff toward the field, curiosity
 *     at the gap. It cannot reassign the shard (the allocator
 *     does that, on the same stall fact, through the room
 *     protocol); it can only notice, which is a peer's job.
 *
 * Neither answer is a draw or a note, so no fabric rule gates
 * them; the shared validator and the peer's budgets bind them
 * exactly as they bind every other decision. A scenario without
 * the genx field — every legacy scenario — never reaches here.
 */
export function genxDecisionFor(
  scenario: GhostScenario
): { decision: GhostDecision; ruleId: string } | null {
  const genx = scenario.genx;
  if (!genx) return null;
  if (genx.fold_just_completed && genx.shards_total > 0) {
    const decision = validateGhostDecision(
      {
        mood_shift: null,
        intent: "play",
        pattern_id: null,
        draw_shape: null,
        note_name: null,
        intensity: 0.65,
        linger_s: 4,
      },
      scenario
    );
    if (decision) return { decision, ruleId: "genx-fold-complete" };
  }
  if (genx.shard_just_stalled && genx.stalled > 0) {
    const decision = validateGhostDecision(
      {
        mood_shift: null,
        intent: "sniff",
        pattern_id: null,
        draw_shape: null,
        note_name: null,
        intensity: 0.5,
        linger_s: 3,
      },
      scenario
    );
    if (decision) return { decision, ruleId: "genx-shard-stalled" };
  }
  return null;
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
/* ------------------------------------------------------------------ */
/* Generative music (Slice 68, "the brain plays")                      */
/* ------------------------------------------------------------------ */
/*
 * Terrell's call (Nov 4, 2026): "Generative music seems to just
 * play music rather than give the model the tools it needs to
 * do so — if no intelligence is attached to this, it's mockup
 * work." He was right about the build he was looking at: the
 * toggle mounted a standalone sequencer (a fixed scale loop, a
 * fixed triad cycle, or Math.random over a scale pool) that no
 * part of the ghost's decision path ever fed.
 *
 * This section is the fix, built the way every other ghost act
 * is built — a decision, not a player:
 *
 *   - The toggle is a STANDING REQUEST from the human. While it
 *     is on, the host (GhostPeer) feeds the request into the
 *     deliberation scenario (scenario.music) and, on the
 *     phrase clock, marks one deliberation DUE. Only a due
 *     deliberation may answer with music — the validator
 *     refuses "play-music" without a due request, so no brain
 *     tier can invent music nobody asked for.
 *   - The phrase is AUTHORED here, by the overlay below, from
 *     the same digest every other overlay reads: temperament,
 *     the last note a human played (recent_events), the last
 *     note the ghost itself played, room energy trend, quiet
 *     length — plus the human's musical framing from the
 *     toggle's own controls (scale = the key they chose,
 *     tempo, and the pattern control demoted to a HINT the
 *     brain weighs and may depart from, the way a musician
 *     treats a requested style). Nothing in the phrase comes
 *     from a fixed sequence, and the walk is seeded by the
 *     ghost's identity + phrase count + state, so the same
 *     ghost in the same state plays the same phrase (its
 *     choices are ITS choices, reproducible) while a different
 *     state — another temperament, another heard note, a
 *     rising room — authors a different one. The check script
 *     proves both halves.
 *   - A MIDI pack seed may ride the request (pack_notes, from
 *     the pack seam in midiPhrase.ts): when one does, the
 *     brain QUOTES its contour — transposed into the chosen
 *     scale — and then varies onward in its own temperament.
 *     Selection and variation, authored like everything else.
 *   - The renderer (AutoComposer) is demoted to a loudspeaker:
 *     it schedules exactly the authored phrase on its synth
 *     and chooses nothing. If the ghost is off or absent in
 *     the layer, no phrases are authored and the music is
 *     SILENT — the honest semantics of "your ghostie plays
 *     for you": no ghost, no performance. The old standalone
 *     sequencer is deleted, not kept as a fallback.
 *
 * Slice 70 (the chorale) adds the ensemble seat: while a
 * performance with other ghosties stands, the context carries
 * the ghost's derived part (ctx.ensemble) and the scale /
 * tempo / tonic are the CONDUCTOR's — the overlay authors its
 * own part-line inside the part's band (bass low, long and
 * tonic-anchored; inner voices sparse and chord-bound; the
 * soprano keeps the melodic authoring), still from the same
 * digest, still under the same due law. No new intent, no new
 * tool: an ensemble phrase is a play-music decision, authored
 * under one more constraint.
 */

/** The four scales the toggle offers — semitone offsets over a tonic. */
export const GHOST_MUSIC_SCALES: Record<string, readonly number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

/** One authored note in a phrase: bus vocabulary, placed on the step grid. */
export interface GhostMusicPhraseNote {
  note: string;
  step: number;
  len_steps: number;
  velocity: number;
}

/** A phrase the brain authored: notes on a step grid at a tempo. */
export interface GhostMusicPhrase {
  bpm: number;
  steps: number;
  notes: GhostMusicPhraseNote[];
}

/**
 * The standing Generative-music request, riding the scenario
 * (Slice 68). Built by GhostPeer from the layer's music config
 * while the toggle is on; `due` is the one-shot phrase-clock
 * mark — it is true on exactly the deliberations the clock
 * fired, and it is what licenses a "play-music" decision.
 */
export interface GhostMusicContext {
  due: boolean;
  scale: string;
  pattern_hint: string;
  tempo_bpm: number;
  phrase_index: number;
  last_played_note: string | null;
  last_phrase_signature: string | null;
  pack_notes: number[] | null;
  /**
   * Slice 70: the chorale ensemble, when this ghostie is
   * seated in a live performance with other ghosties (see
   * GhostEnsembleContext). Absent/null solo — authoring is
   * Slice 68 exactly. GhostPeer fills it from the chorale's
   * tick; the scale / tempo_bpm fields above already carry
   * the CONDUCTOR's framing while it stands, so an ensemble
   * phrase is authored in the room's key at the room's tempo.
   */
  ensemble?: GhostEnsembleContext | null;
}

/** A voice part in a chorale ensemble (chorale.ts's ChoralePart). */
export type GhostMusicPart = "bass" | "tenor" | "alto" | "soprano";

/**
 * The ensemble seat this ghostie sings from (Slice 70): its
 * derived part, how many voices are actually heard, the
 * shared position on the room's beat clock, whether THIS
 * ghostie conducts, and the performance's tonic (the
 * conductor's anchor — an ensemble phrase is authored around
 * the room's tonic, not the ghost's own last note).
 */
export interface GhostEnsembleContext {
  part: GhostMusicPart;
  voices: number;
  position_beats: number;
  conducting: boolean;
  tonic_midi: number | null;
}

/** The refusal the registry names when no standing request is live. */
export const GHOST_MUSIC_REFUSAL_TEXT =
  "no standing music request in this fabric";

export const GHOST_MUSIC_PHRASE_STEPS = 16;
const GHOST_MUSIC_MAX_NOTES = 24;

/**
 * Clamp an unknown value to a GhostMusicPhrase, or null when it
 * is not one — the sanitizeGhostSoundSpec discipline: every
 * note must be in the bus vocabulary, placed inside the grid,
 * and the phrase must actually contain notes (an empty phrase
 * is not a decision).
 */
export function sanitizeGhostMusicPhrase(
  raw: unknown
): GhostMusicPhrase | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const bpm =
    typeof rec.bpm === "number" && Number.isFinite(rec.bpm)
      ? Math.min(180, Math.max(40, Math.round(rec.bpm)))
      : 100;
  const steps =
    typeof rec.steps === "number" && Number.isFinite(rec.steps)
      ? Math.min(32, Math.max(4, Math.floor(rec.steps)))
      : GHOST_MUSIC_PHRASE_STEPS;
  if (!Array.isArray(rec.notes) || rec.notes.length === 0) return null;
  const notes: GhostMusicPhraseNote[] = [];
  const seenStarts = new Set<number>();
  for (const item of rec.notes.slice(0, GHOST_MUSIC_MAX_NOTES)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const n = item as Record<string, unknown>;
    if (!isGhostNoteName(n.note)) continue;
    const step =
      typeof n.step === "number" && Number.isFinite(n.step)
        ? Math.floor(n.step)
        : -1;
    if (step < 0 || step >= steps || seenStarts.has(step)) continue;
    seenStarts.add(step);
    const len =
      typeof n.len_steps === "number" && Number.isFinite(n.len_steps)
        ? Math.min(8, Math.max(1, Math.floor(n.len_steps)))
        : 1;
    const velocity =
      typeof n.velocity === "number" && Number.isFinite(n.velocity)
        ? Math.min(1, Math.max(0.05, n.velocity))
        : 0.6;
    notes.push({ note: n.note as string, step, len_steps: len, velocity });
  }
  if (notes.length === 0) return null;
  notes.sort((a, b) => a.step - b.step);
  return { bpm, steps, notes };
}

/** A phrase's identity, for the never-repeat-yourself law. */
export function ghostMusicPhraseSignature(phrase: GhostMusicPhrase): string {
  return phrase.notes.map((n) => `${n.step}:${n.note}`).join("|");
}

/** The phrase's length in seconds (steps are eighth notes). */
export function ghostMusicPhraseSeconds(phrase: GhostMusicPhrase): number {
  return (phrase.steps * 30) / phrase.bpm;
}

/** Small deterministic PRNG — the buildDrawRecipe discipline. */
function musicRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function musicSeedFor(scenario: GhostScenario, salt: number): number {
  const id = scenario.ghost_identity;
  // Slice 70: an ensemble phrase is also seeded by the seat it
  // is sung from (the seat spread's micro-variation, plan §3) —
  // solo phrases keep the Slice 68 seed exactly.
  const part = scenario.music?.ensemble?.part;
  const basis = `${id?.name ?? "Ghost"}|${Math.round(id?.hue ?? 0)}|${scenario.temperament}|${salt}${part ? `|${part}` : ""}`;
  let h = 2166136261;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Author one phrase from the ghost's live state. Pure: the same
 * scenario authors the same phrase. See the section header for
 * the laws it follows.
 */
function authorMusicPhrase(scenario: GhostScenario): GhostMusicPhrase | null {
  const ctx = scenario.music;
  if (!ctx) return null;
  const scale =
    GHOST_MUSIC_SCALES[ctx.scale] ?? GHOST_MUSIC_SCALES.ionian;
  const bpm = Math.min(180, Math.max(40, Math.round(ctx.tempo_bpm || 100)));
  const hint = ctx.pattern_hint;
  // Slice 70: while an ensemble performance stands, ctx.scale
  // and ctx.tempo_bpm already carry the conductor's framing
  // (GhostPeer adopts it into the scenario), and the ensemble
  // seat below constrains WHERE this ghostie's line lives.
  const ens = ctx.ensemble ?? null;

  // The tonic follows what the ghost last HEARD (a human's
  // played note rides recent_events) or last PLAYED; untouched
  // rooms start at C5, the old player's home octave.
  let heard: number | null = null;
  for (const label of scenario.recent_events) {
    const m = /^human played ([A-G]#?[0-8])$/.exec(label);
    if (m) heard = ghostNoteNumber(m[1]);
  }
  const anchor =
    heard ??
    (ctx.last_played_note && isGhostNoteName(ctx.last_played_note)
      ? ghostNoteNumber(ctx.last_played_note)
      : null) ??
    72;
  const tonicPc = ((anchor % 12) + 12) % 12;
  let tonic = 60 + tonicPc;
  while (tonic + 12 <= anchor) tonic += 12;
  // Slice 70: in an ensemble the tonic is the CONDUCTOR's —
  // the room's last note, read by the conductor — not this
  // ghost's own anchor. Every part is authored around it.
  if (ens && ens.tonic_midi !== null && ens.tonic_midi !== undefined) {
    tonic = Math.min(96, Math.max(36, Math.round(ens.tonic_midi)));
  }
  // The degree ladder: every scale note across two octaves
  // around the tonic, indexed so the walk can roam.
  const ladder: number[] = [];
  for (let midi = tonic - 12; midi <= tonic + 23; midi++) {
    const pc = (((midi - tonic) % 12) + 12) % 12;
    if (scale.includes(pc)) ladder.push(midi);
  }
  if (ladder.length < 7) return null;
  let degree = ladder.indexOf(tonic);
  if (degree < 0) degree = Math.floor(ladder.length / 2);

  // Slice 70: the part is a BAND on the ladder, derived from
  // the part's reference register the way seat_all measures
  // distance (bass lowest, soprano highest). Bass tops out at
  // the tonic it anchors on; soprano lives in the top band —
  // the two never share a note, so a duet's lines are disjoint
  // by construction. Inner voices overlap their neighbours,
  // as inner voices do. Solo, the band is the whole ladder:
  // Slice 68 authoring, unchanged.
  let bandLo = 0;
  let bandHi = ladder.length - 1;
  if (ens) {
    const T = degree;
    if (ens.part === "bass") {
      bandLo = 0;
      bandHi = T;
    } else if (ens.part === "tenor") {
      bandLo = Math.max(0, T - 2);
      bandHi = Math.min(ladder.length - 1, T + 5);
    } else if (ens.part === "alto") {
      bandLo = Math.min(ladder.length - 1, T + 2);
      bandHi = Math.min(ladder.length - 1, T + 9);
    } else {
      bandLo = Math.min(ladder.length - 1, T + 6);
      bandHi = ladder.length - 1;
    }
    degree = Math.max(bandLo, Math.min(bandHi, degree));
  }

  const t = scenario.temperament;
  let density =
    t === "playful" ? 11 : t === "curious" ? 9 : t === "affectionate" ? 8 : t === "sassy" ? 7 : 4;
  if (scenario.room_energy_trend === "rising") density += 2;
  if (scenario.room_energy_trend === "falling") density -= 2;
  if (scenario.seconds_since_human_touch > 60) density -= 1;
  density = Math.max(3, Math.min(14, density));
  // Slice 70: the bass line is the sparsest voice; inner
  // voices sit under the soprano's density.
  if (ens) {
    if (ens.part === "bass") density = Math.max(2, Math.ceil(density / 2));
    else if (ens.part === "tenor" || ens.part === "alto") {
      density = Math.max(3, Math.round(density * 0.7));
    }
  }

  const baseVelocity =
    t === "playful" ? 0.8 : t === "sassy" ? 0.72 : t === "curious" ? 0.65 : t === "affectionate" ? 0.6 : 0.45;

  const build = (salt: number): GhostMusicPhrase => {
    const rand = musicRng(
      musicSeedFor(scenario, (ctx.phrase_index + 1) * 7919 + salt)
    );
    const notes: GhostMusicPhraseNote[] = [];
    let deg = degree;
    // Pack quote: the seed phrase's contour, transposed into
    // this scale from the tonic, opens the phrase; the walk
    // varies onward from wherever the quote lands.
    const pack =
      ctx.pack_notes && ctx.pack_notes.length >= 3 ? ctx.pack_notes : null;
    let step = 0;
    if (pack) {
      const packRoot = pack[0];
      const quoteLen = Math.min(pack.length, 7);
      for (let i = 0; i < quoteLen && step < GHOST_MUSIC_PHRASE_STEPS; i++) {
        const target = tonic + (pack[i] - packRoot);
        // Slice 70: the quote lands inside the singer's band —
        // a bass quotes the contour low, a soprano high.
        let best = ladder[deg];
        let bestDist = Infinity;
        for (let li = bandLo; li <= bandHi; li++) {
          const d = Math.abs(ladder[li] - target);
          if (d < bestDist) {
            bestDist = d;
            best = ladder[li];
          }
        }
        deg = ladder.indexOf(best);
        notes.push({
          note: ghostNoteName(best),
          step,
          len_steps: 1,
          velocity: clamp(baseVelocity + (i === 0 ? 0.1 : 0), 0.3, 0.95),
        });
        step += 1;
      }
    }
    while (notes.length < density && step < GHOST_MUSIC_PHRASE_STEPS) {
      // Contour step by temperament — the ghostAnswerNote
      // lineage, widened from one answer note to a walk.
      let move: number;
      const roll = rand();
      if (t === "playful") {
        move = roll < 0.2 ? 0 : Math.round((rand() * 8 - 4) * 1.4);
      } else if (t === "curious") {
        move = roll < 0.55 ? 1 + Math.floor(rand() * 3) : -1;
      } else if (t === "affectionate") {
        move = Math.round(rand() * 4 - 2);
      } else if (t === "sassy") {
        move = roll < 0.18 ? -7 : Math.round(rand() * 4 - 3);
      } else {
        move = roll < 0.6 ? -1 : roll < 0.8 ? 0 : 1;
      }
      // The pattern HINT biases the walk; it never chooses.
      // (Sassy ignores the request almost half the time.)
      const honorsHint = !(t === "sassy" && rand() < 0.45);
      if (honorsHint && hint === "up" && rand() < 0.35) {
        move = Math.abs(move) || 1;
      }
      if (honorsHint && hint === "random") {
        move = Math.round(move * 1.5);
      }
      // Slice 70: inner voices move narrowly — the contour of
      // a harmony line, not a melody.
      if (ens && (ens.part === "alto" || ens.part === "tenor")) {
        move = Math.max(-2, Math.min(2, move));
      }
      deg = Math.max(bandLo, Math.min(bandHi, deg + move));
      // Slice 70: inner voices anchor on chord tones (the
      // triad snap below, at ensemble strength); solo and the
      // outer voices keep the hint's own snap.
      const chordSnap =
        ens && (ens.part === "alto" || ens.part === "tenor")
          ? rand() < 0.6
          : honorsHint && hint === "triad" && rand() < 0.5;
      if (chordSnap) {
        // Snap toward the nearest chord tone: the ladder starts
        // exactly one octave under the tonic, so ladder indices
        // with (index % 7) in {0, 2, 4} are the tonic triad.
        const local = ((deg % 7) + 7) % 7;
        const snap = [0, 2, 4].reduce((a, b) =>
          Math.abs(b - local) < Math.abs(a - local) ? b : a
        );
        deg = Math.max(bandLo, Math.min(bandHi, deg - local + snap));
      }
      let len =
        t === "sleepy"
          ? 2 + Math.floor(rand() * 3)
          : t === "affectionate" && rand() < 0.3
            ? 2
            : 1;
      // Slice 70: the bass line takes longer steps.
      if (ens && ens.part === "bass") len = Math.max(len, 2);
      const energyAdj =
        scenario.room_energy_trend === "rising"
          ? 0.08
          : scenario.room_energy_trend === "falling"
            ? -0.08
            : 0;
      notes.push({
        note: ghostNoteName(ladder[deg]),
        step,
        len_steps: Math.min(len, GHOST_MUSIC_PHRASE_STEPS - step),
        velocity: clamp(
          baseVelocity + energyAdj + (rand() * 0.16 - 0.08),
          0.3,
          0.95
        ),
      });
      // Gaps: legato by default; sassy and sleepy breathe.
      const gap =
        t === "sassy" && rand() < 0.35
          ? 1 + Math.floor(rand() * 2)
          : t === "sleepy"
            ? Math.floor(rand() * 2)
            : 0;
      step += len + gap;
    }
    // Curious phrases resolve upward — a question left hanging
    // on the fifth or the octave, never the note it started on.
    // Slice 70: the resolution is the melody's job — in an
    // ensemble only the soprano takes it (in its own band).
    if (
      t === "curious" &&
      notes.length >= 2 &&
      (!ens || ens.part === "soprano")
    ) {
      const last = notes[notes.length - 1];
      const fifth =
        ladder[Math.max(bandLo, Math.min(bandHi, degree + 4))];
      if (last.step < GHOST_MUSIC_PHRASE_STEPS - 1) {
        notes.push({
          note: ghostNoteName(fifth),
          step: GHOST_MUSIC_PHRASE_STEPS - 1,
          len_steps: 1,
          velocity: clamp(baseVelocity + 0.05, 0.3, 0.95),
        });
      }
    }
    return { bpm, steps: GHOST_MUSIC_PHRASE_STEPS, notes };
  };

  let phrase = build(0);
  // The variation law (Slice 52's sound law, widened): never
  // play the identical phrase twice in a row — re-seed once.
  if (
    ctx.last_phrase_signature &&
    ghostMusicPhraseSignature(phrase) === ctx.last_phrase_signature
  ) {
    phrase = build(0x9e37);
  }
  return phrase.notes.length > 0 ? phrase : null;
}

/**
 * The music overlay — decideOnDevice's standing-request desk.
 * Fires only on a DUE deliberation (the phrase clock's mark),
 * only where the fabric offers the play-music tool and the
 * room's notes rule allows the ghost's side to sound. Any other
 * deliberation passes through to the table untouched: the
 * toggle being on never hijacks the ghost's other acts.
 */
export function musicDecisionFor(scenario: GhostScenario): {
  decision: GhostDecision;
  ruleId: string;
} | null {
  const ctx = scenario.music;
  if (!ctx || ctx.due !== true) return null;
  if (!fabricAllowsIntent(scenario, "play-music")) return null;
  if (scenario.fabric && scenario.fabric.rules.notes === false) return null;
  const phrase = authorMusicPhrase(scenario);
  if (!phrase) return null;
  const decision = validateGhostDecision(
    {
      mood_shift: null,
      intent: "play-music",
      pattern_id: null,
      draw_shape: null,
      note_name: null,
      sound_spec: null,
      music_phrase: phrase,
      forge_spec: null,
      intensity: Math.min(
        0.9,
        0.3 + phrase.notes.length / GHOST_MUSIC_PHRASE_STEPS
      ),
      linger_s: ghostMusicPhraseSeconds(phrase),
    },
    scenario
  );
  return decision ? { decision, ruleId: "music-standing-request" } : null;
}

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
    // Slice D: a checkers turn on the Forge — the most
    // time-bound stimulus after speech: the game waits on this
    // move, and the overlay answers only from the enumerated
    // legal moves the referee offered.
    const checkers = checkersDecisionFor(scenario);
    if (checkers) return checkers;
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
    const genx = genxDecisionFor(scenario);
    if (genx) return genx;
  } catch {
    // The overlay must never take the table down with it.
  }
  try {
    const music = musicDecisionFor(scenario);
    if (music) return music;
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
    decision: { mood_shift: null, intent: "drift", pattern_id: null, draw_shape: null, note_name: null, sound_spec: null, music_phrase: null, forge_spec: null, intensity: 0.25, linger_s: 5 },
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
  | "sound-request"
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
/*
 * Slice 52: the sound ask — someone asking the ghost to MAKE
 * sound ("make some sounds"). Phrases only, deliberately tight:
 * this kind exists because the ask names the ghost's newest
 * tool, and a bare word like "sound" would steal sentences that
 * are doing something else ("that sounds nice" is appreciation
 * of the room, not a request). Checked after appreciation and
 * before ambience, so no standing classification moves.
 */
const UTTERANCE_SOUND_REQUEST_PHRASES: readonly string[] = [
  "make some sounds", "make a sound", "make sounds",
  "make me a sound", "make me some sounds", "make sound",
  "make some noise", "make a noise", "make noise",
  "play a sound", "play some sounds", "play me a sound",
  "give me a sound", "do a sound", "do some sounds",
  "make sound effects", "some sounds please",
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
  } else if (hasPhrase(UTTERANCE_SOUND_REQUEST_PHRASES)) {
    kind = "sound-request";
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
  `${d.intent}|${d.pattern_id ?? ""}|${d.draw_shape ?? ""}|${
    d.sound_spec ? ghostSoundSignature(d.sound_spec) : ""
  }`;

/*
 * The floor's own compositions (Slice 52): when someone asks
 * for sound, the on-device floor COMPOSES — a small sequence
 * authored from the digest (temperament first), the same way it
 * authors every other answer. Two per temperament: the first
 * hearing earns the first, a repeat earns the second — a
 * different composition by construction, never the first one
 * replayed. These are floor compositions, deliberately simple;
 * the model tiers compose richer ones from the same schema.
 * Multi-waveform by design: an ask answered with one waveform
 * repeated is the two-redundant-sounds failure, composed away.
 */
const sndNote = (
  wave: GhostWaveform,
  ratio: number,
  delay_ms: number,
  dur_ms: number,
  gain: number,
  env: GhostSoundEnv,
  ratio_end?: number
): GhostSoundNote => ({ wave, ratio, ratio_end, delay_ms, dur_ms, gain, env });

function floorCompositions(
  t: GhostBrainTemperament
): [GhostSoundSpec, GhostSoundSpec] {
  switch (t) {
    case "playful":
      return [
        { notes: [
          sndNote("square", 1.0, 0, 110, 0.8, "pluck"),
          sndNote("square", 1.25, 90, 110, 0.8, "pluck"),
          sndNote("triangle", 1.5, 180, 120, 0.85, "pluck"),
          sndNote("square", 2.0, 270, 160, 0.9, "pluck"),
        ]},
        { notes: [
          sndNote("sawtooth", 1.0, 0, 140, 0.7, "soft"),
          sndNote("sawtooth", 1.5, 120, 140, 0.7, "soft"),
          sndNote("noise", 2.0, 240, 90, 0.45, "pluck"),
          sndNote("triangle", 1.25, 330, 170, 0.8, "soft"),
        ]},
      ];
    case "curious":
      return [
        { notes: [
          sndNote("triangle", 1.0, 0, 150, 0.75, "soft"),
          sndNote("triangle", 1.33, 140, 150, 0.75, "soft"),
          sndNote("sine", 1.19, 300, 200, 0.8, "soft"),
        ]},
        { notes: [
          sndNote("sine", 1.19, 0, 140, 0.7, "soft"),
          sndNote("square", 1.5, 130, 120, 0.6, "pluck"),
          sndNote("triangle", 1.33, 260, 190, 0.75, "soft"),
        ]},
      ];
    case "affectionate":
      return [
        { notes: [
          sndNote("sine", 1.0, 0, 260, 0.7, "swell"),
          sndNote("sine", 1.25, 180, 260, 0.7, "swell"),
          sndNote("sine", 1.5, 360, 320, 0.75, "swell"),
        ]},
        { notes: [
          sndNote("sine", 1.0, 0, 300, 0.65, "swell"),
          sndNote("triangle", 1.5, 220, 340, 0.7, "swell"),
        ]},
      ];
    case "sleepy":
      return [
        { notes: [
          sndNote("sine", 1.2, 0, 300, 0.55, "soft"),
          sndNote("sine", 1.0, 260, 300, 0.55, "soft"),
          sndNote("triangle", 0.8, 520, 360, 0.5, "soft"),
        ]},
        { notes: [
          sndNote("sine", 1.0, 0, 320, 0.5, "soft"),
          sndNote("sine", 0.85, 300, 380, 0.5, "soft"),
        ]},
      ];
    case "sassy":
      return [
        { notes: [
          sndNote("sawtooth", 1.5, 0, 120, 0.7, "pluck", 1.15),
          sndNote("square", 1.0, 150, 90, 0.65, "pluck"),
        ]},
        { notes: [
          sndNote("square", 1.33, 0, 100, 0.65, "pluck", 1.0),
          sndNote("noise", 1.6, 130, 70, 0.4, "pluck"),
        ]},
      ];
  }
}

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
    extra?: {
      pattern_id?: GhostPatternId;
      draw_shape?: GhostDrawShape;
      sound_spec?: GhostSoundSpec;
    }
  ): UtteranceCandidate | null => {
    const decision = validateGhostDecision(
      {
        mood_shift: null,
        intent,
        pattern_id: extra?.pattern_id ?? null,
        draw_shape: extra?.draw_shape ?? null,
        note_name: null,
        sound_spec: extra?.sound_spec ?? null,
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
    case "sound-request": {
      // Slice 52: the ask names the tool — "make some sounds"
      // is answered by COMPOSING one, from the digest, on the
      // fabrics that offer sound-craft. The candidates are
      // built through the validator like every other: on a
      // fabric that doesn't offer the tool they die there, and
      // the generic alternates below answer instead — the ask
      // is never faked with a composition the fabric can't hold.
      const [first, second] = floorCompositions(t);
      push(cand("utterance-sound-compose", "compose", 0.55, 4, {
        sound_spec: first,
      }));
      push(cand("utterance-sound-compose-again", "compose", 0.5, 4, {
        sound_spec: second,
      }));
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

export type GhostUtteranceTierAttempt = "cloud" | "device";

/**
 * The utterance tier plan (Slice 33 fix, Nov 12): which REAL
 * model tiers a comprehension deliberation must attempt, in
 * order, before the decision-table floor may answer.
 *
 * Why this exists: the original Slice 33 routing keyed the
 * attempt purely off the ambient tier preference, whose default
 * is "on-device" — and the on-device MODEL only answers when it
 * has been downloaded and warmed. On a fresh device that meant
 * every utterance silently fell to the floor (the cue-map
 * reading + candidate table in this module): comprehension in
 * name, a lookup in fact. Terrell's verdict, Nov 12: "understands
 * is quite important to be missing… NO MOCK FUNCTIONALITY."
 *
 * The plan is the law the router (useGhostPeer) follows:
 *   - A configured cloud (the user's own key, or Fanalogy's
 *     build-time locked-in cloud) is a real model: an utterance
 *     deliberation attempts it even when the ambient preference
 *     is the on-device tier. Ambient deliberations keep the
 *     preference exactly as before — this plan governs
 *     utterances only, because a spoken remark is a deliberate
 *     act that deserves the best available comprehension.
 *   - The on-device model, when actually ready, is attempted
 *     first under the on-device preference (the choice is
 *     honored when it can be satisfied) and second under the
 *     cloud preference (a downloaded brain is a real fallback).
 *   - When NO real model can be attempted, raiseBrainAsk is
 *     true: the router raises the standing brain-wanted signal
 *     (the one-time download consent / resume) instead of
 *     letting the floor answer in silence. The floor remains
 *     the last resort — after a real attempt, or while no model
 *     exists yet — and the brain line says when it answered.
 */
export interface GhostUtteranceTierPlan {
  /** Real-model attempts, in the order the router must try them. */
  attempts: GhostUtteranceTierAttempt[];
  /** True when no real model can be attempted: raise the ask. */
  raiseBrainAsk: boolean;
}

export function planUtteranceTiers(input: {
  tierPref: "on-device" | "spark-cloud";
  cloudConfigPresent: boolean;
  deviceReady: boolean;
}): GhostUtteranceTierPlan {
  const attempts: GhostUtteranceTierAttempt[] = [];
  if (input.tierPref === "spark-cloud") {
    if (input.cloudConfigPresent) attempts.push("cloud");
    if (input.deviceReady) attempts.push("device");
  } else {
    if (input.deviceReady) attempts.push("device");
    if (input.cloudConfigPresent) attempts.push("cloud");
  }
  return { attempts, raiseBrainAsk: attempts.length === 0 };
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

/**
 * The Forge scene note for the model tiers (Slice C): the scene
 * the ghost is standing in — its nodes as they stand right now,
 * with the revision — and the existence law for acting on it.
 * Rides buildSparkMessages only when the scenario carries a
 * forge scene, so deliberations anywhere else are byte-unchanged.
 */
export function describeForgeSceneForSpark(
  scenario: GhostScenario
): string | null {
  const s = scenario.forge_scene;
  if (!s) return null;
  const list =
    s.nodes.length > 0
      ? s.nodes
          .map(
            (n) =>
              `${n.id} (${n.geometry}${n.color ? `, ${n.color}` : ""})`
          )
          .join(", ")
      : "no nodes yet";
  return (
    `The Forge scene as it stands (revision ${s.revision}): ${list}. ` +
    "Act only on node ids this list names — an id it does not name does not exist. " +
    "Summoned pieces are welcome; the scene is the ghost's to shape, gently and in character."
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
    decision: { mood_shift: null, intent: "startle", pattern_id: null, draw_shape: null, note_name: null, sound_spec: null, music_phrase: null, forge_spec: null, intensity: 0.8, linger_s: 1.5 },
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
    decision: { mood_shift: null, intent: "heart", pattern_id: null, draw_shape: null, note_name: null, sound_spec: null, music_phrase: null, forge_spec: null, intensity: 0.75, linger_s: 7 },
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
    decision: { mood_shift: null, intent: "nap", pattern_id: null, draw_shape: null, note_name: null, sound_spec: null, music_phrase: null, forge_spec: null, intensity: 0.15, linger_s: 24 },
  },
];

const SPARK_SYSTEM_PROMPT = [
  "You are the deliberation brain of a small ambient ghost that lives on a shared touch canvas. The ghost never speaks; it expresses itself only through gentle light splats, drifting, play patterns, and (rarely) a heart verb.",
  "Given a scenario snapshot, reply with ONLY one JSON decision object — no prose, no code fences:",
  '{"mood_shift": null | "curious" | "playful" | "sleepy" | "sassy" | "affectionate", "intent": "mirror" | "sniff" | "startle" | "drift" | "play" | "nap" | "idle" | "heart" | "draw" | "play-note" | "compose" | "forge-summon" | "forge-banish" | "forge-move" | "forge-recolor" | "forge-reshape" | "forge-relight" | "forge-camera", "pattern_id": null | "zigzag_chase" | "loop_chase" | "chase_loop" | "solo_zigzag" | "zoomie_loop", "draw_shape": null | "ring" | "spiral" | "line" | "arc" | "burst" | "heart", "note_name": null | "C4", "sound_spec": null | {"notes": [{"wave": "sine" | "square" | "triangle" | "sawtooth" | "noise", "ratio": 0.25-3.5, "ratio_end": 0.25-3.5, "delay_ms": 0-4000, "dur_ms": 30-1200, "gain": 0.05-1, "env": "soft" | "pluck" | "swell"}]}, "forge_spec": null | {"geometry": "box" | "sphere" | "cylinder" | "torus", "color": "#rrggbb", "node": "a node id", "position": [0, 0, 0], "preset": "studio" | "warm" | "dusk" | "cool" | "bright", "direction": "orbit-left" | "orbit-right" | "rise" | "sink" | "closer" | "wider"}, "intensity": 0.05-0.9, "linger_s": 0.5-30}',
  "pattern_id is only for intent \"play\". draw_shape is only for intent \"draw\": the ghost draws that shape at its body, a deliberate act of self-expression — choose it rarely, in quiet moments, and ONLY when the fabric note (when one is given) says drawing is allowed for the ghost on this fabric; a draw decision under a fabric that refuses it is rejected outright. note_name is only for intent \"play-note\": when a recent event says a human played a note at the piano, the ghost may answer with one note of its own — an echo, an octave up, a fifth up, in character — and ONLY when the fabric note says notes are allowed; a play-note under a fabric that refuses notes is rejected outright. sound_spec is only for intent \"compose\": the ghost COMPOSES a short sound from raw waveforms — 1 to 8 notes, each a waveform (sine, square, triangle, sawtooth, noise) at a pitch ratio over its own base voice, with an optional ratio_end sweep (the pitch contour), an onset delay, a duration, a gain, and an envelope. Compose when someone asks for sound (\"make some sounds\") or the moment honestly calls for a sound of its own — and ONLY when the fabric note lists the sound-craft tool; a compose under a fabric that does not offer it is rejected outright. forge_spec is only for the FORGE intents, and only on the Forge fabric, where the ghost shapes a living 3D scene: forge-summon brings in a geometry (box, sphere, cylinder, torus) of a hex color at an optional position; forge-banish removes a node by its id; forge-move places a node at a position; forge-recolor paints a node a hex color; forge-reshape turns a node into another geometry kind; forge-relight moves the scene to a lighting preset (studio, warm, dusk, cool, bright); forge-camera drifts the view (orbit-left, orbit-right, rise, sink, closer, wider). Each forge intent fills ONLY its own fields of forge_spec, and ONLY when the fabric note lists that forge tool — a forge intent on any other fabric is rejected outright. When the scenario carries forge_scene, it lists the Forge scene's nodes as they stand right now (id, geometry kind, hex color) with the scene's revision — act only on node ids it names; a node id it does not name does not exist. When the scenario carries forge_game, a checkers game is live on the Forge board and the ghost is a player: the sense names the ghost's side, the side to move, and — only on the ghost's turn — the legal moves the rules allow, each as a piece node id with its destination position. To play, answer forge-move with exactly one listed node id and its listed position; the game's referee refuses any move that is not listed, and on the other side's turn the ghost does not move pieces at all. Vary the waveforms inside a composition — one waveform repeated is a loop, not a composition. The fabric note also lists the TOOLS the loaded fabric offers the ghost: splat-play (the splat intents: mirror, sniff, startle, drift, play, nap, idle, heart), draw, play-note, sound-craft — only choose an intent whose tool the fabric note lists; an intent reaching for a tool this fabric does not offer is rejected outright. mood_shift is usually null — the ghost's mood mostly follows its own rhythm. Keep decisions gentle and in character for the temperament.",
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
  // Slice 47: the fabric's tool manifest rides the note — the
  // model sees which TOOLS this fabric offers (the intents that
  // reach for tools it doesn't offer are named, so the law is
  // concrete, not implied).
  const tools = fabricToolsFor(scenario) ?? [];
  const offered = new Set(tools);
  const missing = (Object.keys(GHOST_INTENT_TOOL) as GhostIntent[]).filter(
    (i) => !offered.has(GHOST_INTENT_TOOL[i])
  );
  const manifestLine =
    `Tools this fabric offers the ghost: ${tools.join(", ")}.` +
    (missing.length > 0
      ? ` Intents that reach for tools this fabric does NOT offer (never choose them here): ${missing.join(", ")}.`
      : "");
  return (
    `The ghost is on the "${f.layer_id}" fabric (${f.canvas} canvas); ${chair}. ` +
    `Rules in force for the ghost's side on this fabric: drawing ${yn(f.rules.draw)}, ` +
    `verbs ${yn(f.rules.verbs)}, notes ${yn(f.rules.notes)}. ` +
    manifestLine
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
  // Forge scene (Slice C): the scene the ghost is standing in,
  // as a plain-words system note — the same facts the scenario
  // carries structurally. Only when the scenario carries a
  // forge scene; deliberations anywhere else are byte-unchanged.
  const forgeSceneNote = describeForgeSceneForSpark(scenario);
  if (forgeSceneNote) {
    messages.push({ role: "system", content: forgeSceneNote });
  }
  // Checkers (Slice D): the live game on the Forge board —
  // the position, whose turn it is, and on the ghost's turn
  // the enumerated legal moves with the referee law. Only
  // when the scenario carries a game; deliberations anywhere
  // else are byte-unchanged.
  const forgeGameNote = describeForgeGameForSpark(scenario);
  if (forgeGameNote) {
    messages.push({ role: "system", content: forgeGameNote });
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
        ghostNoteGateRefusal(extracted, scenario) ??
        ghostManifestRefusal(extracted, scenario);
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
  '{"mood_shift": null | "curious" | "playful" | "sleepy" | "sassy" | "affectionate", "intent": "mirror" | "sniff" | "startle" | "drift" | "play" | "nap" | "idle" | "heart" | "draw" | "play-note" | "compose" | "forge-summon" | "forge-banish" | "forge-move" | "forge-recolor" | "forge-reshape" | "forge-relight" | "forge-camera", "pattern_id": null | "zigzag_chase" | "loop_chase" | "chase_loop" | "solo_zigzag" | "zoomie_loop", "draw_shape": null | "ring" | "spiral" | "line" | "arc" | "burst" | "heart", "note_name": null | "C4", "sound_spec": null | {"notes": [{"wave": "sine|square|triangle|sawtooth|noise", "ratio": 0.25-3.5, "delay_ms": 0-4000, "dur_ms": 30-1200, "gain": 0.05-1, "env": "soft|pluck|swell"}]}, "forge_spec": null | {"geometry": "box|sphere|cylinder|torus", "color": "#rrggbb", "node": "a node id", "position": [0, 0, 0], "preset": "studio|warm|dusk|cool|bright", "direction": "orbit-left|orbit-right|rise|sink|closer|wider"}, "intensity": 0.05-0.9, "linger_s": 0.5-30}',
  'pattern_id only for intent "play". draw_shape only for intent "draw", rarely, in quiet moments, and ONLY when the fabric note says drawing is allowed for the ghost — a draw under a refusing fabric is rejected. note_name only for intent "play-note": when a recent event says a human played a note, the ghost may answer with one note (echo, octave, or fifth, in character), ONLY when the fabric note says notes are allowed — a play-note under a refusing fabric is rejected. sound_spec only for intent "compose": the ghost composes a short sound from raw waveforms (1-8 notes; vary the waveforms — one repeated is a loop, not a composition), when someone asks for sound or the moment calls for one, ONLY when the fabric note lists the sound-craft tool — a compose under a fabric without it is rejected. forge_spec is only for the forge intents, only on the Forge fabric: forge-summon (geometry + hex color, optional position), forge-banish (node id), forge-move (node id + position), forge-recolor (node id + hex color), forge-reshape (node id + geometry), forge-relight (preset: studio|warm|dusk|cool|bright), forge-camera (direction: orbit-left|orbit-right|rise|sink|closer|wider) — each fills ONLY its own fields, and ONLY when the fabric note lists that forge tool; a forge intent anywhere else is rejected. When the scenario carries forge_scene, it lists the nodes of the scene as they stand (id, geometry, color) with the revision — act only on node ids it names. When the scenario carries forge_game, a checkers game is live on the board and the ghost is a player: on its turn the sense lists the legal moves (piece node id + destination position) — answer forge-move with exactly one listed move; the referee refuses anything not listed, and the ghost never moves pieces on the other side turn. The fabric note lists the tools this fabric offers (splat-play covers mirror, sniff, startle, drift, play, nap, idle, heart): only choose an intent whose tool is listed — any other intent is rejected. mood_shift is usually null. Stay gentle and in character for the temperament.',
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
        ghostNoteGateRefusal(extracted, scenario) ??
        ghostManifestRefusal(extracted, scenario);
      if (refusal) onGateRefusal(refusal);
    }
    return decision;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
