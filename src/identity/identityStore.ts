/**
 * Participant identity — Slice 6 "Who's Who".
 *
 * LifePacket v0 for HUMANS, mirroring the ghost pattern
 * (src/ghost/useGhostPeer + fabric_ghost_v1): every participant has a
 * persistent, device-bound identity — a friendly name, a signature
 * hue, and a seed — generated on first run and kept across sessions.
 * It is how a room knows who's who:
 *
 * - COLOR: your splats carry your hue (the fluid's dye is tinted by
 *   it, and your own pointer paints in it).
 * - SOUND: your strokes on other people's screens are pitched by
 *   your hue (300–660 Hz, the ghost SFX mapping in useGhostSfx).
 * - ROSTER: the SHARE section lists people by name with a hue dot,
 *   and Take control passes the brush by name.
 *
 * Privacy posture (LifePacket design): identity is for presence and
 * accountability, never tracking. The seed — the packet root — stays
 * on this device; only the public face (name + hue) is announced to
 * a room, and only while you are in it. The ghost keeps its own
 * separate identity (fabric_ghost_v1) for now; deriving the ghost
 * from the human packet is the designed next step, not this slice.
 *
 * Module pub/sub like src/session/sessionStore and
 * src/ghost/ghostStore — no prop drilling across the canvas:
 * - the transport hook (useFluidMultiUser) owns announcing and
 *   learning; it writes peers here and reads the local identity.
 * - the chrome (FabricMenu, ExperienceHUD, diagnostics) reads.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";
import { shortPeerId } from "../session/sessionStore";

export const IDENTITY_KEY = "fabric_identity_v1";

export interface ParticipantIdentity {
  /** Friendly display name, generated once, editable in the menu. */
  name: string;
  /** Signature hue, degrees 0–359. Tints dye; pitches sound. */
  hue: number;
  /** LifePacket root. Device-local; never announced to a room. */
  seed: number;
}

/** The public face of a room participant (what the wire carries). */
export interface PeerIdentity {
  name: string;
  hue: number;
}

const HUMAN_NAMES = [
  "Amber",
  "Ash",
  "Birch",
  "Briar",
  "Cedar",
  "Clover",
  "Copper",
  "Coral",
  "Dune",
  "Ember",
  "Fern",
  "Flint",
  "Hazel",
  "Indigo",
  "Iris",
  "Juniper",
  "Linden",
  "Maple",
  "Nova",
  "Onyx",
  "Rowan",
  "Sable",
  "Sol",
  "Wren",
];

/** Same PRNG family as the ghost brain, so identity derives from seed. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateParticipantIdentity(): ParticipantIdentity {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const rng = mulberry32(seed);
  return {
    seed,
    name: HUMAN_NAMES[Math.floor(rng() * HUMAN_NAMES.length)],
    // Drawn from the whole wheel — a signature, not a cluster.
    hue: Math.floor(rng() * 360),
  };
}

export function normalizeHue(hue: number): number {
  return ((Math.round(hue) % 360) + 360) % 360;
}

/** "hsl(187, 85%, 55%)" — the swatch color for dots and chips. */
export function hueCss(hue: number): string {
  return `hsl(${normalizeHue(hue)}, 85%, 55%)`;
}

/**
 * The dye color for a hue in the fluid engine's pointer convention:
 * fully saturated HSV scaled to the same 0.15 intensity the engine
 * gives a fresh pointer press, so identity-colored strokes sit in
 * the fluid exactly like the strokes they replace.
 */
export function hueDyeColor(
  hue: number,
  intensity = 1
): { r: number; g: number; b: number } {
  const h = normalizeHue(hue) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  let r = 0,
    g = 0,
    b = 0;
  if (h < 1) [r, g, b] = [1, x, 0];
  else if (h < 2) [r, g, b] = [x, 1, 0];
  else if (h < 3) [r, g, b] = [0, 1, x];
  else if (h < 4) [r, g, b] = [0, x, 1];
  else if (h < 5) [r, g, b] = [x, 0, 1];
  else [r, g, b] = [1, 0, x];
  const scale = 0.15 * Math.min(1, Math.max(0, intensity));
  return { r: r * scale, g: g * scale, b: b * scale };
}

function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Tint a splat color TOWARD a signature hue — rotate the color's own
 * hue part-way (shortest arc) to the sender's hue, keeping its
 * saturation/value energy untouched. A tint, never a replace: a
 * composed pattern's colors lean toward their author instead of
 * being overwritten by them.
 */
export function tintColorTowardHue(
  color: { r: number; g: number; b: number },
  hue: number,
  strength = 0.6
): { r: number; g: number; b: number } {
  const max = Math.max(color.r, color.g, color.b);
  if (max <= 0) return hueDyeColor(hue);
  const target = normalizeHue(hue);
  const own = rgbToHue(color.r, color.g, color.b);
  let delta = target - own;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const rotated = own + delta * Math.min(1, Math.max(0, strength));
  // Rebuild at the color's own intensity: direction from the rotated
  // hue (unit dye color), magnitude from the original max channel.
  const unit = hueDyeColor(rotated, 1);
  const unitMax = Math.max(unit.r, unit.g, unit.b) || 1;
  const k = max / unitMax;
  return { r: unit.r * k, g: unit.g * k, b: unit.b * k };
}

// ------------------------------------------------------------------
// Store: local identity + learned peer identities, one snapshot.
// ------------------------------------------------------------------

export interface IdentitySnapshot {
  self: ParticipantIdentity | null;
  peers: Record<string, PeerIdentity>;
}

let self: ParticipantIdentity | null = null;
/** Internal peer record — seenAt drives TTL pruning; never exposed. */
interface PeerRecord extends PeerIdentity {
  seenAt: number;
}
const peers = new Map<string, PeerRecord>();
const listeners = new Set<(s: IdentitySnapshot) => void>();
let loadPromise: Promise<ParticipantIdentity> | null = null;

export function getIdentitySnapshot(): IdentitySnapshot {
  const out: Record<string, PeerIdentity> = {};
  peers.forEach((v, k) => {
    out[k] = { name: v.name, hue: v.hue };
  });
  return { self: self ? { ...self } : null, peers: out };
}

function emit(): void {
  const snap = getIdentitySnapshot();
  listeners.forEach((l) => l(snap));
}

export function subscribeIdentity(
  fn: (s: IdentitySnapshot) => void
): () => void {
  listeners.add(fn);
  fn(getIdentitySnapshot());
  return () => {
    listeners.delete(fn);
  };
}

function persist(): void {
  if (!self) return;
  void setJSON(IDENTITY_KEY, self).catch(() => undefined);
}

/**
 * Load the persisted identity, or generate + persist one on first
 * run. Safe to call from many places: one shared load, and the
 * result is cached in the store for synchronous readers.
 */
export function ensureLocalIdentity(): Promise<ParticipantIdentity> {
  if (self) return Promise.resolve(self);
  if (!loadPromise) {
    loadPromise = (async () => {
      let stored: ParticipantIdentity | null = null;
      try {
        stored = await getJSON<ParticipantIdentity | null>(IDENTITY_KEY, null);
      } catch {
        stored = null;
      }
      const valid =
        stored &&
        typeof stored.name === "string" &&
        stored.name.length > 0 &&
        typeof stored.hue === "number" &&
        typeof stored.seed === "number";
      self = valid
        ? {
            name: stored.name.slice(0, 40),
            hue: normalizeHue(stored.hue),
            seed: stored.seed,
          }
        : generateParticipantIdentity();
      if (!valid) persist();
      emit();
      return self;
    })();
  }
  return loadPromise;
}

export function getLocalIdentity(): ParticipantIdentity | null {
  return self ? { ...self } : null;
}

/** Menu edit: rename yourself. Announces ride the store change. */
export function setLocalIdentityName(name: string): void {
  const clean = name.trim().slice(0, 40);
  if (!self || !clean || clean === self.name) return;
  self = { ...self, name: clean };
  persist();
  emit();
}

/** Menu edit: take a new signature hue (0–359). */
export function setLocalIdentityHue(hue: number): void {
  if (!self || typeof hue !== "number" || !Number.isFinite(hue)) return;
  const next = normalizeHue(hue);
  if (next === self.hue) return;
  self = { ...self, hue: next };
  persist();
  emit();
}

// ------------------------------------------------------------------
// Peers: learned from peer-announce and from interaction hue stamps.
// ------------------------------------------------------------------

const MAX_PEER_NAME = 40;

export function setPeerIdentity(
  userId: string,
  identity: PeerIdentity
): void {
  if (!userId || typeof identity.hue !== "number") return;
  const name =
    typeof identity.name === "string"
      ? identity.name.trim().slice(0, MAX_PEER_NAME)
      : "";
  const hue = normalizeHue(identity.hue);
  const prev = peers.get(userId);
  const nextName = name || prev?.name || "";
  if (prev && prev.name === nextName && prev.hue === hue) {
    prev.seenAt = Date.now();
    return;
  }
  peers.set(userId, { name: nextName, hue, seenAt: Date.now() });
  emit();
}

/** Hue-only learning (from an interaction stamp, before any announce). */
export function notePeerHue(userId: string, hue: number): void {
  if (!userId || typeof hue !== "number" || !Number.isFinite(hue)) return;
  const next = normalizeHue(hue);
  const prev = peers.get(userId);
  if (prev && prev.hue === next) {
    prev.seenAt = Date.now();
    return;
  }
  peers.set(userId, { name: prev?.name ?? "", hue: next, seenAt: Date.now() });
  emit();
}

export function getPeerIdentity(userId: string): PeerIdentity | null {
  const p = peers.get(userId);
  return p ? { name: p.name, hue: p.hue } : null;
}

/**
 * Drop identities for peers no longer present. An entry is removed
 * only when it is BOTH absent from the present set AND not heard
 * from within PEER_IDENTITY_TTL_MS — the grace window rides out the
 * presence map's rebuild when the transport flips from
 * BroadcastChannel to WebRTC (identities re-confirm on the next
 * announce / interaction stamp, well inside the window).
 */
export const PEER_IDENTITY_TTL_MS = 12_000;

export function prunePeerIdentities(presentIds: readonly string[]): void {
  const present = new Set(presentIds);
  const now = Date.now();
  let changed = false;
  peers.forEach((rec, id) => {
    if (!present.has(id) && now - rec.seenAt > PEER_IDENTITY_TTL_MS) {
      peers.delete(id);
      changed = true;
    }
  });
  if (changed) emit();
}

/**
 * How a participant is named anywhere in the chrome: their announced
 * name when known, their short id fragment until then. Self resolves
 * to the local identity ("you" is the caller's word, not ours).
 */
export function displayNameFor(
  userId: string | null | undefined,
  selfId?: string | null
): string {
  if (!userId) return "—";
  if (selfId && userId === selfId) {
    return self ? `${self.name} (you)` : "you";
  }
  const peer = peers.get(userId);
  if (peer && peer.name) return peer.name;
  return shortPeerId(userId);
}
