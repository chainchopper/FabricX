/**
 * Known people — Slice 59's Friends memory.
 *
 * The Find list's Friends filter needs an honest answer to "who
 * are this user's friends?" — and the app, truthfully, has no
 * friends list: FriendsDrawer is the current room's chat, and the
 * profile stores keep a person's card only while their presence
 * lasts. What the app DOES know is who you have actually shared
 * a fabric with. This store is that memory, kept on this device
 * in the LifePacket posture (device-bound, never announced, never
 * tracking): every peer-announce that carries a secure tag —
 * the one-way fDNA fingerprint a participant already publishes
 * to their room (Slice 21) — is remembered here by tag, with the
 * name and hue the room knew them by and when you last met.
 *
 * "Friends", in the Find list, means exactly this set: hosts
 * whose tag this device remembers from a fabric you were both
 * in. Nobody is added by search, by browsing the lobby, or by
 * asking to join — only by having shared a room.
 *
 * Module pub/sub in the house pattern (identityStore,
 * profileStore): the transport hook feeds it from the announce
 * handler; the Find view reads it.
 *
 * Powered by Nirvana
 */

import { useEffect, useState } from "react";
import { getJSON, setJSON } from "../../app/utils/storage";
import { isLobbyTag } from "./lobbyProtocol";

export const KNOWN_PEOPLE_KEY = "fabric_known_people_v1";
export const MAX_KNOWN_PEOPLE = 200;

export interface KnownPerson {
  /** Secure tag — the person's stable public identity key. */
  tag: string;
  /** The name their room knew them by, most recently. */
  name: string;
  /** Their signature hue, most recently announced. */
  hue: number;
  /** When this device last shared a fabric with them. */
  lastMetAt: number;
}

/* ------------------------------------------------------------------ */
/* Pure helpers (the check drives these)                               */
/* ------------------------------------------------------------------ */

export function sanitizeKnownPeople(raw: unknown): KnownPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: KnownPerson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    if (!isLobbyTag(src.tag)) continue;
    if (typeof src.hue !== "number" || !Number.isFinite(src.hue)) continue;
    if (typeof src.lastMetAt !== "number" || !Number.isFinite(src.lastMetAt)) continue;
    out.push({
      tag: src.tag,
      name: typeof src.name === "string" ? src.name.trim().slice(0, 40) : "",
      hue: ((Math.round(src.hue) % 360) + 360) % 360,
      lastMetAt: src.lastMetAt,
    });
    if (out.length >= MAX_KNOWN_PEOPLE) break;
  }
  return out;
}

/** Newest meeting first; one entry per tag, ever. */
export function upsertKnownPerson(
  list: readonly KnownPerson[],
  person: KnownPerson
): KnownPerson[] {
  const rest = list.filter((p) => p.tag !== person.tag);
  return [person, ...rest].slice(0, MAX_KNOWN_PEOPLE);
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

let known: KnownPerson[] = [];
let loadPromise: Promise<void> | null = null;
const listeners = new Set<(tags: ReadonlySet<string>) => void>();

export function getKnownTags(): ReadonlySet<string> {
  return new Set(known.map((p) => p.tag));
}

export function getKnownPeople(): KnownPerson[] {
  return known.map((p) => ({ ...p }));
}

function emit(): void {
  const tags = getKnownTags();
  listeners.forEach((l) => l(tags));
}

export function subscribeKnownPeople(
  fn: (tags: ReadonlySet<string>) => void
): () => void {
  listeners.add(fn);
  fn(getKnownTags());
  return () => {
    listeners.delete(fn);
  };
}

export function ensureKnownPeople(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await getJSON<unknown>(KNOWN_PEOPLE_KEY, null);
        known = sanitizeKnownPeople(raw);
      } catch {
        known = [];
      }
      emit();
    })();
  }
  return loadPromise;
}

/**
 * Remember a person this device shared a fabric with. Called by
 * the transport's announce handler with wire data — validated
 * here, and a tagless or garbled announce teaches nothing. Cheap
 * and never throws: learning must never disturb the room.
 */
export function noteKnownPerson(input: {
  tag: unknown;
  name: unknown;
  hue: unknown;
}): void {
  try {
    if (!isLobbyTag(input.tag)) return;
    if (typeof input.hue !== "number" || !Number.isFinite(input.hue)) return;
    const person: KnownPerson = {
      tag: input.tag,
      name: typeof input.name === "string" ? input.name.trim().slice(0, 40) : "",
      hue: ((Math.round(input.hue) % 360) + 360) % 360,
      lastMetAt: Date.now(),
    };
    void ensureKnownPeople().then(() => {
      const prev = known.find((p) => p.tag === person.tag);
      if (
        prev &&
        prev.name === person.name &&
        prev.hue === person.hue &&
        person.lastMetAt - prev.lastMetAt < 60_000
      ) {
        return; // met moments ago with the same face — nothing new
      }
      known = upsertKnownPerson(known, person);
      void setJSON(KNOWN_PEOPLE_KEY, known).catch(() => undefined);
      emit();
    });
  } catch {
    // Memory is a courtesy; the room is the job.
  }
}

/** React reader for the Friends filter. */
export function useKnownTags(): ReadonlySet<string> {
  const [tags, setTags] = useState<ReadonlySet<string>>(() => getKnownTags());
  useEffect(() => {
    void ensureKnownPeople();
    return subscribeKnownPeople(setTags);
  }, []);
  return tags;
}
