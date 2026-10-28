/**
 * Ghost shared settings — the pure core (Slice 20, "Ghostie Home").
 *
 * How this device's ghostie is WITH OTHERS. Three switches, each
 * wired to a real gate (see ghostSharedPref.ts for storage and
 * GhostPeer / LegacyFluid for the gates themselves):
 *
 * - socialize: the ghost greets, approaches, sniffs, and plays
 *   with OTHER ghosties (the session social machine + deliberated
 *   sniff approaches). Off: it still perceives them — the brain's
 *   scenario counts them honestly — but it never goes to them.
 * - acceptRemotePets: other participants' strokes landing on the
 *   ghost count as pets. Off: they don't land at all (no lean, no
 *   burst, no PURR/HEART, no pet context for the brain). The
 *   primary's own pets ALWAYS land — this switch is about others.
 * - followHostFabric: when the host moves the room to a new
 *   fabric, the ghostie comes along (subject to that fabric's own
 *   "Ghost in this layer" setting). Off: the ghost stays behind —
 *   it is not enabled on fabrics this device was host-moved into,
 *   only on fabrics its primary opened themselves.
 *
 * Defaults are all ON: an existing install that has never seen
 * this key behaves exactly as the ghost always has.
 *
 * Pure module (no imports) so the check can prove the sanitizer
 * and the arrival resolver headlessly.
 *
 * Powered by Nirvana
 */

export interface GhostSharedSettings {
  socialize: boolean;
  acceptRemotePets: boolean;
  followHostFabric: boolean;
}

export const DEFAULT_GHOST_SHARED_SETTINGS: GhostSharedSettings = {
  socialize: true,
  acceptRemotePets: true,
  followHostFabric: true,
};

/**
 * Clamp an unknown stored value to a GhostSharedSettings. Only
 * real booleans are honored; anything missing or malformed falls
 * back to the permissive default for that key — a garbled record
 * must never silently unsocialize someone's ghost.
 */
export function sanitizeGhostSharedSettings(
  input: unknown
): GhostSharedSettings {
  const out: GhostSharedSettings = { ...DEFAULT_GHOST_SHARED_SETTINGS };
  if (!input || typeof input !== "object") return out;
  const rec = input as Record<string, unknown>;
  if (typeof rec.socialize === "boolean") out.socialize = rec.socialize;
  if (typeof rec.acceptRemotePets === "boolean") {
    out.acceptRemotePets = rec.acceptRemotePets;
  }
  if (typeof rec.followHostFabric === "boolean") {
    out.followHostFabric = rec.followHostFabric;
  }
  return out;
}

/**
 * Resolve whether the local ghost runs on the ACTIVE layer,
 * combining the three authorities that can speak to it:
 *
 * - the layer's own "Ghost in this layer" setting (storedEnabled)
 *   is sovereign: a layer that opts out of ghosts has no ghost,
 *   whatever anyone's preferences say;
 * - the primary's follow choice binds only host-led arrivals:
 *   with followHostFabric off, a layer this device was MOVED to
 *   by the host (arrivedViaHost) does not get the ghost — the
 *   primary never chose to be there. Layers the primary opened
 *   themselves are unaffected.
 */
export function resolveGhostLayerEnabled(args: {
  storedEnabled: boolean;
  followHostFabric: boolean;
  arrivedViaHost: boolean;
}): boolean {
  if (!args.storedEnabled) return false;
  if (args.arrivedViaHost && !args.followHostFabric) return false;
  return true;
}
