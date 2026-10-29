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
import {
  DEFAULT_GHOST_PERMISSIONS,
  type GhostPermissions,
} from "../ghost/ghostPermissions";
import { subscribeGhostPermissions } from "../ghost/ghostPermissionsPref";
import { getGhostPersonality } from "../ghost/ghostPersonalityPref";
import {
  rewardsPublicFace,
  subscribeRewards,
} from "../rewards/rewardsStore";

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
  /** Equipped Signature Heart motif id (Slice 24), if any. */
  motif: string | null;
  /**
   * The ghostie's card permissions (Slice 22), live from
   * ghostPermissionsPref — they decide what the announce may
   * publish about the ghostie.
   */
  permissions: GhostPermissions;
  /**
   * The primary's Personality text. It enters the announce ONLY
   * under permissions.personalityPublic (profile.ts enforces);
   * here it is simply the current text, refreshed on load, on
   * permission changes, and via refreshLocalGhostCardInputs()
   * after the Home saves an edit.
   */
  personality: string;
  loaded: boolean;
}

let local: LocalProfileExtras = {
  ghostSeed: null,
  badges: [],
  trail: null,
  motif: null,
  permissions: { ...DEFAULT_GHOST_PERMISSIONS },
  personality: "",
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

async function readRewards(): Promise<{
  badges: string[];
  trail: string | null;
  motif: string | null;
}> {
  try {
    const raw = await getJSON<unknown>(REWARDS_KEY, null);
    if (!raw || typeof raw !== "object") {
      return { badges: [], trail: null, motif: null };
    }
    const rec = raw as Record<string, unknown>;
    // Accept every shape the design allows: a flat id list, or
    // earned entries with ids — Slice 24's store writes `earned`
    // (and earlier drafts wrote `earnedBadges`). Anything else
    // sanitizes to empty.
    const flat = sanitizeBadgeIds(rec.badges);
    const earnedFrom = (list: unknown): string[] =>
      Array.isArray(list)
        ? sanitizeBadgeIds(
            list.map((e) =>
              e && typeof e === "object"
                ? (e as Record<string, unknown>).id
                : undefined
            )
          )
        : [];
    const earned = earnedFrom(rec.earned);
    const earnedBadges = earnedFrom(rec.earnedBadges);
    const equipped =
      rec.equipped && typeof rec.equipped === "object"
        ? (rec.equipped as Record<string, unknown>)
        : {};
    const idOrNull = (v: unknown): string | null =>
      typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(v) ? v : null;
    return {
      badges: flat.length ? flat : earned.length ? earned : earnedBadges,
      trail: idOrNull(equipped.trail),
      motif: idOrNull(equipped.heartMotif),
    };
  } catch {
    return { badges: [], trail: null, motif: null };
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
    const [ghostSeed, rewards, personality] = await Promise.all([
      readGhostSeed(),
      readRewards(),
      getGhostPersonality().catch(() => ""),
    ]);
    publishLocal({
      ...local,
      ghostSeed,
      badges: rewards.badges,
      trail: rewards.trail,
      motif: rewards.motif,
      personality,
      loaded: true,
    });
  })();
  // Slice 24: the rewards store is LIVE — a badge earned or a
  // power-up (un)equipped mid-session republishes the local
  // extras, and the transport's existing subscription turns the
  // republish into a re-announce, so the room sees the new badge
  // (or trail, or heart motif) on the next announce instead of
  // the next app launch. The store's public face is the only
  // thing read here; its counters stay home.
  subscribeRewards((s) => {
    const face = rewardsPublicFace(s);
    if (
      face.badges.join(",") === local.badges.join(",") &&
      face.trail === local.trail &&
      face.heartMotif === local.motif
    ) {
      return;
    }
    publishLocal({
      ...local,
      badges: face.badges,
      trail: face.trail,
      motif: face.heartMotif,
    });
  });
  // Slice 22: permissions are live — a flip in the Ghostie Home
  // republishes the local extras (and the transport re-announces
  // on the republish), and the Personality text is re-read at the
  // same moment so a just-saved edit rides along.
  subscribeGhostPermissions((permissions) => {
    if (
      permissions.shareable === local.permissions.shareable &&
      permissions.tradeable === local.permissions.tradeable &&
      permissions.personalityPublic === local.permissions.personalityPublic
    ) {
      return;
    }
    publishLocal({ ...local, permissions });
    void getGhostPersonality()
      .then((text) => {
        if (text !== local.personality) {
          publishLocal({ ...local, personality: text });
        }
      })
      .catch(() => undefined);
  });
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

/**
 * Re-read the Personality text into the local extras (Slice 22).
 * Called by the Ghostie Home right after it saves an edit, so a
 * public personality reaches the room's cards with the next
 * announce instead of the next app load.
 */
export function refreshLocalGhostCardInputs(): void {
  ensureLocalProfileExtras();
  void getGhostPersonality()
    .then((text) => {
      if (text !== local.personality) {
        publishLocal({ ...local, personality: text });
      }
    })
    .catch(() => undefined);
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
  const gc = (e: PeerProfileExtras) =>
    e.ghostCard
      ? [
          e.ghostCard.shareable ? 1 : 0,
          e.ghostCard.tradeable ? 1 : 0,
          e.ghostCard.personalityPublic ? 1 : 0,
          e.ghostCard.personality ?? "",
          e.ghostCard.vitals
            ? `${e.ghostCard.vitals.h}/${e.ghostCard.vitals.s}/${e.ghostCard.vitals.v}`
            : "",
        ].join("|")
      : "";
  return (
    a.tag === b.tag &&
    a.trail === b.trail &&
    a.motif === b.motif &&
    a.ghost?.name === b.ghost?.name &&
    a.ghost?.temperament === b.ghost?.temperament &&
    a.ghost?.hue === b.ghost?.hue &&
    (a.badges ?? []).join(",") === (b.badges ?? []).join(",") &&
    gc(a) === gc(b)
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
