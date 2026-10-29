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
import type { GhostSfxKind } from "./useGhostSfx";
import type {
  GhostDecision,
  GhostScenario,
  GhostScenarioOther,
} from "./GhostBrain";
import { seedTraitsForTemperament } from "./GhostBrain";
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
   * sleep, wake, heart). The hook layer turns them into synthesized SFX
   * pitched from the ghost's signature hue — ghosts never speak.
   */
  onSfx?: (kind: GhostSfxKind) => void;
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
    source: "spark" | "table";
    at: number;
  } | null = null;
  /** nap/idle directives silence autonomous drift + antics until here. */
  private brainQuietUntil = 0;
  /** Scenario journal, in the dataset's event vocabulary. */
  private eventJournal: { label: string; at: number }[] = [];
  private verbsSeenLog: { id: string; at: number }[] = [];
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
    this.options.onSfx?.("heart");

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
      this.options.onSfx?.("startle");
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
        if (idx === 0) this.options.onSfx?.("mirror");
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
      this.options.onSfx?.("play");
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
        this.options.onSfx?.("sniff");
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
    if (
      this.options.onDeliberate &&
      this.enabled &&
      !this.dismissing &&
      now - this.lastDeliberationAt >= DELIBERATION_MIN_MS &&
      this.deliberationDirty
    ) {
      this.lastDeliberationAt = now;
      this.deliberationDirty = false;
      // Vitals journal: thinking is work; stamina spends on it.
      this.deliberationTimes = this.deliberationTimes.filter(
        (t) => now - t < 30 * 60_000
      );
      this.deliberationTimes.push(now);
      try {
        this.options.onDeliberate(this.buildScenario(now));
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
    };
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
  applyBrainDecision(decision: GhostDecision, source: "spark" | "table"): void {
    if (this.destroyed || !this.enabled) return;
    const now = Date.now();
    this.lastBrainDecision = { decision, source, at: now };
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
    const now = Date.now();
    if (
      this.mode !== "session" &&
      now - this.lastVerbAt > VERB_MIN_INTERVAL_MS
    ) {
      // Solo/crowd: the real verb path, under the shared verb clock.
      this.lastVerbAt = now;
      this.schedule(200, () => {
        if (this.canAct()) this.emitVerb(HEART);
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
      this.options.onSfx?.("play");
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
    this.options.onSfx?.("play");
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
    this.options.onSfx?.("sniff");
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
      this.options.onSfx?.("startle");
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
    if (verb.id === "heart") this.options.onSfx?.("heart");
    // Verbs normally splat at canvas center; the ghost's verbs belong at
    // the ghost's body.
    this.emit({
      ...verbInteraction(verb),
      position: { x: this.position.x, y: this.position.y },
    });
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
        this.options.onSfx?.("sleep");
      } else if (!isFirstPublish && prev === "sleeping" && next === "present") {
        this.options.onSfx?.("wake");
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
