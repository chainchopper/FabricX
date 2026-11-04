/**
 * Lobby protocol — Slice 59 "Finding people" (the pure core).
 *
 * Terrell, on device: "How do I find other users and request to
 * join their fabrics? Filterable? Nearby? Friends? Last seen?"
 * Until this slice, joining was invite-link only: PEOPLE carried
 * the link and the in-session roster, and there was NO way to
 * discover a session you hadn't been handed a link to. This
 * module is the wire + logic core of the missing surface; the
 * transport lives in lobbyService.ts and the view in
 * app/components/fabric/FindFabrics.tsx.
 *
 * THE ROOM. Discovery rides the existing signaling worker exactly
 * as it is deployed — no worker change. Every client that lists
 * or browses joins ONE well-known room (LOBBY_ROOM_ID below) on
 * its own second socket and meshes with the room's other members
 * over the core protocol (join / presence / offer / answer / ice)
 * — the same device-proven path a session room uses. Discovery
 * frames travel the lobby's WebRTC control channels. (The Hotfix
 * 2.0 `relay` message type was the lighter candidate, but a live
 * probe of the production worker on Nov 3, 2026 showed the
 * deployed build drops relay frames — presence/peer-joined/
 * peer-left all delivered, broadcast + targeted relay delivered
 * to nobody — so the lobby is built on what the deployed worker
 * provably does.)
 *
 * THE CONSENT RULE (MicroDuck's chorale rule, Terrell's
 * direction): a session is listed ONLY when its host flips
 * "List my fabric" on. Unlisted sessions put nothing on the air
 * and are invisible — exactly as before this slice existed.
 *
 * Frames (JSON on the lobby control channel, every one carries
 * kind + v; anything malformed is dropped field-by-field by the
 * sanitizers below — the lobby is untrusted input like any other
 * wire):
 * - listing      host → everyone: the beacon. Carries the fabric,
 *                the host's public face (name / hue / secure tag),
 *                the room id + mode a granted guest will join,
 *                the participant count, and `beat` — the host
 *                room's last-activity stamp (see lobbyService for
 *                what stamps it).
 * - unlist       host → everyone: the listing is withdrawn NOW
 *                (toggle off / hosting over), not left to expire.
 * - join-request guest → host (targeted): "let me in", with the
 *                guest's public face so the host decides about a
 *                person, not an id.
 * - join-granted host → guest (targeted): the room id + mode +
 *                fabric — the guest's client feeds them to the
 *                SAME join transition an invite link performs on
 *                load. No parallel join system exists.
 * - join-denied  host → guest (targeted): a plain no. The guest
 *                sees it in product language and can move on.
 *
 * NEARBY is deliberately absent: the app has no location feature
 * (Terrell confirmed no location is collected), so a Nearby
 * filter would be a fabrication. The filters that ship are the
 * honest ones: text, Friends (secure tags this device remembers
 * from fabrics actually shared — knownPeople.ts), and Active now
 * (the beat inside ACTIVE_NOW_MS).
 *
 * Pure and import-free (types aside) so the headless check
 * exercises it directly.
 *
 * Powered by Nirvana
 */

import type { SessionMode } from "../session/sessionStore";

/** The one well-known discovery room on the existing worker. */
export const LOBBY_ROOM_ID = "fabric-lobby";

/** Host beacon cadence while listed. */
export const BEACON_MS = 12_000;
/**
 * A listing with no beacon for this long is gone (host closed,
 * crashed, or lost the network before its unlist could leave).
 * ~3 missed beacons plus slack.
 */
export const LISTING_TTL_MS = 40_000;
/** "Active now": the host room's beat is fresher than this. */
export const ACTIVE_NOW_MS = 5 * 60_000;
/** A guest's unanswered ask expires after this long. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** A host-side pending request is answerable for this long. */
export const REQUEST_HOST_TTL_MS = 45_000;

/** The public face every lobby frame speaks in (Slice 6 + 21). */
export interface LobbyIdentity {
  /** Announced display name (never empty in practice). */
  name: string;
  /** Signature hue, degrees 0–359. */
  hue: number;
  /** Secure tag (one-way fDNA fingerprint — profile.ts's tag). */
  tag: string;
}

/** One listed session, as its host's beacon states it. */
export interface LobbyListing {
  fabricId: string;
  fabricName: string;
  hostName: string;
  hostHue: number;
  hostTag: string;
  roomId: string;
  mode: SessionMode;
  /** People in the room, host included. */
  participants: number;
  /** The host room's last-activity stamp (ms epoch, host clock). */
  beat: number;
  /** The host's ghostie's name, when it has one (gallery card). */
  ghostName?: string;
  /** The host's earned badge ids (Slice 21's public face). */
  badges?: string[];
}

/* ------------------------------------------------------------------ */
/* Sanitizers — the wire is untrusted                                  */
/* ------------------------------------------------------------------ */

/** profile.ts's TAG_PATTERN — the same FBR-XXXX-XXXX shape. */
const TAG_PATTERN = /^FBR-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export function isLobbyTag(value: unknown): value is string {
  return typeof value === "string" && TAG_PATTERN.test(value);
}

const FABRIC_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROOM_ID_PATTERN = /^[A-Za-z0-9-]{2,40}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const SESSION_MODE_SET: ReadonlySet<string> = new Set([
  "collab",
  "mirror",
  "view",
  "control",
]);

function cleanName(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanHue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return ((Math.round(value) % 360) + 360) % 360;
}

/** profile.ts's badge-id discipline, restated for the beacon. */
const BADGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function sanitizeListingBadges(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim().toLowerCase();
    if (!BADGE_ID_PATTERN.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= 24) break;
  }
  return out;
}

export function sanitizeLobbyIdentity(raw: unknown): LobbyIdentity | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const name = cleanName(src.name, 40);
  const hue = cleanHue(src.hue);
  if (!name || hue === null || !isLobbyTag(src.tag)) return null;
  return { name, hue, tag: src.tag };
}

/**
 * Validate a beacon's listing. `now` is the RECEIVER's clock: the
 * beat is the host's clock, so it is only sanity-bounded (not far
 * future, not ancient) — freshness itself is judged on seenAt,
 * the receiver-side arrival stamp the book keeps.
 */
export function sanitizeListing(raw: unknown, now: number): LobbyListing | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const fabricName = cleanName(src.fabricName, 60);
  const hostName = cleanName(src.hostName, 40);
  const hostHue = cleanHue(src.hostHue);
  const participants =
    typeof src.participants === "number" && Number.isFinite(src.participants)
      ? Math.round(src.participants)
      : NaN;
  const beat = typeof src.beat === "number" && Number.isFinite(src.beat) ? src.beat : NaN;
  if (typeof src.fabricId !== "string" || !FABRIC_ID_PATTERN.test(src.fabricId)) return null;
  if (!fabricName || !hostName || hostHue === null) return null;
  if (!isLobbyTag(src.hostTag)) return null;
  if (typeof src.roomId !== "string" || !ROOM_ID_PATTERN.test(src.roomId)) return null;
  if (typeof src.mode !== "string" || !SESSION_MODE_SET.has(src.mode)) return null;
  if (!Number.isFinite(participants) || participants < 1) return null;
  if (!Number.isFinite(beat) || beat <= 0) return null;
  if (beat > now + 120_000) return null; // host clock far ahead of ours
  if (now - beat > 24 * 3_600_000) return null; // a day old is not a listing
  const out: LobbyListing = {
    fabricId: src.fabricId,
    fabricName,
    hostName,
    hostHue,
    hostTag: src.hostTag,
    roomId: src.roomId,
    mode: src.mode as SessionMode,
    participants: Math.min(256, participants),
    beat,
  };
  const ghostName = cleanName(src.ghostName, 40);
  if (ghostName) out.ghostName = ghostName;
  const badges = sanitizeListingBadges(src.badges);
  if (badges.length > 0) out.badges = badges;
  return out;
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

export type LobbyFrame =
  | { kind: "listing"; listing: LobbyListing }
  | { kind: "unlist"; tag: string }
  | { kind: "join-request"; requestId: string; from: LobbyIdentity }
  | {
      kind: "join-granted";
      requestId: string;
      roomId: string;
      mode: SessionMode;
      fabricId: string | null;
    }
  | { kind: "join-denied"; requestId: string };

/** Validate any frame arriving on a lobby channel. */
export function sanitizeFrame(raw: unknown, now: number): LobbyFrame | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  switch (src.kind) {
    case "listing": {
      const listing = sanitizeListing(src.listing, now);
      return listing ? { kind: "listing", listing } : null;
    }
    case "unlist":
      return isLobbyTag(src.tag) ? { kind: "unlist", tag: src.tag } : null;
    case "join-request": {
      const from = sanitizeLobbyIdentity(src.from);
      if (!from) return null;
      if (typeof src.requestId !== "string" || !REQUEST_ID_PATTERN.test(src.requestId)) return null;
      return { kind: "join-request", requestId: src.requestId, from };
    }
    case "join-granted": {
      if (typeof src.requestId !== "string" || !REQUEST_ID_PATTERN.test(src.requestId)) return null;
      if (typeof src.roomId !== "string" || !ROOM_ID_PATTERN.test(src.roomId)) return null;
      if (typeof src.mode !== "string" || !SESSION_MODE_SET.has(src.mode)) return null;
      const fabricId =
        typeof src.fabricId === "string" && FABRIC_ID_PATTERN.test(src.fabricId)
          ? src.fabricId
          : null;
      return {
        kind: "join-granted",
        requestId: src.requestId,
        roomId: src.roomId,
        mode: src.mode as SessionMode,
        fabricId,
      };
    }
    case "join-denied": {
      if (typeof src.requestId !== "string" || !REQUEST_ID_PATTERN.test(src.requestId)) return null;
      return { kind: "join-denied", requestId: src.requestId };
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* The listing book (receiver side)                                    */
/* ------------------------------------------------------------------ */

export interface ListingEntry {
  listing: LobbyListing;
  /** The lobby transport peer the beacon arrived from. */
  fromPeerId: string;
  /** Receiver clock: when the last beacon from this host landed. */
  seenAt: number;
}

/** Keyed by host secure tag — one listing per person, ever. */
export type ListingBook = Map<string, ListingEntry>;

export function createListingBook(): ListingBook {
  return new Map();
}

/** Returns true when the book visibly changed. */
export function upsertListing(
  book: ListingBook,
  listing: LobbyListing,
  fromPeerId: string,
  now: number
): boolean {
  const prev = book.get(listing.hostTag);
  book.set(listing.hostTag, { listing, fromPeerId, seenAt: now });
  if (!prev) return true;
  const a = prev.listing;
  return (
    prev.fromPeerId !== fromPeerId ||
    a.fabricId !== listing.fabricId ||
    a.fabricName !== listing.fabricName ||
    a.hostName !== listing.hostName ||
    a.hostHue !== listing.hostHue ||
    a.roomId !== listing.roomId ||
    a.mode !== listing.mode ||
    a.participants !== listing.participants ||
    a.beat !== listing.beat ||
    a.ghostName !== listing.ghostName ||
    (a.badges ?? []).join(",") !== (listing.badges ?? []).join(",")
  );
}

export function removeListing(book: ListingBook, tag: string): boolean {
  return book.delete(tag);
}

/** Drop listings whose host has gone quiet past the TTL. */
export function expireListings(book: ListingBook, now: number): boolean {
  let changed = false;
  book.forEach((entry, tag) => {
    if (now - entry.seenAt > LISTING_TTL_MS) {
      book.delete(tag);
      changed = true;
    }
  });
  return changed;
}

/** Freshest beacon first — the list reads as "who's around now". */
export function bookRows(book: ListingBook): ListingEntry[] {
  return [...book.values()].sort((x, y) => y.seenAt - x.seenAt);
}

/* ------------------------------------------------------------------ */
/* Last seen + filters                                                 */
/* ------------------------------------------------------------------ */

/**
 * The row's activity words, from the host's beat (its room's
 * last-activity stamp): "live now" while the room is stirring,
 * "active Nm ago" inside the active window, "quiet Nm" beyond
 * it — a listed-but-settled room says so instead of pretending.
 */
export function activityLabel(beat: number, now: number): string {
  const diff = Math.max(0, now - beat);
  if (diff <= 45_000) return "live now";
  const mins = Math.max(1, Math.round(diff / 60_000));
  if (diff <= ACTIVE_NOW_MS) return `active ${mins}m ago`;
  if (diff < 3_600_000) return `quiet ${mins}m`;
  return `quiet ${Math.round(diff / 3_600_000)}h`;
}

export function isActiveNow(beat: number, now: number): boolean {
  return now - beat <= ACTIVE_NOW_MS;
}

export interface ListingFilter {
  query: string;
  friendsOnly: boolean;
  activeOnly: boolean;
  /** Secure tags this device knows (knownPeople.ts). */
  knownTags: ReadonlySet<string>;
  /** The viewer's own tag — your own listing is never a result. */
  ownTag: string | null;
  now: number;
}

export function filterListings(
  rows: readonly ListingEntry[],
  filter: ListingFilter
): ListingEntry[] {
  const q = filter.query.trim().toLowerCase();
  return rows.filter(({ listing }) => {
    if (filter.ownTag && listing.hostTag === filter.ownTag) return false;
    if (filter.friendsOnly && !filter.knownTags.has(listing.hostTag)) return false;
    if (filter.activeOnly && !isActiveNow(listing.beat, filter.now)) return false;
    if (q) {
      const hay = `${listing.fabricName} ${listing.hostName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* The guest's outgoing ask — a small state machine                    */
/* ------------------------------------------------------------------ */

export type OutgoingState =
  | { phase: "idle" }
  | {
      phase: "pending";
      requestId: string;
      hostPeerId: string;
      hostTag: string;
      hostName: string;
      sentAt: number;
    }
  | {
      phase: "granted";
      requestId: string;
      hostTag: string;
      hostName: string;
      roomId: string;
      mode: SessionMode;
      fabricId: string | null;
    }
  | { phase: "denied"; requestId: string; hostTag: string; hostName: string; at: number }
  | { phase: "timeout"; requestId: string; hostTag: string; hostName: string; at: number };

export type OutgoingEvent =
  | {
      type: "ask";
      requestId: string;
      hostPeerId: string;
      hostTag: string;
      hostName: string;
      now: number;
    }
  | {
      type: "granted";
      requestId: string;
      roomId: string;
      mode: SessionMode;
      fabricId: string | null;
    }
  | { type: "denied"; requestId: string; now: number }
  | { type: "tick"; now: number }
  | { type: "reset" };

/**
 * Answers land only on the ask that is actually pending — a late
 * grant for an ask the guest already gave up on changes nothing
 * (the guest is never yanked into a room by a stale yes).
 */
export function reduceOutgoing(
  state: OutgoingState,
  event: OutgoingEvent,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): OutgoingState {
  switch (event.type) {
    case "ask":
      return {
        phase: "pending",
        requestId: event.requestId,
        hostPeerId: event.hostPeerId,
        hostTag: event.hostTag,
        hostName: event.hostName,
        sentAt: event.now,
      };
    case "granted":
      if (state.phase !== "pending" || state.requestId !== event.requestId) return state;
      return {
        phase: "granted",
        requestId: event.requestId,
        hostTag: state.hostTag,
        hostName: state.hostName,
        roomId: event.roomId,
        mode: event.mode,
        fabricId: event.fabricId,
      };
    case "denied":
      if (state.phase !== "pending" || state.requestId !== event.requestId) return state;
      return {
        phase: "denied",
        requestId: event.requestId,
        hostTag: state.hostTag,
        hostName: state.hostName,
        at: event.now,
      };
    case "tick":
      if (state.phase === "pending" && event.now - state.sentAt > timeoutMs) {
        return {
          phase: "timeout",
          requestId: state.requestId,
          hostTag: state.hostTag,
          hostName: state.hostName,
          at: event.now,
        };
      }
      return state;
    case "reset":
      return { phase: "idle" };
  }
}

const REQUEST_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Fresh join-request id, e.g. "ask-k7d2qx9f". */
export function mintRequestId(): string {
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += REQUEST_ALPHABET[Math.floor(Math.random() * REQUEST_ALPHABET.length)];
  }
  return `ask-${suffix}`;
}

/* ------------------------------------------------------------------ */
/* The host's pending requests                                         */
/* ------------------------------------------------------------------ */

export interface JoinRequest {
  requestId: string;
  /** The lobby transport peer to answer. */
  fromPeerId: string;
  from: LobbyIdentity;
  at: number;
}

export const MAX_PENDING_REQUESTS = 8;

/**
 * One live request per person: a re-ask from the same tag
 * refreshes the existing row (new id, new peer, new clock)
 * instead of stacking duplicates the host must answer twice.
 */
export function upsertJoinRequest(
  list: readonly JoinRequest[],
  req: JoinRequest
): JoinRequest[] {
  const rest = list.filter((r) => r.from.tag !== req.from.tag);
  return [...rest, req].slice(-MAX_PENDING_REQUESTS);
}

export function pruneJoinRequests(
  list: readonly JoinRequest[],
  now: number
): JoinRequest[] {
  return list.filter((r) => now - r.at <= REQUEST_HOST_TTL_MS);
}

/* ------------------------------------------------------------------ */
/* Gallery order                                                       */
/* ------------------------------------------------------------------ */

/**
 * The gallery's order: people you FOLLOW surface first (that is
 * what following means here — a local subscription, see
 * socialStore.ts), freshest beacon first inside each tier.
 */
export function sortGalleryRows(
  rows: readonly ListingEntry[],
  followTags: ReadonlySet<string>
): ListingEntry[] {
  return [...rows].sort((a, b) => {
    const af = followTags.has(a.listing.hostTag) ? 0 : 1;
    const bf = followTags.has(b.listing.hostTag) ? 0 : 1;
    if (af !== bf) return af - bf;
    return b.seenAt - a.seenAt;
  });
}

/* ------------------------------------------------------------------ */
/* Encounters — the ghostie's trigger discipline                       */
/* ------------------------------------------------------------------ */

/**
 * When someone you follow or friended lists a fabric while you
 * are in the app, your ghostie reacts (a greeting chirp through
 * its generative voice + a pulse through the vibration gate).
 * The MicroDuck lesson — its pet detector "cooed at every
 * incidental brush and wore thin" — is the discipline here:
 *
 * - ONCE PER ENCOUNTER: an encounter is a continuous presence.
 *   Beacons land every BEACON_MS; a tag already present never
 *   re-fires. Only a genuine absent → present transition counts,
 *   and the tag must leave (unlist / expire) before it can be
 *   encountered again.
 * - THE FIRST SYNC IS SILENT: when this client joins the lobby,
 *   everyone already listed arrives in one burst — they were
 *   there before you were. The tracker stays cold until the
 *   service warms it (ENCOUNTER_SETTLE_MS after the transport
 *   starts), seeding whoever is present without a single chirp.
 * - BURSTS COALESCE: arrivals inside ENCOUNTER_COALESCE_MS of
 *   the last reaction share it — three friends listing at once
 *   is one moment, not three alarms.
 *
 * Presence-based only: this is the network lobby's presence, NOT
 * physical proximity — the literal walk-past version needs the
 * Bluetooth/location options that are out of scope (and, for
 * location, a feature the app does not have).
 */
export const ENCOUNTER_SETTLE_MS = 4_000;
export const ENCOUNTER_COALESCE_MS = 3_000;

export interface EncounterTracker {
  warm: boolean;
  present: Set<string>;
  lastFiredAt: number;
}

export function createEncounterTracker(): EncounterTracker {
  return { warm: false, present: new Set(), lastFiredAt: 0 };
}

/** The initial sync is over: seed the room as it stands, silently. */
export function encounterWarmUp(
  tracker: EncounterTracker,
  presentTags: Iterable<string>
): void {
  tracker.present = new Set(presentTags);
  tracker.warm = true;
}

/**
 * A listing for `tag` is present at `now`. Returns true when the
 * ghostie should react: a warm tracker, a genuinely new arrival,
 * a person the user deliberately marked (follow / friend — the
 * encounter set is the DELIBERATE marks, not everyone ever met),
 * and no reaction still ringing from a burst.
 */
export function encounterSeen(
  tracker: EncounterTracker,
  tag: string,
  deliberate: boolean,
  now: number
): boolean {
  if (!tracker.warm) {
    tracker.present.add(tag);
    return false;
  }
  if (tracker.present.has(tag)) return false;
  tracker.present.add(tag);
  if (!deliberate) return false;
  if (now - tracker.lastFiredAt < ENCOUNTER_COALESCE_MS) return false;
  tracker.lastFiredAt = now;
  return true;
}

/** A listing left: the next arrival is a new encounter. */
export function encounterGone(tracker: EncounterTracker, tag: string): void {
  tracker.present.delete(tag);
}
