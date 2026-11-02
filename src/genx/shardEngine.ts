/**
 * shardEngine — the allocator's arithmetic for The Fold (Slice 36).
 *
 * GenX's TaskAllocator laws, ported in semantics (attributed in
 * the spec): priority + best-fit assignment, failure re-queue
 * with a hard attempt cap, completion accounting. Here "best-fit"
 * is measured, not declared: a device joins a job only with the
 * throughput it BENCHMARKED on the real shard workload
 * (lifeField.BENCH_TILE), and assignments split in proportion to
 * those measurements.
 *
 * Everything the board shows is computed here from the job spec
 * and those measurements:
 * - total work = tiles × tile cells × generations (the spec);
 * - Juice pool = total work / 1,000,000 (1 Juice per million
 *   cell-steps — a formula, stated on the card);
 * - ETA = remaining work / summed measured room power (null when
 *   the room has no measured power — the card shows "—", never a
 *   guess);
 * - a claim counts only when verifyClaim RECOMPUTES the shard
 *   and the checksums match. No recompute, no verified, no Juice.
 *
 * Pure module apart from measureThroughput's wall clock.
 *
 * Powered by Nirvana
 */

import {
  BENCH_CELL_STEPS,
  BENCH_TILE,
  computeTile,
  type TileSpec,
} from "./lifeField";
import {
  bundledStructureMeta,
  HEMOGLOBIN_STRUCTURE_ID,
  INSULIN_STRUCTURE_ID,
  structureJuicePool,
  structureWorkUnits,
} from "./structures";
import type {
  GenxBountyDef,
  GenxMissionSpec,
  GenxShardAssignment,
} from "./genxTypes";

/* ------------------------------------------------------------------ */
/* The Room Fold job template                                          */
/* ------------------------------------------------------------------ */

/** The demo mission's field geometry (spec §3: fixed, deterministic). */
export const ROOM_FOLD_FIELD = {
  fieldW: 96,
  fieldH: 64,
  tileW: 24,
  tileH: 16,
  generations: 16000,
} as const;

/** Work units in one shard of a mission with this spec. */
export function shardWorkUnits(spec: GenxMissionSpec): number {
  return spec.tileW * spec.tileH * spec.generations;
}

/** Number of shards a spec cuts into. */
export function shardCount(spec: GenxMissionSpec): number {
  if (spec.structure) return spec.structure.ranges.length;
  return (
    Math.ceil(spec.fieldW / spec.tileW) * Math.ceil(spec.fieldH / spec.tileH)
  );
}

/**
 * Total work units of a mission (all shards). Tile missions:
 * per-shard work × shard count. Structure missions: the sum
 * of the ranges' residue counts (structures.ts: one work unit
 * per residue — the same total the job's def was posted with).
 */
export function missionTotalWork(spec: GenxMissionSpec): number {
  if (spec.structure) {
    return spec.structure.ranges.reduce((a, r) => a + (r.end - r.start), 0);
  }
  return shardWorkUnits(spec) * shardCount(spec);
}

/** The tile spec for one shard of a mission (any device can derive it). */
export function tileSpecFor(spec: GenxMissionSpec, shardId: number): TileSpec {
  const cols = Math.ceil(spec.fieldW / spec.tileW);
  const col = shardId % cols;
  const row = Math.floor(shardId / cols);
  return {
    missionSeed: spec.seed,
    fieldW: spec.fieldW,
    fieldH: spec.fieldH,
    shardId,
    tileX: col * spec.tileW,
    tileY: row * spec.tileH,
    tileW: spec.tileW,
    tileH: spec.tileH,
    generations: spec.generations,
  };
}

/** Build a Room Fold mission spec from a seed + allocator. */
export function roomFoldSpec(args: {
  missionId: string;
  jobId: string;
  allocatorId: string;
  seed: number;
  startedAt: number;
}): GenxMissionSpec {
  return {
    missionId: args.missionId,
    jobId: args.jobId,
    allocatorId: args.allocatorId,
    seed: args.seed >>> 0,
    ...ROOM_FOLD_FIELD,
    structure: null,
    form: "helix",
    startedAt: args.startedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Juice + estimates — formulas, never constants                       */
/* ------------------------------------------------------------------ */

/** 1 Juice per million cell-steps of VERIFIED work. */
export const CELL_STEPS_PER_JUICE = 1_000_000;

export function juicePoolFor(totalWorkUnits: number): number {
  return totalWorkUnits / CELL_STEPS_PER_JUICE;
}

/**
 * ETA in seconds for `workUnits` at `powerCellsPerSec` — null
 * when there is no measured power to divide by. Callers render
 * null as "—": an unknown ETA is shown as unknown.
 */
export function estimateEtaSeconds(
  workUnits: number,
  powerCellsPerSec: number
): number | null {
  if (!(powerCellsPerSec > 0) || !(workUnits >= 0)) return null;
  return workUnits / powerCellsPerSec;
}

/**
 * A joined device's estimated share of a job, from measured
 * throughputs: my power / the room's total power. 0 when the
 * room has no measured power.
 */
export function estimatedShare(
  myCellsPerSec: number,
  roomPowerCellsPerSec: number
): number {
  if (!(roomPowerCellsPerSec > 0) || !(myCellsPerSec > 0)) return 0;
  return myCellsPerSec / roomPowerCellsPerSec;
}

/* ------------------------------------------------------------------ */
/* Assignment planning (best-fit by measured power)                    */
/* ------------------------------------------------------------------ */

export interface GenxWorkerPower {
  id: string;
  cellsPerSec: number;
}

/**
 * Split shards across workers in proportion to MEASURED
 * throughput (largest-remainder counts, round-robin dealing so
 * regions spread across the field). Deterministic: workers sort
 * by power desc, then id asc; the same inputs always plan the
 * same mission.
 */
export function planAssignments(
  spec: GenxMissionSpec,
  workers: GenxWorkerPower[]
): GenxShardAssignment[] {
  const ids: number[] = [];
  for (let i = 0; i < shardCount(spec); i++) ids.push(i);
  return planAssignmentsForShards(ids, workers);
}

/**
 * The dealing itself, over an explicit shard-id list (Slice
 * 41): a structure mission's shards are its range indices, a
 * tile mission's are 0..shardCount-1 — one allocator law for
 * both variants. Same arithmetic planAssignments has always
 * run; the tile path delegates with its own id list.
 */
export function planAssignmentsForShards(
  shardIds: number[],
  workers: GenxWorkerPower[]
): GenxShardAssignment[] {
  const total = shardIds.length;
  const pool = workers
    .filter((w) => w.cellsPerSec > 0)
    .slice()
    .sort((a, b) => b.cellsPerSec - a.cellsPerSec || (a.id < b.id ? -1 : 1));
  if (pool.length === 0 || total === 0) return [];
  const powerSum = pool.reduce((a, w) => a + w.cellsPerSec, 0);
  const counts = pool.map((w) => Math.floor((w.cellsPerSec / powerSum) * total));
  let dealt = counts.reduce((a, c) => a + c, 0);
  // Largest remainder: hand the leftover shards to the largest
  // fractional shares first (ties → stronger worker first).
  const remainders = pool
    .map((w, i) => ({ i, frac: (w.cellsPerSec / powerSum) * total - counts[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const r of remainders) {
    if (dealt >= total) break;
    counts[r.i] += 1;
    dealt += 1;
  }
  const out: GenxShardAssignment[] = [];
  const taken = pool.map(() => 0);
  let dealtIdx = 0;
  while (dealtIdx < total) {
    for (let i = 0; i < pool.length && dealtIdx < total; i++) {
      if (taken[i] >= counts[i]) continue;
      out.push({ shardId: shardIds[dealtIdx], to: pool[i].id, attempt: 1 });
      taken[i] += 1;
      dealtIdx += 1;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Verification + benchmark                                            */
/* ------------------------------------------------------------------ */

/**
 * THE verifier for tile missions: recompute the shard from the
 * spec and compare checksums. This is the only door from
 * "claimed" to "verified" (and therefore to Juice) in the
 * whole fabric. Structure missions pass through the same door
 * in its structure form — verifyStructureClaim
 * (structureEngine.ts) re-runs the shard's relaxation and
 * compares coordinate checksums; there is no second standard.
 */
export function verifyClaim(
  spec: GenxMissionSpec,
  shardId: number,
  checksum: string
): boolean {
  if (typeof checksum !== "string" || checksum.length === 0) return false;
  return computeTile(tileSpecFor(spec, shardId)).checksum === checksum;
}

/**
 * Measure THIS device's real shard throughput: run the fixed
 * benchmark workload (twice, for a steadier clock) and divide
 * the cell-steps actually executed by the wall time actually
 * taken. The number is this device's join ticket — measured,
 * never declared.
 */
export function measureThroughput(): number {
  const runs = 2;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) computeTile(BENCH_TILE);
  const seconds = (performance.now() - t0) / 1000;
  if (!(seconds > 0)) return 0;
  return (BENCH_CELL_STEPS * runs) / seconds;
}

/* ------------------------------------------------------------------ */
/* Seed bounties (Fanalogy posts the first jobs — real ones)           */
/* ------------------------------------------------------------------ */

/** Human insulin A-chain (21 aa) — a real sequence for a real provider job. */
export const INSULIN_A_CHAIN = "GIVEQCCTSICSLYQLENYCN";

export const ROOM_FOLD_JOB_ID = "bounty-room-fold-1";
export const NODE_ESMFOLD_JOB_ID = "bounty-node-esmfold-1";
export const STRUCTURE_FOLD_JOB_ID = "bounty-structure-fold-1";

/**
 * The board's seed bounties, posted by Fanalogy on the room's
 * behalf (Terrell's direction: institutional sponsors and
 * ourselves first). All are REAL jobs with real referents: the
 * Room Fold runs on the room's own devices; the sequence job
 * submits through a bridged GenX node's /jobs/submit to its
 * ESMFold provider (framework id "esmfold", confirmed from the
 * node's provider registry code); the structure job's target
 * is a real bundled molecule (structures.ts) whose shards are
 * its own residue ranges. Their work/pool figures are computed
 * from the templates above; the node job's are null — its cost
 * is the node's to report.
 */
export function buildSeedBounties(
  postedBy: string,
  at: number
): GenxBountyDef[] {
  const template = roomFoldSpec({
    missionId: "template",
    jobId: ROOM_FOLD_JOB_ID,
    allocatorId: postedBy,
    seed: 0,
    startedAt: at,
  });
  const totalWork = missionTotalWork(template);
  // The hemoglobin job's figures come from the bundled
  // structure's verified registry entry (parser-computed
  // counts), through structures.ts's stated formulas.
  const hemo = bundledStructureMeta(HEMOGLOBIN_STRUCTURE_ID);
  return [
    {
      id: ROOM_FOLD_JOB_ID,
      kind: "room-fold",
      title: "Room Fold #1 — the room's LifePacket field",
      summary:
        "Evolve the room's shared LifePacket seed field, sharded across every opted-in device in the room. Each shard is checksummed and recomputed by the host before it counts.",
      postedBy,
      form: "helix",
      framework: null,
      params: null,
      structureId: null,
      totalWorkUnits: totalWork,
      juicePool: juicePoolFor(totalWork),
      createdAt: at,
    },
    {
      id: NODE_ESMFOLD_JOB_ID,
      kind: "node-job",
      title: "Insulin A-chain — ESMFold structure prediction",
      summary:
        "A real sequence job for the room's GenX node: submitted through the node's own /jobs/submit to its ESMFold provider. The node reports its own status; nothing here is estimated for it.",
      postedBy,
      form: "complex",
      framework: "esmfold",
      params: { sequence: INSULIN_A_CHAIN },
      structureId: INSULIN_STRUCTURE_ID,
      totalWorkUnits: null,
      juicePool: null,
      createdAt: at,
    },
    {
      id: STRUCTURE_FOLD_JOB_ID,
      kind: "room-fold",
      title: "Fold Hemoglobin — room fold",
      summary:
        "A real target for the room: human deoxyhemoglobin (RCSB 4HHB) — 574 residues across 4 chains, 4 heme groups, experimentally determined. Shards are residue ranges of the molecule (structures.ts); each range's target shape is the structure's own measured Cα trace, bundled with this app.",
      postedBy,
      form: "complex",
      framework: null,
      params: null,
      structureId: HEMOGLOBIN_STRUCTURE_ID,
      totalWorkUnits: hemo ? structureWorkUnits(hemo.totalResidues) : null,
      juicePool: hemo ? structureJuicePool(hemo.totalResidues) : null,
      createdAt: at,
    },
  ];
}
