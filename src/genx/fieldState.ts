/**
 * fieldState — The Fold's one shared truth (Slice 36).
 *
 * Every client in the room folds the same stream of genx events
 * into ONE field state through this pure reducer, so every screen
 * renders the same field — the same shards, the same verified
 * ledger, the same Juice — regardless of message order. Shard
 * merges key on shardId; "verified" is terminal; progress only
 * ever moves forward.
 *
 * Every inbound payload is hostile until sanitized here (the
 * sanitizeFabricRules discipline): strings are capped, numbers
 * are finite-clamped, unknown shapes are dropped whole. On top of
 * sanitization the reducer enforces ORIGIN LAW:
 * - a mission exists only on its allocator's word (from ===
 *   spec.allocatorId);
 * - shard assignments and verdicts bind only from that allocator;
 * - progress and results bind only from the shard's assignee.
 * A forged or confused message is therefore inert, not dangerous.
 *
 * Pure module: no imports beyond genxTypes, no storage, no timers.
 *
 * Powered by Nirvana
 */

import type {
  GenxBountyDef,
  GenxBountyState,
  GenxContribution,
  GenxFieldState,
  GenxMissionSpec,
  GenxMissionState,
  GenxNodeJobState,
  GenxNodeReading,
  GenxSenseSnapshot,
  GenxShardAssignment,
  GenxShardState,
  GenxStructureSpec,
} from "./genxTypes";

/** A shard with no word for this long counts as stalled. */
export const GENX_STALL_MS = 6000;
/** Attempts a shard gets before it is failed for good (the allocator's law). */
export const GENX_MAX_ATTEMPTS = 3;

const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, v))
    : dflt;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number =>
  Math.floor(clampNum(v, lo, hi, dflt));

const capStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0
    ? v.trim().slice(0, max)
    : null;

const isId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9:_-]{1,64}$/.test(v);

export function createFieldState(): GenxFieldState {
  return { bounties: {}, mission: null, node: null, verifiedWork: {} };
}

/* ------------------------------------------------------------------ */
/* Sanitizers                                                          */
/* ------------------------------------------------------------------ */

export function sanitizeBountyDef(raw: unknown): GenxBountyDef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.id) || !isId(r.postedBy)) return null;
  const title = capStr(r.title, 80);
  const summary = capStr(r.summary, 160);
  if (!title || !summary) return null;
  const kind = r.kind === "node-job" ? "node-job" : r.kind === "room-fold" ? "room-fold" : null;
  if (!kind) return null;
  const form = r.form === "sheet" || r.form === "complex" ? r.form : "helix";
  let params: Record<string, string> | null = null;
  if (r.params && typeof r.params === "object" && !Array.isArray(r.params)) {
    params = {};
    for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) {
      if (typeof v === "string" && k.length <= 32) {
        params[k.slice(0, 32)] = v.slice(0, 512);
      }
    }
    if (Object.keys(params).length === 0) params = null;
  }
  return {
    id: r.id,
    kind,
    title,
    summary,
    postedBy: r.postedBy,
    form,
    framework: kind === "node-job" ? capStr(r.framework, 48) : null,
    params: kind === "node-job" ? params : null,
    // The structure binding survives the wire (Slice 41): an
    // id-shaped string only — whether it RESOLVES is the
    // registry's question, answered at use sites.
    structureId: isId(r.structureId) ? r.structureId : null,
    totalWorkUnits:
      typeof r.totalWorkUnits === "number" && Number.isFinite(r.totalWorkUnits) && r.totalWorkUnits > 0
        ? Math.floor(r.totalWorkUnits)
        : null,
    juicePool:
      typeof r.juicePool === "number" && Number.isFinite(r.juicePool) && r.juicePool > 0
        ? r.juicePool
        : null,
    createdAt: clampNum(r.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

/**
 * The structure block of a mission spec, sanitized (Slice 41):
 * a registry-shaped structure id, a bounded iteration count,
 * and 1–64 residue ranges whose spans are sane (0-based,
 * end > start, inside a generous per-chain bound, total
 * coverage bounded). Anything malformed drops the WHOLE
 * block's spec — a structure mission with a bent domain list
 * must not degrade into something else.
 */
export function sanitizeStructureSpec(raw: unknown): GenxStructureSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.structureId)) return null;
  // relaxSteps is the work spec itself: a raw value that is
  // not a finite number ≥ 1 is malformed, not clamped up — a
  // zero-work mission must never be posted by rounding.
  if (
    typeof r.relaxSteps !== "number" ||
    !Number.isFinite(r.relaxSteps) ||
    r.relaxSteps < 1
  ) {
    return null;
  }
  const relaxSteps = clampInt(r.relaxSteps, 1, 200_000, 0);
  if (!Array.isArray(r.ranges) || r.ranges.length === 0 || r.ranges.length > 64) {
    return null;
  }
  const ranges: GenxStructureSpec["ranges"] = [];
  let total = 0;
  for (const entry of r.ranges) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    const chainId =
      typeof e.chainId === "string" && /^[A-Za-z0-9_-]{1,8}$/.test(e.chainId)
        ? e.chainId
        : null;
    if (!chainId) return null;
    const start = clampInt(e.start, 0, 16384, -1);
    const end = clampInt(e.end, 0, 16384, -1);
    if (start < 0 || end <= start) return null;
    total += end - start;
    if (total > 16384) return null;
    ranges.push({ chainId, start, end });
  }
  return { structureId: r.structureId, relaxSteps, ranges };
}

export function sanitizeMissionSpec(raw: unknown): GenxMissionSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.missionId) || !isId(r.jobId) || !isId(r.allocatorId)) return null;
  // A structure block, when present, must sanitize whole — and
  // a structure mission's tile geometry is the 0 sentinel, so
  // the tile requirements below apply only to tile missions.
  let structure: GenxStructureSpec | null = null;
  if (r.structure !== undefined && r.structure !== null) {
    structure = sanitizeStructureSpec(r.structure);
    if (!structure) return null;
  }
  const fieldW = clampInt(r.fieldW, structure ? 0 : 8, 512, 0);
  const fieldH = clampInt(r.fieldH, structure ? 0 : 8, 512, 0);
  const tileW = clampInt(r.tileW, structure ? 0 : 4, 128, 0);
  const tileH = clampInt(r.tileH, structure ? 0 : 4, 128, 0);
  const generations = clampInt(r.generations, structure ? 0 : 1, 1_000_000, 0);
  if (!structure) {
    if (!fieldW || !fieldH || !tileW || !tileH || !generations) return null;
    if (tileW > fieldW || tileH > fieldH) return null;
  }
  return {
    missionId: r.missionId,
    jobId: r.jobId,
    allocatorId: r.allocatorId,
    seed: clampInt(r.seed, 0, 0xffffffff, 0),
    fieldW,
    fieldH,
    tileW,
    tileH,
    generations,
    structure,
    form: r.form === "sheet" || r.form === "complex" ? r.form : "helix",
    startedAt: clampNum(r.startedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

export function sanitizeAssignments(raw: unknown): GenxShardAssignment[] {
  if (!Array.isArray(raw)) return [];
  const out: GenxShardAssignment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    if (!isId(r.to)) continue;
    out.push({
      shardId: clampInt(r.shardId, 0, 4096, -1),
      to: r.to,
      attempt: clampInt(r.attempt, 1, GENX_MAX_ATTEMPTS, 1),
    });
    if (out.length >= 4096) break;
  }
  return out.filter((a) => a.shardId >= 0);
}

export function sanitizeNodeReading(raw: unknown): GenxNodeReading | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const label = capStr(r.label, 64);
  if (!label) return null;
  const slots: GenxNodeReading["fahSlots"] = [];
  if (Array.isArray(r.fahSlots)) {
    for (const s of r.fahSlots.slice(0, 8)) {
      if (!s || typeof s !== "object" || Array.isArray(s)) continue;
      const sr = s as Record<string, unknown>;
      slots.push({
        id: clampInt(sr.id, 0, 64, 0),
        type: capStr(sr.type, 16) ?? "—",
        status: capStr(sr.status, 24) ?? "—",
      });
    }
  }
  const providers: string[] = [];
  if (Array.isArray(r.providersInstalled)) {
    for (const p of r.providersInstalled.slice(0, 8)) {
      const name = capStr(p, 32);
      if (name) providers.push(name);
    }
  }
  return {
    label,
    at: clampNum(r.at, 0, Number.MAX_SAFE_INTEGER, 0),
    reachable: r.reachable === true,
    fahStatus:
      r.fahStatus === "ONLINE" || r.fahStatus === "OFFLINE" ? r.fahStatus : "UNKNOWN",
    fahPointsPerDay: clampNum(r.fahPointsPerDay, 0, 1e12, 0),
    fahSlots: slots,
    nodes: clampInt(r.nodes, 0, 100000, 0),
    queuedTasks: clampInt(r.queuedTasks, 0, 100000, 0),
    activeTasks: clampInt(r.activeTasks, 0, 100000, 0),
    providersInstalled: providers,
    cpuLoadReported:
      typeof r.cpuLoadReported === "number" && Number.isFinite(r.cpuLoadReported)
        ? Math.min(100, Math.max(0, r.cpuLoadReported))
        : null,
  };
}

export function sanitizeNodeJobUpdate(raw: unknown): GenxNodeJobState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.jobId) || !isId(r.bridgeId)) return null;
  const provider = capStr(r.provider, 48);
  if (!provider) return null;
  return {
    jobId: r.jobId,
    bridgeId: r.bridgeId,
    provider,
    nodeJobId: capStr(r.nodeJobId, 96),
    nodeStatus: capStr(r.nodeStatus, 48) ?? "submitted",
    nodeProgress:
      typeof r.nodeProgress === "number" && Number.isFinite(r.nodeProgress)
        ? Math.min(1, Math.max(0, r.nodeProgress))
        : null,
    hasResults: r.hasResults === true,
    updatedAt: clampNum(r.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Events + reducer                                                    */
/* ------------------------------------------------------------------ */

export type GenxFieldEvent =
  | { kind: "bounty"; from: string; def: GenxBountyDef; at: number }
  | { kind: "join"; from: string; jobId: string; cellsPerSec: number; at: number }
  | {
      kind: "mission";
      from: string;
      spec: GenxMissionSpec;
      assignments: GenxShardAssignment[];
      at: number;
    }
  | {
      kind: "shard";
      from: string;
      missionId: string;
      shardId: number;
      to: string;
      attempt: number;
      at: number;
    }
  | { kind: "progress"; from: string; missionId: string; shardId: number; progress: number; at: number }
  | {
      kind: "result";
      from: string;
      missionId: string;
      shardId: number;
      checksum: string;
      liveCells: number;
      at: number;
    }
  | { kind: "verdict"; from: string; missionId: string; shardId: number; ok: boolean; at: number }
  | { kind: "fail"; from: string; missionId: string; shardId: number; at: number }
  | { kind: "node"; from: string; reading: GenxNodeReading; at: number }
  | { kind: "nodejob"; from: string; update: GenxNodeJobState; at: number };

function shardIndex(mission: GenxMissionState, shardId: number): number {
  return mission.shards.findIndex((s) => s.shardId === shardId);
}

function withShard(
  mission: GenxMissionState,
  idx: number,
  next: GenxShardState
): GenxMissionState {
  const shards = mission.shards.slice();
  shards[idx] = next;
  return { ...mission, shards };
}

/** Settle a mission whose shards all reached a terminal state. */
function settleMission(
  state: GenxFieldState,
  mission: GenxMissionState,
  at: number
): GenxFieldState {
  const terminal = mission.shards.every(
    (s) => s.status === "verified" || s.status === "failed"
  );
  if (!terminal || mission.status === "complete") return { ...state, mission };
  const verifiedWork = { ...state.verifiedWork };
  for (const s of mission.shards) {
    if (s.status === "verified" && s.claimedBy) {
      verifiedWork[s.claimedBy] = (verifiedWork[s.claimedBy] ?? 0) + s.workUnits;
    }
  }
  const done: GenxMissionState = { ...mission, status: "complete", completedAt: at };
  const bounties = { ...state.bounties };
  const b = bounties[mission.spec.jobId];
  if (b) bounties[mission.spec.jobId] = { ...b, status: "complete" };
  return { ...state, mission: done, verifiedWork, bounties };
}

export function reduceField(
  state: GenxFieldState,
  ev: GenxFieldEvent
): GenxFieldState {
  switch (ev.kind) {
    case "bounty": {
      const prev = state.bounties[ev.def.id];
      if (prev && prev.def.createdAt >= ev.def.createdAt) return state;
      const next: GenxBountyState = prev
        ? { ...prev, def: ev.def }
        : { def: ev.def, status: "open", joins: {}, nodeJob: null };
      return { ...state, bounties: { ...state.bounties, [ev.def.id]: next } };
    }
    case "join": {
      const b = state.bounties[ev.jobId];
      if (!b || !isId(ev.from)) return state;
      const cps = clampNum(ev.cellsPerSec, 0, 1e9, 0);
      if (cps <= 0) return state;
      if (b.joins[ev.from] === cps) return state;
      return {
        ...state,
        bounties: {
          ...state.bounties,
          [ev.jobId]: { ...b, joins: { ...b.joins, [ev.from]: cps } },
        },
      };
    }
    case "mission": {
      // Origin law: a mission exists only on its allocator's word.
      if (ev.from !== ev.spec.allocatorId) return state;
      const byShard = new Map(ev.assignments.map((a) => [a.shardId, a]));
      const shards: GenxShardState[] = [];
      if (ev.spec.structure) {
        // Structure variant (Slice 41): one shard per residue
        // range, IN RANGE ORDER — range i is shard i (Slice
        // 40's positional binding). No tile geometry; the
        // shard's work is its range's residue count.
        ev.spec.structure.ranges.forEach((range, shardId) => {
          const a = byShard.get(shardId);
          shards.push({
            shardId,
            tileX: 0,
            tileY: 0,
            status: a ? "assigned" : "queued",
            assignee: a ? a.to : null,
            attempt: a ? a.attempt : 1,
            progress: 0,
            checksum: null,
            liveCells: null,
            claimedBy: null,
            workUnits: range.end - range.start,
            lastWordAt: ev.at,
          });
        });
      } else {
        const cols = Math.ceil(ev.spec.fieldW / ev.spec.tileW);
        const rows = Math.ceil(ev.spec.fieldH / ev.spec.tileH);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const shardId = row * cols + col;
            const a = byShard.get(shardId);
            shards.push({
              shardId,
              tileX: col * ev.spec.tileW,
              tileY: row * ev.spec.tileH,
              status: a ? "assigned" : "queued",
              assignee: a ? a.to : null,
              attempt: a ? a.attempt : 1,
              progress: 0,
              checksum: null,
              liveCells: null,
              claimedBy: null,
              workUnits: ev.spec.tileW * ev.spec.tileH * ev.spec.generations,
              lastWordAt: ev.at,
            });
          }
        }
      }
      const mission: GenxMissionState = {
        spec: ev.spec,
        shards,
        status: "running",
        completedAt: null,
      };
      const bounties = { ...state.bounties };
      const b = bounties[ev.spec.jobId];
      if (b) bounties[ev.spec.jobId] = { ...b, status: "running" };
      return { ...state, mission, bounties };
    }
    case "shard": {
      const m = state.mission;
      if (!m || m.spec.missionId !== ev.missionId) return state;
      if (ev.from !== m.spec.allocatorId) return state;
      const idx = shardIndex(m, ev.shardId);
      if (idx < 0) return state;
      const s = m.shards[idx];
      if (s.status === "verified" || s.status === "failed" || s.status === "claimed") {
        return state;
      }
      return {
        ...state,
        mission: withShard(m, idx, {
          ...s,
          status: "assigned",
          assignee: ev.to,
          attempt: Math.min(GENX_MAX_ATTEMPTS, Math.max(1, ev.attempt)),
          progress: 0,
          lastWordAt: ev.at,
        }),
      };
    }
    case "progress": {
      const m = state.mission;
      if (!m || m.spec.missionId !== ev.missionId) return state;
      const idx = shardIndex(m, ev.shardId);
      if (idx < 0) return state;
      const s = m.shards[idx];
      if (s.assignee !== ev.from) return state;
      if (s.status !== "assigned" && s.status !== "running") return state;
      const p = clampNum(ev.progress, 0, 1, 0);
      return {
        ...state,
        mission: withShard(m, idx, {
          ...s,
          status: "running",
          progress: Math.max(s.progress, p),
          lastWordAt: ev.at,
        }),
      };
    }
    case "result": {
      const m = state.mission;
      if (!m || m.spec.missionId !== ev.missionId) return state;
      const idx = shardIndex(m, ev.shardId);
      if (idx < 0) return state;
      const s = m.shards[idx];
      if (s.assignee !== ev.from) return state;
      if (s.status !== "assigned" && s.status !== "running") return state;
      const checksum = capStr(ev.checksum, 32);
      if (!checksum) return state;
      return {
        ...state,
        mission: withShard(m, idx, {
          ...s,
          status: "claimed",
          progress: 1,
          checksum,
          liveCells: clampInt(ev.liveCells, 0, 1_000_000, 0),
          claimedBy: ev.from,
          lastWordAt: ev.at,
        }),
      };
    }
    case "verdict": {
      const m = state.mission;
      if (!m || m.spec.missionId !== ev.missionId) return state;
      if (ev.from !== m.spec.allocatorId) return state;
      const idx = shardIndex(m, ev.shardId);
      if (idx < 0) return state;
      const s = m.shards[idx];
      if (s.status !== "claimed") return state;
      const next: GenxShardState = ev.ok
        ? { ...s, status: "verified", lastWordAt: ev.at }
        : s.attempt >= GENX_MAX_ATTEMPTS
          ? { ...s, status: "failed", lastWordAt: ev.at }
          : {
              ...s,
              status: "queued",
              assignee: null,
              progress: 0,
              checksum: null,
              liveCells: null,
              claimedBy: null,
              lastWordAt: ev.at,
            };
      return settleMission(state, withShard(m, idx, next), ev.at);
    }
    case "fail": {
      // The allocator retires a shard whose worker vanished
      // (a dropped device that never claimed). Allocator-only,
      // and only before a claim exists — a claimed shard's fate
      // is a verdict, never a retirement.
      const m = state.mission;
      if (!m || m.spec.missionId !== ev.missionId) return state;
      if (ev.from !== m.spec.allocatorId) return state;
      const idx = shardIndex(m, ev.shardId);
      if (idx < 0) return state;
      const s = m.shards[idx];
      if (s.status !== "queued" && s.status !== "assigned" && s.status !== "running") {
        return state;
      }
      return settleMission(
        state,
        withShard(m, idx, { ...s, status: "failed", lastWordAt: ev.at }),
        ev.at
      );
    }
    case "node": {
      if (state.node && state.node.at > ev.reading.at) return state;
      return { ...state, node: ev.reading };
    }
    case "nodejob": {
      const b = state.bounties[ev.update.jobId];
      if (!b) return state;
      if (b.nodeJob && b.nodeJob.updatedAt > ev.update.updatedAt) return state;
      const status = ev.update.hasResults
        ? "complete"
        : /fail|error/i.test(ev.update.nodeStatus)
          ? "failed"
          : "running";
      return {
        ...state,
        bounties: {
          ...state.bounties,
          [ev.update.jobId]: { ...b, nodeJob: ev.update, status },
        },
      };
    }
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Derived truth (all computed, nothing stored twice)                  */
/* ------------------------------------------------------------------ */

/** Verified fraction of a mission, 0..1 (0 when there are no shards). */
export function missionProgress(mission: GenxMissionState | null): number {
  if (!mission || mission.shards.length === 0) return 0;
  const done = mission.shards.filter((s) => s.status === "verified").length;
  return done / mission.shards.length;
}

/** Sum of a bounty's joined devices' MEASURED throughput (cells/sec). */
export function roomPowerOf(bounty: GenxBountyState): number {
  return Object.values(bounty.joins).reduce((a, b) => a + b, 0);
}

/**
 * The contribution table for a mission: verified work per
 * participant, shares that sum to exactly 1 across verified work,
 * and Juice split pro-rata from the job's pool. Unverified work
 * earns nothing — this function is the whole reward law.
 */
export function contributionsOf(
  mission: GenxMissionState | null,
  juicePool: number | null
): GenxContribution[] {
  if (!mission) return [];
  const work = new Map<string, { work: number; shards: number }>();
  for (const s of mission.shards) {
    if (s.status !== "verified" || !s.claimedBy) continue;
    const cur = work.get(s.claimedBy) ?? { work: 0, shards: 0 };
    cur.work += s.workUnits;
    cur.shards += 1;
    work.set(s.claimedBy, cur);
  }
  const total = [...work.values()].reduce((a, c) => a + c.work, 0);
  return [...work.entries()]
    .map(([participantId, c]) => ({
      participantId,
      verifiedWork: c.work,
      verifiedShards: c.shards,
      share: total > 0 ? c.work / total : 0,
      juice: juicePool !== null && total > 0 ? (c.work / total) * juicePool : 0,
    }))
    .sort((a, b) => b.verifiedWork - a.verifiedWork);
}

/** The ghost's sense of the field, derived — see GenxSenseSnapshot. */
export function senseSnapshotOf(
  state: GenxFieldState,
  now: number
): GenxSenseSnapshot {
  const m = state.mission;
  const joined = new Set<string>();
  for (const b of Object.values(state.bounties)) {
    for (const id of Object.keys(b.joins)) joined.add(id);
  }
  let busy = 0;
  let stalled = 0;
  if (m) {
    const busyIds = new Set<string>();
    for (const s of m.shards) {
      if (
        (s.status === "assigned" || s.status === "running" || s.status === "claimed") &&
        s.assignee
      ) {
        busyIds.add(s.assignee);
        if (s.status !== "claimed" && now - s.lastWordAt > GENX_STALL_MS) {
          stalled += 1;
        }
      }
    }
    busy = busyIds.size;
  }
  const nodesOnline = joined.size + (state.node?.reachable ? 1 : 0);
  return {
    nodesOnline,
    fieldLoad: joined.size > 0 ? busy / joined.size : 0,
    missionProgress: missionProgress(m),
    shardsDone: m ? m.shards.filter((s) => s.status === "verified").length : 0,
    shardsTotal: m ? m.shards.length : 0,
    fahOnline: state.node?.fahStatus === "ONLINE",
    stalled,
  };
}

/**
 * The field's target cells: 2×2 tile groups, each with a canvas
 * position (its tiles' centroid, 0..1) and a verified fraction.
 * A target "dies" exactly when its last shard verifies — the
 * microcosm's visual truth is this table and nothing else.
 */
export interface GenxTarget {
  id: string;
  x: number;
  y: number;
  verifiedFraction: number;
  dead: boolean;
}

export function targetsOf(mission: GenxMissionState | null): GenxTarget[] {
  if (!mission) return [];
  // Targets are a tile-field concept (2×2 tile groups). A
  // structure mission's visual truth is the molecule itself —
  // the molecular view renders its ranges from this same field
  // state — so the tile-target table is honestly empty.
  if (mission.spec.structure) return [];
  const { spec } = mission;
  const cols = Math.ceil(spec.fieldW / spec.tileW);
  const groups = new Map<string, GenxShardState[]>();
  for (const s of mission.shards) {
    const col = s.shardId % cols;
    const row = Math.floor(s.shardId / cols);
    const key = `${Math.floor(col / 2)},${Math.floor(row / 2)}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([id, shards]) => {
    const cx =
      shards.reduce((a, s) => a + (s.tileX + spec.tileW / 2) / spec.fieldW, 0) /
      shards.length;
    const cy =
      shards.reduce((a, s) => a + (s.tileY + spec.tileH / 2) / spec.fieldH, 0) /
      shards.length;
    const vf =
      shards.filter((s) => s.status === "verified").length / shards.length;
    return { id, x: cx, y: cy, verifiedFraction: vf, dead: vf >= 1 };
  });
}
