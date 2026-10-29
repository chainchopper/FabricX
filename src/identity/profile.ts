/**
 * Profile cards — the pure core (Slice 21).
 *
 * Terrell's question — "where are the user profile cards? What do
 * I look like to another user?" — gets its answer here. Until now
 * a participant's whole public face was a name in a roster, a hue,
 * and a ghostie name tag. This module defines the CARD behind the
 * name and the wire that carries it:
 *
 * - peer-announce (Slice 6) gains OPTIONAL extras: the sender's
 *   secure tag, a ghostie summary, earned badge ids, and an
 *   equipped trail id. Every field is optional and additive — old
 *   clients ignore them, and a card built from a legacy announce
 *   (name + hue only) renders exactly the face it always had.
 * - The TAG is Slice 20's secure tag (src/identity/fdna): a
 *   one-way fingerprint of the GHOST's seed. Sharing it is safe
 *   by construction — it names the ghostie and cannot be turned
 *   back into a seed — and the seed itself is never computed for
 *   export and never put on the wire. resolveFdnaTag below is the
 *   exact expression GhostieHome renders, so the tag on a card
 *   and the tag in the Home are the same tag by construction.
 * - Badge ids are DATA, not an economy: BADGE_REGISTRY knows the
 *   labels and glyphs from the rewards design (fabric-rewards-
 *   design.md) so a badge earned by a later slice renders here
 *   with no protocol change. An id the registry doesn't know
 *   renders as a plain dot with the id beside it — never a crash,
 *   never a fake label. The rewards store itself is a later
 *   slice; senders report what exists (usually nothing yet).
 *
 * Pure and dependency-light (fdna only) so the node check
 * exercises it directly.
 *
 * Powered by Nirvana
 */

import { deriveFdnaTag } from "./fdna";

/* ------------------------------------------------------------------ */
/* The secure tag                                                      */
/* ------------------------------------------------------------------ */

/**
 * THE tag expression — the same one GhostieHome renders: the
 * ghost's seed when the ghost record exists, the identity seed
 * as the pre-first-run fallback. One derivation site (fdna)
 * plus this one fallback order, shared by the Home, the
 * announce, and every card.
 */
export function resolveFdnaTag(
  ghostSeed: number | null | undefined,
  identitySeed: number
): string {
  return deriveFdnaTag(ghostSeed ?? identitySeed);
}

/** FBR-XXXX-XXXX over fdna's unambiguous alphabet (no 0/O, 1/I/L). */
const TAG_PATTERN = /^FBR-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export function isFdnaTag(value: unknown): value is string {
  return typeof value === "string" && TAG_PATTERN.test(value);
}

/* ------------------------------------------------------------------ */
/* Announce extras: build (sender side) + sanitize (receiver side)     */
/* ------------------------------------------------------------------ */

/** The optional public extras a peer-announce may carry (Slice 21). */
export interface PeerProfileExtras {
  /** Secure tag (one-way fDNA fingerprint of the sender's ghost seed). */
  tag?: string;
  /** The sender's ghostie, as its primary lets the room know it. */
  ghost?: { name: string; temperament?: string };
  /** Earned badge ids (public by design; the store stays home). */
  badges?: string[];
  /** Equipped ghostie trail style id (rewards design), if any. */
  trail?: string;
}

/** Temperaments a ghost can actually have (GhostPeer's set). */
const GHOST_TEMPERAMENTS: ReadonlySet<string> = new Set([
  "curious",
  "playful",
  "sleepy",
  "sassy",
  "affectionate",
]);

const BADGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const MAX_ANNOUNCE_BADGES = 24;

export function sanitizeBadgeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim().toLowerCase();
    if (!BADGE_ID_PATTERN.test(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_ANNOUNCE_BADGES) break;
  }
  return out;
}

/**
 * Validate extras arriving on the wire. A peer-announce is
 * untrusted input like any other payload: every field is
 * type-checked, length-capped, and pattern-matched, and anything
 * malformed is dropped field-by-field (a bad tag never costs the
 * ghost line, and vice versa). Returns {} when nothing usable
 * arrived — callers treat that as "no extras learned".
 */
export function sanitizePeerExtras(raw: unknown): PeerProfileExtras {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: PeerProfileExtras = {};
  if (isFdnaTag(src.tag)) out.tag = src.tag;
  const ghost = src.ghost;
  if (ghost && typeof ghost === "object") {
    const g = ghost as Record<string, unknown>;
    const name = typeof g.name === "string" ? g.name.trim().slice(0, 40) : "";
    if (name) {
      out.ghost = { name };
      if (
        typeof g.temperament === "string" &&
        GHOST_TEMPERAMENTS.has(g.temperament)
      ) {
        out.ghost.temperament = g.temperament;
      }
    }
  }
  const badges = sanitizeBadgeIds(src.badges);
  if (badges.length > 0) out.badges = badges;
  if (typeof src.trail === "string" && BADGE_ID_PATTERN.test(src.trail)) {
    out.trail = src.trail;
  }
  return out;
}

export function hasPeerExtras(extras: PeerProfileExtras): boolean {
  return Boolean(
    extras.tag || extras.ghost || extras.badges?.length || extras.trail
  );
}

/** Raw local inputs the extras are built from (sender side). */
export interface AnnounceExtrasInputs {
  /** This device's ghost seed (fabric_ghost_v1), or null pre-birth. */
  ghostSeed: number | null;
  /** This device's LifePacket seed. Never sent — feeds the tag only. */
  identitySeed: number;
  ghostName: string | null;
  temperament: string | null;
  badges: readonly string[];
  trail: string | null;
}

/**
 * Build the extras this device announces. ONE builder, used by
 * the transport when it sends and by the menu when it renders
 * the user's own card — so "what the room sees" is the payload
 * itself, field for field, not a second rendering of it.
 */
export function buildAnnounceExtras(
  input: AnnounceExtrasInputs
): PeerProfileExtras {
  const extras: PeerProfileExtras = {
    tag: resolveFdnaTag(input.ghostSeed, input.identitySeed),
  };
  const name =
    typeof input.ghostName === "string" ? input.ghostName.trim() : "";
  if (name) {
    extras.ghost = { name: name.slice(0, 40) };
    if (input.temperament && GHOST_TEMPERAMENTS.has(input.temperament)) {
      extras.ghost.temperament = input.temperament;
    }
  }
  const badges = sanitizeBadgeIds([...input.badges]);
  if (badges.length > 0) extras.badges = badges;
  if (input.trail && BADGE_ID_PATTERN.test(input.trail)) {
    extras.trail = input.trail;
  }
  return extras;
}

/* ------------------------------------------------------------------ */
/* Badges: the display registry (the economy is a later slice)         */
/* ------------------------------------------------------------------ */

/** Glyph primitives the card draws with plain Views — no emoji. */
export type BadgeGlyph = "ring" | "dot" | "ringDot" | "diamond" | "bars";

export interface BadgeInfo {
  label: string;
  /** The one-line story of how it is earned (rewards design v0). */
  story: string;
  glyph: BadgeGlyph;
  /** The badge's own display hue (degrees). */
  hue: number;
}

/**
 * The rewards design's badge set as display data. Earning,
 * counters, and unlocks belong to the rewards slice; this
 * registry exists so ids on the wire render meaningfully the
 * day they start arriving.
 */
export const BADGE_REGISTRY: Record<string, BadgeInfo> = {
  "first-thread": {
    label: "First Thread",
    story: "Shared a fabric with someone for the first time",
    glyph: "ringDot",
    hue: 190,
  },
  heartfelt: {
    label: "Heartfelt",
    story: "Sent 25 hearts to other people",
    glyph: "ring",
    hue: 340,
  },
  "good-host": {
    label: "Good Host",
    story: "Hosted a room of three or more",
    glyph: "bars",
    hue: 35,
  },
  composer: {
    label: "Composer",
    story: "Saved a first composition in Studio",
    glyph: "diamond",
    hue: 265,
  },
  "pattern-mind": {
    label: "Pattern Mind",
    story: "The agent answered five asks",
    glyph: "ringDot",
    hue: 210,
  },
  "pet-whisperer": {
    label: "Pet Whisperer",
    story: "Petted three different ghosties",
    glyph: "dot",
    hue: 20,
  },
  "stage-presence": {
    label: "Stage Presence",
    story: "Danced on the Stage with a crowd",
    glyph: "bars",
    hue: 290,
  },
  "night-owl": {
    label: "Night Owl",
    story: "On a fabric past midnight, three nights running",
    glyph: "ring",
    hue: 230,
  },
  "first-light": {
    label: "First Light",
    story: "A real lint object joined the fabric",
    glyph: "dot",
    hue: 50,
  },
};

export function badgeInfo(id: string): BadgeInfo | null {
  return BADGE_REGISTRY[id] ?? null;
}

/** Trail style labels from the rewards design (equipped flair). */
export const TRAIL_LABELS: Record<string, string> = {
  ribbon: "Ribbon trail",
  sparkle: "Sparkle trail",
  petals: "Petal trail",
  comet: "Comet trail",
};

export function trailLabel(id: string): string {
  return TRAIL_LABELS[id] ?? id;
}

/* ------------------------------------------------------------------ */
/* The card's data                                                     */
/* ------------------------------------------------------------------ */

/**
 * Everything a profile card renders, and nothing it doesn't.
 * Built by buildProfileCardData from an announce-shaped object
 * plus the viewer's local session context (the fabric line and
 * the role line are the VIEWER's knowledge, never wire claims).
 */
export interface ProfileCardData {
  peerId: string;
  isSelf: boolean;
  /** Announced display name; "" when it hasn't landed yet. */
  name: string;
  /** Announced signature hue; null when it hasn't landed yet. */
  hue: number | null;
  tag: string | null;
  ghost: { name: string; temperament: string | null } | null;
  /** Where this person is, as the viewer's session state knows it. */
  fabricLine: string;
  /** Host / driving / guest / here — viewer-side session knowledge. */
  roleLine: string | null;
  badges: string[];
  trail: string | null;
}

export function buildProfileCardData(args: {
  peerId: string;
  isSelf: boolean;
  /** Announced name + hue (or the announce object itself). */
  name: string;
  hue: number | null;
  /** Anything announce-shaped; sanitized here, never trusted raw. */
  extras: unknown;
  fabricLine: string;
  roleLine: string | null;
}): ProfileCardData {
  const extras = sanitizePeerExtras(args.extras);
  return {
    peerId: args.peerId,
    isSelf: args.isSelf,
    name: typeof args.name === "string" ? args.name.slice(0, 40) : "",
    hue:
      typeof args.hue === "number" && Number.isFinite(args.hue)
        ? ((Math.round(args.hue) % 360) + 360) % 360
        : null,
    tag: extras.tag ?? null,
    ghost: extras.ghost
      ? {
          name: extras.ghost.name,
          temperament: extras.ghost.temperament ?? null,
        }
      : null,
    fabricLine: args.fabricLine,
    roleLine: args.roleLine,
    badges: extras.badges ?? [],
    trail: extras.trail ?? null,
  };
}
