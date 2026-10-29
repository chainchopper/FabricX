/**
 * Role resolution — Hotfix 2.6 "Who's hosting?".
 *
 * THE AUDIT (what was actually wrong, Oct 29 field report: "App
 * seems to be confused on whether it hosting or a guest"):
 *
 * Before this module, a client's role was whatever the claim
 * traffic last said: my own menu claim -> host; ANY other client's
 * announced session -> guest; otherwise "open". That produced the
 * confusion by construction:
 *
 * - No election, no succession, no solo-host. A solo user who
 *   never minted a claim through the Share UI was "open" forever —
 *   nobody's host, not even their own. A host who departed without
 *   a graceful session-clear degraded the room to "open" after a
 *   heartbeat TTL; nobody ever inherited.
 * - Any live claim in the room made you a guest — including a
 *   claim held by your OWN other tab or device (the seniority
 *   yield silently discarded your own claim), and room ids persist
 *   per layer (fabric_layer_settings_v1) while role does not, so
 *   reopening a layer dropped you back into yesterday's room as
 *   the guest of whoever (or whatever idle tab) still announced
 *   there. Nothing anywhere told the user their claim had lost,
 *   or that they were a guest at all.
 * - A claim's liveness ran on a private clock (the session
 *   heartbeat TTL), never on the presence set the rest of the app
 *   reads. Role resolution never consulted presence at all.
 * - The guest follower's host-inertness was a single downstream
 *   role check: when resolution mislabeled the rightful host as
 *   "guest" (the two defects above — the reported case), the
 *   follower treated the host's own client as a follower.
 *
 * THE RESOLUTION (deterministic; this module is the single place
 * it is computed — the transport hook feeds it live inputs, the
 * chrome only ever reads its output):
 *
 * 1. My own live claim wins: I am the host.
 * 2. A remote claim wins ONLY while its claimant is present in
 *    the live presence set. A claim from an absent peer —
 *    departed, stale, or left over from a dead session — is
 *    ignored. Role resolution never defers to a ghost.
 * 3. Otherwise, succession: the present participant with the
 *    earliest room-join time is host (stable tiebreak: the
 *    lexicographically smaller participant id). A solo participant
 *    is therefore host immediately — there is nobody to follow.
 *
 * Join times are shared data, not local impressions: every
 * participant announces its own room-join time on its identity
 * card (peer-announce `joinedAt`), so every chair computes the
 * same winner from the same set. Participants who never announce
 * (older builds) rank by first-seen time and behind every known
 * join time.
 *
 * Pure and dependency-free (the SessionRole import is type-only)
 * so scripts/role-resolution-check.mjs can drive the scenario
 * matrix headlessly — the same discipline as fabricStore.
 *
 * Powered by Nirvana
 */

import type { SessionRole } from "./sessionStore";

/** A present participant (NOT including self) and when they joined this room. */
export interface PresentParticipant {
  id: string;
  /** Room-join time (their announced joinedAt, or local first-seen). */
  joinedAt: number;
}

export type RoleSource = "claim" | "remote-claim" | "succession" | "none";

export interface SessionRoleResolution {
  role: SessionRole;
  /** The resolved host's participant id (self when hosting), or null. */
  hostId: string | null;
  source: RoleSource;
}

/**
 * Resolve this client's role from claims + presence.
 *
 * - `hasClaim`: this client holds a live host claim (menu intent).
 * - `remoteHostId`: the host named by the latest announced remote
 *   session, if any. Honored only while present (rule 2) — the
 *   caller passes the raw announced value; presence is judged here.
 * - `present`: the live presence set, self excluded.
 */
export function resolveSessionRole(args: {
  selfId: string;
  selfJoinedAt: number;
  hasClaim: boolean;
  remoteHostId: string | null;
  present: readonly PresentParticipant[];
}): SessionRoleResolution {
  const { selfId, selfJoinedAt, hasClaim, remoteHostId, present } = args;
  if (!selfId) return { role: "open", hostId: null, source: "none" };

  // Rule 1: my own claim. (A remote session naming ME is my own
  // claim coming back around — never a reason to guest myself.)
  if (hasClaim) return { role: "host", hostId: selfId, source: "claim" };

  // Rule 2: a remote claim, honored only while its claimant is
  // actually here. The presence set is the only clock that counts.
  if (
    remoteHostId &&
    remoteHostId !== selfId &&
    present.some((p) => p.id === remoteHostId)
  ) {
    return { role: "guest", hostId: remoteHostId, source: "remote-claim" };
  }

  // Rule 3: succession over the present set, self included.
  // Earliest join wins; ties break on the smaller id, so every
  // chair holding the same set names the same host.
  let winnerId = selfId;
  let winnerJoined = selfJoinedAt;
  for (const p of present) {
    if (!p.id || p.id === selfId) continue;
    if (
      p.joinedAt < winnerJoined ||
      (p.joinedAt === winnerJoined && p.id < winnerId)
    ) {
      winnerId = p.id;
      winnerJoined = p.joinedAt;
    }
  }
  return winnerId === selfId
    ? { role: "host", hostId: selfId, source: "succession" }
    : { role: "guest", hostId: winnerId, source: "succession" };
}

/**
 * The one plain notice for a host change (Hotfix 2.6, rule: on any
 * host change, everyone hears it once — the follower's toast
 * channel carries it). Returns null when there is nothing to say:
 * the first observed host is a baseline, not a change; the same
 * host continuing is not a change; and a room with no host at all
 * says nothing (post-resolution that is only the pre-join frame).
 *
 * `prevHostId === undefined` marks the baseline sighting.
 */
export function hostChangeNotice(args: {
  prevHostId: string | null | undefined;
  nextHostId: string | null;
  selfId: string;
  hostName: string;
}): string | null {
  const { prevHostId, nextHostId, selfId, hostName } = args;
  if (prevHostId === undefined) return null;
  if (!nextHostId || nextHostId === prevHostId) return null;
  if (nextHostId === selfId) return "You’re hosting now.";
  return `${hostName} is hosting now.`;
}
