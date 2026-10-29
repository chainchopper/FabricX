/**
 * Ghostie card permissions — the pure core (Slice 22, "ID Cards").
 *
 * What a ghostie's PRIMARY publishes about it on its ID card
 * (fabric-id-cards-design.md). Three switches, stored locally in
 * fabric_ghost_permissions_v1 (see ghostPermissionsPref.ts) and
 * published on the room announce — a card carries only what its
 * controller chooses to publish, so every one of these defaults
 * OFF: an untouched ghostie is unshared, untradeable, and its
 * Personality stays home.
 *
 * - shareable: others may feature this ghostie — the room sees
 *   its full card (portrait, vitals, published fields). Off: the
 *   card others get is the minimal face (name + temperament).
 * - tradeable: a flag for the Juice-era marketplace. The flag is
 *   real and displayed; trading itself is NOT built — the card
 *   says "Trading opens with the marketplace", never more.
 * - personalityPublic: the primary's Personality text for this
 *   ghostie rides the announce and appears on the card. Off: the
 *   card shows "Personality: private" and the text itself never
 *   leaves the device (it previously rode only the primary's own
 *   deliberation requests; this switch is the room-facing one).
 *
 * Pure module (no imports) so the check can prove the sanitizer
 * headlessly — same discipline as ghostShared.ts, with the
 * opposite default posture: manners default permissive because
 * they only govern behavior; permissions default closed because
 * they govern publication.
 *
 * Powered by Nirvana
 */

export interface GhostPermissions {
  shareable: boolean;
  tradeable: boolean;
  personalityPublic: boolean;
}

export const DEFAULT_GHOST_PERMISSIONS: GhostPermissions = {
  shareable: false,
  tradeable: false,
  personalityPublic: false,
};

/**
 * Clamp an unknown stored value to a GhostPermissions. Only real
 * booleans are honored; anything missing or malformed falls back
 * to OFF for that key — a garbled record must never silently
 * publish someone's ghostie.
 */
export function sanitizeGhostPermissions(input: unknown): GhostPermissions {
  const out: GhostPermissions = { ...DEFAULT_GHOST_PERMISSIONS };
  if (!input || typeof input !== "object") return out;
  const rec = input as Record<string, unknown>;
  if (typeof rec.shareable === "boolean") out.shareable = rec.shareable;
  if (typeof rec.tradeable === "boolean") out.tradeable = rec.tradeable;
  if (typeof rec.personalityPublic === "boolean") {
    out.personalityPublic = rec.personalityPublic;
  }
  return out;
}
