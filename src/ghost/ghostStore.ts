/**
 * Ghost public-state store.
 *
 * A tiny module-level pub/sub (same pattern as shared/utils/realtimeStatus
 * and app/utils/demoMode) so the overlay UI (ExperienceHUD) can display
 * the ghost's presence while the canvas layer (LegacyFluid) publishes it —
 * no prop drilling across the single persistent canvas, and the ghost's
 * internal machinery stays private to src/ghost.
 *
 * Controls travel the other direction as window CustomEvents, mirroring
 * how the VerbBar asks the canvas to send a verb via FABRIC_VERB_EVENT:
 * - FABRIC_GHOST_TOGGLE_EVENT (detail: boolean) — per-user on/off. Also
 *   mutes a visiting session ghost's effects locally (presence stays
 *   visible; sensations are optional).
 * - FABRIC_GHOST_SESSION_EVENT (detail: "summon" | "dismiss") — summon or
 *   dismiss THIS user's own ghost into/out of the shared session.
 *
 * Powered by Nirvana
 */

export type GhostPresence =
  | "present"
  | "sleeping"
  | "away"
  | "off"
  | "summoned";

export interface GhostPublicState {
  /** The user's manual on/off preference (persisted as fabric_ghost_v1). */
  enabled: boolean;
  /**
   * The ACTIVE layer's own ghost feature toggle ("Ghost in this
   * layer", THIS LAYER settings, stored per layer id under
   * fabric_layer_settings_v1:<layerId>). Independent of the per-user
   * preference above: the local ghost runs in a layer only when BOTH
   * are on, and when this is off the indicator pill leaves the canvas
   * cluster entirely — the feature simply isn't part of that layer.
   */
  layerEnabled: boolean;
  /**
   * What the local ghost brain is doing right now:
   * - "present": here (solo), may drift / mirror / respond
   * - "sleeping": quiet after ~60s without user interaction
   * - "away": human peers are connected, so the solo ghost stepped back
   * - "summoned": this client is hosting its ghost for the shared session
   * - "off": disabled by the user
   */
  presence: GhostPresence;
  /** "host" while THIS client runs its own summoned session ghost. */
  sessionRole: "none" | "host";
  /** This user's ghost's persistent name (identity in fabric_ghost_v1). */
  ghostName: string | null;
  /** This user's ghost's current temperament (curious/playful/...). */
  temperament: string | null;
  /** Distinct OTHER ghosts this client has sensed recently in the room. */
  otherGhostCount: number;
  /**
   * Last time a ghost interaction (peerId "ghost:…") was rendered from
   * the remote path — lets a non-host participant's HUD show a ghost is
   * visiting their session without running a brain for it.
   */
  sessionGhostLastSeenAt: number;
  /**
   * Ghost Brain honesty surface: the last deliberation outcome. Set by
   * useGhostPeer's router on EVERY deliberation (table, Spark, Spark
   * picked-but-keyless, Spark failed) so AI Services and the diag
   * panel can show which brain actually decided — never a silent fake.
   */
  brain: GhostBrainStatus | null;
}

export interface GhostBrainStatus {
  /** The brain that actually produced this outcome. */
  source: "spark" | "table";
  /**
   * Live tier label, e.g. "Spark", "On-device table", or
   * "On-device table · Spark picked, no key saved".
   */
  tierLabel: string;
  /** Outcome line, e.g. "decided: mirror · linger 6.5s". */
  lastText: string;
  /** Epoch ms of this outcome. */
  lastAt: number;
}

/** Window event HUD -> canvas: detail is the desired `enabled` boolean. */
export const FABRIC_GHOST_TOGGLE_EVENT = "fabric:ghost-toggle";

/** Window event HUD -> canvas: detail is "summon" | "dismiss". */
export const FABRIC_GHOST_SESSION_EVENT = "fabric:ghost-session";

const state: GhostPublicState = {
  enabled: true,
  layerEnabled: true,
  presence: "sleeping",
  sessionRole: "none",
  ghostName: null,
  temperament: null,
  otherGhostCount: 0,
  sessionGhostLastSeenAt: 0,
  brain: null,
};
const listeners = new Set<(s: GhostPublicState) => void>();

export function getGhostPublicState(): GhostPublicState {
  return { ...state };
}

export function setGhostPublicState(next: Partial<GhostPublicState>): void {
  let changed = false;
  (Object.keys(next) as (keyof GhostPublicState)[]).forEach((key) => {
    if (next[key] !== undefined && next[key] !== state[key]) {
      (state as Record<string, unknown>)[key] = next[key];
      changed = true;
    }
  });
  if (changed) {
    listeners.forEach((l) => l({ ...state }));
  }
}

export function subscribeGhostState(
  fn: (s: GhostPublicState) => void
): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => {
    listeners.delete(fn);
  };
}
