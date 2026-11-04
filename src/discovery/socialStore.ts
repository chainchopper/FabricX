/**
 * The social store — Slice 59's Follow + Friend.
 *
 * Plain truth, stated the way the submission must state it:
 * THERE IS NO SERVER SOCIAL GRAPH. Fabric has no accounts
 * backend and this slice adds none. Follow and Friend are
 * LOCAL-FIRST marks, kept on this device, keyed by the person's
 * secure tag (the one-way LifePacket fingerprint of Slice 21) —
 * the same posture as the identity itself: device-bound, never
 * announced, never uploaded. The other person's device never
 * learns you followed or friended them; nothing here is mutual
 * by protocol, and the UI never claims otherwise.
 *
 * - FOLLOW (fabric_follows_v1): a one-way local subscription.
 *   A followed host's listings surface FIRST in the Find
 *   gallery, and their arrival is an encounter (the ghostie
 *   reacts — see lobbyProtocol's encounter discipline).
 * - FRIEND (fabric_friends_v1): added deliberately from a
 *   person's profile in the Find gallery. The Find list's
 *   Friends FILTER reads this set UNION the known-people memory
 *   (knownPeople.ts — tags remembered from fabrics actually
 *   shared), so "friends" = people you marked here + people
 *   the app remembers meeting. Unfriending here removes the
 *   deliberate mark; a person also known from a shared fabric
 *   still reads as a friend by memory, and their profile says
 *   which kind they are.
 *
 * Both sets are written only from the Find profile's buttons —
 * nothing auto-follows, nothing auto-friends.
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import { getJSON, setJSON } from "../../app/utils/storage";
import { isLobbyTag, type LobbyIdentity } from "./lobbyProtocol";

export const FOLLOWS_KEY = "fabric_follows_v1";
export const FRIENDS_KEY = "fabric_friends_v1";
export const MAX_SOCIAL_ENTRIES = 500;

export interface SocialEntry {
  tag: string;
  name: string;
  hue: number;
  /** When the mark was made (ms epoch). */
  at: number;
}

/* ------------------------------------------------------------------ */
/* Pure helpers (the check drives these)                               */
/* ------------------------------------------------------------------ */

export function sanitizeSocialEntries(raw: unknown): SocialEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SocialEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    if (!isLobbyTag(src.tag)) continue;
    if (typeof src.hue !== "number" || !Number.isFinite(src.hue)) continue;
    if (typeof src.at !== "number" || !Number.isFinite(src.at)) continue;
    out.push({
      tag: src.tag,
      name: typeof src.name === "string" ? src.name.trim().slice(0, 40) : "",
      hue: ((Math.round(src.hue) % 360) + 360) % 360,
      at: src.at,
    });
    if (out.length >= MAX_SOCIAL_ENTRIES) break;
  }
  return out;
}

export function upsertSocialEntry(
  list: readonly SocialEntry[],
  entry: SocialEntry
): SocialEntry[] {
  const rest = list.filter((e) => e.tag !== entry.tag);
  return [entry, ...rest].slice(0, MAX_SOCIAL_ENTRIES);
}

export function removeSocialEntry(
  list: readonly SocialEntry[],
  tag: string
): SocialEntry[] {
  return list.filter((e) => e.tag !== tag);
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

type SocialKind = "follows" | "friends";

const KEYS: Record<SocialKind, string> = {
  follows: FOLLOWS_KEY,
  friends: FRIENDS_KEY,
};

const entries: Record<SocialKind, SocialEntry[]> = { follows: [], friends: [] };
const loadPromises: Partial<Record<SocialKind, Promise<void>>> = {};
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeSocial(fn: () => void): () => void {
  listeners.add(fn);
  fn();
  return () => {
    listeners.delete(fn);
  };
}

function ensureLoaded(kind: SocialKind): Promise<void> {
  if (!loadPromises[kind]) {
    loadPromises[kind] = (async () => {
      try {
        const raw = await getJSON<unknown>(KEYS[kind], null);
        entries[kind] = sanitizeSocialEntries(raw);
      } catch {
        entries[kind] = [];
      }
      emit();
    })();
  }
  return loadPromises[kind] as Promise<void>;
}

export function ensureSocial(): Promise<void> {
  return Promise.all([ensureLoaded("follows"), ensureLoaded("friends")]).then(
    () => undefined
  );
}

function tagsOf(kind: SocialKind): ReadonlySet<string> {
  return new Set(entries[kind].map((e) => e.tag));
}

export function getFollowTags(): ReadonlySet<string> {
  return tagsOf("follows");
}

export function getFriendTags(): ReadonlySet<string> {
  return tagsOf("friends");
}

export function isFollowing(tag: string): boolean {
  return entries.follows.some((e) => e.tag === tag);
}

export function isFriended(tag: string): boolean {
  return entries.friends.some((e) => e.tag === tag);
}

function setMark(kind: SocialKind, who: LobbyIdentity, on: boolean): void {
  void ensureLoaded(kind).then(() => {
    const has = entries[kind].some((e) => e.tag === who.tag);
    if (on === has) return;
    entries[kind] = on
      ? upsertSocialEntry(entries[kind], {
          tag: who.tag,
          name: who.name,
          hue: who.hue,
          at: Date.now(),
        })
      : removeSocialEntry(entries[kind], who.tag);
    void setJSON(KEYS[kind], entries[kind]).catch(() => undefined);
    emit();
  });
}

/** Follow / unfollow — a local subscription, nothing leaves. */
export function setFollow(who: LobbyIdentity, on: boolean): void {
  setMark("follows", who, on);
}

/** Friend / unfriend — the deliberate half of the Friends set. */
export function setFriend(who: LobbyIdentity, on: boolean): void {
  setMark("friends", who, on);
}

export interface SocialSnapshot {
  followTags: ReadonlySet<string>;
  friendTags: ReadonlySet<string>;
}

/** React reader: both deliberate sets, live. */
export function useSocial(): SocialSnapshot {
  const [snap, setSnap] = useState<SocialSnapshot>(() => ({
    followTags: getFollowTags(),
    friendTags: getFriendTags(),
  }));
  useEffect(() => {
    void ensureSocial();
    return subscribeSocial(() =>
      setSnap({ followTags: getFollowTags(), friendTags: getFriendTags() })
    );
  }, []);
  return snap;
}
