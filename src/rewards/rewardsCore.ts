/**
 * Rewards — the pure core (Slice 24).
 *
 * Terrell named the gap (Oct 28): "none of the rewards systems
 * are in place — no ghostie power ups, no user badges." The
 * design (fabric-rewards-design.md) set rule zero, and this
 * module is built to it:
 *
 *   NOTHING HERE REWARDS SPAM. Every earn comes from a real
 *   action at a seam the app already has; counters dedupe
 *   repeated taps; counters never decrement; and no unlock —
 *   badge or power-up — ever touches the ghost's hard
 *   invariants (budgets, petting rules, never-talks). Power
 *   here means more EXPRESSION, never more volume.
 *
 * Shape of the system:
 * - Badge definitions are DATA (BADGE_DEFS): an id, the counter
 *   that feeds it, and a threshold. The ids are the same id
 *   space Slice 21's display registry (profile.ts BADGE_REGISTRY)
 *   renders — this module is the earning side, that one is the
 *   display side; the headless check asserts they agree.
 * - Events are typed (RewardEvent) and applied by ONE pure
 *   reducer, applyRewardEvent. Feature code never writes
 *   counters directly; it reports what happened at its seam and
 *   the reducer decides what it was worth. No screen scrapes
 *   its own stats.
 * - Power-up unlocks are DERIVED from earned badges
 *   (powerUpUnlocked / trailStyleUnlocked), never stored as
 *   facts that could drift from the badges that grant them.
 *   What IS stored is only the primary's equip choices.
 *
 * Pure and dependency-free so the node check exercises it
 * directly, in the pattern of profile.ts / stageRoster.ts.
 *
 * Powered by Nirvana
 */

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface EarnedBadge {
  id: string;
  /** Epoch ms the badge was earned (device-local truth). */
  at: number;
}

export interface RewardsCounters {
  /** Hearts that counted (deduped per recipient, see heart-sent). */
  heartsSent: number;
  /** Recipient id -> epoch ms of the last COUNTED heart to them. */
  heartCountedAt: Record<string, number>;
  compositionsSaved: number;
  agentAnswers: number;
  /** Distinct ghost peer ids this user has petted. */
  pettedGhostIds: string[];
  /** Stage appearances with a crowd (roster >= 3 incl. self). */
  stagePresences: number;
  /** Local night keys ("2026-10-29") spent on a fabric past midnight. */
  nights: string[];
  /** Shared sessions joined or hosted (another human present). */
  sessionsShared: number;
  /** Largest room held while HOST (people incl. self). */
  hostedCrowdMax: number;
  /** A real lint object joined (simulated hellos never set this). */
  lintJoined: boolean;
}

/** The primary's equip choices — the only non-counter state. */
export interface RewardsEquipped {
  /** Trail style id ("ribbon" | "sparkle" | "petals" | "comet") or null. */
  trail: string | null;
  /** Second Voice equipped (alternate ghost SFX timbre). */
  voice: boolean;
  /** Stage Aura equipped (aura ring under the local rig). */
  aura: boolean;
  /** Signature Heart motif id ("double-ring") or null. */
  heartMotif: string | null;
  /** The verb the ghost greets with (Warm Welcome): heart/cheer/tickle. */
  welcomeVerb: string;
}

export interface RewardsState {
  earned: EarnedBadge[];
  counters: RewardsCounters;
  equipped: RewardsEquipped;
}

export function freshRewardsState(): RewardsState {
  return {
    earned: [],
    counters: {
      heartsSent: 0,
      heartCountedAt: {},
      compositionsSaved: 0,
      agentAnswers: 0,
      pettedGhostIds: [],
      stagePresences: 0,
      nights: [],
      sessionsShared: 0,
      hostedCrowdMax: 0,
      lintJoined: false,
    },
    equipped: {
      trail: null,
      voice: false,
      aura: false,
      heartMotif: null,
      welcomeVerb: "heart",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Badge definitions — data, not code branches                         */
/* ------------------------------------------------------------------ */

export interface BadgeDef {
  id: string;
  /** The counter (or boolean fact) that feeds the badge. */
  source: keyof RewardsCounters | "pettedGhostCount" | "nightCount";
  threshold: number;
}

export const BADGE_DEFS: readonly BadgeDef[] = [
  { id: "first-thread", source: "sessionsShared", threshold: 1 },
  { id: "heartfelt", source: "heartsSent", threshold: 25 },
  { id: "good-host", source: "hostedCrowdMax", threshold: 3 },
  { id: "composer", source: "compositionsSaved", threshold: 1 },
  { id: "pattern-mind", source: "agentAnswers", threshold: 5 },
  { id: "pet-whisperer", source: "pettedGhostCount", threshold: 3 },
  { id: "stage-presence", source: "stagePresences", threshold: 1 },
  { id: "night-owl", source: "nightCount", threshold: 3 },
  { id: "first-light", source: "lintJoined", threshold: 1 },
];

export const BADGE_IDS: readonly string[] = BADGE_DEFS.map((d) => d.id);

function progressOf(state: RewardsState, def: BadgeDef): number {
  const c = state.counters;
  switch (def.source) {
    case "pettedGhostCount":
      return c.pettedGhostIds.length;
    case "nightCount":
      return c.nights.length;
    case "lintJoined":
      return c.lintJoined ? 1 : 0;
    default:
      return c[def.source] as number;
  }
}

export function badgeProgress(
  state: RewardsState,
  id: string
): { progress: number; threshold: number } | null {
  const def = BADGE_DEFS.find((d) => d.id === id);
  if (!def) return null;
  return { progress: progressOf(state, def), threshold: def.threshold };
}

export function hasBadge(state: RewardsState, id: string): boolean {
  return state.earned.some((e) => e.id === id);
}

export function earnedBadgeIds(state: RewardsState): string[] {
  return state.earned.map((e) => e.id);
}

/* ------------------------------------------------------------------ */
/* Events + the one reducer                                            */
/* ------------------------------------------------------------------ */

/**
 * What feature code may report. Each event is a fact at a seam
 * that already exists:
 * - session-shared: the session store saw another human present
 *   (role + headcount incl. self ride along for Good Host).
 * - heart-sent: a heart verb left through the send funnel, with
 *   the humans it could reach. The reducer applies rule zero:
 *   a recipient counts at most once per minute, so leaning on
 *   the heart button is worth exactly one heart a minute each.
 * - composition-saved: the Studio store persisted a composition.
 * - agent-answer: the interpreter/ghost actually performed an
 *   answer (a failed ask is not an answer and never arrives).
 * - pet-given: this user petted a ghostie (card pet or a stroke
 *   that landed on one), by ghost peer id — distinctness is the
 *   whole badge, so the id is the payload.
 * - stage-presence: the Stage cast held `crowd` people incl.
 *   self; only a real crowd (>= 3) is an event worth the name.
 * - night-active: the local clock says past midnight (the feed
 *   only raises this in the small hours, while sharing a
 *   fabric); nightKey is the local date, so three EVENTS on one
 *   night are still one night.
 * - lint-joined: a lint-hello registered a device. `simulated`
 *   is carried honestly: the in-app simulator is a local
 *   preview, and its hello NEVER earns First Light.
 */
export type RewardEvent =
  | {
      type: "session-shared";
      at: number;
      isHost: boolean;
      /** Room size incl. self, for Good Host's crowd fact. */
      peerCount: number;
      /**
       * True only on the transition INTO sharing (the feed's
       * edge), so sessionsShared counts sessions, while crowd
       * growth inside one session can still raise hostedCrowdMax
       * by reporting again with countSession false.
       */
      countSession: boolean;
    }
  | {
      type: "heart-sent";
      at: number;
      recipients: readonly string[];
      selfId: string;
    }
  | { type: "composition-saved"; at: number }
  | { type: "agent-answer"; at: number }
  | { type: "pet-given"; at: number; ghostId: string }
  | { type: "stage-presence"; at: number; crowd: number }
  | { type: "night-active"; at: number; nightKey: string }
  | { type: "lint-joined"; at: number; simulated: boolean };

export const HEART_DEDUPE_MS = 60_000;

export interface RewardApplyResult {
  state: RewardsState;
  /** Badge ids earned BY this event (usually empty). */
  earnedNow: string[];
  /** True when any counter/equip fact actually moved. */
  changed: boolean;
}

export function applyRewardEvent(
  prev: RewardsState,
  event: RewardEvent
): RewardApplyResult {
  const c: RewardsCounters = {
    ...prev.counters,
    heartCountedAt: { ...prev.counters.heartCountedAt },
    pettedGhostIds: [...prev.counters.pettedGhostIds],
    nights: [...prev.counters.nights],
  };
  let changed = false;

  switch (event.type) {
    case "session-shared": {
      if (event.countSession) {
        c.sessionsShared += 1;
        changed = true;
      }
      if (event.isHost && event.peerCount > c.hostedCrowdMax) {
        c.hostedCrowdMax = event.peerCount;
        changed = true;
      }
      break;
    }
    case "heart-sent": {
      for (const r of event.recipients) {
        if (!r || r === event.selfId) continue;
        const last = c.heartCountedAt[r];
        if (last !== undefined && event.at - last < HEART_DEDUPE_MS) continue;
        c.heartCountedAt[r] = event.at;
        c.heartsSent += 1;
        changed = true;
      }
      break;
    }
    case "composition-saved": {
      c.compositionsSaved += 1;
      changed = true;
      break;
    }
    case "agent-answer": {
      c.agentAnswers += 1;
      changed = true;
      break;
    }
    case "pet-given": {
      if (event.ghostId && !c.pettedGhostIds.includes(event.ghostId)) {
        c.pettedGhostIds.push(event.ghostId);
        changed = true;
      }
      break;
    }
    case "stage-presence": {
      if (event.crowd >= 3) {
        c.stagePresences += 1;
        changed = true;
      }
      break;
    }
    case "night-active": {
      if (event.nightKey && !c.nights.includes(event.nightKey)) {
        c.nights.push(event.nightKey);
        changed = true;
      }
      break;
    }
    case "lint-joined": {
      // The simulator demonstrates the loop; it is not a lint
      // object joining anyone's fabric. Honest source, no earn.
      if (!event.simulated && !c.lintJoined) {
        c.lintJoined = true;
        changed = true;
      }
      break;
    }
  }

  const mid: RewardsState = { ...prev, counters: c };
  const earnedNow: string[] = [];
  const earned = [...prev.earned];
  for (const def of BADGE_DEFS) {
    if (earned.some((e) => e.id === def.id)) continue;
    if (progressOf(mid, def) >= def.threshold) {
      earned.push({ id: def.id, at: event.at });
      earnedNow.push(def.id);
    }
  }
  if (earnedNow.length > 0) changed = true;

  return {
    state: earnedNow.length > 0 ? { ...mid, earned } : mid,
    earnedNow,
    changed,
  };
}

/* ------------------------------------------------------------------ */
/* Power-ups: unlocks derived from badges, equips validated            */
/* ------------------------------------------------------------------ */

export const TRAIL_STYLES: readonly string[] = [
  "ribbon",
  "sparkle",
  "petals",
  "comet",
];

/** Badges that must be EARNED (any badges) for the count trails. */
const TRAIL_COUNT_GATES: Record<string, number> = {
  sparkle: 3,
  petals: 5,
  comet: 7,
};

export function trailStyleUnlocked(state: RewardsState, style: string): boolean {
  if (style === "ribbon") return hasBadge(state, "first-thread");
  const gate = TRAIL_COUNT_GATES[style];
  if (gate === undefined) return false;
  return state.earned.length >= gate;
}

export type PowerUpId =
  | "trail"
  | "second-voice"
  | "signature-heart"
  | "stage-aura"
  | "warm-welcome";

/** The badge each power-up hangs from (count trails live above). */
export const POWERUP_BADGE: Record<Exclude<PowerUpId, "trail">, string> = {
  "second-voice": "pattern-mind",
  "signature-heart": "heartfelt",
  "stage-aura": "stage-presence",
  "warm-welcome": "good-host",
};

export function powerUpUnlocked(state: RewardsState, id: PowerUpId): boolean {
  if (id === "trail") return TRAIL_STYLES.some((s) => trailStyleUnlocked(state, s));
  return hasBadge(state, POWERUP_BADGE[id]);
}

/**
 * May this equip choice be applied? The store refuses equips the
 * badges don't back — a tampered record or a stale UI can ask,
 * and the answer stays no. (Unequipping is always allowed.)
 */
export function equipAllowed(
  state: RewardsState,
  patch: Partial<RewardsEquipped>
): boolean {
  if (patch.trail) {
    if (!TRAIL_STYLES.includes(patch.trail)) return false;
    if (!trailStyleUnlocked(state, patch.trail)) return false;
  }
  if (patch.voice === true && !powerUpUnlocked(state, "second-voice")) {
    return false;
  }
  if (patch.aura === true && !powerUpUnlocked(state, "stage-aura")) {
    return false;
  }
  if (patch.heartMotif) {
    if (patch.heartMotif !== "double-ring") return false;
    if (!powerUpUnlocked(state, "signature-heart")) return false;
  }
  if (
    patch.welcomeVerb !== undefined &&
    !["heart", "cheer", "tickle"].includes(patch.welcomeVerb)
  ) {
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Sanitizing what storage hands back                                  */
/* ------------------------------------------------------------------ */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const nonNegInt = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0
    ? Math.floor(v)
    : 0;

/**
 * A garbled or stale fabric_rewards_v1 must become a clean state,
 * never a throw and never a half-trusted record: earned ids are
 * limited to the known registry, counters are clamped to
 * non-negative integers, string sets are pattern-checked and
 * capped, and equips are RE-VALIDATED against the sanitized
 * badges (an equip its badges no longer back is dropped, not
 * honored). Counters themselves are kept as recorded — the
 * record is the device's truth, but nothing in it may crash or
 * inflate the room's view.
 */
export function sanitizeRewardsState(raw: unknown): RewardsState {
  const out = freshRewardsState();
  if (!raw || typeof raw !== "object") return out;
  const rec = raw as Record<string, unknown>;

  if (Array.isArray(rec.earned)) {
    for (const e of rec.earned) {
      if (!e || typeof e !== "object") continue;
      const id = (e as Record<string, unknown>).id;
      const at = (e as Record<string, unknown>).at;
      if (typeof id !== "string" || !BADGE_IDS.includes(id)) continue;
      if (out.earned.some((x) => x.id === id)) continue;
      out.earned.push({
        id,
        at: typeof at === "number" && Number.isFinite(at) ? at : 0,
      });
    }
  }

  const c = rec.counters;
  if (c && typeof c === "object") {
    const cr = c as Record<string, unknown>;
    out.counters.heartsSent = nonNegInt(cr.heartsSent);
    out.counters.compositionsSaved = nonNegInt(cr.compositionsSaved);
    out.counters.agentAnswers = nonNegInt(cr.agentAnswers);
    out.counters.stagePresences = nonNegInt(cr.stagePresences);
    out.counters.sessionsShared = nonNegInt(cr.sessionsShared);
    out.counters.hostedCrowdMax = nonNegInt(cr.hostedCrowdMax);
    out.counters.lintJoined = cr.lintJoined === true;
    if (cr.heartCountedAt && typeof cr.heartCountedAt === "object") {
      for (const [k, v] of Object.entries(
        cr.heartCountedAt as Record<string, unknown>
      )) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          out.counters.heartCountedAt[k] = v;
        }
      }
    }
    if (Array.isArray(cr.pettedGhostIds)) {
      for (const g of cr.pettedGhostIds) {
        if (typeof g === "string" && g && out.counters.pettedGhostIds.length < 200) {
          if (!out.counters.pettedGhostIds.includes(g)) {
            out.counters.pettedGhostIds.push(g);
          }
        }
      }
    }
    if (Array.isArray(cr.nights)) {
      for (const n of cr.nights) {
        if (
          typeof n === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(n) &&
          out.counters.nights.length < 90 &&
          !out.counters.nights.includes(n)
        ) {
          out.counters.nights.push(n);
        }
      }
    }
  }
  // Counters and badges reconcile: a counter at threshold with
  // no badge (an older build's record, a hand-edited file) earns
  // silently at load — the badge is the counter's truth, and the
  // toast is for the moment of earning, not for archaeology.
  for (const def of BADGE_DEFS) {
    if (!out.earned.some((e) => e.id === def.id) && progressOf(out, def) >= def.threshold) {
      out.earned.push({ id: def.id, at: 0 });
    }
  }

  const eq = rec.equipped;
  if (eq && typeof eq === "object") {
    const er = eq as Record<string, unknown>;
    const patch: Partial<RewardsEquipped> = {};
    if (typeof er.trail === "string" && ID_PATTERN.test(er.trail)) {
      patch.trail = er.trail;
    }
    if (er.voice === true) patch.voice = true;
    if (er.aura === true) patch.aura = true;
    if (typeof er.heartMotif === "string" && ID_PATTERN.test(er.heartMotif)) {
      patch.heartMotif = er.heartMotif;
    }
    if (
      typeof er.welcomeVerb === "string" &&
      ["heart", "cheer", "tickle"].includes(er.welcomeVerb)
    ) {
      patch.welcomeVerb = er.welcomeVerb;
    }
    if (equipAllowed(out, patch)) {
      out.equipped = { ...out.equipped, ...patch };
    } else {
      // Per-field mercy: keep the equips that ARE backed.
      if (patch.trail && trailStyleUnlocked(out, patch.trail)) {
        out.equipped.trail = patch.trail;
      }
      if (patch.voice && powerUpUnlocked(out, "second-voice")) {
        out.equipped.voice = true;
      }
      if (patch.aura && powerUpUnlocked(out, "stage-aura")) {
        out.equipped.aura = true;
      }
      if (patch.heartMotif === "double-ring" && powerUpUnlocked(out, "signature-heart")) {
        out.equipped.heartMotif = "double-ring";
      }
      if (patch.welcomeVerb) out.equipped.welcomeVerb = patch.welcomeVerb;
    }
  }
  return out;
}
