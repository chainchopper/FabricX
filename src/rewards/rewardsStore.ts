/**
 * Rewards store — Slice 24 ("Rewards: badges + ghostie power-ups").
 *
 * The storage + pub/sub half of rewardsCore.ts, in the same
 * module-store pattern as profileStore / ghostSharedPref. The
 * record is fabric_rewards_v1 — the key Slice 21's profile store
 * already reads for the announce's public face (earned badge ids
 * + equipped trail) — so the day this store lands, earned badges
 * start riding the announce Slice 21 built, with no protocol
 * change. (profileStore also subscribes here, below the load, so
 * a badge earned mid-session republishes the local extras and
 * the room's next announce carries it.)
 *
 * Honesty rules carried from the design:
 * - Existing installs start at ZERO. Events before this slice
 *   shipped never counted, and nothing here back-fills them —
 *   a badge is earned in the living of it, not reconstructed.
 * - The record never leaves the device. Only its public face
 *   (badge ids, the equipped trail/motif ids) rides the
 *   announce, exactly as Slice 21 designed.
 * - Counters never decrement; a badge earned is earned.
 * - Equips are validated against the badges that back them
 *   (rewardsCore.equipAllowed) at the moment they're set.
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import { getJSON, setJSON } from "../../app/utils/storage";
import {
  applyRewardEvent,
  earnedBadgeIds,
  equipAllowed,
  freshRewardsState,
  sanitizeRewardsState,
  type RewardEvent,
  type RewardsEquipped,
  type RewardsState,
} from "./rewardsCore";

export const REWARDS_KEY = "fabric_rewards_v1";

let state: RewardsState = freshRewardsState();
let loaded = false;
let loadPromise: Promise<void> | null = null;

const listeners = new Set<(s: RewardsState) => void>();
const earnListeners = new Set<(id: string, at: number) => void>();

function publish(): void {
  const snap = state;
  listeners.forEach((l) => l(snap));
}

function persist(): void {
  void setJSON(REWARDS_KEY, state).catch(() => undefined);
}

/**
 * Load the record once (idempotent). A garbled record sanitizes
 * to a clean state (rewardsCore) — never a throw, never a
 * half-trusted badge. Events recorded before the load lands are
 * applied AFTER it (recordRewardEvent awaits this), so a fast
 * first session can't earn into a state the load then overwrites.
 */
export function ensureRewardsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await getJSON<unknown>(REWARDS_KEY, null);
      state = sanitizeRewardsState(raw);
    } catch {
      state = freshRewardsState();
    }
    loaded = true;
    publish();
  })();
  return loadPromise;
}

export function getRewardsSnapshot(): RewardsState {
  return state;
}

export function isRewardsLoaded(): boolean {
  return loaded;
}

export function subscribeRewards(
  fn: (s: RewardsState) => void
): () => void {
  void ensureRewardsLoaded();
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

/** Fires once per badge at the moment it is earned (the toast). */
export function subscribeBadgeEarned(
  fn: (id: string, at: number) => void
): () => void {
  earnListeners.add(fn);
  return () => {
    earnListeners.delete(fn);
  };
}

/** React reader for the rewards record. */
export function useRewards(): RewardsState {
  const [snap, setSnap] = useState<RewardsState>(() => getRewardsSnapshot());
  useEffect(() => subscribeRewards(setSnap), []);
  return snap;
}

/* ------------------------------------------------------------------ */
/* Recording: the typed seams' only door                               */
/* ------------------------------------------------------------------ */

/**
 * Apply one event. Awaits the load, runs the pure reducer,
 * persists + publishes when something moved, and announces any
 * badge the event earned. Fire-and-forget by design — no seam
 * ever blocks on a badge.
 */
export function recordRewardEvent(event: RewardEvent): void {
  void (async () => {
    await ensureRewardsLoaded();
    const result = applyRewardEvent(state, event);
    if (!result.changed) return;
    state = result.state;
    persist();
    publish();
    for (const id of result.earnedNow) {
      earnListeners.forEach((l) => {
        try {
          l(id, event.at);
        } catch {
          // A listener's failure is not the badge's failure.
        }
      });
    }
  })();
}

export function recordSessionShared(args: {
  isHost: boolean;
  peerCount: number;
  countSession: boolean;
}): void {
  recordRewardEvent({ type: "session-shared", at: Date.now(), ...args });
}

export function recordHeartSent(recipients: readonly string[], selfId: string): void {
  if (recipients.length === 0) return;
  recordRewardEvent({
    type: "heart-sent",
    at: Date.now(),
    recipients,
    selfId,
  });
}

export function recordCompositionSaved(): void {
  recordRewardEvent({ type: "composition-saved", at: Date.now() });
}

export function recordAgentAnswer(): void {
  recordRewardEvent({ type: "agent-answer", at: Date.now() });
}

export function recordPetGiven(ghostId: string): void {
  if (!ghostId) return;
  recordRewardEvent({ type: "pet-given", at: Date.now(), ghostId });
}

export function recordStagePresence(crowd: number): void {
  recordRewardEvent({ type: "stage-presence", at: Date.now(), crowd });
}

export function recordNightActive(nightKey: string): void {
  recordRewardEvent({ type: "night-active", at: Date.now(), nightKey });
}

export function recordLintJoined(simulated: boolean): void {
  recordRewardEvent({ type: "lint-joined", at: Date.now(), simulated });
}

/* ------------------------------------------------------------------ */
/* Equipping                                                           */
/* ------------------------------------------------------------------ */

/**
 * Apply an equip patch if the badges back it (rewardsCore
 * decides). Returns whether it applied. Unequips (null/false)
 * always pass the same gate — equipAllowed only refuses
 * turning something ON without its badge.
 */
export function equipRewards(patch: Partial<RewardsEquipped>): boolean {
  if (!loaded) {
    void ensureRewardsLoaded();
    return false;
  }
  if (!equipAllowed(state, patch)) return false;
  state = { ...state, equipped: { ...state.equipped, ...patch } };
  persist();
  publish();
  return true;
}

/** The announce's public face, in one place (badges + flair ids). */
export function rewardsPublicFace(s: RewardsState): {
  badges: string[];
  trail: string | null;
  heartMotif: string | null;
} {
  return {
    badges: earnedBadgeIds(s),
    trail: s.equipped.trail,
    heartMotif: s.equipped.heartMotif,
  };
}
