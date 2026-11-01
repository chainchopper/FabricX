/**
 * genxStore — The Fold's client-side home (Slice 36).
 *
 * One module store (the controllerStore / motionState pattern)
 * holding everything genx that more than one surface reads:
 *
 * - THE FIELD STATE — the pure reducer's output (fieldState.ts).
 *   Both wire arrivals (useFluidMultiUser's receive branches call
 *   ingestGenxWire) and locally originated events (the room hook
 *   calls dispatchGenxEvent) fold through the SAME path, so this
 *   client's field is built exactly the way every peer's is.
 * - THE PROBE — the bridge probe's latest verdict for the node
 *   address in THIS LAYER settings (reachable / blocked /
 *   offline), surfaced there and on the node card.
 * - LOCAL-ONLY PREFERENCES — the jobs this device FOLLOWS (its
 *   progress-alert subscriptions) and the participant it
 *   SPECTATES (its view follows that participant's entity).
 *   These bind nobody else, travel nowhere, and persist on the
 *   device like any other body preference.
 * - FOLLOW ALERTS — derived from REAL field transitions on
 *   followed jobs (progress milestones, completion, node
 *   arrival/departure), kept as a short list the layer renders.
 * - MY JUICE LEDGER — this device's lifetime Juice: settled
 *   once per completed mission from the mission's own verified
 *   contribution table (the allocator's verdicts, recomputed
 *   here from the same field state) and persisted on-device.
 *   It is a record of what rooms verified, stated as such.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";
import {
  contributionsOf,
  createFieldState,
  missionProgress,
  reduceField,
  sanitizeAssignments,
  sanitizeBountyDef,
  sanitizeMissionSpec,
  sanitizeNodeJobUpdate,
  sanitizeNodeReading,
  senseSnapshotOf,
  type GenxFieldEvent,
} from "./fieldState";
import type {
  GenxAlert,
  GenxFieldState,
  GenxProbeStatus,
  GenxSenseSnapshot,
  GenxWireMessage,
} from "./genxTypes";

export const GENX_PREFS_KEY = "fabric_genx_prefs_v1";

export interface GenxSnapshot {
  field: GenxFieldState;
  probe: GenxProbeStatus;
  followed: string[];
  spectating: string | null;
  alerts: GenxAlert[];
  /** This device's lifetime verified Juice (settled, persisted). */
  juiceLifetime: number;
  sense: GenxSenseSnapshot;
}

interface GenxPrefs {
  followed: string[];
  juiceLifetime: number;
  settledMissions: string[];
}

let selfId: string | null = null;
let prefs: GenxPrefs = { followed: [], juiceLifetime: 0, settledMissions: [] };
let prefsLoaded = false;

let snapshot: GenxSnapshot = {
  field: createFieldState(),
  probe: { state: "unknown", url: "", at: 0, detail: "" },
  followed: [],
  spectating: null,
  alerts: [],
  juiceLifetime: 0,
  sense: senseSnapshotOf(createFieldState(), 0),
};

type Listener = (s: GenxSnapshot) => void;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // A misbehaving consumer must not break the store.
    }
  });
}

export function getGenxSnapshot(): GenxSnapshot {
  return snapshot;
}

export function subscribeGenx(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The room hook names this device once (Juice settlement + alerts). */
export function setGenxSelfId(id: string | null): void {
  selfId = id;
}

export async function ensureGenxPrefsLoaded(): Promise<void> {
  if (prefsLoaded) return;
  prefsLoaded = true;
  try {
    const raw = await getJSON<unknown>(GENX_PREFS_KEY, null);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      prefs = {
        followed: Array.isArray(r.followed)
          ? r.followed.filter((x): x is string => typeof x === "string").slice(0, 64)
          : [],
        juiceLifetime:
          typeof r.juiceLifetime === "number" && Number.isFinite(r.juiceLifetime)
            ? Math.max(0, r.juiceLifetime)
            : 0,
        settledMissions: Array.isArray(r.settledMissions)
          ? r.settledMissions
              .filter((x): x is string => typeof x === "string")
              .slice(-256)
          : [],
      };
      snapshot = {
        ...snapshot,
        followed: prefs.followed,
        juiceLifetime: prefs.juiceLifetime,
      };
      emit();
    }
  } catch {
    // A device that cannot read its prefs simply starts fresh.
  }
}

function persistPrefs(): void {
  void setJSON(GENX_PREFS_KEY, prefs).catch(() => {
    // Persistence is a courtesy; the in-memory record stands.
  });
}

/* ------------------------------------------------------------------ */
/* Field folding — one path for wire and local events                  */
/* ------------------------------------------------------------------ */

const MILESTONES = [0.25, 0.5, 0.75, 1];

function pushAlert(
  list: GenxAlert[],
  jobId: string,
  text: string,
  at: number
): GenxAlert[] {
  const alert: GenxAlert = { id: `${jobId}:${at}:${text}`, jobId, text, at };
  return [alert, ...list].slice(0, 12);
}

/**
 * Watch a field transition for the things a follower (or the
 * room) should hear about — computed from the before/after
 * states, so an alert can only ever name a transition that
 * actually happened.
 */
function watchTransitions(
  prev: GenxFieldState,
  next: GenxFieldState,
  at: number
): void {
  let alerts = snapshot.alerts;
  let juiceLifetime = snapshot.juiceLifetime;
  // Mission progress milestones + completion, for followed jobs.
  const jobId = next.mission?.spec.jobId ?? null;
  if (jobId && snapshot.followed.includes(jobId)) {
    const before = prev.mission?.spec.jobId === jobId ? missionProgress(prev.mission) : 0;
    const after = missionProgress(next.mission);
    for (const m of MILESTONES) {
      if (before < m && after >= m) {
        alerts = pushAlert(
          alerts,
          jobId,
          m >= 1
            ? "The fold is complete — every shard verified."
            : `The fold passed ${Math.round(m * 100)}% verified.`,
          at
        );
      }
    }
  }
  // Mission completion on a followed job (may be short of 100%
  // verified — failed shards are stated, never rounded up).
  if (
    jobId &&
    snapshot.followed.includes(jobId) &&
    next.mission?.status === "complete" &&
    prev.mission?.status !== "complete"
  ) {
    const total = next.mission?.shards.length ?? 0;
    const verified =
      next.mission?.shards.filter((s) => s.status === "verified").length ?? 0;
    alerts = pushAlert(
      alerts,
      jobId,
      `The fold finished — ${verified} of ${total} shards verified.`,
      at
    );
  }
  // Node arrival / departure.
  const wasUp = prev.node?.reachable === true;
  const isUp = next.node?.reachable === true;
  if (wasUp !== isUp && next.node) {
    alerts = pushAlert(
      alerts,
      "node",
      isUp
        ? `GenX node ${next.node.label} is reporting into the field.`
        : `GenX node ${next.node.label} stopped answering.`,
      at
    );
  }
  // Juice settlement: a mission completing settles this device's
  // verified share — once per mission, from the mission's own
  // contribution table.
  if (
    selfId &&
    next.mission &&
    next.mission.status === "complete" &&
    prev.mission?.status !== "complete" &&
    !prefs.settledMissions.includes(next.mission.spec.missionId)
  ) {
    const bounty = next.bounties[next.mission.spec.jobId];
    const mine = contributionsOf(next.mission, bounty?.def.juicePool ?? null).find(
      (c) => c.participantId === selfId
    );
    prefs = {
      ...prefs,
      settledMissions: [...prefs.settledMissions, next.mission.spec.missionId],
      juiceLifetime: prefs.juiceLifetime + (mine?.juice ?? 0),
    };
    juiceLifetime = prefs.juiceLifetime;
    persistPrefs();
    if (mine && mine.juice > 0) {
      alerts = pushAlert(
        alerts,
        next.mission.spec.jobId,
        `You earned ${mine.juice.toFixed(1)} Juice — ${mine.verifiedShards} verified shard${mine.verifiedShards === 1 ? "" : "s"}.`,
        at
      );
    }
  }
  if (alerts !== snapshot.alerts || juiceLifetime !== snapshot.juiceLifetime) {
    snapshot = { ...snapshot, alerts, juiceLifetime };
  }
}

export function dispatchGenxEvent(ev: GenxFieldEvent): void {
  const prev = snapshot.field;
  const next = reduceField(prev, ev);
  if (next === prev) return;
  const withSense = {
    ...snapshot,
    field: next,
    sense: senseSnapshotOf(next, Date.now()),
  };
  snapshot = withSense;
  watchTransitions(prev, next, Date.now());
  emit();
}

/**
 * The wire seam: useFluidMultiUser's receive branches hand every
 * genx message here. Payloads are sanitized into field events —
 * a garbled message folds to nothing.
 */
export function ingestGenxWire(msg: GenxWireMessage): void {
  const at = Date.now();
  switch (msg.type) {
    case "genx-bounty": {
      const def = sanitizeBountyDef(msg.bounty);
      if (def) dispatchGenxEvent({ kind: "bounty", from: msg.from, def, at });
      return;
    }
    case "genx-join": {
      if (typeof msg.jobId === "string") {
        dispatchGenxEvent({
          kind: "join",
          from: msg.from,
          jobId: msg.jobId,
          cellsPerSec: msg.cellsPerSec,
          at,
        });
      }
      return;
    }
    case "genx-mission": {
      const raw = msg.mission as Record<string, unknown> | null;
      const spec = sanitizeMissionSpec(raw);
      if (!spec || !raw) return;
      dispatchGenxEvent({
        kind: "mission",
        from: msg.from,
        spec,
        assignments: sanitizeAssignments(raw.assignments),
        at,
      });
      return;
    }
    case "genx-shard":
      dispatchGenxEvent({
        kind: "shard",
        from: msg.from,
        missionId: msg.missionId,
        shardId: msg.shardId,
        to: msg.to,
        attempt: msg.attempt,
        at,
      });
      return;
    case "genx-progress":
      dispatchGenxEvent({
        kind: "progress",
        from: msg.from,
        missionId: msg.missionId,
        shardId: msg.shardId,
        progress: msg.progress,
        at,
      });
      return;
    case "genx-result":
      dispatchGenxEvent({
        kind: "result",
        from: msg.from,
        missionId: msg.missionId,
        shardId: msg.shardId,
        checksum: msg.checksum,
        liveCells: msg.liveCells,
        at,
      });
      return;
    case "genx-verdict":
      dispatchGenxEvent({
        kind: "verdict",
        from: msg.from,
        missionId: msg.missionId,
        shardId: msg.shardId,
        ok: msg.ok,
        at,
      });
      return;
    case "genx-fail":
      dispatchGenxEvent({
        kind: "fail",
        from: msg.from,
        missionId: msg.missionId,
        shardId: msg.shardId,
        at,
      });
      return;
    case "genx-node": {
      const reading = sanitizeNodeReading(msg.reading);
      if (reading) dispatchGenxEvent({ kind: "node", from: msg.from, reading, at });
      return;
    }
    case "genx-nodejob": {
      const update = sanitizeNodeJobUpdate(msg.update);
      if (update) dispatchGenxEvent({ kind: "nodejob", from: msg.from, update, at });
      return;
    }
    default:
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Probe + local preferences                                           */
/* ------------------------------------------------------------------ */

export function setGenxProbe(probe: GenxProbeStatus): void {
  snapshot = { ...snapshot, probe };
  emit();
}

export function setGenxFollowed(jobId: string, follow: boolean): void {
  const has = prefs.followed.includes(jobId);
  if (follow === has) return;
  prefs = {
    ...prefs,
    followed: follow
      ? [...prefs.followed, jobId]
      : prefs.followed.filter((j) => j !== jobId),
  };
  snapshot = { ...snapshot, followed: prefs.followed };
  persistPrefs();
  emit();
}

export function setGenxSpectating(participantId: string | null): void {
  if (snapshot.spectating === participantId) return;
  snapshot = { ...snapshot, spectating: participantId };
  emit();
}
