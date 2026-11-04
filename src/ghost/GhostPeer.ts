/**
 * GhostPeer — the Fabric ghost: a local agent peer on the same
 * interaction protocol human peers use, with a personality of its own.
 *
 * The ghost is NOT a fake user. It has a clearly-an-agent peer id
 * ("ghost:<ownerId>"), a persistent identity (generated name + signature
 * hue, persisted by useGhostPeer in fabric_ghost_v1), and it never
 * appears in contacts or people lists. Every interaction it makes is
 * rendered by clients through the normal remote-interaction path (splat
 * + verb haptics/audio), honoring each client's own preferences.
 *
 * Two modes:
 *
 * - SOLO (default companion): the ghost lives only on this client,
 *   injected locally, never networked. Alone, it is the full Slice 2
 *   companion (drift / mirror / call-and-response / solo affection /
 *   sleep). When human peers connect and it has NOT been summoned, it
 *   no longer leaves: it shifts to the CROWD role — still local-only,
 *   at a lower frequency (sparser drift, sampled responses, its own
 *   tighter emit sub-budget), reacting to the room's energy: mirroring
 *   finished strokes, answering rhythms, noticing petting from anyone,
 *   dozing only when the whole room goes quiet. (Before the crowd
 *   role existed, any connected human switched the solo ghost off
 *   entirely — presence "away", zero emissions — and even a summoned
 *   ghost starved, because its courtesy gates keyed on room-wide
 *   activity; see the fix notes in tick()/noteInteraction.)
 *
 * - SESSION (summoned): any participant can summon THEIR OWN ghost into
 *   the shared session. The owner's client runs the brain; the ghost's
 *   interactions are also broadcast under its "ghost:<ownerId>" peer id
 *   so everyone renders it through the normal remote path. The brain
 *   consumes ALL participants' interactions, so it reacts to anyone.
 *   Only the owner can dismiss their ghost (soft goodbye sequence);
 *   when the owner disconnects, their ghost leaves with them (v1).
 *
 * Personality: a temperament state machine (curious / playful / sleepy /
 * sassy / affectionate) drifts over time and reacts to events — petting
 * raises affectionate, being ignored while playful can flip sassy, long
 * quiet becomes sleepy. Temperament biases probabilities and speeds:
 * a sassy ghost occasionally ignores a pet and wanders off; a playful
 * ghost initiates more. Even idle, the ghost has autonomous antics
 * (spiral doodles, tail-chases, a startle-hop when a very strong splat
 * lands nearby) — rate-limited so the canvas never gets noisy.
 *
 * Body & petting: the ghost has a virtual position; it wanders slowly
 * and its idle splats originate there. PETTING = any participant's
 * interaction landing within PET_RADIUS of that position. Petted ghosts
 * lean toward the hand, burst happily, PURR (ghost-only verb), and
 * after sustained petting occasionally send a HEART. In session mode the
 * only room-wide verbs a ghost sends are those petting responses (PURR /
 * HEART) — never verbs aimed at other ghosts.
 *
 * Ghost society: ghosts perceive each other through the broadcast stream
 * (peerId prefix "ghost:"). On first sensing another ghost, a ghost
 * approaches it and SNIFFS (3–4 small quick probing splats near it).
 * Then temperament decides: PLAY (a short chase), SOCIAL IDLE (drift
 * nearby, occasional companionable splat), or ALOOF (wander off). Ghosts
 * that met before in the session skip the sniff and go straight to
 * social/play with higher probability. Soft cap: MAX_GHOSTS_PER_ROOM
 * ghosts per room; a hard per-ghost emit budget keeps ghost society
 * from ever flooding human interaction.
 *
 * Reflexes are local and deterministic (PRNG seeded by the persisted
 * identity seed). On top of them sits the deliberation layer
 * (GhostBrain.ts): every ~10s of MEANINGFULLY CHANGED context the
 * peer hands the host a scenario snapshot in the ghost-factory
 * dataset schema, and the host answers with applyBrainDecision —
 * routed by the user's brain tier (on-device distilled table by
 * default; the configured cloud model when they opt in). Reflexes
 * never wait on it: a failed, invalid, or late deliberation changes
 * nothing, and no decision can override the invariants in this file.
 * setMoodBias remains as the soft steering seam deliberation uses.
 *
 * Tools (Slice 23): deliberation can now also answer with the DRAW
 * tool — the ghost builds a one-step Recipe in its own hue and
 * hands it to the host's draw sink (the recipe transport, under
 * the ghost's own peer id), priced against the same emit budget
 * as any performance and spaced by a draw cooldown. The peer
 * re-checks the fabric's draw rule at performance time, so no
 * caller can talk it into drawing where the fabric forbids it.
 * And an asked verb is a tool too: answerVerb performs heart /
 * cheer / tickle on the primary's word, through the same verb
 * clock and session degrade as its deliberated verbs. The
 * registry these tools are declared in is ghostTools.ts.
 *
 * Powered by Nirvana
 */

import type { FluidInteraction } from "../types/fluid";
import {
  HEART,
  CHEER,
  TICKLE,
  PURR,
  verbInteraction,
  type SensoryVerb,
} from "../sensory/verbs";
import type { GhostPresence } from "./ghostStore";
import type { GhostSfxContext, GhostSfxKind } from "./useGhostSfx";
import type {
  GhostDecision,
  GhostFabricContext,
  GhostGenxContext,
  GhostGestureReading,
  GhostMusicContext,
  GhostMusicPhrase,
  GhostScenario,
  GhostScenarioOther,
  GhostUtteranceContext,
  GhostUtteranceSpeaker,
} from "./GhostBrain";
import {
  fabricContextAllowsIntent,
  isGhostNoteLayer,
  ghostMusicPhraseSeconds,
  ghostMusicPhraseSignature,
  ghostNoteName,
  ghostNoteNumber,
  isGhostNoteName,
  parseUtteranceReading,
  sanitizeFabricContext,
  sanitizeGenxContext,
  sanitizeGestureReadings,
  sanitizeUtteranceContext,
  seedTraitsForTemperament,
  UTTERANCE_CONFIDENCE_FLOOR,
} from "./GhostBrain";
import type { GenxSenseSnapshot } from "../genx/genxTypes";
import { validateRecipe, type Recipe } from "../ai/RecipeCore";
import {
  DEFAULT_GHOST_SHARED_SETTINGS,
  type GhostSharedSettings,
} from "./ghostShared";

/** Peer-id convention: every ghost broadcasts as "ghost:<ownerUserId>". */
export const GHOST_PEER_PREFIX = "ghost:";

export function ghostPeerIdFor(ownerUserId: string): string {
  return `${GHOST_PEER_PREFIX}${ownerUserId}`;
}

export function isGhostPeerId(userId?: string | null): boolean {
  return typeof userId === "string" && userId.startsWith(GHOST_PEER_PREFIX);
}

/**
 * Slice 17 routing: is this free-form request asking THIS ghost for
 * its heartbeat? A heartbeat phrase alone is a generic performance
 * request; it belongs to the ghost when it is addressed to it — by
 * name, by the word "ghost", or possessively ("your heartbeat",
 * including Terrell's acceptance case, "lemme see your heart beat").
 */
export function isGhostHeartbeatRequest(
  prompt: string,
  ghostName?: string | null
): boolean {
  const text = (prompt || "").toLowerCase();
  if (!/\b(heartbeat|heart\s+beat)\b/.test(text)) return false;
  if (ghostName && text.includes(ghostName.toLowerCase())) return true;
  return /\bghost\b/.test(text) || /\byour\b/.test(text);
}

/** Verbs the primary can ask their ghost to perform by name. */
export type GhostVerbAskId = "heart" | "cheer" | "tickle";

const GHOST_VERB_ASK_PATTERNS: { id: GhostVerbAskId; re: RegExp }[] = [
  { id: "tickle", re: /\btickle\b/ },
  { id: "cheer", re: /\bcheer\b/ },
  { id: "heart", re: /\bheart\b/ },
];

/**
 * Slice 23 routing ("say-it"): is this request asking THIS ghost
 * to perform a named verb — "tickle, Boop", "Boop, cheer for me",
 * "ghost, give me a heart"? Both halves are required: the ask
 * must ADDRESS the ghost (by name, "ghost"/"ghostie", or the
 * possessive "your" the heartbeat route already honors) AND name
 * the verb. A bare "tickle" or an unaddressed "make a heart"
 * belongs to the generic interpreter, exactly as before.
 *
 * Heartbeat phrases are excluded up front: "your heart beat" is
 * the heartbeat route's (Slice 17), never a heart-verb ask — the
 * two routers are order-independent by construction.
 *
 * When several verbs are named, the first one mentioned wins.
 */
export function ghostVerbAsk(
  prompt: string,
  ghostName?: string | null
): GhostVerbAskId | null {
  const text = (prompt || "").toLowerCase();
  if (/\bheartbeat\b/.test(text) || /\bheart\s+beat\b/.test(text)) {
    return null;
  }
  const addressed =
    (ghostName ? text.includes(ghostName.toLowerCase()) : false) ||
    /\bghost(ie)?\b/.test(text) ||
    /\byour\b/.test(text);
  if (!addressed) return null;
  let best: { id: GhostVerbAskId; at: number } | null = null;
  for (const { id, re } of GHOST_VERB_ASK_PATTERNS) {
    const at = text.search(re);
    if (at >= 0 && (!best || at < best.at)) best = { id, at };
  }
  return best ? best.id : null;
}

/**
 * What a note ask routes to (Slice 31): one named note (or the
 * ghost's choice when note is null), a replay of the last note
 * it heard or played, or an arpeggio.
 */
export type GhostNoteAsk =
  | { kind: "note"; note: string | null }
  | { kind: "again" }
  | { kind: "arpeggio"; descending: boolean };

const GHOST_NOTE_LETTER_PC: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
};
const GHOST_NOTE_SHARP_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/** Letter + accidental + octave -> the bus's canonical (sharps) name. */
function ghostCanonicalNote(
  letter: string,
  accidental: string,
  octave: number
): string | null {
  let pc = GHOST_NOTE_LETTER_PC[letter];
  if (pc === undefined) return null;
  if (accidental === "#") pc += 1;
  else if (accidental === "b") pc -= 1;
  let oct = octave;
  if (pc < 0) {
    pc += 12;
    oct -= 1;
  }
  if (pc > 11) {
    pc -= 12;
    oct += 1;
  }
  if (oct < 0 || oct > 8) return null;
  const name = `${GHOST_NOTE_SHARP_NAMES[pc]}${oct}`;
  return isGhostNoteName(name) ? name : null;
}

/**
 * The note-ask router (Slice 31) — the compose path's note
 * sibling of ghostVerbAsk, and deliberately NARROWER in what it
 * claims and LOOSER in how:
 *
 *   - It claims only play-shaped asks carrying a note shape:
 *     "play a note" (the ghost chooses), "play middle C",
 *     "play C#4", "play Eb3" (flats land on their sharp names),
 *     "play that again", "play an arpeggio" (up, or down when
 *     the ask says so). "Play a song / some jazz / the
 *     heartbeat" claim nothing — songs are the composer's
 *     business, not the NOTE tool's.
 *   - Unlike ghostVerbAsk it does NOT require addressing: a
 *     verb can also be performed by the generic interpreter as
 *     a pattern step, so say-it needs the ghost's name to know
 *     whose act it is — a named NOTE is not something the
 *     generic interpreter can perform at all, and the layer
 *     gates the rest (LegacyFluid only performs on the Piano
 *     layer and redirects the ask in-world anywhere else).
 *
 * ghostName is accepted for signature parity with ghostVerbAsk;
 * it is not consulted.
 */
export function ghostNoteAsk(
  prompt: string,
  ghostName?: string | null
): GhostNoteAsk | null {
  void ghostName;
  const text = (prompt || "").toLowerCase();
  const playAt = text.search(/\bplay(?:s|ing|ed)?\b/);
  if (playAt < 0) return null;
  const tail = text
    .slice(playAt)
    .replace(/^play(?:s|ing|ed)?\b/, " ")
    .trim();
  if (/\barpeggio\b/.test(tail)) {
    return {
      kind: "arpeggio",
      descending: /\b(descending|downwards?|down)\b/.test(tail),
    };
  }
  if (/\bmiddle\s+c\b/.test(tail)) return { kind: "note", note: "C4" };
  const accidental = tail.match(/\b([a-g])(#|b)\s*([0-8])?\b/);
  if (accidental) {
    const note = ghostCanonicalNote(
      accidental[1],
      accidental[2],
      accidental[3] ? parseInt(accidental[3], 10) : 4
    );
    return note ? { kind: "note", note } : null;
  }
  const withOctave = tail.match(/\b([a-g])([0-8])\b/);
  if (withOctave) {
    const note = ghostCanonicalNote(
      withOctave[1],
      "",
      parseInt(withOctave[2], 10)
    );
    return note ? { kind: "note", note } : null;
  }
  if (/\bagain\b/.test(tail)) return { kind: "again" };
  if (/^(the\s+|a\s+|an\s+)?notes?\b/.test(tail)) {
    return { kind: "note", note: null };
  }
  const lone = tail.replace(/^(the|a|an)\s+/, "").trim();
  if (/^[a-g]$/.test(lone)) {
    const note = ghostCanonicalNote(lone, "", 4);
    return note ? { kind: "note", note } : null;
  }
  return null;
}

/*
 * Slice 33 ("Understands"): is this prompt an UTTERANCE — words
 * spoken into the room — rather than an ask the other routes own?
 * The claim is deliberately conservative in both directions:
 *
 *   - The ask paths keep their asks. Heartbeat, verb and note
 *     asks are excluded outright (they are also routed earlier —
 *     this is the belt to their braces), imperative-led prompts
 *     ("draw a heart", "make it rain") stay the composer's, and
 *     request questions ("can you…", "would you…") stay asks.
 *   - What remains is claimed when it READS as an utterance
 *     (parseUtteranceReading finds a kind) — or when it is at
 *     least shaped like a statement (a subject, more than one
 *     word, not a question): an unreadable STATEMENT still
 *     belongs to the ghost, which answers it with honest
 *     uncertainty in character instead of letting a nonsense
 *     remark be dressed up as a composed pattern.
 *
 * Feeling-words that are the generic interpreter's home turf are
 * NOT claimed on shape alone: "gentle rain on a lake" has no
 * subject and stays a composition; "i love the rain" is a person
 * speaking and is the ghost's to acknowledge.
 */
const UTTERANCE_REQUEST_WORDS: ReadonlySet<string> = new Set([
  "draw", "paint", "make", "create", "play", "show", "give",
  "send", "summon", "compose", "build", "put", "spawn", "start",
  "stop", "sing", "dance", "turn", "set", "add", "light", "tell",
  "color", "colour", "do", "go", "let", "lets", "let's",
]);
const UTTERANCE_REQUEST_PAIRS: ReadonlySet<string> = new Set([
  "can you", "could you", "will you", "would you", "shall we",
  "you should",
]);
const UTTERANCE_SUBJECT_WORDS: ReadonlySet<string> = new Set([
  "i", "i'm", "im", "it", "it's", "this", "that", "we", "we're",
  "you", "there", "the", "he", "she", "they", "my",
]);

export function ghostUtteranceClaim(
  prompt: string,
  ghostName?: string | null
): boolean {
  const text = (prompt ?? "").trim();
  if (!text) return false;
  if (isGhostHeartbeatRequest(text, ghostName ?? null)) return false;
  if (ghostVerbAsk(text, ghostName ?? null)) return false;
  if (ghostNoteAsk(text, ghostName ?? null)) return false;
  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.length < 2) return false;
  // Find the lead word past any address ("Boop, …", "ghost, …")
  // and politeness ("please …"): the lead is what decides
  // whether this was phrased as an order.
  const name = (ghostName ?? "").toLowerCase().trim();
  let lead = 0;
  while (
    lead < words.length &&
    (words[lead] === "please" ||
      words[lead] === "ghost" ||
      words[lead] === "ghostie" ||
      (name.length > 0 && words[lead] === name))
  ) {
    lead++;
  }
  if (lead >= words.length) return false;
  if (UTTERANCE_REQUEST_WORDS.has(words[lead])) return false;
  if (
    lead + 1 < words.length &&
    UTTERANCE_REQUEST_PAIRS.has(`${words[lead]} ${words[lead + 1]}`)
  ) {
    return false;
  }
  if (parseUtteranceReading(text, ghostName).kind !== "unknown") {
    return true;
  }
  if (text.endsWith("?")) return false;
  return words.some((w) => UTTERANCE_SUBJECT_WORDS.has(w));
}

export type GhostMode = "solo" | "session";

export type GhostTemperament =
  | "curious"
  | "playful"
  | "sleepy"
  | "sassy"
  | "affectionate";

/** Behavior biases the optional LLM link may pick — nothing else sticks. */
export type GhostMoodBias = "heart" | "cheer" | "tickle" | "drift" | "mirror";
export const GHOST_MOOD_BIASES: readonly GhostMoodBias[] = [
  "heart",
  "cheer",
  "tickle",
  "drift",
  "mirror",
];

export interface GhostIdentity {
  /** Signature hue, degrees 0..360. Plain splats live in this family. */
  hue: number;
  /** Persistent seed: drives the PRNG (and, in useGhostPeer, the name). */
  seed: number;
}

export interface GhostPeerOptions {
  /** This ghost's own peer id: ghostPeerIdFor(ownerUserId). */
  peerId: string;
  identity: GhostIdentity;
  /** Render a ghost interaction on THIS client (never networked). */
  injectLocal: (interaction: FluidInteraction) => void;
  /**
   * Broadcast a ghost interaction to the session (session mode only).
   * The owner's sendInteraction stamps it with this ghost's peer id.
   */
  broadcast?: (
    interaction: Omit<FluidInteraction, "userId" | "timestamp">
  ) => void;
  onPresenceChange?: (presence: GhostPresence, mode: GhostMode) => void;
  onTemperamentChange?: (temperament: GhostTemperament) => void;
  /** Fired when the count of sensed OTHER ghosts in the room changes. */
  onGhostsChange?: (otherGhostCount: number) => void;
  /**
   * Semantic sound events for THIS ghost (sniff, play, mirror, startle,
   * sleep, wake, heart, heartbeat, thinking). The hook layer turns
   * them into synthesized SFX pitched from the ghost's signature
   * hue — ghosts never speak. Slice 47: the context rides along —
   * what caused the sound (the deciding decision's intensity, the
   * ghost's temperament, a heartbeat's live tempo) — so the voice
   * layer can ARTICULATE the utterance instead of replaying a
   * fixed cue (see ghostVoice.ts).
   */
  onSfx?: (kind: GhostSfxKind, ctx?: GhostSfxContext) => void;
  /** Display name for the brain scenario snapshot (identity label). */
  ghostName?: string;
  /**
   * A named performance the ghost gave on request (Slice 17). The
   * host publishes the label to the brain line, e.g.
   * "answered: heartbeat @ 92bpm" — an answer is an observable act,
   * not a silent side effect.
   */
  onPerformance?: (label: string) => void;
  /**
   * Deliberation hook: fired at most once per DELIBERATION_MIN_MS and
   * only when meaningful context changed, with a scenario snapshot in
   * the ghost-factory dataset schema (GhostBrain.ts). The host routes
   * it to the picked brain tier and answers with applyBrainDecision.
   * Fire-and-forget — the reflex brain never waits on the answer.
   */
  onDeliberate?: (scenario: GhostScenario) => void;
  /**
   * Fabric awareness (Slice 23): the host's read of where the ghost
   * is — active fabric/layer, canvas kind, session role, and the
   * host rules as they apply to this participant. Consulted at
   * snapshot time (buildScenario) and again at draw time (the
   * peer-side gate). Absent, the scenario carries no fabric context
   * and the peer draws under no fabric authority (solo semantics).
   */
  getFabricContext?: () => GhostFabricContext | null;
  /**
   * The DRAW tool's sink (Slice 23): a recipe the ghost chose to
   * draw, built and validated by the peer. The host renders it
   * locally and ships it on the recipe transport under the ghost's
   * own peer id — the peer owns the decision and the budget charge,
   * the host owns the wires.
   */
  onDrawRecipe?: (recipe: Recipe) => void;
  /**
   * The NOTE tools' sink (Slice 31): one note the ghost chose to
   * play — name in the bus's vocabulary, velocity, ring length.
   * The host puts it on the shared noteBus, the pipeline human
   * keys use, so it sounds through the soundfont on this device,
   * lights the key, streams into the fluid, and rides the note
   * transport to the room under the session's notes gate, exactly
   * like a tapped key. The peer owns the decision, the gates and
   * the budget charge; the host owns the bus.
   */
  onNote?: (note: string, velocity: number, durationMs: number) => void;
  /**
   * The PLAY-MUSIC tool's sink (Slice 68): one phrase the brain
   * authored under the layer's standing Generative-music
   * request — notes, steps, velocities, tempo, complete. The
   * host hands it to the layer's music renderer, which sounds
   * exactly those notes and chooses nothing. The peer owns the
   * authoring cadence, the gates and the budget charge; the
   * host owns the synth.
   */
  onMusicPhrase?: (phrase: GhostMusicPhrase) => void;
}

export const MAX_GHOSTS_PER_ROOM = 4;

// ---- Tuning (all times in ms, positions normalized 0..1) ----
const TICK_MS = 300;
const SLEEP_AFTER_MS = 60_000;
const DRIFT_MIN_IDLE_MS = 3_500;
const CONTACT_GAP_MS = 220;
const CONTACT_FINALIZE_MS = 320;
const TAP_MAX_DURATION_MS = 300;
const RHYTHM_WINDOW_MS = 1_800;
const VERB_MIN_INTERVAL_MS = 180_000;
const VERB_RECENT_ACTIVITY_MS = 25_000;
const PET_RADIUS = 0.17;
const PET_BURST_COOLDOWN_MS = 2_500;
const PET_PURR_COOLDOWN_MS = 20_000;
const PET_HEART_COOLDOWN_MS = 150_000;
const BIAS_TTL_MS = 90_000;
const EMIT_BUDGET = 16; // max ghost interactions per EMIT_WINDOW_MS
const EMIT_WINDOW_MS = 10_000;
// Crowd role (humans present, not summoned): a tighter sub-budget and
// sparser drift than solo, so the ghost plays along without competing
// with the people in the room. Session (summoned) keeps EMIT_BUDGET.
const CROWD_EMIT_BUDGET = 6; // max crowd-role interactions per EMIT_WINDOW_MS
const CROWD_DRIFT_BASE_MS = 9_000;
const CROWD_DRIFT_SPAN_MS = 6_000;
const GHOST_STALE_MS = 20_000;
const ANTICS_MIN_GAP_MS = 18_000;
const STARTLE_COOLDOWN_MS = 6_000;
const STARTLE_RADIUS = 0.26;
/**
 * Deliberation floor: the brain is consulted at most once per 10s,
 * and only when meaningful context changed since the last consult
 * (pets, verbs, crowd changes, a loud splat, a mood shift, a long
 * quiet arriving). Inside the ~8–15s window the design calls for;
 * the dirty gate is what keeps an idle room from burning cloud calls.
 */
const DELIBERATION_MIN_MS = 10_000;
/**
 * Utterance pacing (Slice 33). Words are answered promptly — a
 * remark acknowledged a full deliberation-window later reads as
 * ignored — so a pending utterance opens its own deliberation
 * window on this shorter floor. The floor still exists (two
 * utterances back-to-back deliberate once each, never in a burst)
 * and the repeat window is the spec's "said twice in one minute"
 * with room to spare: inside it, the same words heard again are
 * counted, and the count rides the scenario as context.
 */
const UTTERANCE_MIN_INTERVAL_MS = 2_000;
const UTTERANCE_REPEAT_WINDOW_MS = 90_000;
/**
 * The DRAW tool's price and pace (Slice 23). A drawn shape is one
 * performance — priced at 6 emit slots against the same 16/10s
 * budget every splat pays (a play pattern is 8, a heartbeat
 * phrase 12) — and the cooldown keeps a quiet room's doodles
 * occasional rather than metronomic.
 */
const DRAW_BUDGET_COST = 6;
const DRAW_MIN_INTERVAL_MS = 45_000;
/**
 * The NOTE tools' price and pace (Slice 31). A single note is
 * the smallest act the ghost has — 1 emit slot; a four-note
 * arpeggio is one gesture priced at 3. The cooldown sits far
 * below the draw's 45s (a conversation at the piano is quicker
 * than a doodle) and far above anything deliberation could spam:
 * an answer per stimulus, never a metronome.
 */
const NOTE_BUDGET_COST = 1;
const ARPEGGIO_BUDGET_COST = 3;
const NOTE_MIN_INTERVAL_MS = 8_000;
/**
 * The SOUND-CRAFT tool's price and pace (Slice 52). A composed
 * sound is one authored performance — a sequence, not a splat —
 * priced with the arpeggio (3 emit slots: a multi-note gesture),
 * and its cooldown sits between the note's and the draw's: a
 * ghost asked twice in a row still answers differently (the
 * composition changes), but it does not become a jukebox.
 */
const SOUND_BUDGET_COST = 3;
const SOUND_MIN_INTERVAL_MS = 20_000;
/**
 * The PLAY-MUSIC tool's price and pace (Slice 68). An authored
 * phrase is one performance — a sequence, not a splat — priced
 * with the arpeggio and the composition (3 emit slots). Its
 * deliberation floor sits with the utterance's: a due phrase
 * window opens promptly, but phrases are paced by their own
 * length (performPlayMusic sets the next due time from the
 * phrase it just played), never back-to-back.
 */
const MUSIC_BUDGET_COST = 3;
const MUSIC_MIN_INTERVAL_MS = 2_000;
const NOTE_DURATION_MS = 900;
const ARPEGGIO_STEP_MS = 150;
/**
 * Warm Welcome's price (Slice 24): a session-mode verb burst is
 * three emits, and the greeting is all-or-nothing against the
 * ordinary emit budget — the power-up buys expression, never
 * headroom. EMIT_BUDGET itself is untouched, here and everywhere.
 */
const WELCOME_COST = 3;

/** Deterministic PRNG so ghost behavior is reproducible, never chaotic. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(
  hDeg: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1 / 6) [r, g, b] = [c, x, 0];
  else if (h < 2 / 6) [r, g, b] = [x, c, 0];
  else if (h < 3 / 6) [r, g, b] = [0, c, x];
  else if (h < 4 / 6) [r, g, b] = [0, x, c];
  else if (h < 5 / 6) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}

const clamp01 = (v: number) => Math.min(0.97, Math.max(0.03, v));
const dist2 = (
  ax: number,
  ay: number,
  bx: number,
  by: number
): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

interface ContactPoint {
  x: number;
  y: number;
  fx: number;
  fy: number;
  pressure: number;
  t: number;
}

interface Contact {
  userId: string;
  startedAt: number;
  lastAt: number;
  points: ContactPoint[];
}

interface Tap {
  t: number;
  x: number;
  y: number;
}

interface OtherGhost {
  x: number;
  y: number;
  lastSeen: number;
}

type SocialPhase = "none" | "approach" | "decide" | "chase" | "social";

interface SocialState {
  phase: SocialPhase;
  targetId: string | null;
  until: number;
  nextActionAt: number;
}

/**
 * The outcome of an asked See act (Slice 30):
 *   "performed" — the ghost did it, through its own machinery;
 *   "refused"   — the fabric's draw gate forbids it here: the
 *                 refusal is journaled, ZERO emits happen, and
 *                 nobody else performs it in the ghost's place;
 *   "unavailable" — the ghost cannot act right now (off,
 *                 dismissing, resting, budget or cooldown):
 *                 the caller answers with the fabric itself,
 *                 the established living fallback.
 */
export type GhostActResult = "performed" | "refused" | "unavailable";

/**
 * The utterance sense's verdict (Slice 33): "heard" — the words
 * landed and a deliberation will answer them; "uncertain" — the
 * hearing was too garbled to deliberate on, and the ghost has
 * already answered with in-character puzzlement; "unavailable" —
 * no ghost here to hear (off, dismissing, destroyed), so the
 * caller falls back to its ordinary path, as every ask route does.
 */
export type GhostUtteranceResult = "heard" | "uncertain" | "unavailable";

export class GhostPeer {
  private options: GhostPeerOptions;
  private rng: () => number;
  private sigColor: { r: number; g: number; b: number };
  private sigDriftColor: { r: number; g: number; b: number };

  private enabled = true;
  private humansPresent = false;
  private mode: GhostMode = "solo";
  private dismissing = false;

  private presence: GhostPresence = "sleeping";
  private temperament: GhostTemperament = "curious";
  private temperamentSince = Date.now();

  private lastActivityAt: number;
  /**
   * Activity clocks, split by origin. The courtesy gates ("don't paint
   * over a stroke in progress") key on the LOCAL user only: remote
   * participants stream interactions continuously, and keying on any
   * interaction — the pre-crowd behavior — left the gates shut ~100%
   * of the time in a busy room, silencing the ghost exactly when the
   * room was alive.
   */
  private lastLocalEventAt = 0;
  private lastRemoteEventAt = 0;
  private lastVerbAt = 0;
  private lastPetBurstAt = 0;
  private lastPurrAt = 0;
  private lastPetHeartAt = 0;
  private lastAnticAt = 0;
  private lastStartleAt = 0;
  private lastAttentionAt = 0;

  /** The ghost's body: current position + where it is drifting toward. */
  private position = { x: 0.5, y: 0.42 };
  private wanderTarget = { x: 0.5, y: 0.42 };
  private nextWanderAt = 0;
  private nextDriftAt = 0;

  private contacts = new Map<string, Contact>();
  private taps = new Map<string, Tap[]>();
  private petTimes: number[] = [];
  private emitTimes: number[] = [];

  // ---- Vitals journals (Slice 22) ----
  // Longer-window rings the ID card's vitals read (ghostVitals.ts).
  // petTimes above prunes at 9s for the purr rules; nourishment is
  // a 30-minute story, so landed pets are journaled again here.
  // Same discipline for work: emitTimes is the 10s budget window,
  // emitHistory keeps 30 minutes of output; deliberationTimes
  // journals each brain window. All pruned on write, all local —
  // only the three derived readings ever leave (on the announce).
  private petReceivedTimes: number[] = [];
  private emitHistory: number[] = [];
  private deliberationTimes: number[] = [];
  /** When the current presence began (rest stretches for stamina). */
  private presenceSince = Date.now();
  private crowdEmitTimes: number[] = [];

  // Ghost society
  private otherGhosts = new Map<string, OtherGhost>();
  private metBefore = new Set<string>();
  private aloofUntil = new Map<string, number>();
  private social: SocialState = {
    phase: "none",
    targetId: null,
    until: 0,
    nextActionAt: 0,
  };

  /**
   * How this ghostie is with others (Slice 20 shared settings,
   * ghostShared.ts). Fed live by useGhostPeer from the persisted
   * preference; starts at the permissive defaults so the ghost
   * behaves exactly as it always has until the record loads.
   * followHostFabric is NOT read here — it resolves at the layer
   * gate (LegacyFluid), not inside the peer.
   */
  private sharedSettings: GhostSharedSettings = {
    ...DEFAULT_GHOST_SHARED_SETTINGS,
  };

  private bias: GhostMoodBias | null = null;
  private biasExpiresAt = 0;

  // ---- Brain deliberation state (GhostBrain.ts) ----
  private lastDeliberationAt = 0;
  /** Starts true: the first window always deliberates once. */
  private deliberationDirty = true;
  private lastBrainDecision: {
    decision: GhostDecision;
    source: "spark" | "table" | "device";
    at: number;
  } | null = null;
  /**
   * Slice 47: the most recent brain decision's intensity — the
   * articulation context for sounds the decision's performance
   * causes, so a big decision SOUNDS bigger than a small one.
   */
  private lastBrainIntensity: number | undefined;
  /** nap/idle directives silence autonomous drift + antics until here. */
  private brainQuietUntil = 0;
  /** DRAW tool state (Slice 23): last performance + count (seed salt). */
  private lastDrawAt = 0;
  private drawCount = 0;
  /** NOTE tool state (Slice 31): last performance + the notes memory. */
  private lastNoteAt = 0;
  /** SOUND-CRAFT tool state (Slice 52): last composed performance. */
  private lastSoundAt = 0;
  /**
   * PLAY-MUSIC tool state (Slice 68): the standing Generative-
   * music request the host feeds while the toggle is on (null =
   * no request, no music), the pack seed's notes when a pack is
   * loaded, the phrase bookkeeping (count, last signature for
   * the never-repeat law, last note for the next phrase's
   * anchor), and the phrase clock (next due time, the one-shot
   * due mark the next buildScenario consumes, and the last
   * music deliberation's time for the cadence floor).
   */
  private musicStanding: {
    scale: string;
    patternHint: string;
    tempoBpm: number;
  } | null = null;
  private musicPackNotes: number[] | null = null;
  private musicPhraseIndex = 0;
  private musicLastSignature: string | null = null;
  private musicLastNote: string | null = null;
  private nextMusicAt = 0;
  private musicDuePending = false;
  private lastMusicDeliberationAt = 0;
  /** The last note a HUMAN played at the piano (call-and-response memory). */
  private lastHumanNote: string | null = null;
  /** The last note this ghost itself played ("play that again"). */
  private lastPlayedNote: string | null = null;
  /**
   * Utterance sense state (Slice 33): the latest heard utterance
   * awaiting its deliberation (consumed by exactly one), the
   * repeat memory (same words within the window count up), and
   * the last utterance-driven deliberation's time (its pace).
   */
  private pendingUtterance: GhostUtteranceContext | null = null;
  private lastUtteranceKey: string | null = null;
  private lastUtteranceAt = 0;
  private lastUtteranceRepeats = 0;
  private lastUtteranceDeliberationAt = 0;
  /** Scenario journal, in the dataset's event vocabulary. */
  private eventJournal: { label: string; at: number }[] = [];
  private verbsSeenLog: { id: string; at: number }[] = [];
  /**
   * Slice 34 (Layer B1): recent gesture-token readings, in the
   * v2 digest shape + their arrival time. The scenario snapshot
   * carries the fresh ones (45s) as `gestures`; like every sense
   * log it is pruned on read and capped on write — a digest field,
   * not a history.
   */
  private gestureLog: (GhostGestureReading & { at: number })[] = [];
  /**
   * Slice 36 (The Fold): the latest genx field digest + when it
   * landed. The scenario carries it as `genx` while fresh (45s —
   * the gesture window). The one-shot transition marks are set by
   * noteGenx on the completion / stall-onset transitions and are
   * consumed by exactly one buildScenario, the pendingUtterance
   * discipline: an event is answered once, not on every tick
   * while its state holds.
   */
  private genxDigest: { ctx: GhostGenxContext; at: number } | null = null;
  private genxFoldJustCompleted = false;
  private genxShardJustStalled = false;
  /** Human interaction timestamps (energy trend), pruned at 90s. */
  private humanEventTimes: number[] = [];
  /** Strongest nearby splat + when (decays over ~20s in snapshots). */
  private nearbySplat = { intensity: 0, at: 0 };
  /** Last observed action per other ghost (verb id or "drift"). */
  private ghostLastAction = new Map<string, string>();
  private quietJournalMarkedAt = 0;

  private lastTs = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(options: GhostPeerOptions) {
    this.options = options;
    this.rng = mulberry32(options.identity.seed || 0xfab21c);
    this.sigColor = hslToRgb(options.identity.hue, 0.8, 0.68);
    this.sigDriftColor = hslToRgb(options.identity.hue, 0.62, 0.76);
    // A seed-flavored starting temperament (stable per identity).
    const starts: GhostTemperament[] = ["curious", "playful", "curious", "affectionate"];
    this.temperament = starts[Math.floor(this.rng() * starts.length)];
    this.lastActivityAt = Date.now();
    this.temperamentSince = this.lastActivityAt;
    this.nextWanderAt = this.lastActivityAt + 4_000;
    this.nextDriftAt = this.lastActivityAt + 5_000;
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  get peerId(): string {
    return this.options.peerId;
  }

  getMode(): GhostMode {
    return this.mode;
  }

  getPresence(): GhostPresence {
    return this.presence;
  }

  getTemperament(): GhostTemperament {
    return this.temperament;
  }

  // ---------------------------------------------------------- inputs

  /**
   * Slice 50: the primary renamed their ghostie — in app
   * settings, the only door (see ghostStore.sanitizeGhostName).
   * useGhostPeer owns the persisted record and calls this so the
   * LIVE peer answers to the new name at once: the scenario's
   * identity label, the say-it address matching, and the
   * performance lines all read options.ghostName as they run.
   */
  setGhostName(name: string): void {
    this.options.ghostName = name;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled && this.mode === "session") {
      // Muting yourself releases the session ghost you host.
      this.mode = "solo";
      this.dismissing = false;
      this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
    }
    this.publishPresence();
  }

  /**
   * Apply the primary's shared settings (Slice 20). Live-fed by
   * useGhostPeer whenever the persisted record changes. Turning
   * socialize OFF mid-episode ends any approach/chase in flight —
   * the ghost stops going to others immediately, though it keeps
   * perceiving them (the brain's scenario stays honest).
   */
  setSharedSettings(next: GhostSharedSettings): void {
    const wasSocial = this.sharedSettings.socialize;
    this.sharedSettings = { ...next };
    if (wasSocial && !next.socialize && this.social.phase !== "none") {
      this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
    }
  }

  setHumansPresent(present: boolean): void {
    if (this.humansPresent === present) return;
    const now = Date.now();
    this.humansPresent = present;
    // A crowd change is meaningful context: the brain re-deliberates.
    this.markDeliberationDirty();
    if (present && this.mode === "solo") {
      // Crowd role begins: the ghost stays (it used to fade and stay
      // away). Pull its next drift in close so the room sees it arrive
      // promptly instead of whenever the solo schedule happened to land.
      this.nextDriftAt = Math.min(
        this.nextDriftAt,
        now + 2_000 + this.rng() * 2_000
      );
    }
    if (!present && this.mode === "session") {
      // Everyone left — the summoned ghost leaves with the session.
      this.mode = "solo";
      this.dismissing = false;
    }
    this.publishPresence();
  }

  /**
   * Crowd role: humans are connected but this ghost was not summoned.
   * It acts locally only (emit() never broadcasts outside session
   * mode), at crowd frequency and under the crowd sub-budget.
   */
  private inCrowd(): boolean {
    return this.mode === "solo" && this.humansPresent;
  }

  /**
   * Summon THIS user's ghost into the shared session (this client hosts
   * it). Returns false when the room is already at the ghost cap.
   */
  summon(): boolean {
    if (!this.enabled || !this.humansPresent || this.mode === "session") {
      return this.mode === "session";
    }
    if (1 + this.activeOtherGhostCount(Date.now()) > MAX_GHOSTS_PER_ROOM) {
      return false;
    }
    this.mode = "session";
    this.dismissing = false;
    // A small hello: three soft splats rising from the ghost's position.
    for (let k = 0; k < 3; k++) {
      this.schedule(
        k * 140,
        () => {
          this.emit(
            {
              position: { x: this.position.x, y: this.position.y - k * 0.03 },
              force: { x: 0, y: -60 - k * 30 },
              pressure: 0.35 + k * 0.1,
              color: this.sigColor,
            },
            true
          );
        },
        true
      );
    }
    this.publishPresence();
    return true;
  }

  /** Dismiss your own session ghost: a soft goodbye, then it stops. */
  dismiss(): void {
    if (this.mode !== "session" || this.dismissing) return;
    this.dismissing = true;
    this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
    for (let k = 0; k < 4; k++) {
      this.schedule(
        k * 170,
        () => {
          this.emit(
            {
              position: {
                x: clamp01(this.position.x + k * 0.035),
                y: clamp01(this.position.y + k * 0.05),
              },
              force: { x: 40, y: 70 },
              pressure: 0.42 - k * 0.07,
              color: this.sigDriftColor,
            },
            true
          );
        },
        true
      );
    }
    this.schedule(
      850,
      () => {
        this.mode = "solo";
        this.dismissing = false;
        this.publishPresence();
      },
      true
    );
    this.publishPresence();
  }

  /**
   * Bias behavior with a brain-chosen directive (allowlist enforced).
   * ttlMs defaults to BIAS_TTL_MS (the old one-word poll's horizon);
   * deliberation passes the decision's own linger so a steer lasts
   * exactly as long as the brain asked.
   */
  setMoodBias(bias: GhostMoodBias, ttlMs: number = BIAS_TTL_MS): void {
    this.bias = bias;
    this.biasExpiresAt = Date.now() + ttlMs;
  }

  /** Any user activity that is not a canvas stroke (e.g. sending a verb). */
  noteUserActivity(): void {
    this.lastActivityAt = Date.now();
    if (this.temperament === "sleepy") this.setTemperament("curious");
    this.publishPresence();
  }

  /**
   * The ghost's live heartbeat tempo. The base rate belongs to its
   * temperament; arousal raises it — recent pets count most, then
   * verbs and strong nearby splats. A petted playful ghost therefore
   * literally beats faster than the same ghost left alone.
   */
  heartbeatBpm(now = Date.now()): number {
    const base: Record<GhostTemperament, number> = {
      sleepy: 48,
      curious: 68,
      sassy: 78,
      affectionate: 84,
      playful: 92,
    };
    const recentPets = this.petTimes.filter((t) => now - t < 5_000).length;
    const recentVerbs = this.verbsSeenLog.filter(
      (v) => now - v.at < 15_000
    ).length;
    const splatBoost =
      this.nearbySplat.at > 0 && now - this.nearbySplat.at < 10_000
        ? this.nearbySplat.intensity * 10
        : 0;
    return Math.round(
      Math.min(
        132,
        Math.max(
          42,
          base[this.temperament] +
            Math.min(24, recentPets * 8) +
            Math.min(12, recentVerbs * 4) +
            splatBoost
        )
      )
    );
  }

  /**
   * The raw state the ID card's vitals derive from (Slice 22 —
   * ghostVitals.computeGhostVitals does the reading). A snapshot,
   * never a store: the peer's journals stay the one truth, and
   * the card's numbers can always be re-derived from them.
   */
  getVitalsSnapshot(now = Date.now()): {
    ghostSeed: number;
    bpm: number;
    petsReceived30m: number;
    verbsReceived30m: number;
    secondsSinceHumanTouch: number;
    emits10m: number;
    deliberations30m: number;
    restSeconds: number;
  } {
    return {
      ghostSeed: this.options.identity.seed,
      bpm: this.heartbeatBpm(now),
      petsReceived30m: this.petReceivedTimes.filter(
        (t) => now - t < 30 * 60_000
      ).length,
      verbsReceived30m: this.verbsSeenLog.filter(
        (v) => now - v.at < 30 * 60_000
      ).length,
      secondsSinceHumanTouch: Math.max(
        0,
        Math.round((now - this.lastActivityAt) / 1000)
      ),
      emits10m: this.emitHistory.filter((t) => now - t < 10 * 60_000).length,
      deliberations30m: this.deliberationTimes.filter(
        (t) => now - t < 30 * 60_000
      ).length,
      restSeconds:
        this.presence === "sleeping"
          ? Math.max(0, Math.round((now - this.presenceSince) / 1000))
          : 0,
    };
  }

  /**
   * Slice 47: fire a sound event WITH its articulation context —
   * the ghost's current temperament always; the intensity of the
   * brain decision whose performance caused the sound, when one
   * did (reflex and verb sounds are temperament-shaped only);
   * the live tempo for a heartbeat answer. The voice layer
   * (ghostVoice via useGhostSfx) turns the context into a
   * generated utterance; the peer never picks pitches itself.
   */
  private emitSfx(kind: GhostSfxKind, extra?: GhostSfxContext): void {
    if (!this.options.onSfx) return;
    this.options.onSfx(kind, {
      temperament: this.temperament,
      intensity:
        extra?.intensity ??
        (kind === "thinking" ? undefined : this.lastBrainIntensity),
      bpm: extra?.bpm,
      // Slice 52: a composed sound's spec rides to the voice —
      // the composition IS the utterance for a "composed" cue.
      sound: extra?.sound,
    });
  }

  /**
   * Answer a direct heartbeat request with a generated pulse at the
   * ghost's body, in its signature color. This is not the HEART verb
   * macro: two unequal strikes (lub, then a softer dub), a rest, and
   * six cycles at the ghost's CURRENT tempo. Every strike goes
   * through schedule() + emit(), so presence gates, the 16/10s hard
   * budget, the crowd sub-budget, and session broadcast rules all
   * remain exactly as hard as they are for reflex behavior.
   * Returns the BPM used, or null when the ghost cannot answer.
   */
  answerHeartbeat(): number | null {
    if (this.destroyed || !this.enabled || this.dismissing) return null;
    // Being asked is itself company: wake and timestamp the contact.
    this.noteUserActivity();
    if (!this.canAct()) return null;
    const now = Date.now();
    const bpm = this.heartbeatBpm(now);
    const beatMs = 60_000 / bpm;
    const cycles = 6;
    const phraseBeats = 0.38 + 0.38 + 1; // lub + dub + a full rest beat
    this.journal("answered heartbeat request", now);
    this.markDeliberationDirty();
    this.options.onPerformance?.(`answered: heartbeat @ ${bpm}bpm`);
    // Slice 47: the answer SOUNDS at the same live tempo it splats
    // at — its own family now, not the heart-verb chime.
    this.emitSfx("heartbeat", { bpm });

    for (let cycle = 0; cycle < cycles; cycle++) {
      const cycleStart = cycle * phraseBeats * beatMs;
      const strikes: Array<{ offset: number; strength: number }> = [
        { offset: cycleStart, strength: 1 },
        { offset: cycleStart + 0.38 * beatMs, strength: 0.74 },
      ];
      strikes.forEach(({ offset, strength }, strikeIndex) => {
        this.schedule(offset, () => {
          if (!this.canAct()) return;
          const wobble = (this.rng() - 0.5) * 0.018;
          this.emit({
            position: {
              x: clamp01(this.position.x + wobble),
              y: clamp01(this.position.y + (strikeIndex === 0 ? 0 : 0.012)),
            },
            force: {
              x: (this.rng() - 0.5) * 50,
              y: -55 * strength,
            },
            pressure: 0.34 + 0.34 * strength,
            color: this.sigColor,
          });
        });
      });
    }
    return bpm;
  }

  /**
   * Warm Welcome (Slice 24, the Good Host power-up): greet a guest
   * who just joined my primary's hosted session with one verb.
   * The greeting is NOT free and NOT extra: in session mode a verb
   * performance is a three-splat burst, and this method first
   * checks the SAME emit window emit() enforces — when fewer than
   * WELCOME_COST emits remain in the window, there is no greeting
   * and false is returned. Nothing is charged for the check; the
   * scheduled burst pays emit()'s ordinary price when it fires,
   * and emit() remains the final enforcer if the room spends the
   * headroom in between. Session mode only: a welcome belongs to
   * a hosted room, and a ghost that isn't summoned into it has
   * nobody to welcome.
   */
  warmWelcome(verbId: GhostVerbAskId): boolean {
    if (this.destroyed || !this.enabled || this.dismissing) return false;
    if (this.mode !== "session") return false;
    if (!this.canAct()) return false;
    const now = Date.now();
    const inWindow = this.emitTimes.filter(
      (t) => now - t < EMIT_WINDOW_MS
    ).length;
    if (EMIT_BUDGET - inWindow < WELCOME_COST) return false;
    this.journal("warm welcome", now);
    this.options.onPerformance?.("welcomed a guest");
    if (verbId === "heart") {
      this.brainHeart(0.65);
    } else {
      this.performVerbAct(verbId === "cheer" ? CHEER : TICKLE, 0.65);
    }
    return true;
  }

  /**
   * Notice an encounter (Slice 59): someone the primary follows
   * or friended just listed a fabric in the lobby, and the
   * discovery service's discipline (once per encounter, first
   * sync silent, bursts coalesced) decided this arrival earns a
   * reaction. The reaction is a greeting chirp — the "sniff"
   * cue, the greeting family of the generative voice — and
   * nothing else: the person is NOT in this room, so there is
   * no verb, no splat, no room act to perform, and pretending
   * otherwise would be theater. Presence and budget gates bind
   * exactly as they do for every other utterance: a sleeping or
   * absent ghost does not chirp. Returns true when it reacted.
   */
  noteEncounter(name: string): boolean {
    if (this.destroyed || !this.enabled || this.dismissing) return false;
    // Being noticed is itself company: wake and timestamp it.
    this.noteUserActivity();
    if (!this.canAct()) return false;
    const now = Date.now();
    const who = typeof name === "string" && name.trim() ? name.trim().slice(0, 40) : "someone";
    this.journal(`noticed ${who} in the lobby`, now);
    this.options.onPerformance?.(`noticed: ${who} is around`);
    this.emitSfx("sniff");
    return true;
  }

  /**
   * Answer a direct verb request ("tickle, Boop") by performing
   * the verb as the ghost's own act (Slice 23, the verb-perform
   * tool). This is not the VerbBar macro and not the generic
   * interpreter: the ghost itself performs, through the same
   * machinery as its deliberated verbs — performVerbAct's verb
   * clock and session degrade, emit()'s budgets, presence gates.
   * Returns the verb performed, or null when the ghost cannot act.
   */
  answerVerb(verbId: GhostVerbAskId): GhostVerbAskId | null {
    if (this.destroyed || !this.enabled || this.dismissing) return null;
    // Being asked is itself company: wake and timestamp the contact.
    this.noteUserActivity();
    if (!this.canAct()) return null;
    const now = Date.now();
    this.journal(`answered: ${verbId} on request`, now);
    this.markDeliberationDirty();
    this.options.onPerformance?.(`answered: ${verbId} on request`);
    if (verbId === "heart") {
      this.brainHeart(0.75);
    } else {
      this.performVerbAct(verbId === "cheer" ? CHEER : TICKLE, 0.75);
    }
    return verbId;
  }

  /**
   * Answer a direct See act — "ghostie, touch the apple" — by
   * touching the found spot AS the ghost (Slice 30). This is
   * the Slice 23 machinery, not a new path: the fabric draw
   * gate decides first (a touch is a mark on the fabric), the
   * splat rides schedule() + emit() so the 16/10s hard budget,
   * the crowd sub-budget and session broadcast rules bind
   * exactly as they do for reflex behavior, and the headroom
   * check is read-only like Warm Welcome's — emit() stays the
   * final enforcer and the only charger. The touch lands in
   * the ghost's signature color at the region's center, with a
   * force scaled mildly by the region's size.
   */
  answerTouchAt(
    x: number,
    y: number,
    radius: number,
    targetLabel: string
  ): GhostActResult {
    if (this.destroyed || !this.enabled || this.dismissing) {
      return "unavailable";
    }
    // Being asked is itself company: wake and timestamp the contact.
    this.noteUserActivity();
    if (!this.canAct()) return "unavailable";
    const now = Date.now();
    if (this.drawGateRefusal(now, "touch")) return "refused";
    const inWindow = this.emitTimes.filter(
      (t) => now - t < EMIT_WINDOW_MS
    ).length;
    if (EMIT_BUDGET - inWindow < 1) {
      this.journal("wanted to touch — budget spent", now);
      return "unavailable";
    }
    const px = clamp01(x);
    const py = clamp01(y);
    const r = Math.min(1, Math.max(0.05, radius));
    this.journal(`answered: touched ${targetLabel} on request`, now);
    this.markDeliberationDirty();
    this.options.onPerformance?.(`touched ${targetLabel} on request`);
    this.emitSfx("play");
    this.schedule(0, () => {
      if (!this.canAct()) return;
      this.emit({
        position: { x: px, y: py },
        force: { x: 0, y: -(50 + r * 170) },
        pressure: 0.55,
        color: this.sigColor,
      });
    });
    return "performed";
  }

  /**
   * Answer a direct See act — "ghostie, draw a circle around
   * the chair" — by drawing the fitted ring AS the ghost
   * (Slice 30). The gate, the cooldown and the budget charge
   * are performDraw's own, shared helpers and all: an asked
   * ring costs exactly what a deliberated drawing costs
   * (DRAW_BUDGET_COST of the window, DRAW_MIN_INTERVAL_MS of
   * quiet), and the recipe rides the host's draw sink, so it
   * renders here and ships on the recipe transport under the
   * ghost's peer id like every ghost drawing.
   */
  answerDrawAround(
    cx: number,
    cy: number,
    scale: number,
    targetLabel: string
  ): GhostActResult {
    if (this.destroyed || !this.enabled || this.dismissing) {
      return "unavailable";
    }
    // Being asked is itself company: wake and timestamp the contact.
    this.noteUserActivity();
    if (!this.canAct()) return "unavailable";
    const now = Date.now();
    if (this.drawGateRefusal(now, "draw")) return "refused";
    if (now - this.lastDrawAt < DRAW_MIN_INTERVAL_MS) {
      return "unavailable";
    }
    if (!this.chargePerformanceBudget(DRAW_BUDGET_COST)) {
      this.journal("wanted to draw — budget spent", now);
      return "unavailable";
    }
    this.lastDrawAt = now;
    this.drawCount += 1;
    const recipe = this.buildDrawRecipe(
      "ring",
      clamp01(cx),
      clamp01(cy),
      Math.min(0.5, Math.max(0.05, scale))
    );
    if (!recipe) return "unavailable"; // Inputs are clamped; stay total anyway.
    this.journal(
      `answered: drew a ring around ${targetLabel} on request`,
      now
    );
    this.markDeliberationDirty();
    this.options.onPerformance?.(
      `drew a ring around ${targetLabel} on request`
    );
    this.options.onDrawRecipe?.(recipe);
    return "performed";
  }

  /**
   * Play ONE note because the primary asked (Slice 31, the
   * note-perform tool): "play middle C", "play a note". A null
   * note is the ghost's choice — it answers with the note it
   * last heard a human play if it has one, then its own last
   * note, then middle C. Same gates, budget and cooldown as the
   * deliberated call-and-response: the fabric's notes rule
   * refuses outright ("refused"), and away from the Piano layer
   * the tool does not exist ("unavailable" — the caller answers
   * with the in-world redirect, never an error).
   */
  answerNote(note: string | null): GhostActResult {
    if (this.destroyed || !this.enabled || this.dismissing) {
      return "unavailable";
    }
    this.noteUserActivity();
    if (!this.canAct()) return "unavailable";
    const now = Date.now();
    if (this.noteGateRefusal(now, "play")) return "refused";
    if (this.noteLayerUnavailable()) return "unavailable";
    const target =
      note ?? this.lastHumanNote ?? this.lastPlayedNote ?? "C4";
    if (!isGhostNoteName(target)) return "unavailable";
    return this.performAskedNote(
      target,
      `answered: played ${target} on request`,
      `played ${target} on request`,
      NOTE_BUDGET_COST
    );
  }

  /**
   * "Play that again" (Slice 31): replay the last note a human
   * played at this piano, or the ghost's own last note when no
   * human note is remembered. Nothing remembered = nothing to
   * replay ("unavailable" — the caller falls back in-world).
   */
  answerNoteAgain(): GhostActResult {
    if (this.destroyed || !this.enabled || this.dismissing) {
      return "unavailable";
    }
    this.noteUserActivity();
    if (!this.canAct()) return "unavailable";
    const now = Date.now();
    if (this.noteGateRefusal(now, "play")) return "refused";
    if (this.noteLayerUnavailable()) return "unavailable";
    const target = this.lastHumanNote ?? this.lastPlayedNote;
    if (!target) return "unavailable";
    return this.performAskedNote(
      target,
      `answered: played ${target} again on request`,
      `played ${target} again on request`,
      NOTE_BUDGET_COST
    );
  }

  /**
   * Play an arpeggio because the primary asked (Slice 31): four
   * chord tones (root, third, fifth, octave) from the note the
   * ghost last heard or played — middle C when it has neither —
   * ascending, or descending when the ask said so. ONE tool
   * call, ONE budget charge of ARPEGGIO_BUDGET_COST, one
   * cooldown stamp; the notes themselves stagger ARPEGGIO_STEP_MS
   * apart through the sink.
   */
  answerArpeggio(descending = false): GhostActResult {
    if (this.destroyed || !this.enabled || this.dismissing) {
      return "unavailable";
    }
    this.noteUserActivity();
    if (!this.canAct()) return "unavailable";
    const now = Date.now();
    if (this.noteGateRefusal(now, "play")) return "refused";
    if (this.noteLayerUnavailable()) return "unavailable";
    const root = this.lastHumanNote ?? this.lastPlayedNote ?? "C4";
    const rootNum = ghostNoteNumber(root);
    if (rootNum === null) return "unavailable";
    if (now - this.lastNoteAt < NOTE_MIN_INTERVAL_MS) {
      return "unavailable";
    }
    if (!this.chargePerformanceBudget(ARPEGGIO_BUDGET_COST)) {
      this.journal("wanted to play — budget spent", now);
      return "unavailable";
    }
    this.lastNoteAt = now;
    const notes = [0, 4, 7, 12].map((step) => ghostNoteName(rootNum + step));
    if (descending) notes.reverse();
    this.lastPlayedNote = notes[notes.length - 1];
    this.journal("answered: played an arpeggio on request", now);
    this.markDeliberationDirty();
    this.options.onPerformance?.("played an arpeggio on request");
    notes.forEach((note, k) =>
      this.emitNoteToSink(note, 0.65, k * ARPEGGIO_STEP_MS)
    );
    return "performed";
  }

  /**
   * The asked single-note performance's shared tail (Slice 31):
   * cooldown, budget charge, journal, sink. The deliberated
   * call-and-response (performPlayNote) runs the same prices
   * through its own journal wording.
   */
  private performAskedNote(
    note: string,
    journalLabel: string,
    performanceLabel: string,
    cost: number
  ): GhostActResult {
    const now = Date.now();
    if (now - this.lastNoteAt < NOTE_MIN_INTERVAL_MS) {
      return "unavailable";
    }
    if (!this.chargePerformanceBudget(cost)) {
      this.journal("wanted to play — budget spent", now);
      return "unavailable";
    }
    this.lastNoteAt = now;
    this.lastPlayedNote = note;
    this.journal(journalLabel, now);
    this.markDeliberationDirty();
    this.options.onPerformance?.(performanceLabel);
    this.emitNoteToSink(note, 0.7, 0);
    return "performed";
  }

  /** One note into the sink, on the peer's own clock. */
  private emitNoteToSink(
    note: string,
    velocity: number,
    delayMs: number
  ): void {
    this.schedule(delayMs, () => {
      if (!this.canAct()) return;
      this.options.onNote?.(note, velocity, NOTE_DURATION_MS);
    });
  }

  /**
   * React to a request NO interpreter could shape (Hotfix 2.4, the
   * living fallback). The honest answer to an unshapeable ask is
   * not an error caption — it is the ghost being puzzled, in-world:
   * a curious drift toward the asker and a soft question-ripple in
   * its signature color (a low dot at the body, then a smaller one
   * up and to the side — the ghost tilting its head). It does NOT
   * pretend to perform the ask. Every splat goes through schedule()
   * + emit(), so presence gates, the 16/10s hard budget, the crowd
   * sub-budget, and session broadcast rules bind exactly as they do
   * for reflex behavior. Returns true when the ghost performed the
   * puzzlement; false when it cannot act (off, dismissing, gated) —
   * the caller then answers with the fabric itself.
   */
  expressPuzzlement(): boolean {
    if (this.destroyed || !this.enabled || this.dismissing) return false;
    // Being asked is itself company: wake and timestamp the contact.
    this.noteUserActivity();
    if (!this.canAct()) return false;
    const now = Date.now();
    this.journal("puzzled by an unshapeable ask", now);
    this.markDeliberationDirty();
    this.options.onPerformance?.("puzzled: tilted its head at that one");
    this.emitSfx("sniff");
    if (this.temperament === "sleepy") this.setTemperament("curious");

    // Curious drift toward the asker: lean body + wander target
    // toward the freshest contact's last point (the asker's hand is
    // the best local answer to "where the asker is"). With no fresh
    // contact — a voice ask from across the room — drift toward the
    // canvas center, where the asker is looking.
    let tx = 0.5;
    let ty = 0.46;
    let freshestAt = 0;
    for (const c of this.contacts.values()) {
      if (c.lastAt > freshestAt && c.points.length > 0) {
        freshestAt = c.lastAt;
        const p = c.points[c.points.length - 1];
        tx = p.x;
        ty = p.y;
      }
    }
    if (now - freshestAt > 60_000) {
      tx = 0.5;
      ty = 0.46;
    }
    this.position.x = clamp01(this.position.x + (tx - this.position.x) * 0.22);
    this.position.y = clamp01(this.position.y + (ty - this.position.y) * 0.22);
    this.wanderTarget.x = clamp01(
      this.wanderTarget.x + (tx - this.wanderTarget.x) * 0.3
    );
    this.wanderTarget.y = clamp01(
      this.wanderTarget.y + (ty - this.wanderTarget.y) * 0.3
    );

    // The question-ripple: two soft splats, body then brow.
    this.schedule(0, () => {
      if (!this.canAct()) return;
      this.emit({
        position: { x: this.position.x, y: this.position.y },
        force: { x: 0, y: -38 },
        pressure: 0.3,
        color: this.sigColor,
      });
    });
    this.schedule(280, () => {
      if (!this.canAct()) return;
      this.emit({
        position: {
          x: clamp01(this.position.x + 0.045),
          y: clamp01(this.position.y - 0.05),
        },
        force: { x: 8, y: -20 },
        pressure: 0.22,
        color: this.sigColor,
      });
    });
    return true;
  }

  /**
   * Be seen to hear (Slice 58, natural voice). A hot mic is
   * never invisible in Fabric, and the signal is the ghostie's
   * own body — never chrome, never a panel or a dot. The voice
   * surface reports the listener's transitions; the canvas
   * calls this, and the ghostie answers in-world:
   *
   * - attending (its name just landed): it PERKS — rises a
   *   little, leans toward the middle of the room where its
   *   person is looking, and wears a brief bright halo of its
   *   signature color, three soft splats blooming around the
   *   body. You can see that you were heard before it acts.
   * - listening (the loop armed, waiting for the name): one
   *   soft halo breath at the body — ears on, quietly.
   *
   * Every splat rides schedule() + emit(), so presence gates
   * and the hard budget bind exactly as for any act; a light
   * cooldown keeps the signal a gesture, not a strobe.
   * Returns true when the ghostie performed the signal.
   */
  expressAttention(attending: boolean): boolean {
    if (this.destroyed || !this.enabled || this.dismissing) return false;
    this.noteUserActivity();
    if (!this.canAct()) return false;
    const now = Date.now();
    if (now - this.lastAttentionAt < 900) return false;
    this.lastAttentionAt = now;
    if (attending) {
      this.journal("heard its name — attending", now);
      this.markDeliberationDirty();
      this.options.onPerformance?.("perked up at its name — listening");
      if (this.temperament === "sleepy") this.setTemperament("curious");
      // The perk: rise a little, lean toward the asker.
      this.position.y = clamp01(this.position.y - 0.03);
      this.position.x = clamp01(
        this.position.x + (0.5 - this.position.x) * 0.08
      );
      this.wanderTarget.y = clamp01(this.wanderTarget.y - 0.02);
      // The glow: a halo blooming around the body.
      for (let k = 0; k < 3; k++) {
        const angle = (k / 3) * Math.PI * 2 + 0.5;
        this.schedule(k * 140, () => {
          if (!this.canAct()) return;
          this.emit({
            position: {
              x: clamp01(this.position.x + Math.cos(angle) * 0.035),
              y: clamp01(this.position.y + Math.sin(angle) * 0.035),
            },
            force: { x: Math.cos(angle) * 14, y: -16 },
            pressure: 0.28,
            color: this.sigColor,
          });
        });
      }
    } else {
      this.journal("listening for its name", now);
      this.schedule(0, () => {
        if (!this.canAct()) return;
        this.emit({
          position: { x: this.position.x, y: this.position.y },
          force: { x: 0, y: -14 },
          pressure: 0.16,
          color: this.sigColor,
        });
      });
    }
    return true;
  }

  /**
   * A hand sign, SEEN (Slice 28, "Hands"). The local user's camera
   * reads their hand on-device; when a held sign fires, LegacyFluid
   * forwards it here. This is a SENSE, not an act: the ghost emits
   * nothing, spends nothing, and no gate is consulted — the sign
   * lands in the event journal, which is a deliberation input
   * (buildScenario's recent_events), so the brain's next decision
   * is made in a room where someone just showed it an open palm /
   * a peace sign / a fist / a thumbs up, in the dataset's own
   * vocabulary of plain event labels. Being shown a sign is
   * company, so it also wakes and timestamps like any activity.
   * Unknown sign ids are ignored — the vocabulary is an allowlist,
   * like every other stimulus the ghost accepts.
   */
  noteHandSign(sign: string): void {
    if (this.destroyed) return;
    const labels: Record<string, string> = {
      hold: "open palm received",
      peace: "peace sign received",
      fist: "fist received",
      thumbsup: "thumbs up received",
    };
    const label = labels[sign];
    if (!label) return;
    const now = Date.now();
    this.noteUserActivity();
    this.journal(label, now);
    this.markDeliberationDirty();
  }

  /**
   * A gesture TOKEN, READ (Slice 34, "Senses" Layer B1). The hands
   * engine's vocabulary tracker (src/hands/gestureVocabulary) turns
   * the local user's hand into tokens — open_palm, pinch, point,
   * finger_draw, wave, palm_push, the signs — and LegacyFluid
   * forwards each fired token here. This is a SENSE, like
   * noteHandSign: nothing is emitted, nothing is spent, no gate is
   * consulted. The reading lands in two places the brain reads:
   * the event journal ("gesture open_palm", the dataset's plain
   * event style) and the gesture log, which buildScenario carries
   * into the scenario's v2 `gestures` field — so both brain tiers
   * deliberate in a room where a hand just spoke, in the same
   * digest where Slice 33's utterances will land. Readings are
   * clamped through GhostBrain's sanitizer (the vocabulary
   * allowlist lives there): an out-of-vocabulary token is ignored,
   * and "none" — the vocabulary's word for a present-but-unread
   * hand — is deliberately NOT recorded: camera noise is not
   * company, and journaling it would mark deliberation dirty on
   * every unreadable frame's behalf. Being gestured at IS company,
   * so a real token wakes and timestamps like any activity.
   */
  noteGesture(reading: {
    token: string;
    hand?: string;
    confidence?: number;
    held_s?: number;
  }): void {
    if (this.destroyed) return;
    if (!reading || reading.token === "none") return;
    const clean = sanitizeGestureReadings([reading]);
    if (clean.length === 0) return;
    const now = Date.now();
    this.gestureLog.push({ ...clean[0], at: now });
    if (this.gestureLog.length > 8) {
      this.gestureLog = this.gestureLog.filter((g) => now - g.at < 45_000);
    }
    this.noteUserActivity();
    this.journal(`gesture ${clean[0].token}`, now);
    this.markDeliberationDirty();
  }

  /**
   * The Generative-music standing request (Slice 68). The host
   * (LegacyFluid) feeds the layer's music framing while the
   * toggle is on — the human's chosen scale, pattern hint and
   * tempo — and clears it when the toggle goes off. This is a
   * STANDING REQUEST, not a stimulus: it rides every scenario
   * while it stands, and the phrase clock alone marks a
   * deliberation due (see tick). Setting it never performs
   * anything by itself.
   */
  setMusicStanding(
    standing: { scale: string; patternHint: string; tempoBpm: number } | null
  ): void {
    this.musicStanding = standing;
    if (!standing) {
      this.musicDuePending = false;
    } else if (this.nextMusicAt === 0) {
      // First phrase comes promptly; the clock paces the rest.
      this.nextMusicAt = Date.now() + MUSIC_MIN_INTERVAL_MS;
    }
  }

  /**
   * A MIDI pack's seed phrase (Slice 68), parsed by the host
   * through the pack seam (midiPhrase.ts) and handed over as
   * plain MIDI numbers. The brain may quote and vary it when
   * authoring; the pack never plays itself.
   */
  setMusicPackNotes(notes: number[] | null): void {
    this.musicPackNotes =
      notes && notes.length >= 3 ? notes.slice(0, 32) : null;
  }

  /**
   * The compute field moved (Slice 36, "The Fold"). LegacyFluid
   * forwards the field's digest (src/genx's senseSnapshotOf, via
   * the genx store) whenever it changes while the Fold is the
   * loaded fabric. This is a SENSE, like noteGesture: nothing is
   * emitted, nothing is spent, no gate is consulted. The digest
   * is clamped through GhostBrain's sanitizer — the field's
   * numbers arrive as untrusted wire-derived data like any
   * other — and lands in the scenario's v2 `genx` field, so both
   * brain tiers deliberate in a room whose fold they can feel.
   *
   * TRANSITIONS are journaled in the dataset's event style and
   * marked one-shot for the overlay: the fold completing
   * ("the fold is complete"), a shard crossing into stalled
   * ("a shard went quiet"), a bridged node's FAH coming online
   * ("a folding node is reporting"). Steady states journal
   * nothing — the digest rides the scenario, the journal carries
   * only what CHANGED, and a ghost that re-announced the field's
   * progress every few seconds would be chatter, not company.
   */
  noteGenx(snapshot: GenxSenseSnapshot): void {
    if (this.destroyed) return;
    const clean = sanitizeGenxContext({
      nodes_online: snapshot?.nodesOnline,
      field_load: snapshot?.fieldLoad,
      mission_progress: snapshot?.missionProgress,
      shards_done: snapshot?.shardsDone,
      shards_total: snapshot?.shardsTotal,
      fah_online: snapshot?.fahOnline,
      stalled: snapshot?.stalled,
      fold_just_completed: false,
      shard_just_stalled: false,
    });
    if (!clean) return;
    const now = Date.now();
    const prev = this.genxDigest?.ctx ?? null;
    this.genxDigest = { ctx: clean, at: now };
    if (!prev) return;
    let marked = false;
    if (
      clean.shards_total > 0 &&
      clean.mission_progress >= 1 &&
      prev.mission_progress < 1
    ) {
      this.genxFoldJustCompleted = true;
      this.journal("the fold is complete", now);
      marked = true;
    }
    if (clean.stalled > prev.stalled) {
      this.genxShardJustStalled = true;
      this.journal("a shard went quiet", now);
      marked = true;
    }
    if (clean.fah_online && !prev.fah_online) {
      this.journal("a folding node is reporting", now);
      marked = true;
    }
    if (marked) this.markDeliberationDirty();
  }

  /**
   * A human played a note at the piano (Slice 31). LegacyFluid
   * forwards bus note-ons here while the Piano layer is front —
   * local keys and remote peers' notes alike (both ride the
   * bus); the ghost's own sink emissions are guarded out by the
   * host, so everything that lands here is a person playing.
   * This is a SENSE, like noteHandSign: nothing is emitted and
   * nothing is spent. The note is remembered (the
   * call-and-response memory: answerNoteAgain and the arpeggio's
   * root read it) and journaled in the dataset's event
   * vocabulary, so the brain's next deliberation happens in a
   * room where someone just played — and the brain's NOTE
   * overlay may answer it. Playing near the ghost is company:
   * it wakes and timestamps like any activity.
   */
  noteHumanNote(note: string): void {
    if (this.destroyed) return;
    if (!isGhostNoteName(note)) return;
    this.lastHumanNote = note;
    const now = Date.now();
    this.noteUserActivity();
    this.journal(`human played ${note}`, now);
    this.markDeliberationDirty();
  }

  /**
   * Someone SAID something (Slice 33, "Understands"). The voice
   * path and the typed path both land here (LegacyFluid routes a
   * claimed utterance), tagged with the transcription confidence
   * when the hearing path reported one. This is a SENSE, like
   * noteHandSign and noteHumanNote — but a sense with an
   * immediate reflex of its own, because the layer's contract is
   * acknowledge-before-acting:
   *
   *   1. ACKNOWLEDGE at ghost scale, now: a soft ear-perk lean
   *      toward the speaker and two small signature splats (the
   *      acknowledgment beat in acknowledgeUtterance). Skipping
   *      it would read as a trigger, not understanding.
   *   2. REMEMBER: the utterance becomes the pending context the
   *      next deliberation's scenario carries (buildScenario),
   *      and repetition is counted — the same words inside the
   *      window are a NEW fact ("said it again"), and the count
   *      rides along so no tier may answer a repeat identically.
   *   3. DELIBERATE promptly: the tick's utterance window opens
   *      on UTTERANCE_MIN_INTERVAL_MS, not the ambient 10s floor.
   *
   * Failure honesty is decided HERE, at the sense, for the case
   * no brain may paper over: a hearing whose reported confidence
   * is under the floor is not deliberated on at all — the ghost
   * performs puzzlement (expressPuzzlement: the ear-tilt and
   * question-ripple) and the verdict is "uncertain". Garbled
   * words that carry no confidence score still deliberate; the
   * brain's own reading decides uncertainty there.
   */
  noteUtterance(
    text: string,
    opts?: { confidence?: number | null; speaker?: GhostUtteranceSpeaker }
  ): GhostUtteranceResult {
    if (this.destroyed || !this.enabled || this.dismissing) {
      return "unavailable";
    }
    const heard = sanitizeUtteranceContext({
      text,
      asr_confidence: opts?.confidence ?? null,
      speaker: opts?.speaker ?? "primary",
      repeats: 0,
    });
    if (!heard) return "unavailable";
    const now = Date.now();
    // Being spoken to is company: wake and timestamp the contact.
    this.noteUserActivity();
    if (
      heard.asr_confidence !== null &&
      heard.asr_confidence < UTTERANCE_CONFIDENCE_FLOOR
    ) {
      this.journal("couldn't make that out", now);
      this.markDeliberationDirty();
      this.expressPuzzlement();
      return "uncertain";
    }
    const key = heard.text.toLowerCase();
    const repeats =
      this.lastUtteranceKey === key &&
      now - this.lastUtteranceAt < UTTERANCE_REPEAT_WINDOW_MS
        ? this.lastUtteranceRepeats + 1
        : 0;
    this.lastUtteranceKey = key;
    this.lastUtteranceAt = now;
    this.lastUtteranceRepeats = repeats;
    this.pendingUtterance = { ...heard, repeats };
    this.journal(repeats > 0 ? "said it again" : "someone spoke", now);
    this.acknowledgeUtterance(now);
    this.options.onPerformance?.(
      repeats > 0 ? "heard an utterance — again" : "heard an utterance"
    );
    this.markDeliberationDirty();
    return "heard";
  }

  /** The freshest contact's last point, or the canvas center. */
  private freshestContactPoint(now: number): { x: number; y: number } {
    let tx = 0.5;
    let ty = 0.46;
    let freshestAt = 0;
    for (const c of this.contacts.values()) {
      if (c.lastAt > freshestAt && c.points.length > 0) {
        freshestAt = c.lastAt;
        const p = c.points[c.points.length - 1];
        tx = p.x;
        ty = p.y;
      }
    }
    if (now - freshestAt > 60_000) {
      tx = 0.5;
      ty = 0.46;
    }
    return { x: tx, y: ty };
  }

  /**
   * The acknowledgment beat (Slice 33, variation rule 3): the
   * first beat of any utterance response, at ghost scale — a
   * gentle lean toward whoever spoke and two soft splats in the
   * ghost's own color (a dot at the body, a smaller one up and
   * to the side: an ear perking). Smaller than puzzlement's
   * ripple — this ghost HEARD you; it is the substantive answer
   * that deliberation owes, not this. Through schedule() +
   * emit(), so presence gates and the emit budgets bind exactly
   * as they do for every other act.
   */
  private acknowledgeUtterance(now: number): void {
    if (!this.canAct()) return;
    this.emitSfx("sniff");
    const target = this.freshestContactPoint(now);
    this.position.x = clamp01(
      this.position.x + (target.x - this.position.x) * 0.12
    );
    this.position.y = clamp01(
      this.position.y + (target.y - this.position.y) * 0.12
    );
    this.schedule(0, () => {
      if (!this.canAct()) return;
      this.emit({
        position: { x: this.position.x, y: this.position.y },
        force: { x: 0, y: -30 },
        pressure: 0.24,
        color: this.sigColor,
      });
    });
    this.schedule(240, () => {
      if (!this.canAct()) return;
      this.emit({
        position: {
          x: clamp01(this.position.x + 0.03),
          y: clamp01(this.position.y - 0.035),
        },
        force: { x: 6, y: -16 },
        pressure: 0.17,
        color: this.sigColor,
      });
    });
  }

  /**
   * Feed one HUMAN participant interaction into the brain — the local
   * user's strokes and every remote human peer's, so the ghost can
   * react to anyone in the room. `origin` says whose hand it was: the
   * courtesy gates key on the local user alone (see lastLocalEventAt),
   * while room activity still feeds the energy clocks (lastActivityAt
   * drives sleep/temperament; lastRemoteEventAt marks a hot room).
   * Ghost-authored interactions must go through noteGhostSighting
   * instead; verb interactions count as activity only.
   */
  noteInteraction(i: FluidInteraction, origin: "local" | "remote" = "remote"): void {
    if (isGhostPeerId(i.userId)) return;
    const now = i.timestamp || Date.now();
    this.lastActivityAt = now;
    if (origin === "local") {
      this.lastLocalEventAt = now;
    } else {
      this.lastRemoteEventAt = now;
    }
    if (this.temperament === "sleepy") this.setTemperament("curious");
    if (i.verb) {
      // Verbs are scenario context for the brain (seen, not acted on).
      this.verbsSeenLog.push({ id: i.verb, at: now });
      this.journal(`${i.verb} received`, now);
      this.markDeliberationDirty();
      this.publishPresence();
      return;
    }

    // Scenario tracking for the brain: energy + nearby splat strength.
    this.humanEventTimes.push(now);
    if (this.humanEventTimes.length > 400) {
      this.humanEventTimes = this.humanEventTimes.filter(
        (t) => now - t < 90_000
      );
    }
    if (
      dist2(i.position.x, i.position.y, this.position.x, this.position.y) <
      0.42 * 0.42
    ) {
      const decayed =
        this.nearbySplat.at === 0
          ? 0
          : this.nearbySplat.intensity *
            Math.exp(-(now - this.nearbySplat.at) / 20_000);
      this.nearbySplat = {
        intensity: Math.max(decayed, i.pressure ?? 0.4),
        at: now,
      };
      if ((i.pressure ?? 0) >= 0.9) {
        this.journal("loud splat nearby", now);
        this.markDeliberationDirty();
      }
    }

    this.maybeStartle(i, now);
    this.registerPet(i, now, origin);

    let contact = this.contacts.get(i.userId);
    if (contact && now - contact.lastAt > CONTACT_GAP_MS) {
      this.finalizeContact(contact);
      this.contacts.delete(i.userId);
      contact = undefined;
    }
    if (!contact) {
      contact = { userId: i.userId, startedAt: now, lastAt: now, points: [] };
      this.contacts.set(i.userId, contact);
    }
    contact.points.push({
      x: i.position.x,
      y: i.position.y,
      fx: i.force?.x ?? 0,
      fy: i.force?.y ?? 0,
      pressure: i.pressure ?? 0.5,
      t: now,
    });
    if (contact.points.length > 60) contact.points.shift();
    contact.lastAt = now;
    this.publishPresence();
  }

  /**
   * Feed one GHOST-authored interaction (from the broadcast stream) into
   * social perception: track the other ghost's position and, in session
   * mode, run the greeting ritual. Own-ghost and stale ids are ignored.
   */
  noteGhostSighting(i: FluidInteraction): void {
    if (!isGhostPeerId(i.userId) || i.userId === this.peerId) return;
    const now = Date.now();
    const isNew = !this.otherGhosts.has(i.userId);
    this.otherGhosts.set(i.userId, {
      x: i.position.x,
      y: i.position.y,
      lastSeen: now,
    });
    if (isNew) {
      this.options.onGhostsChange?.(this.otherGhosts.size);
      this.journal("ghost entered", now);
      this.markDeliberationDirty();
    }
    if (i.verb) {
      this.ghostLastAction.set(i.userId, i.verb);
    } else if (!this.ghostLastAction.has(i.userId)) {
      this.ghostLastAction.set(i.userId, "drift");
    }

    // Greetings only happen while my own ghost is summoned & social.
    // Shared settings gate (Slice 20): with "Socialize with other
    // ghosties" off, sightings are still tracked above (perception
    // stays honest) but no greeting ever starts.
    if (
      this.mode !== "session" ||
      !this.enabled ||
      this.dismissing ||
      !this.sharedSettings.socialize ||
      this.social.phase !== "none" ||
      (this.aloofUntil.get(i.userId) ?? 0) > now
    ) {
      return;
    }

    if (!this.metBefore.has(i.userId)) {
      // First meeting this session: approach, then sniff.
      this.social = {
        phase: "approach",
        targetId: i.userId,
        until: now + 5_000,
        nextActionAt: 0,
      };
    } else if (this.rng() < 0.5) {
      // Old friends skip the sniff — straight to play or social idle.
      this.decideAfterSniff(i.userId, true);
    }
  }

  /**
   * Slice 21: where another ghost was last sensed on this canvas
   * (normalized coordinates), or null when it hasn't been seen or
   * the sighting has gone stale (the same GHOST_STALE_MS horizon
   * the social brain prunes on). Read-only and position-only: the
   * profile card's "Pet their ghostie" aims its strokes here, so
   * a card pet is aimed at the ghost as this device actually
   * perceives it — never at a position the wire merely claims.
   */
  otherGhostPosition(peerId: string): { x: number; y: number } | null {
    const g = this.otherGhosts.get(peerId);
    if (!g) return null;
    if (Date.now() - g.lastSeen > GHOST_STALE_MS) return null;
    return { x: g.x, y: g.y };
  }

  /**
   * Slice 53: where THIS ghost's body is right now (normalized
   * coordinates) — the own-body twin of otherGhostPosition.
   * Read-only and position-only: the Playground's Draw control
   * aims the ghost's own draw tool at its body ("draw a ring
   * around yourself"), the same place its deliberated drawings
   * land. Null when the ghost cannot act (off / dismissing /
   * destroyed), so a caller never aims for a ghost that isn't
   * there.
   */
  bodyPosition(): { x: number; y: number } | null {
    if (this.destroyed || !this.enabled || this.dismissing) return null;
    return { x: this.position.x, y: this.position.y };
  }

  // ---------------------------------------------------------- petting

  private registerPet(
    i: FluidInteraction,
    now: number,
    origin: "local" | "remote"
  ): void {
    // Shared settings gate (Slice 20): "Accept pets from others"
    // off means a REMOTE stroke on the ghost does not land as a
    // pet at all — no lean, no burst, no PURR/HEART credit, no
    // pet context for the brain. The primary's own hand always
    // lands; PURR/HEART mechanics for accepted pets are unchanged.
    if (origin === "remote" && !this.sharedSettings.acceptRemotePets) {
      return;
    }
    if (
      dist2(i.position.x, i.position.y, this.position.x, this.position.y) >
      PET_RADIUS * PET_RADIUS
    ) {
      return;
    }

    // A sassy ghost occasionally pointedly ignores a pet.
    if (this.temperament === "sassy" && this.rng() < 0.25) {
      this.wanderTarget.x = clamp01(
        this.position.x - (i.position.x - this.position.x) * 0.6
      );
      this.wanderTarget.y = clamp01(
        this.position.y - (i.position.y - this.position.y) * 0.6
      );
      return;
    }

    // Lean toward the stroking hand.
    const lean = this.temperament === "affectionate" ? 0.26 : 0.18;
    this.position.x = clamp01(
      this.position.x + (i.position.x - this.position.x) * lean
    );
    this.position.y = clamp01(
      this.position.y + (i.position.y - this.position.y) * lean
    );
    this.wanderTarget.x = clamp01(
      this.wanderTarget.x + (i.position.x - this.wanderTarget.x) * 0.25
    );
    this.wanderTarget.y = clamp01(
      this.wanderTarget.y + (i.position.y - this.wanderTarget.y) * 0.25
    );

    this.petTimes = this.petTimes.filter((t) => now - t < 9_000);
    this.petTimes.push(now);
    // Vitals journal: a landed pet nourishes for 30 minutes.
    this.petReceivedTimes = this.petReceivedTimes.filter(
      (t) => now - t < 30 * 60_000
    );
    this.petReceivedTimes.push(now);
    // A landed pet is meaningful context for the brain.
    this.journal(
      `pet x${this.petTimes.filter((t) => now - t < 5_000).length}`,
      now
    );
    this.markDeliberationDirty();
    if (this.rng() < 0.7) this.setTemperament("affectionate");

    // Happy burst — small, soft, rate-limited.
    if (now - this.lastPetBurstAt > PET_BURST_COOLDOWN_MS) {
      this.lastPetBurstAt = now;
      this.schedule(120, () => {
        if (!this.canAct()) return;
        for (let k = 0; k < 3; k++) {
          const angle = this.rng() * Math.PI * 2;
          this.emit({
            position: { x: this.position.x, y: this.position.y },
            force: { x: Math.cos(angle) * 90, y: Math.sin(angle) * 90 },
            pressure: 0.42,
            color: this.sigColor,
          });
        }
      });
    }

    const recentPets = this.petTimes.filter((t) => now - t < 5_000).length;
    const purrThreshold = this.temperament === "affectionate" ? 3 : 4;

    // Sustained petting -> purr (ghost-only verb, standard effect path).
    if (recentPets >= purrThreshold && now - this.lastPurrAt > PET_PURR_COOLDOWN_MS) {
      this.lastPurrAt = now;
      this.schedule(250, () => {
        if (!this.canAct()) return;
        this.emitVerb(PURR);
      });
    }

    // Lots of sustained petting -> an occasional heart.
    if (
      this.petTimes.length >= 8 &&
      now - this.lastPetHeartAt > PET_HEART_COOLDOWN_MS
    ) {
      this.lastPetHeartAt = now;
      this.petTimes = [];
      this.schedule(450, () => {
        if (!this.canAct()) return;
        this.emitVerb(HEART);
      });
    }
  }

  // ---------------------------------------------------------- startle

  private maybeStartle(i: FluidInteraction, now: number): void {
    if (
      (i.pressure ?? 0) < 0.95 ||
      now - this.lastStartleAt < STARTLE_COOLDOWN_MS ||
      dist2(i.position.x, i.position.y, this.position.x, this.position.y) >
        STARTLE_RADIUS * STARTLE_RADIUS
    ) {
      return;
    }
    this.lastStartleAt = now;
    // Hop away from the big splat.
    let dx = this.position.x - i.position.x;
    let dy = this.position.y - i.position.y;
    const len = Math.hypot(dx, dy) || 1;
    dx = (dx / len) * 0.11;
    dy = (dy / len) * 0.11;
    const from = { ...this.position };
    this.position.x = clamp01(this.position.x + dx);
    this.position.y = clamp01(this.position.y + dy);
    this.wanderTarget.x = clamp01(this.position.x + dx * 0.6);
    this.wanderTarget.y = clamp01(this.position.y + dy * 0.6);
    this.setTemperament("curious");
    this.schedule(60, () => {
      if (!this.canAct()) return;
      this.emitSfx("startle");
      this.emit({
        position: from,
        force: { x: dx * 900, y: dy * 900 },
        pressure: 0.5,
        color: this.sigColor,
      });
      this.emit({
        position: { x: this.position.x, y: this.position.y },
        force: { x: dx * 500, y: dy * 500 },
        pressure: 0.35,
        color: this.sigColor,
      });
    });
  }

  // ---------------------------------------------------------- contacts

  private finalizeContact(contact: Contact): void {
    const duration = contact.lastAt - contact.startedAt;
    const points = contact.points;
    if (points.length === 0) return;

    if (duration <= TAP_MAX_DURATION_MS && points.length <= 5) {
      // A tap — collect it toward a possible rhythm.
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
      const list = (this.taps.get(contact.userId) ?? []).filter(
        (t) => contact.startedAt - t.t < RHYTHM_WINDOW_MS
      );
      list.push({ t: contact.startedAt, x: cx, y: cy });
      if (list.length >= 3) {
        this.taps.set(contact.userId, []);
        this.scheduleResponse(list);
      } else {
        this.taps.set(contact.userId, list);
      }
      return;
    }

    if (points.length >= 3) {
      this.scheduleMirror(points);
    }
  }

  /** Echo a softened, slightly offset copy of a finished stroke. */
  private scheduleMirror(points: ContactPoint[]): void {
    if (!this.canAct()) return;
    // Crowd role samples its responses: playing along, not answering
    // every stroke in the room. Summoned (session) ghosts answer all.
    if (this.inCrowd() && this.rng() >= 0.6) return;
    const bias = this.currentBias();
    const delay =
      bias === "mirror" ? 500 + this.rng() * 300 : 700 + this.rng() * 450;
    const att =
      this.temperament === "curious" ? 0.75 : bias === "mirror" ? 0.8 : 0.6;
    const step = Math.max(1, Math.floor(points.length / 9));
    const sampled = points.filter((_, idx) => idx % step === 0).slice(0, 9);

    sampled.forEach((p, idx) => {
      this.schedule(delay + idx * 50, () => {
        if (!this.canAct() || this.localUserIsDrawing()) return;
        if (idx === 0) this.emitSfx("mirror");
        this.emit({
          position: { x: clamp01(p.x + 0.055), y: clamp01(p.y - 0.035) },
          force: { x: p.fx * att, y: p.fy * att },
          pressure: Math.max(0.15, p.pressure * 0.7),
          color: this.sigColor,
        });
      });
    });
  }

  /** Answer a quick tap rhythm with a simple variation of it. */
  private scheduleResponse(taps: Tap[]): void {
    if (!this.canAct()) return;
    // Crowd role samples its responses (see scheduleMirror).
    if (this.inCrowd() && this.rng() >= 0.6) return;
    const bias = this.currentBias();
    const delay = 480 + this.rng() * 250;
    const extra =
      bias === "tickle" || this.temperament === "playful"
        ? 1
        : this.rng() < 0.35
          ? 1
          : 0;
    const count = Math.min(6, Math.max(2, taps.length + extra));
    const cx = taps.reduce((s, t) => s + t.x, 0) / taps.length;
    const cy = taps.reduce((s, t) => s + t.y, 0) / taps.length;
    let interval = 260;
    if (taps.length > 1) {
      const gaps = taps.slice(1).map((t, idx) => t.t - taps[idx].t);
      interval =
        (gaps.reduce((s, g) => s + g, 0) / gaps.length) *
        (0.9 + this.rng() * 0.25);
    }

    for (let k = 0; k < count; k++) {
      this.schedule(delay + k * interval, () => {
        if (!this.canAct() || this.localUserIsDrawing()) return;
        this.emit({
          position: {
            x: clamp01(cx + (this.rng() - 0.5) * 0.07),
            y: clamp01(cy + (this.rng() - 0.5) * 0.07),
          },
          force: { x: (this.rng() - 0.5) * 36, y: (this.rng() - 0.5) * 36 },
          pressure: 0.5,
          color: this.sigColor,
        });
      });
    }
  }

  // ---------------------------------------------------------- society

  private activeOtherGhostCount(now: number): number {
    let n = 0;
    this.otherGhosts.forEach((g) => {
      if (now - g.lastSeen < GHOST_STALE_MS) n++;
    });
    return n;
  }

  /** After the sniff (or for old friends): play, socialize, or aloof. */
  private decideAfterSniff(targetId: string, oldFriend: boolean): void {
    const t = this.temperament;
    const playBase =
      t === "playful" ? 0.55 : t === "curious" ? 0.4 : t === "affectionate" ? 0.45 : t === "sassy" ? 0.15 : 0.1;
    const socialBase =
      t === "playful" ? 0.3 : t === "curious" ? 0.4 : t === "affectionate" ? 0.45 : t === "sassy" ? 0.25 : 0.3;
    const playP = oldFriend ? Math.min(0.8, playBase + 0.2) : playBase;
    const socialP = oldFriend ? Math.min(0.9, socialBase + 0.15) : socialBase;
    const roll = this.rng();
    this.metBefore.add(targetId);
    if (roll < playP) {
      this.emitSfx("play");
      this.social = {
        phase: "chase",
        targetId,
        until: Date.now() + 4_000,
        nextActionAt: 0,
      };
    } else if (roll < playP + socialP) {
      this.social = {
        phase: "social",
        targetId,
        until: Date.now() + 20_000,
        nextActionAt: 0,
      };
    } else {
      this.aloofUntil.set(targetId, Date.now() + 60_000);
      this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
      this.wanderTarget = {
        x: 0.15 + this.rng() * 0.7,
        y: 0.15 + this.rng() * 0.7,
      };
    }
  }

  private tickSocial(now: number): void {
    // Prune ghosts that left.
    let changed = false;
    this.otherGhosts.forEach((g, id) => {
      if (now - g.lastSeen > GHOST_STALE_MS) {
        this.otherGhosts.delete(id);
        changed = true;
        if (this.social.targetId === id) {
          this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
        }
      }
    });
    if (changed) this.options.onGhostsChange?.(this.otherGhosts.size);

    if (this.social.phase === "none" || !this.social.targetId) return;
    const target = this.otherGhosts.get(this.social.targetId);
    if (!target) {
      this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
      return;
    }

    if (this.social.phase === "approach") {
      // Drift toward the other ghost; sniff when close (or time out).
      this.wanderTarget.x = target.x;
      this.wanderTarget.y = target.y;
      const close =
        dist2(this.position.x, this.position.y, target.x, target.y) <
        0.13 * 0.13;
      if (close || now > this.social.until) {
        const targetId = this.social.targetId;
        this.social = {
          phase: "decide",
          targetId,
          until: now + 900,
          nextActionAt: 0,
        };
        // The sniff: 3–4 small, quick probing splats near the other ghost.
        this.emitSfx("sniff");
        const probes = 3 + Math.floor(this.rng() * 2);
        for (let k = 0; k < probes; k++) {
          this.schedule(k * 130, () => {
            if (this.mode !== "session") return;
            this.emit({
              position: {
                x: clamp01(target.x + (this.rng() - 0.5) * 0.05),
                y: clamp01(target.y + (this.rng() - 0.5) * 0.05),
              },
              force: { x: (this.rng() - 0.5) * 60, y: (this.rng() - 0.5) * 60 },
              pressure: 0.3,
              color: this.sigColor,
            });
          });
        }
      }
      return;
    }

    if (this.social.phase === "decide") {
      if (now > this.social.until && this.social.targetId) {
        this.decideAfterSniff(this.social.targetId, false);
      }
      return;
    }

    if (this.social.phase === "chase") {
      if (now > this.social.until) {
        this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
        return;
      }
      this.wanderTarget.x = target.x;
      this.wanderTarget.y = target.y;
      if (now >= this.social.nextActionAt) {
        this.social.nextActionAt = now + 450;
        this.emit({
          position: { x: this.position.x, y: this.position.y },
          force: { x: (this.rng() - 0.5) * 120, y: (this.rng() - 0.5) * 120 },
          pressure: 0.4,
          color: this.sigColor,
        });
      }
      return;
    }

    if (this.social.phase === "social") {
      if (now > this.social.until) {
        this.social = { phase: "none", targetId: null, until: 0, nextActionAt: 0 };
        return;
      }
      // Loiter companionably nearby.
      this.wanderTarget.x = clamp01(target.x + 0.18);
      this.wanderTarget.y = clamp01(target.y + 0.1);
      if (now >= this.social.nextActionAt) {
        this.social.nextActionAt = now + 7_000 + this.rng() * 5_000;
        this.emit({
          position: {
            x: (this.position.x + target.x) / 2,
            y: (this.position.y + target.y) / 2,
          },
          force: { x: (this.rng() - 0.5) * 50, y: (this.rng() - 0.5) * 50 },
          pressure: 0.3,
          color: this.sigDriftColor,
        });
      }
    }
  }

  // ---------------------------------------------------------- antics

  private maybeAntic(now: number): void {
    // A brain nap/idle directive silences antics until its linger ends.
    if (now < this.brainQuietUntil) return;
    if (now - this.lastAnticAt < ANTICS_MIN_GAP_MS) return;
    const p =
      this.temperament === "playful"
        ? 0.01
        : this.temperament === "curious"
          ? 0.006
          : this.temperament === "affectionate"
            ? 0.004
            : this.temperament === "sassy"
              ? 0.002
              : 0;
    if (p === 0 || this.rng() >= p) return;
    this.lastAnticAt = now;

    if (this.rng() < 0.5) {
      // Spiral doodle around the ghost's position.
      const cx = this.position.x;
      const cy = this.position.y;
      for (let k = 0; k < 10; k++) {
        const angle = k * 0.9;
        const radius = 0.02 + k * 0.012;
        this.schedule(k * 70, () => {
          if (!this.canAct()) return;
          this.emit({
            position: {
              x: clamp01(cx + Math.cos(angle) * radius),
              y: clamp01(cy + Math.sin(angle) * radius),
            },
            force: {
              x: -Math.sin(angle) * 70,
              y: Math.cos(angle) * 70,
            },
            pressure: 0.32,
            color: this.sigColor,
          });
        });
      }
    } else {
      // Tail-chase: a quick circle of splats following its own position.
      const cx = this.position.x;
      const cy = this.position.y;
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        this.schedule(k * 60, () => {
          if (!this.canAct()) return;
          this.emit({
            position: {
              x: clamp01(cx + Math.cos(angle) * 0.055),
              y: clamp01(cy + Math.sin(angle) * 0.055),
            },
            force: {
              x: -Math.sin(angle) * 110,
              y: Math.cos(angle) * 110,
            },
            pressure: 0.38,
            color: this.sigColor,
          });
        });
      }
    }
  }

  // ---------------------------------------------------------- temperament

  private setTemperament(t: GhostTemperament): void {
    if (this.temperament === t) return;
    this.temperament = t;
    this.temperamentSince = Date.now();
    // A mood shift is meaningful context: the brain re-deliberates.
    this.markDeliberationDirty();
    this.options.onTemperamentChange?.(t);
  }

  private tickTemperament(now: number): void {
    const idleFor = now - this.lastActivityAt;
    const age = now - this.temperamentSince;

    if (idleFor > SLEEP_AFTER_MS) {
      this.setTemperament("sleepy");
      return;
    }
    if (this.temperament === "sleepy") {
      this.setTemperament("curious");
      return;
    }
    // Ignored while playful can flip sassy.
    if (
      this.temperament === "playful" &&
      idleFor > 45_000 &&
      this.rng() < 0.01
    ) {
      this.setTemperament("sassy");
      return;
    }
    // Moods soften over time.
    if (this.temperament === "affectionate" && age > 25_000) {
      this.setTemperament(this.rng() < 0.5 ? "curious" : "playful");
      return;
    }
    if (this.temperament === "sassy" && age > 30_000) {
      this.setTemperament("curious");
      return;
    }
    // Gentle spontaneous drift between curious and playful.
    if (
      (this.temperament === "curious" || this.temperament === "playful") &&
      this.rng() < 0.002
    ) {
      this.setTemperament(
        this.temperament === "curious" ? "playful" : "curious"
      );
    }
  }

  // ---------------------------------------------------------- tick

  private tick(): void {
    if (this.destroyed) return;
    const now = Date.now();

    // Finalize contacts that have gone quiet.
    this.contacts.forEach((contact, userId) => {
      if (now - contact.lastAt > CONTACT_FINALIZE_MS) {
        this.finalizeContact(contact);
        this.contacts.delete(userId);
      }
    });

    this.tickTemperament(now);
    if (this.mode === "session") this.tickSocial(now);

    // A long quiet arriving is itself deliberation context (once per
    // idle episode, journaled in the dataset's vocabulary).
    if (
      now - this.lastActivityAt > SLEEP_AFTER_MS &&
      now - this.quietJournalMarkedAt > SLEEP_AFTER_MS
    ) {
      this.quietJournalMarkedAt = now;
      this.journal("long quiet", now);
      this.markDeliberationDirty();
    }

    // Ghost Brain: the deliberation window. Reflexes never wait on
    // this — when the window opens and context changed, the host gets
    // a snapshot and answers asynchronously via applyBrainDecision.
    // Slice 33: a pending utterance opens the window on its own
    // shorter floor (UTTERANCE_MIN_INTERVAL_MS) — words are answered
    // promptly or they read as ignored — and is consumed by exactly
    // the deliberation that carries it.
    const utteranceDue =
      this.pendingUtterance !== null &&
      now - this.lastUtteranceDeliberationAt >= UTTERANCE_MIN_INTERVAL_MS;
    // Slice 68: the phrase clock. While a Generative-music
    // standing request stands, a deliberation falls DUE when
    // the last phrase has finished (plus a breath) — it opens
    // the window on the music floor, marks the one scenario
    // buildScenario is about to take as due, and that scenario
    // alone may answer with a phrase.
    const musicDue =
      this.musicStanding !== null &&
      now >= this.nextMusicAt &&
      now - this.lastMusicDeliberationAt >= MUSIC_MIN_INTERVAL_MS;
    if (musicDue) this.musicDuePending = true;
    if (
      this.options.onDeliberate &&
      this.enabled &&
      !this.dismissing &&
      ((now - this.lastDeliberationAt >= DELIBERATION_MIN_MS &&
        this.deliberationDirty) ||
        utteranceDue ||
        musicDue)
    ) {
      this.lastDeliberationAt = now;
      this.deliberationDirty = false;
      // Vitals journal: thinking is work; stamina spends on it.
      this.deliberationTimes = this.deliberationTimes.filter(
        (t) => now - t < 30 * 60_000
      );
      this.deliberationTimes.push(now);
      try {
        const scenario = this.buildScenario(now);
        if (scenario.utterance) {
          this.pendingUtterance = null;
          this.lastUtteranceDeliberationAt = now;
        }
        if (scenario.music?.due) {
          this.lastMusicDeliberationAt = now;
          // If this window answers with anything other than a
          // phrase (an utterance outranks the music desk), the
          // clock retries on the music floor instead of waiting
          // for a phrase that never played; a real performance
          // pushes the next due time out to the phrase's end.
          this.nextMusicAt = Math.max(
            this.nextMusicAt,
            now + MUSIC_MIN_INTERVAL_MS
          );
        }
        // Slice 47: thinking is audible now — a soft murmur while
        // the brain consults (the SFX limiter keeps it rare; the
        // family's priority never interrupts another cue).
        this.emitSfx("thinking");
        this.options.onDeliberate(scenario);
      } catch {
        // A host-side routing failure must never hurt the reflexes.
      }
    }

    // Slow wander (approach/chase/social phases override the target).
    if (
      this.social.phase === "none" &&
      now > this.nextWanderAt
    ) {
      this.wanderTarget = {
        x: 0.22 + this.rng() * 0.56,
        y: 0.22 + this.rng() * 0.56,
      };
      this.nextWanderAt = now + 9_000 + this.rng() * 5_000;
    }
    this.position.x += (this.wanderTarget.x - this.position.x) * 0.02;
    this.position.y += (this.wanderTarget.y - this.position.y) * 0.02;

    this.publishPresence();
    if (!this.canAct()) return;

    const idleFor = now - this.lastActivityAt;
    const session = this.mode === "session";

    // Idle drift: gentle splats originating at the ghost's position.
    // Solo-alone: only while the user is around but quiet, and never
    // once asleep (the original rule). Session and crowd are
    // SCHEDULE-driven instead: the old session rule required the room
    // to be idle for 2s, but every participant's interaction feeds
    // lastActivityAt, so in a live room that was ~never true and the
    // ghost never drifted — a core part of why it "died" in crowds.
    // The pace is set by the per-role interval below (crowd sparsest)
    // plus the emit budgets, not by room silence.
    const crowd = this.inCrowd();
    const driftIdleOk =
      session || crowd
        ? true
        : idleFor > DRIFT_MIN_IDLE_MS && idleFor < SLEEP_AFTER_MS;
    if (driftIdleOk && now >= this.nextDriftAt && now >= this.brainQuietUntil) {
      const bias = this.currentBias();
      const base = crowd ? CROWD_DRIFT_BASE_MS : session ? 6_000 : 3_800;
      const span = crowd ? CROWD_DRIFT_SPAN_MS : session ? 4_000 : 3_200;
      let scale = bias === "drift" ? 0.6 : 1;
      if (this.temperament === "playful") scale *= 0.75;
      if (this.temperament === "sleepy") scale *= 1.5;
      if (this.temperament === "sassy") scale *= 1.1;
      this.nextDriftAt = now + (base + this.rng() * span) * scale;
      this.emitDrift();
      this.maybeAntic(now);
    }

    // Solo-only spontaneous affection: an occasional heart after recent
    // activity. (In session mode, hearts come from petting only.)
    if (
      !session &&
      now - this.lastVerbAt > VERB_MIN_INTERVAL_MS &&
      idleFor >= 1_200 &&
      idleFor < VERB_RECENT_ACTIVITY_MS &&
      this.rng() < 0.012
    ) {
      this.lastVerbAt = now;
      const bias = this.currentBias();
      const verb = bias === "cheer" ? CHEER : bias === "tickle" ? TICKLE : HEART;
      this.emitVerb(verb);
    }
  }

  private emitDrift(): void {
    const dx = this.wanderTarget.x - this.position.x;
    const dy = this.wanderTarget.y - this.position.y;
    for (let k = 0; k < 3; k++) {
      this.schedule(k * 110, () => {
        if (!this.canAct() || this.localUserIsDrawing()) return;
        this.emit({
          position: {
            x: clamp01(this.position.x + dx * 0.12 * k),
            y: clamp01(this.position.y + dy * 0.12 * k),
          },
          force: {
            x: Math.max(-160, Math.min(160, dx * 1_100)) + (this.rng() - 0.5) * 30,
            y: Math.max(-160, Math.min(160, dy * 1_100)) + (this.rng() - 0.5) * 30,
          },
          pressure: 0.3 + this.rng() * 0.15,
          color: this.sigDriftColor,
        });
      });
    }
  }

  // ---------------------------------------------------------- brain

  /** Append to the scenario journal (dedupes rapid repeats). */
  private journal(label: string, now: number): void {
    const last = this.eventJournal[this.eventJournal.length - 1];
    if (last && last.label === label && now - last.at < 4_000) {
      last.at = now;
      return;
    }
    this.eventJournal.push({ label, at: now });
    if (this.eventJournal.length > 24) this.eventJournal.shift();
  }

  private markDeliberationDirty(): void {
    this.deliberationDirty = true;
  }

  /**
   * Build the scenario snapshot in the dataset's exact schema from
   * live state. Honest limits: the wire protocol does not broadcast
   * other ghosts' names or moods, so other_ghosts entries say
   * "another ghost" / "unknown" rather than inventing them — only
   * their count and last observed action are real.
   *
   * Slice 23: the snapshot also carries the fabric context when
   * the host supplies one (getFabricContext) — the active fabric,
   * its canvas kind, this participant's role, and the host rules
   * resolved for this participant. It is sanitized on the way in
   * and attached verbatim; a host that supplies nothing gets a
   * legacy (dataset-shaped) scenario, unchanged.
   */
  buildScenario(now = Date.now()): GhostScenario {
    const recentEvents = this.eventJournal
      .filter((e) => now - e.at < 120_000)
      .slice(-5)
      .map((e) => e.label);
    if (recentEvents.length === 0) {
      recentEvents.push(
        now - this.lastActivityAt > 60_000 ? "long quiet" : "quiet room"
      );
    }
    const decay =
      this.nearbySplat.at === 0
        ? 0
        : Math.exp(-(now - this.nearbySplat.at) / 20_000);
    const others: GhostScenarioOther[] = [];
    this.otherGhosts.forEach((g, id) => {
      if (now - g.lastSeen < GHOST_STALE_MS) {
        others.push({
          name: "another ghost",
          mood: "unknown",
          last_action: this.ghostLastAction.get(id) ?? "drift",
        });
      }
    });
    const fabric = this.currentFabricContext();
    // Slice 34: fresh gesture readings ride the scenario in the
    // v2 shape; the key is omitted entirely when the sense has
    // been quiet (absence is information — see GhostBrain).
    const gestures: GhostGestureReading[] = this.gestureLog
      .filter((g) => now - g.at < 45_000)
      .slice(-3)
      .map(({ token, hand, confidence, held_s }) => ({
        token,
        hand,
        confidence,
        held_s,
      }));
    // Slice 36: the genx field digest, while fresh (45s — the
    // gesture window). The one-shot transition marks ride this
    // one snapshot and are consumed by it: the next deliberation
    // sees the field's state, not a replay of its events.
    const genx: GhostGenxContext | null =
      this.genxDigest && now - this.genxDigest.at < 45_000
        ? {
            ...this.genxDigest.ctx,
            fold_just_completed: this.genxFoldJustCompleted,
            shard_just_stalled: this.genxShardJustStalled,
          }
        : null;
    if (genx) {
      this.genxFoldJustCompleted = false;
      this.genxShardJustStalled = false;
    }
    // Slice 68: the standing Generative-music request rides
    // every snapshot while it stands; the due mark is one-shot
    // (consumed by this snapshot, like the genx event flags) —
    // only the phrase clock's own deliberation may answer it.
    const music: GhostMusicContext | null = this.musicStanding
      ? {
          due: this.musicDuePending,
          scale: this.musicStanding.scale,
          pattern_hint: this.musicStanding.patternHint,
          tempo_bpm: this.musicStanding.tempoBpm,
          phrase_index: this.musicPhraseIndex,
          last_played_note: this.musicLastNote,
          last_phrase_signature: this.musicLastSignature,
          pack_notes: this.musicPackNotes,
        }
      : null;
    if (music) this.musicDuePending = false;
    return {
      temperament: this.temperament,
      seconds_since_human_touch: Math.round((now - this.lastActivityAt) / 100) / 10,
      recent_events: recentEvents,
      pets_in_last_5s: this.petTimes.filter((t) => now - t < 5_000).length,
      nearby_splat_intensity:
        this.nearbySplat.at === 0
          ? 0.05
          : Math.min(1, Math.max(0, Math.round(this.nearbySplat.intensity * decay * 100) / 100)),
      verbs_seen: this.verbsSeenLog
        .filter((v) => now - v.at < 45_000)
        .slice(-5)
        .map((v) => v.id),
      other_ghosts: others,
      room_energy_trend: this.roomEnergyTrend(now),
      ghost_identity: {
        name: this.options.ghostName ?? "Ghost",
        hue: Math.round(this.options.identity.hue),
        seed_traits: seedTraitsForTemperament(this.temperament),
      },
      ...(fabric ? { fabric } : {}),
      ...(gestures.length > 0 ? { gestures } : {}),
      // Slice 33: the pending utterance, when one is waiting —
      // attached verbatim (it was sanitized at the sense) and
      // consumed by the tick's deliberation, never replayed.
      ...(this.pendingUtterance
        ? { utterance: this.pendingUtterance }
        : {}),
      // Slice 36: the compute field's digest (see above); the
      // key is omitted entirely when the sense is quiet or stale.
      ...(genx ? { genx } : {}),
      // Slice 68: the standing music request (see above); the
      // key is omitted entirely while the toggle is off.
      ...(music ? { music } : {}),
    };
  }

  /**
   * The host-supplied fabric context, sanitized — or null when the
   * host supplies none (or a garbled one). Read fresh at snapshot
   * time and at draw time: the fabric can change under the ghost,
   * and both the scenario and the peer-side draw gate must see
   * the law as it stands NOW.
   */
  private currentFabricContext(): GhostFabricContext | null {
    try {
      const raw = this.options.getFabricContext?.();
      return raw ? sanitizeFabricContext(raw) : null;
    } catch {
      return null;
    }
  }

  private roomEnergyTrend(now: number): "rising" | "falling" | "steady" {
    const recent = this.humanEventTimes.filter((t) => now - t < 15_000).length;
    const prior = this.humanEventTimes.filter(
      (t) => now - t >= 15_000 && now - t < 45_000
    ).length;
    if (recent === 0 && prior === 0) {
      return now - this.lastActivityAt > 60_000 ? "falling" : "steady";
    }
    const priorRate = prior / 2; // prior window is 30s, recent is 15s
    if (recent >= priorRate + 2) return "rising";
    if (priorRate >= 2 && recent <= priorRate / 2) return "falling";
    return "steady";
  }

  /** The last decision the brain handed down (either tier), if any. */
  getLastBrainDecision(): {
    decision: GhostDecision;
    source: "spark" | "table";
    at: number;
  } | null {
    return this.lastBrainDecision;
  }

  /**
   * Apply one validated brain decision. Every intent acts through the
   * EXISTING machinery — emit() budgets, the shared verb interval,
   * the temperament machine, the social machine — so a decision can
   * steer the ghost but never break an invariant: budgets still
   * clamp in emit(), the petting PURR/HEART rules are untouched (a
   * deliberated heart in session mode degrades to a soft burst —
   * room-wide verbs stay petting-only there), and the ghost still
   * never talks. Called by the host's router only; the reflex brain
   * never blocks on it.
   */
  applyBrainDecision(
    decision: GhostDecision,
    source: "spark" | "table" | "device"
  ): void {
    if (this.destroyed || !this.enabled) return;
    const now = Date.now();
    this.lastBrainDecision = { decision, source, at: now };
    this.lastBrainIntensity = decision.intensity;
    if (decision.mood_shift && decision.mood_shift !== this.temperament) {
      this.setTemperament(decision.mood_shift);
    }
    switch (decision.intent) {
      case "heart":
        this.brainHeart(decision.intensity);
        break;
      case "play":
        this.performPlayPattern(decision.pattern_id, decision.intensity);
        break;
      case "draw":
        this.performDraw(decision);
        break;
      case "play-note":
        this.performPlayNote(decision);
        break;
      case "compose":
        this.performCompose(decision);
        break;
      case "play-music":
        this.performPlayMusic(decision);
        break;
      case "mirror":
        // Amplify the reflex mirror/response path for the linger.
        this.setMoodBias("mirror", decision.linger_s * 1000);
        break;
      case "drift":
        this.setMoodBias("drift", decision.linger_s * 1000);
        this.schedule(200, () => {
          if (this.canAct()) this.emitDrift();
        });
        break;
      case "sniff":
        this.performSniff();
        break;
      case "startle":
        this.performStartleHop(decision.intensity);
        break;
      case "nap":
        this.brainQuietUntil = Math.max(
          this.brainQuietUntil,
          now + decision.linger_s * 1000
        );
        if (decision.linger_s >= 10) this.setTemperament("sleepy");
        break;
      case "idle":
        this.brainQuietUntil = Math.max(
          this.brainQuietUntil,
          now + decision.linger_s * 1000
        );
        break;
    }
  }

  private brainHeart(intensity: number): void {
    this.performVerbAct(HEART, intensity);
  }

  /**
   * Perform a verb as the ghost's own act, under the shared verb
   * clock: solo/crowd with a cold clock, the REAL verb goes out;
   * in session mode (or on a hot clock) it degrades to a soft
   * burst at the body — room-wide verbs stay petting-only in
   * session. brainHeart established this discipline for
   * deliberated hearts; asked verbs (answerVerb, Slice 23)
   * inherit it unchanged.
   */
  private performVerbAct(verb: SensoryVerb, intensity: number): void {
    const now = Date.now();
    if (
      this.mode !== "session" &&
      now - this.lastVerbAt > VERB_MIN_INTERVAL_MS
    ) {
      // Solo/crowd: the real verb path, under the shared verb clock.
      this.lastVerbAt = now;
      this.schedule(200, () => {
        if (this.canAct()) this.emitVerb(verb);
      });
      return;
    }
    // Session (or the verb clock is hot): a soft burst at the body.
    this.schedule(200, () => {
      if (!this.canAct()) return;
      for (let k = 0; k < 3; k++) {
        const angle = (k / 3) * Math.PI * 2 + this.rng() * 0.5;
        this.emit({
          position: { x: this.position.x, y: this.position.y },
          force: {
            x: Math.cos(angle) * 70 * (0.5 + intensity),
            y: Math.sin(angle) * 70 * (0.5 + intensity),
          },
          pressure: 0.3 + 0.3 * intensity,
          color: this.sigColor,
        });
      }
    });
  }

  /**
   * The DRAW tool's performance (Slice 23). The ghost draws ONE
   * shape at its body, in its own hue, as a one-step Recipe —
   * validated here, then handed to the host's draw sink, which
   * renders it on this canvas and ships it on the recipe
   * transport under the ghost's peer id. Three gates stand
   * before the sink, in order:
   *
   *   1. The fabric gate, peer-side: whatever the caller believed,
   *      the fabric's CURRENT rules decide — a fabric that refuses
   *      drawing for the ghost's side gets no drawing, and the
   *      refusal is journaled (the scenario picks it up as a
   *      recent event, so the brain can see its own restraint).
   *   2. The draw cooldown: doodles are occasional.
   *   3. The emit budget: the draw is CHARGED like a performance
   *      (DRAW_BUDGET_COST slots), so a burst of draw decisions
   *      can no more flood the room than a burst of play can.
   */
  /**
   * The fabric draw gate, shared by every ghost performance
   * that puts marks on the fabric — deliberated draws (Slice
   * 23) and asked See acts (Slice 30) alike. Whatever the
   * caller believed, the fabric's CURRENT rules decide; a
   * refusal is journaled (the scenario picks it up as a recent
   * event, so the brain can see its own restraint) and true is
   * returned. No fabric context (solo, legacy hosts) = no gate.
   */
  private drawGateRefusal(now: number, what: string): boolean {
    const fabric = this.currentFabricContext();
    if (fabric && !fabric.rules.draw) {
      this.journal(`wanted to ${what} — fabric forbids it`, now);
      return true;
    }
    // Slice 47: the manifest is the outer law — a fabric that
    // doesn't offer drawing at all refuses even where no host
    // rule speaks (the brain tiers are gated in the validator;
    // this is the peer's own copy for direct decision applies).
    if (fabric && !fabricContextAllowsIntent(fabric, "draw")) {
      this.journal(`wanted to ${what} — this fabric doesn't offer drawing`, now);
      return true;
    }
    return false;
  }

  /**
   * The fabric note gate, peer-side (Slice 31) — drawGateRefusal's
   * sibling for the NOTE tools: the fabric's CURRENT notes rule
   * decides, a refusal is journaled in the same vocabulary, and
   * no fabric context means no gate.
   */
  private noteGateRefusal(now: number, what: string): boolean {
    const fabric = this.currentFabricContext();
    if (fabric && !fabric.rules.notes) {
      this.journal(`wanted to ${what} — fabric forbids it`, now);
      return true;
    }
    // Slice 47 note: the manifest deliberately does NOT gate
    // here. Off the Piano layer the note tools are already
    // "unavailable" (noteLayerUnavailable, checked right after
    // this gate by the ask paths — that ordering is pinned by
    // ghost-tools-check), and deliberated play-note decisions
    // are manifest-gated upstream (validator + router) before
    // they can ever reach the peer.
    return false;
  }

  /**
   * The NOTE tools exist only on a note layer (Slice 31's
   * piano; Slice 53 adds the Playground, whose layer brings
   * its own note surface — isGhostNoteLayer is the one list):
   * true when the ghost is verifiably on another layer. With
   * no fabric context the layer is unknown — the deliberated
   * path only ever hears notes through a note layer's own
   * forwarder, so unknown means allowed, exactly the draw
   * gate's solo semantics.
   */
  private noteLayerUnavailable(): boolean {
    const fabric = this.currentFabricContext();
    return fabric !== null && !isGhostNoteLayer(fabric.layer_id);
  }

  /**
   * Build + validate the one-step draw recipe every ghost
   * drawing ships as. The seed mixes the identity seed with
   * the draw count, so consecutive drawings differ; callers
   * increment drawCount BEFORE building. Returns null only if
   * validation rejects — callers pass clamped inputs, so this
   * stays total.
   */
  private buildDrawRecipe(
    shape: NonNullable<GhostDecision["draw_shape"]>,
    cx: number,
    cy: number,
    scale: number
  ): Recipe | null {
    return validateRecipe(
      {
        version: 2,
        name: `${this.options.ghostName ?? "Ghost"} drew a ${shape}`,
        seed: (this.options.identity.seed ^ (this.drawCount * 0x9e3779b9)) >>> 0,
        steps: [
          {
            shape,
            cx,
            cy,
            scale,
            hue: Math.round(this.options.identity.hue),
            durationMs: 2600,
            style: shape === "burst" ? "burst" : "draw",
          },
        ],
      },
      "builtin"
    );
  }

  private performDraw(decision: GhostDecision): void {
    if (!this.canAct()) return;
    const shape = decision.draw_shape;
    if (!shape) return;
    const now = Date.now();
    if (this.drawGateRefusal(now, "draw")) return;
    if (now - this.lastDrawAt < DRAW_MIN_INTERVAL_MS) return;
    if (!this.chargePerformanceBudget(DRAW_BUDGET_COST)) {
      this.journal("wanted to draw — budget spent", now);
      return;
    }
    this.lastDrawAt = now;
    this.drawCount += 1;
    const recipe = this.buildDrawRecipe(
      shape,
      this.position.x,
      this.position.y,
      Math.min(0.5, Math.max(0.05, 0.1 + 0.22 * decision.intensity))
    );
    if (!recipe) return; // Inputs are clamped; stay total anyway.
    this.journal(`drew a ${shape}`, now);
    this.markDeliberationDirty();
    this.options.onPerformance?.(`drew a ${shape}`);
    this.options.onDrawRecipe?.(recipe);
  }

  /**
   * Perform a deliberated "play-note" decision (Slice 31) — call
   * and response: the brain heard a human's note in the scenario
   * and chose to answer. The performance runs the full peer-side
   * discipline performDraw runs, at the note prices: the fabric's
   * notes rule refuses (journaled), the piano is the only stage,
   * the note cooldown paces, and the shared emit budget charges
   * NOTE_BUDGET_COST before the sink is touched. The note then
   * rides the note bus exactly like a human's key press.
   */
  private performPlayNote(decision: GhostDecision): void {
    if (!this.canAct()) return;
    const note = decision.note_name;
    if (!note || !isGhostNoteName(note)) return;
    const now = Date.now();
    if (this.noteGateRefusal(now, "play")) return;
    if (this.noteLayerUnavailable()) return;
    if (now - this.lastNoteAt < NOTE_MIN_INTERVAL_MS) return;
    if (!this.chargePerformanceBudget(NOTE_BUDGET_COST)) {
      this.journal("wanted to play — budget spent", now);
      return;
    }
    this.lastNoteAt = now;
    this.lastPlayedNote = note;
    this.journal(`answered with ${note}`, now);
    this.markDeliberationDirty();
    this.options.onPerformance?.(`answered with ${note}`);
    this.emitNoteToSink(
      note,
      Math.min(0.85, Math.max(0.4, decision.intensity + 0.15)),
      0
    );
  }

  /**
   * Perform a deliberated "compose" decision (Slice 52) — the
   * SOUND-CRAFT tool's performance. The brain authored a short
   * sequence of waveform tones (the decision's sound_spec); the
   * peer prices and paces it like every other performance —
   * the shared budget charges SOUND_BUDGET_COST before anything
   * sounds, the cooldown keeps compositions occasional — and
   * hands the spec to the voice through the SFX path, where
   * ghostSound renders it onto oscillators (and a pitched noise
   * source for the noise waveform). The composition is a LOCAL
   * pleasure, like the ghost's everyday voice: visiting ghosts'
   * compositions are theirs to sound at home.
   */
  private performCompose(decision: GhostDecision): void {
    if (!this.canAct()) return;
    const spec = decision.sound_spec;
    if (!spec || spec.notes.length === 0) return;
    const now = Date.now();
    if (now - this.lastSoundAt < SOUND_MIN_INTERVAL_MS) return;
    if (!this.chargePerformanceBudget(SOUND_BUDGET_COST)) {
      this.journal("wanted to compose — budget spent", now);
      return;
    }
    this.lastSoundAt = now;
    const waves = spec.notes.map((n) => n.wave).join(", ");
    this.journal(`composed a sound (${spec.notes.length} notes: ${waves})`, now);
    this.markDeliberationDirty();
    this.options.onPerformance?.(
      `composed a sound — ${spec.notes.length} notes (${waves})`
    );
    this.emitSfx("composed", { sound: spec });
  }

  /**
   * Perform a deliberated "play-music" decision (Slice 68) —
   * the PLAY-MUSIC tool's performance. The brain authored the
   * phrase entire (the decision's music_phrase); the peer
   * prices it like every other authored performance — the
   * shared budget charges MUSIC_BUDGET_COST before anything
   * sounds — records it for the next phrase's authoring (count,
   * signature, closing note), paces the phrase clock to the
   * phrase's own end plus a breath, and hands the phrase to the
   * host's renderer through onMusicPhrase. The peer never adds,
   * drops or reorders a note: what the brain wrote is what
   * sounds. If the budget is spent, the phrase is not played
   * and the clock retries later — the ghost goes quiet rather
   * than borrowing a sequencer.
   */
  private performPlayMusic(decision: GhostDecision): void {
    if (!this.canAct()) return;
    const phrase = decision.music_phrase;
    if (!phrase || phrase.notes.length === 0) return;
    const now = Date.now();
    if (!this.chargePerformanceBudget(MUSIC_BUDGET_COST)) {
      this.journal("wanted to play a phrase — budget spent", now);
      this.nextMusicAt = now + MUSIC_MIN_INTERVAL_MS * 2;
      return;
    }
    this.musicPhraseIndex += 1;
    this.musicLastSignature = ghostMusicPhraseSignature(phrase);
    this.musicLastNote = phrase.notes[phrase.notes.length - 1].note;
    this.nextMusicAt =
      now + ghostMusicPhraseSeconds(phrase) * 1000 + 400;
    this.journal(`played a phrase (${phrase.notes.length} notes)`, now);
    this.options.onPerformance?.(
      `played a phrase — ${phrase.notes.length} notes`
    );
    this.options.onMusicPhrase?.(phrase);
  }

  private performPlayPattern(
    patternId: GhostDecision["pattern_id"],
    intensity: number
  ): void {
    if (!this.canAct()) return;
    this.lastAnticAt = Date.now();
    const cx = this.position.x;
    const cy = this.position.y;
    const power = 0.5 + intensity;
    if (patternId === "zoomie_loop" || patternId === "loop_chase") {
      // Circle chase — the tail-chase geometry from maybeAntic.
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        this.schedule(k * 80, () => {
          if (!this.canAct()) return;
          this.emit({
            position: {
              x: clamp01(cx + Math.cos(angle) * 0.05),
              y: clamp01(cy + Math.sin(angle) * 0.05),
            },
            force: {
              x: -Math.sin(angle) * 150 * power,
              y: Math.cos(angle) * 150 * power,
            },
            pressure: 0.35 + 0.25 * intensity,
            color: this.sigColor,
          });
        });
      }
      this.emitSfx("play");
      return;
    }
    // Zigzag family (zigzag_chase, solo_zigzag, chase_loop, null):
    // a quick zigzag run trailing from the ghost's position.
    const dir = this.rng() < 0.5 ? -1 : 1;
    for (let k = 0; k < 8; k++) {
      const fx = cx + dir * k * 0.028;
      const fy = cy + (k % 2 === 0 ? -0.035 : 0.035);
      const up = k % 2 === 0;
      this.schedule(k * 65, () => {
        if (!this.canAct()) return;
        this.emit({
          position: { x: clamp01(fx), y: clamp01(fy) },
          force: { x: dir * 130 * power, y: (up ? -60 : 60) * power },
          pressure: 0.3 + 0.25 * intensity,
          color: this.sigColor,
        });
      });
    }
    this.emitSfx("play");
  }

  private performSniff(): void {
    if (
      this.mode === "session" &&
      this.social.phase === "none" &&
      this.sharedSettings.socialize
    ) {
      // Deliberate greeting: approach the nearest sensed ghost; the
      // existing social machine runs the sniff/play from there.
      const now = Date.now();
      let bestId: string | null = null;
      let bestD = Infinity;
      this.otherGhosts.forEach((g, id) => {
        if (now - g.lastSeen >= GHOST_STALE_MS) return;
        const d = dist2(this.position.x, this.position.y, g.x, g.y);
        if (d < bestD) {
          bestD = d;
          bestId = id;
        }
      });
      if (bestId) {
        this.social = {
          phase: "approach",
          targetId: bestId,
          until: now + 5_000,
          nextActionAt: 0,
        };
        return;
      }
    }
    // No one to sniff: sniff the air — small probing splats.
    this.emitSfx("sniff");
    for (let k = 0; k < 3; k++) {
      this.schedule(k * 130, () => {
        if (!this.canAct()) return;
        this.emit({
          position: {
            x: clamp01(this.position.x + (this.rng() - 0.5) * 0.06),
            y: clamp01(this.position.y + (this.rng() - 0.5) * 0.06),
          },
          force: { x: (this.rng() - 0.5) * 60, y: (this.rng() - 0.5) * 60 },
          pressure: 0.3,
          color: this.sigColor,
        });
      });
    }
  }

  private performStartleHop(intensity: number): void {
    // Same hop geometry as the reflex startle, brain-triggered.
    const angle = this.rng() * Math.PI * 2;
    const dx = Math.cos(angle) * 0.09;
    const dy = Math.sin(angle) * 0.09;
    const from = { ...this.position };
    this.position.x = clamp01(this.position.x + dx);
    this.position.y = clamp01(this.position.y + dy);
    this.schedule(40, () => {
      if (!this.canAct()) return;
      this.emitSfx("startle");
      this.emit({
        position: from,
        force: {
          x: dx * 900 * (0.5 + intensity),
          y: dy * 900 * (0.5 + intensity),
        },
        pressure: 0.3 + 0.3 * intensity,
        color: this.sigColor,
      });
    });
  }

  // ---------------------------------------------------------- helpers

  private emitVerb(verb: SensoryVerb): void {
    if (verb.id === "heart") this.emitSfx("heart");
    // Verbs normally splat at canvas center; the ghost's verbs belong at
    // the ghost's body.
    this.emit({
      ...verbInteraction(verb),
      position: { x: this.position.x, y: this.position.y },
    });
  }

  /**
   * Charge a non-splat performance (Slice 23: a draw) against the
   * SAME budgets emit() enforces — the global 16/10s window, the
   * crowd sub-budget, and the 30-minute vitals journal — without
   * emitting anything. Returns false when the charge does not
   * fit, in which case nothing is charged and the performance
   * does not happen: a tool is an act, never a bypass.
   */
  private chargePerformanceBudget(cost: number): boolean {
    const now = Date.now();
    this.emitTimes = this.emitTimes.filter((t) => now - t < EMIT_WINDOW_MS);
    if (this.emitTimes.length + cost > EMIT_BUDGET) return false;
    if (this.inCrowd()) {
      this.crowdEmitTimes = this.crowdEmitTimes.filter(
        (t) => now - t < EMIT_WINDOW_MS
      );
      if (this.crowdEmitTimes.length + cost > CROWD_EMIT_BUDGET) return false;
      for (let k = 0; k < cost; k++) this.crowdEmitTimes.push(now);
    }
    for (let k = 0; k < cost; k++) this.emitTimes.push(now);
    this.emitHistory = this.emitHistory.filter((t) => now - t < 30 * 60_000);
    for (let k = 0; k < cost; k++) this.emitHistory.push(now);
    return true;
  }

  /**
   * Emit one ghost interaction: rendered locally via injectLocal, and in
   * session mode also broadcast. Enforces the per-ghost emit budget so
   * ghost society can never flood human interaction; `essential`
   * (hello/goodbye) bypasses the budget. In the crowd role a tighter
   * sub-budget applies on top: the ghost is a guest in a people's
   * room, not a fourth participant.
   */
  private emit(
    payload: Omit<FluidInteraction, "userId" | "timestamp">,
    essential = false
  ): void {
    const now = Date.now();
    this.emitTimes = this.emitTimes.filter((t) => now - t < EMIT_WINDOW_MS);
    if (!essential && this.emitTimes.length >= EMIT_BUDGET) return;
    if (!essential && this.inCrowd()) {
      this.crowdEmitTimes = this.crowdEmitTimes.filter(
        (t) => now - t < EMIT_WINDOW_MS
      );
      if (this.crowdEmitTimes.length >= CROWD_EMIT_BUDGET) return;
      this.crowdEmitTimes.push(now);
    }
    this.emitTimes.push(now);
    // Vitals journal: 30 minutes of work output for stamina.
    this.emitHistory = this.emitHistory.filter((t) => now - t < 30 * 60_000);
    this.emitHistory.push(now);

    const full: FluidInteraction = {
      ...payload,
      userId: this.peerId,
      timestamp: this.stamp(),
    };
    this.options.injectLocal(full);
    if (this.mode === "session") {
      this.options.broadcast?.(payload);
    }
  }

  private schedule(
    ms: number,
    fn: () => void,
    bypassPresenceGate = false
  ): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.destroyed || !this.enabled) return;
      if (!bypassPresenceGate && !this.gateAllows()) return;
      fn();
    }, ms);
    this.timers.add(id);
  }

  /** Fire-time gate for scheduled gestures. */
  private gateAllows(): boolean {
    if (this.mode === "session") return !this.dismissing;
    // Solo-alone: gestures fire freely. Crowd role: they also fire —
    // the ghost stays in the room now; the crowd sub-budget and the
    // response sampling are what keep it polite, not a closed gate.
    // (The retired solo fade lived here: humans present used to mean
    // every scheduled gesture died at fire time.)
    return true;
  }

  private canAct(): boolean {
    if (!this.enabled || this.dismissing) return false;
    if (this.mode === "session") return true;
    // Crowd role: present and playing along while humans are here.
    if (this.humansPresent) return true;
    return Date.now() - this.lastActivityAt < SLEEP_AFTER_MS;
  }

  /**
   * Courtesy gate: is the LOCAL user mid-stroke right now? Only the
   * local hand counts — remote participants draw continuously in a
   * live room, and the pre-crowd version of this gate (any hand, any
   * origin) is what silenced the ghost in crowds.
   */
  private localUserIsDrawing(): boolean {
    return Date.now() - this.lastLocalEventAt < 250;
  }

  private currentBias(): GhostMoodBias | null {
    if (this.bias && Date.now() > this.biasExpiresAt) {
      this.bias = null;
    }
    return this.bias;
  }

  private computePresence(now: number): GhostPresence {
    if (!this.enabled) return "off";
    if (this.mode === "session") return "summoned";
    if (this.humansPresent) {
      // Crowd role: here and playing along. It dozes only when the
      // whole room has gone quiet — temperament follows the room-fed
      // activity clock, so a live room keeps it awake. (This replaces
      // the retired "away": humans present used to mean gone.)
      return this.temperament === "sleepy" ? "sleeping" : "present";
    }
    if (now - this.lastActivityAt > SLEEP_AFTER_MS) return "sleeping";
    return "present";
  }

  private lastPublishedKey = "";

  private publishPresence(): void {
    const now = Date.now();
    const next = this.computePresence(now);
    const prev = this.presence;
    this.presence = next;
    if (next !== prev) this.presenceSince = now;
    const key = `${next}:${this.mode}`;
    if (key !== this.lastPublishedKey) {
      const isFirstPublish = this.lastPublishedKey === "";
      this.lastPublishedKey = key;
      this.options.onPresenceChange?.(next, this.mode);
      // Sleep/wake chimes on real transitions (never on first publish).
      if (!isFirstPublish && next === "sleeping" && prev !== "sleeping") {
        this.emitSfx("sleep");
      } else if (!isFirstPublish && prev === "sleeping" && next === "present") {
        this.emitSfx("wake");
      }
    }
  }

  /** Monotonic timestamps: remote dedupe keys on userId + timestamp. */
  private stamp(): number {
    const now = Date.now();
    this.lastTs = Math.max(now, this.lastTs + 1);
    return this.lastTs;
  }
}
