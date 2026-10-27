/**
 * First Breath — Slice 10 onboarding: the gate, the flag, and the
 * palette derivation.
 *
 * Terrell's onboarding direction (LifePacket design): NOT a form
 * wizard — a streamlined ghost space tied to world palettes. A new
 * user's first moments are alone on a quiet fabric with their
 * ghost; they pick a signature color from living palette cards the
 * LifePacket itself deals; then the world opens. This module is
 * the state behind that moment (the card itself is
 * app/components/fabric/FirstBreath.tsx):
 *
 * - THE GATE (resolveFirstBreathGate, run once from the card's
 *   mount): the full flow opens only when BOTH the onboarded flag
 *   is unset AND this device's identity was minted by the load that
 *   just ran (identityStore.getIdentityOrigin() === "generated").
 *   An existing install — identity loaded from storage — gets the
 *   flag stamped silently and NEVER sees onboarding: zero
 *   disruption to devices already in the field. A device that
 *   finished (or was stamped) never re-enters the gate.
 * - THE FLAG: fabric_onboarded_v1, set on "Enter Fabric" (full
 *   flow) or silently for existing installs (above). The palette
 *   REPLAY from the menu (requestFirstBreath("palette")) ignores
 *   the flag entirely — it is a door the user opens on purpose.
 * - THE PALETTES: pure functions of the LifePacket seed — three
 *   cards per round, each a signature hue plus two harmony swatches
 *   (analogous / triadic / complement flavors in rotation), drawn
 *   from the codebase's mulberry32 family salted "brea" so the
 *   stream is the packet's own. Same seed + same round deals the
 *   same cards on any device, forever; Shuffle just advances the
 *   round. Choosing a card writes through the identity store's
 *   existing setLocalIdentityHue — no new identity mechanics, and
 *   the seed never leaves the device (it never even leaves this
 *   module's caller on the same device).
 *
 * Module pub/sub like the ghost/session stores — the chrome (the
 * FirstBreath card at the root, the menu's replay row) reads and
 * requests through here, never through prop drilling.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";
import {
  ensureLocalIdentity,
  getIdentityOrigin,
  normalizeHue,
} from "../identity/identityStore";

export const ONBOARDED_KEY = "fabric_onboarded_v1";

/** "full" = the first-run flow; "palette" = the menu replay (palette step only). */
export type FirstBreathMode = "full" | "palette";

export interface FirstBreathState {
  openMode: FirstBreathMode | null;
  /** Bumped on every request so a repeat tap re-opens a closed card. */
  requestNonce: number;
}

let state: FirstBreathState = { openMode: null, requestNonce: 0 };
const listeners = new Set<(s: FirstBreathState) => void>();

function emit(): void {
  const snap = { ...state };
  listeners.forEach((l) => l(snap));
}

export function getFirstBreathState(): FirstBreathState {
  return { ...state };
}

export function subscribeFirstBreath(
  fn: (s: FirstBreathState) => void
): () => void {
  listeners.add(fn);
  fn(getFirstBreathState());
  return () => {
    listeners.delete(fn);
  };
}

/** Open the card — the gate calls this with "full"; the menu with "palette". */
export function requestFirstBreath(mode: FirstBreathMode): void {
  state = { openMode: mode, requestNonce: state.requestNonce + 1 };
  emit();
}

export function closeFirstBreath(): void {
  if (!state.openMode) return;
  state = { ...state, openMode: null };
  emit();
}

export async function isOnboarded(): Promise<boolean> {
  try {
    return (await getJSON<boolean | null>(ONBOARDED_KEY, null)) === true;
  } catch {
    // A storage hiccup must not trap a returning user in onboarding:
    // unreadable reads as onboarded, and the gate below also keys on
    // identity origin, which fails safe the same way.
    return true;
  }
}

export async function markOnboarded(): Promise<void> {
  try {
    await setJSON(ONBOARDED_KEY, true);
  } catch {
    // Best-effort: if the stamp fails, the origin check still keeps
    // every later launch out (a stored identity never re-opens).
  }
}

let gateStarted = false;

/**
 * The first-run gate — call once, from the FirstBreath card's mount
 * at the app root. Resolves silently for everyone except a genuine
 * first run:
 *
 *   flag set            -> nothing (finished, or stamped).
 *   identity "stored"   -> existing install: stamp the flag, nothing
 *                          shows. Terrell's own phones take this path.
 *   identity "generated"-> fresh packet, fresh device: open "full".
 */
export function resolveFirstBreathGate(): void {
  if (gateStarted) return;
  gateStarted = true;
  void (async () => {
    if (await isOnboarded()) return;
    await ensureLocalIdentity();
    if (getIdentityOrigin() !== "generated") {
      await markOnboarded();
      return;
    }
    requestFirstBreath("full");
  })();
}

// ------------------------------------------------------------------
// Palette cards — the packet deals your colors.
// ------------------------------------------------------------------

/** Same PRNG family as the identity/ghost stores, so palettes derive from the seed. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PaletteCard {
  /** The signature hue this card would give you (degrees 0–359). */
  hue: number;
  /** [signature, harmony, harmony] — rendered as overlapping fluid blobs. */
  swatches: [number, number, number];
  /** The harmony flavor: "Analogous" | "Triadic" | "Complement". */
  harmony: string;
}

/** "brea" — the domain salt separating the palette stream from the packet's own. */
const PALETTE_SALT = 0x62726561;

const HARMONIES: { label: string; offsets: [number, number] }[] = [
  { label: "Analogous", offsets: [28, -28] },
  { label: "Triadic", offsets: [120, 240] },
  { label: "Complement", offsets: [180, 24] },
];

/**
 * Deal one round of three palette cards from a LifePacket seed.
 * Pure and deterministic: (seed, round) always deals the same
 * cards; Shuffle is round + 1. Each card's flavor rotates so a
 * round always offers one of each harmony.
 */
export function derivePaletteCards(seed: number, round: number): PaletteCard[] {
  const stream = mulberry32(
    (seed ^ PALETTE_SALT) + Math.imul(round | 0, 0x9e3779b9)
  );
  const cards: PaletteCard[] = [];
  for (let i = 0; i < 3; i++) {
    const hue = Math.floor(stream() * 360);
    const flavor = HARMONIES[i % HARMONIES.length];
    cards.push({
      hue,
      harmony: flavor.label,
      swatches: [
        hue,
        normalizeHue(hue + flavor.offsets[0]),
        normalizeHue(hue + flavor.offsets[1]),
      ],
    });
  }
  return cards;
}
