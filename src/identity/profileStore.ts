/**
 * Profile extras store — Slice 21 ("Profile Cards").
 *
 * The storage + pub/sub half of src/identity/profile.ts, in the
 * same module-store pattern as identityStore and ghostSharedPref.
 * Two halves:
 *
 * LOCAL — the inputs this device announces: the ghost seed (read
 * once from the ghost record; it feeds the secure tag's
 * derivation and is itself NEVER published — only the one-way
 * tag leaves) and the rewards record's public face (earned badge
 * ids + equipped trail, fabric_rewards_v1 — the rewards slice
 * owns that record; until it exists, the local extras are simply
 * a tag and a ghost, which is the truth of the device today).
 *
 * PEERS — the extras learned from each peer's announce, keyed by
 * userId and TTL-pruned alongside the Slice 6 identities, so a
 * card never outlives the presence it describes.
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import { getJSON } from "../../app/utils/storage";
import { PEER_IDENTITY_TTL_MS } from "./identityStore";
import {
  hasPeerExtras,
  sanitizeBadgeIds,
  type PeerProfileExtras,
} from "./profile";
import { subscribeGhostState } from "../ghost/ghostStore";

/** The ghost record's key (canonical export: useGhostPeer.GHOST_PREF_KEY). */
const GHOST_PREF_KEY = "fabric_ghost_v1";
/** The rewards record (fabric-rewards-design.md) — read-only here. */
export const REWARDS_KEY = "fabric_rewards_v1";

/* ------------------------------------------------------------------ */
/* Local extras                                                        */
/* ------------------------------------------------------------------ */

export interface LocalProfileExtras {
  /** Ghost seed for the tag derivation. NEVER leaves this module. */
  ghostSeed: number | null;
  badges: string[];
  trail: string | null;
  loaded: boolean;
}

let local: LocalProfileExtras = {
  ghostSeed: null,
  badges: [],
  trail: null,
  loaded: false,
};
let loadStarted = false;
let ghostPrefRetried = false;
const localListeners = new Set<(s: LocalProfileExtras) => void>();

function publishLocal(next: LocalProfileExtras): void {
  local = next;
  localListeners.forEach((l) => l({ ...local }));
}

async function readGhostSeed(): Promise<number | null> {
  try {
    const pref = await getJSON<{ identity?: { seed?: unknown } } | null>(
      GHOST_PREF_KEY,
      null
    );
    const s = pref?.identity?.seed;
    return typeof s === "number" ? s : null;
  } catch {
    return null;
  }
}

async function readRewards(): Promise<{ badges: string[]; trail: string | null }> {
  try {
    const raw = await getJSON<unknown>(REWARDS_KEY, null);
    if (!raw || typeof raw !== "object") return { badges: [], trail: null };
    const rec = raw as Record<string, unknown>;
    // Accept both shapes the design allows: a flat id list, or
    // earned entries with ids. Anything else sanitizes to empty.
    const flat = sanitizeBadgeIds(rec.badges);
    const earned = Array.isArray(rec.earnedBadges)
      ? sanitizeBadgeIds(
          rec.earnedBadges.map((e) =>
            e && typeof e === "object"
              ? (e as Record<string, unknown>).id
              : undefined
          )
        )
      : [];
    const equipped =
      rec.equipped && typeof rec.equipped === "object"
        ? (rec.equipped as Record<string, unknown>)
        : {};
    const trail =
      typeof equipped.trail === "string" &&
      /^[a-z0-9][a-z0-9-]{0,31}$/.test(equipped.trail)
        ? equipped.trail
        : null;
    return { badges: flat.length ? flat : earned, trail };
  } catch {
    return { badges: [], trail: null };
  }
}

/**
 * Load the local extras once (idempotent). The snapshot starts
 * unloaded with the identity-seed tag fallback in force; when the
 * ghost record lands, the tag resolves to the ghost seed — the
 * same sequence GhostieHome renders on mount.
 */
export function ensureLocalProfileExtras(): void {
  if (loadStarted) return;
  loadStarted = true;
  void (async () => {
    const [ghostSeed, rewards] = await Promise.all([
      readGhostSeed(),
      readRewards(),
    ]);
    publishLocal({
      ghostSeed,
      badges: rewards.badges,
      trail: rewards.trail,
      loaded: true,
    });
  })();
  // Fresh-install race: the ghost record is born when the canvas
  // first runs the ghost, which can be after this load. When a
  // ghost name first publishes and we still hold no seed, read
  // the record once more — the tag then names the real ghost,
  // exactly as the Home's read does on open.
  subscribeGhostState((s) => {
    if (ghostPrefRetried || local.ghostSeed !== null) return;
    if (!s.ghostName) return;
    ghostPrefRetried = true;
    void readGhostSeed().then((seed) => {
      if (seed !== null && local.ghostSeed === null) {
        publishLocal({ ...local, ghostSeed: seed });
      }
    });
  });
}

export function getLocalProfileExtras(): LocalProfileExtras {
  ensureLocalProfileExtras();
  return { ...local };
}

export function subscribeLocalProfileExtras(
  fn: (s: LocalProfileExtras) => void
): () => void {
  ensureLocalProfileExtras();
  localListeners.add(fn);
  fn({ ...local });
  return () => {
    localListeners.delete(fn);
  };
}

/** React reader for the local announce inputs. */
export function useLocalProfileExtras(): LocalProfileExtras {
  const [extras, setExtras] = useState<LocalProfileExtras>(() =>
    getLocalProfileExtras()
  );
  useEffect(() => subscribeLocalProfileExtras(setExtras), []);
  return extras;
}

/* ------------------------------------------------------------------ */
/* Peer extras                                                         */
/* ------------------------------------------------------------------ */

interface PeerExtrasRecord {
  extras: PeerProfileExtras;
  seenAt: number;
}

const peerExtras = new Map<string, PeerExtrasRecord>();
const peerListeners = new Set<
  (s: Record<string, PeerProfileExtras>) => void
>();

export function getPeerProfilesSnapshot(): Record<string, PeerProfileExtras> {
  const out: Record<string, PeerProfileExtras> = {};
  peerExtras.forEach((rec, id) => {
    out[id] = rec.extras;
  });
  return out;
}

function emitPeers(): void {
  const snap = getPeerProfilesSnapshot();
  peerListeners.forEach((l) => l(snap));
}

function extrasEqual(a: PeerProfileExtras, b: PeerProfileExtras): boolean {
  return (
    a.tag === b.tag &&
    a.trail === b.trail &&
    a.ghost?.name === b.ghost?.name &&
    a.ghost?.temperament === b.ghost?.temperament &&
    (a.badges ?? []).join(",") === (b.badges ?? []).join(",")
  );
}

/**
 * Learn a peer's extras from their announce (already sanitized
 * by the caller via sanitizePeerExtras). Announces are full-state
 * and heartbeat-refreshed, so a present record replaces; an empty
 * one teaches nothing and leaves any prior record in place (a
 * legacy client's announce must not erase what a newer one said
 * moments earlier in the same session).
 */
export function setPeerProfileExtras(
  userId: string,
  extras: PeerProfileExtras
): void {
  if (!userId || !hasPeerExtras(extras)) return;
  const prev = peerExtras.get(userId);
  if (prev && extrasEqual(prev.extras, extras)) {
    prev.seenAt = Date.now();
    return;
  }
  peerExtras.set(userId, { extras, seenAt: Date.now() });
  emitPeers();
}

export function getPeerProfileExtras(
  userId: string
): PeerProfileExtras | null {
  const rec = peerExtras.get(userId);
  return rec ? rec.extras : null;
}

/** Presence-tied expiry, mirroring prunePeerIdentities exactly. */
export function prunePeerProfiles(presentIds: readonly string[]): void {
  const present = new Set(presentIds);
  const now = Date.now();
  let changed = false;
  peerExtras.forEach((rec, id) => {
    if (!present.has(id) && now - rec.seenAt > PEER_IDENTITY_TTL_MS) {
      peerExtras.delete(id);
      changed = true;
    }
  });
  if (changed) emitPeers();
}

export function subscribePeerProfiles(
  fn: (s: Record<string, PeerProfileExtras>) => void
): () => void {
  peerListeners.add(fn);
  fn(getPeerProfilesSnapshot());
  return () => {
    peerListeners.delete(fn);
  };
}

/** React reader: every learned peer's extras, by userId. */
export function usePeerProfiles(): Record<string, PeerProfileExtras> {
  const [snap, setSnap] = useState<Record<string, PeerProfileExtras>>(() =>
    getPeerProfilesSnapshot()
  );
  useEffect(() => subscribePeerProfiles(setSnap), []);
  return snap;
}
