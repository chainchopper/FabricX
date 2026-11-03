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
 * Slice 22 adds the ghost's card facts to the published state:
 * its own hue (for portraits) and its computed vitals.
 *
 * Powered by Nirvana
 */

import type { GhostVitals } from "./ghostVitals";

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
   * are on; when this is off the feature simply isn't part of that
   * layer. (Cleanup 2 retired the resident canvas chip — the ghost's
   * controls live in THIS LAYER and Your Ghostie now.)
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
  /**
   * This user's ghost's own signature hue (Slice 22) — distinct
   * from the human's hue: the announce carries it on the ghostie
   * line so a remote ghostie portrait wears the ghost's real color.
   */
  ghostHue: number | null;
  /** This user's ghost's current temperament (curious/playful/...). */
  temperament: string | null;
  /**
   * The local ghost's live vitals (Slice 22): Health / Stamina /
   * Vigor readings computed from the peer's real state by
   * useGhostPeer (ghostVitals.ts) — the ID card's bars and the
   * announce's sender-computed ghostCard readings read these.
   * Null until the peer exists.
   */
  vitals: GhostVitals | null;
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
  source: "spark" | "table" | "device";
  /**
   * Live tier label, e.g. "Spark", "On-device table", "On-device
   * model" (Slice 27: this device's downloaded WebLLM brain), or
   * "On-device brain" (cloud tier picked, no cloud resolved —
   * Cleanup 2: stated as the brain at work, never as a key plea).
   */
  tierLabel: string;
  /** Outcome line, e.g. "decided: mirror · linger 6.5s". */
  lastText: string;
  /** Epoch ms of this outcome. */
  lastAt: number;
}

/** Window event HUD -> canvas: detail is the desired `enabled` boolean. */
export const FABRIC_GHOST_TOGGLE_EVENT = "fabric:ghost-toggle";

/**
 * Window event settings -> canvas (Slice 50): detail is the new
 * ghostie name the primary typed IN APP SETTINGS (GhostieHome's
 * name editor — the ONLY rename door in the app; see the law at
 * sanitizeGhostName below). useGhostPeer answers: it sanitizes,
 * persists the record, republishes the public state, and renames
 * the live peer.
 */
export const FABRIC_GHOST_RENAME_EVENT = "fabric:ghost-rename";

/** The name editor's cap — generated names run ≤7 chars; 20 is generous. */
export const GHOST_NAME_MAX_CHARS = 20;

/**
 * THE NAME LAW (Slice 50, Terrell Nov 3): the ghostie's name is
 * persistent and changes ONLY in app settings. This sanitizer is
 * the gate every candidate name passes through, and the rename
 * event above is the only write path that uses it:
 *
 * - Birth is not a rename: useGhostPeer generates the name once,
 *   when the record is created (LifePacket derivation), and a
 *   stored name is thereafter used exactly as stored.
 * - Peer sync is not a rename: announces carry OTHER ghosties'
 *   names for their cards; a remote name never writes this
 *   device's record (profileStore keeps peer extras per-peer).
 * - Imports are not a rename: nothing outside useGhostPeer
 *   writes fabric_ghost_v1 at all (the settings50 check censuses
 *   the writers), and DancerStage / profileStore only READ it.
 *
 * Rules: trim, collapse runs of whitespace, 1..GHOST_NAME_MAX_CHARS
 * chars, no control characters. Anything else is null — the
 * rename is refused and the old name stands.
 */
export function sanitizeGhostName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > GHOST_NAME_MAX_CHARS) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

/** Window event HUD -> canvas: detail is "summon" | "dismiss". */
export const FABRIC_GHOST_SESSION_EVENT = "fabric:ghost-session";

/**
 * Window event chrome -> canvas (Slice 21): detail is the ghostie's
 * primary's userId — a request to pet THAT ghostie from a profile
 * card. The canvas (LegacyFluid) answers through the ordinary pet
 * path: gentle strokes at the ghost's last-sensed position, sent
 * through the send funnel like any hand stroke, so the mode gate,
 * the fabric rules, and the owner's own accept-pets setting all
 * decide what lands. No listener (the fluid isn't the live
 * canvas) or no sensed position means nothing happens — a pet is
 * a touch, and a touch needs somewhere real to land.
 */
export const FABRIC_PET_GHOST_EVENT = "fabric:pet-ghost";

/**
 * Window event chrome -> canvas (Slice 24): a guest just joined
 * THIS client's hosted session and the host has earned the Warm
 * Welcome power-up. Detail is the greeting verb id the primary
 * chose ("heart" | "cheer" | "tickle"). The canvas answers by
 * asking its ghost to greet via GhostPeer.warmWelcome — which
 * spends from the ghost's ordinary emit budget and refuses when
 * the budget (or the ghost's presence) can't pay. No listener
 * (the fluid isn't the live canvas) means no greeting: the
 * ghost isn't on that canvas to give one.
 */
export const FABRIC_WARM_WELCOME_EVENT = "fabric:warm-welcome";

/**
 * Window event chrome -> canvas (Hotfix 2.5): the compose bar
 * asked for the microphone and the browser said no. The canvas
 * answers the way it answers any moment it can't help with —
 * its ghost performs puzzlement (GhostPeer.expressPuzzlement:
 * the curious ear-tilt drift + question-ripple in its hue,
 * budget-counted like any act) when a ghost is present to hear
 * the news. No listener (the fluid isn't the live canvas) or no
 * ghost means the bar's caption carries the moment alone.
 */
export const FABRIC_VOICE_UNHEARD_EVENT = "fabric:voice-unheard";

const state: GhostPublicState = {
  enabled: true,
  layerEnabled: true,
  presence: "sleeping",
  sessionRole: "none",
  ghostName: null,
  ghostHue: null,
  temperament: null,
  vitals: null,
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
