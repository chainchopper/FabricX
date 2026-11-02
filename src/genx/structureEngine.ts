/**
 * structureEngine — the structure-mission runner's arithmetic
 * for The Fold (Slice 41).
 *
 * Slices 39+40 bound the hemoglobin bounty to a real structure
 * (RCSB 4HHB) and taught the molecular view to settle a residue
 * range when its shard verifies — but no mission could run:
 * GenxMissionSpec was the LifePacket tile spec only. This
 * module is the missing runner, built INTO the standing
 * lifecycle (fieldState's reducer, genxStore, useGenxRoom's
 * allocator duties), not beside it:
 *
 * - A structure mission's shards are the structure's residue
 *   ranges (structures.structureShards, cut from the registry's
 *   verified chain lengths at creation — structureFoldSpec).
 * - A shard's WORK is a deterministic relaxation of its range:
 *   Cα positions start at Slice 40's deterministic unfolded
 *   layout (molMath.unfoldedPositions), then iterate a damped
 *   spring toward the range's real target coordinates with a
 *   neighbor-coherence term, for the spec's relaxSteps. All
 *   inputs are quantized to integer milli-Ångströms before the
 *   first step, and the iteration uses only + − × ÷ on IEEE
 *   doubles — so every device computes bit-identical final
 *   coordinates from the same spec + structure.
 * - The CLAIM is a checksum of those final coordinates at the
 *   same fixed precision. The allocator's verdict RE-RUNS the
 *   identical relaxation (computeRangeRelaxation — the very
 *   function the worker path runs) and compares checksums:
 *   verifyStructureClaim is the tile verifyClaim's door in its
 *   structure form. Match is the only way to verified, and
 *   therefore to Juice (pro-rata by residue count, per
 *   structures.ts's formulas, through the standing
 *   contributionsOf).
 *
 * WHAT THE RELAXATION IS — AND IS NOT: it is a deterministic
 * demonstration computation. Its RESULT (the checksum) is the
 * verified artifact: the checksum proves the specified work
 * ran, on the worker and again on the allocator. It is NOT a
 * scientific folding prediction — the target coordinates are
 * the structure's own measured/predicted Cα trace (RCSB /
 * AlphaFold, Slice 39's provenance), the relaxation is a
 * spring settle toward them, and no surface in the app may
 * call it a prediction.
 *
 * Pure module: no fetches (the caller loads the structure via
 * molStructures), no timers, no storage.
 *
 * Powered by Nirvana
 */

import { fnv1aBytes } from "./lifeField";
import { unfoldedPositions, type MolStructure } from "./molMath";
import {
  bundledStructureMeta,
  structureShardsForChains,
} from "./structures";
import type {
  GenxForm,
  GenxMissionSpec,
  GenxStructureRange,
} from "./genxTypes";

/* ------------------------------------------------------------------ */
/* Constants — the work spec's arithmetic                              */
/* ------------------------------------------------------------------ */

/**
 * Coordinates enter and leave the computation quantized to
 * integer milli-Ångströms (1/1000 Å). Quantizing the inputs
 * (whose unfolded start derives through molMath's sine fields)
 * makes the iteration's inputs identical on every device; the
 * iteration itself is exact IEEE arithmetic.
 */
export const COORD_QUANTUM = 1000;

/** Shards in the demo structure mission (the Room Fold's 16-tile precedent). */
export const STRUCTURE_MISSION_SHARDS = 16;

/**
 * Relaxation iterations per residue of the longest range: a
 * shard's step count is derived from the job's work spec —
 * RELAX_STEPS_PER_RESIDUE × the largest range's length — so a
 * bigger molecule is proportionally more work, stated here as
 * a formula, never tuned per job.
 */
export const RELAX_STEPS_PER_RESIDUE = 24;

/** Steps a mission spec built from `ranges` must run. */
export function relaxStepsForRanges(ranges: GenxStructureRange[]): number {
  const maxLen = ranges.reduce((a, r) => Math.max(a, r.end - r.start), 0);
  return RELAX_STEPS_PER_RESIDUE * Math.max(1, maxLen);
}

/* ------------------------------------------------------------------ */
/* The spec builder (the allocator's first word)                       */
/* ------------------------------------------------------------------ */

/**
 * Build a structure mission spec from the registry's verified
 * metadata alone — the cut depends on chain lengths, never on
 * coordinates (structures.structureShardsForChains), so the
 * allocator needs no .pdb fetch to post the mission, and every
 * device derives the same domains from the spec it receives.
 * Returns null when the structure id resolves to nothing: a
 * mission about an invented molecule is never posted.
 */
export function structureFoldSpec(args: {
  missionId: string;
  jobId: string;
  allocatorId: string;
  structureId: string;
  seed: number;
  startedAt: number;
  form: GenxForm;
}): GenxMissionSpec | null {
  const meta = bundledStructureMeta(args.structureId);
  if (!meta) return null;
  const ranges: GenxStructureRange[] = structureShardsForChains(
    meta.chains,
    STRUCTURE_MISSION_SHARDS
  ).map((r) => ({ chainId: r.chainId, start: r.start, end: r.end }));
  if (ranges.length === 0) return null;
  return {
    missionId: args.missionId,
    jobId: args.jobId,
    allocatorId: args.allocatorId,
    seed: args.seed >>> 0,
    // No tile geometry: a structure mission's field is the
    // molecule. The zeros are the honest sentinel, and every
    // tile-geometry consumer branches on spec.structure first.
    fieldW: 0,
    fieldH: 0,
    tileW: 0,
    tileH: 0,
    generations: 0,
    structure: {
      structureId: meta.id,
      relaxSteps: relaxStepsForRanges(ranges),
      ranges,
    },
    form: args.form,
    startedAt: args.startedAt,
  };
}

/** The range that IS mission shard `shardId` (positional law), or null. */
export function rangeForShard(
  spec: GenxMissionSpec,
  shardId: number
): GenxStructureRange | null {
  if (!spec.structure) return null;
  return spec.structure.ranges[shardId] ?? null;
}

/** Work units of one structure shard: its residue count (structures.ts). */
export function structureShardWorkUnits(range: GenxStructureRange): number {
  return range.end - range.start;
}

/* ------------------------------------------------------------------ */
/* Inputs: quantized start / target / anchors for one range            */
/* ------------------------------------------------------------------ */

export interface RangeInputs {
  /** Start positions (flat xyz), integer milli-Å — the unfolded layout. */
  start: number[];
  /** Target positions (flat xyz), integer milli-Å — the real Cα trace. */
  target: number[];
  /** The chain residue just before the range, at target (fixed anchor). */
  anchorBefore: [number, number, number] | null;
  /** The chain residue just after the range, at target (fixed anchor). */
  anchorAfter: [number, number, number] | null;
  /** Residues in the range. */
  residues: number;
}

function quantizeVec(
  v: readonly number[]
): [number, number, number] {
  return [
    Math.round(v[0] * COORD_QUANTUM),
    Math.round(v[1] * COORD_QUANTUM),
    Math.round(v[2] * COORD_QUANTUM),
  ];
}

/**
 * Derive one range's relaxation inputs from a parsed
 * structure: the start is Slice 40's deterministic unfolded
 * layout for exactly these residues (molMath.unfoldedPositions
 * over the whole structure, sliced to the range's chain
 * segment), the target is the range's real Cα slice, and the
 * boundary anchors are the target positions of the residues
 * flanking the range in its chain (so the neighbor term has
 * the same fixed points on every device). Null when the range
 * names no chain in this structure.
 */
export function rangeInputs(
  structure: MolStructure,
  range: GenxStructureRange
): RangeInputs | null {
  const chainIndex = structure.chains.findIndex((c) => c.id === range.chainId);
  if (chainIndex < 0) return null;
  const chain = structure.chains[chainIndex];
  if (range.start < 0 || range.end > chain.ca.length || range.end <= range.start) {
    return null;
  }
  let flatOffset = 0;
  for (let i = 0; i < chainIndex; i++) flatOffset += structure.chains[i].ca.length;
  const unfolded = unfoldedPositions(structure);
  const start: number[] = [];
  for (let i = range.start; i < range.end; i++) {
    const q = quantizeVec(unfolded[flatOffset + i]);
    start.push(q[0], q[1], q[2]);
  }
  const target: number[] = [];
  for (let i = range.start; i < range.end; i++) {
    const q = quantizeVec(chain.ca[i]);
    target.push(q[0], q[1], q[2]);
  }
  return {
    start,
    target,
    anchorBefore: range.start > 0 ? quantizeVec(chain.ca[range.start - 1]) : null,
    anchorAfter:
      range.end < chain.ca.length ? quantizeVec(chain.ca[range.end]) : null,
    residues: range.end - range.start,
  };
}

/* ------------------------------------------------------------------ */
/* The run core — SELF-CONTAINED (stringified into the worker).        */
/* These functions reference only each other, fnv1aBytes (assembled    */
/* alongside them), and literals: no module-scope names, so the text   */
/* a Worker runs and the text the allocator verifies with are one      */
/* text — the lifeField discipline.                                    */
/* ------------------------------------------------------------------ */

/**
 * A coordinate checksum: two FNV-1a rounds over the packed
 * int32 coordinate stream with decorrelated bases (the
 * gridChecksum standard), so a claim collides only if both
 * rounds agree. Input is the flat integer milli-Å stream.
 */
export function coordsChecksumInts(ints: number[]): string {
  const bytes = new Uint8Array(ints.length * 4);
  for (let i = 0; i < ints.length; i++) {
    const v = ints[i] | 0;
    bytes[i * 4] = v & 0xff;
    bytes[i * 4 + 1] = (v >>> 8) & 0xff;
    bytes[i * 4 + 2] = (v >>> 16) & 0xff;
    bytes[i * 4 + 3] = (v >>> 24) & 0xff;
  }
  const a = fnv1aBytes(bytes, 0x811c9dc5);
  const b = fnv1aBytes(bytes, 0x811c9dc5 ^ 0x9e3779b9);
  return `${a.toString(36)}:${b.toString(36)}`;
}

export interface RangeRun {
  /** Advance up to `maxSteps` iterations; returns iterations run total. */
  advance(maxSteps: number): number;
  readonly done: boolean;
  /** 0..1 of the requested iterations. */
  readonly progress: number;
  result(): { checksum: string; residues: number; stepsRun: number };
}

/**
 * One range's deterministic relaxation. Per iteration, a
 * Jacobi update over the range's positions:
 *   force = 0.08 · (target − p)          (the spring home)
 *         + 0.25 · (neighborMean − p)    (chain coherence;
 *           boundary neighbors are the fixed target anchors)
 *   velocity = (velocity + force) · 0.62 (damping)
 *   p += velocity
 * Only + − × ÷ on doubles: bit-identical on every device.
 */
export function createRelaxRun(
  start: number[],
  target: number[],
  anchorBefore: [number, number, number] | null,
  anchorAfter: [number, number, number] | null,
  steps: number
): RangeRun {
  const n = Math.floor(start.length / 3);
  const pos = new Float64Array(start);
  const vel = new Float64Array(n * 3);
  const next = new Float64Array(n * 3);
  const total = Math.max(0, Math.floor(steps));
  let run = 0;

  const stepOnce = (): void => {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const k = i * 3 + c;
        const p = pos[k];
        // Neighbor mean: in-range neighbors, or the fixed
        // target anchor at a range boundary, or — at a chain
        // end with no anchor — no bond term from that side.
        let sum = 0;
        let count = 0;
        if (i > 0) {
          sum += pos[(i - 1) * 3 + c];
          count += 1;
        } else if (anchorBefore) {
          sum += anchorBefore[c];
          count += 1;
        }
        if (i < n - 1) {
          sum += pos[(i + 1) * 3 + c];
          count += 1;
        } else if (anchorAfter) {
          sum += anchorAfter[c];
          count += 1;
        }
        const bond = count > 0 ? (sum / count - p) * 0.25 : 0;
        const spring = (target[k] - p) * 0.08;
        const v = (vel[k] + spring + bond) * 0.62;
        vel[k] = v;
        next[k] = p + v;
      }
    }
    pos.set(next);
  };

  return {
    advance(maxSteps: number): number {
      const budget = Math.max(0, Math.floor(maxSteps));
      let stepped = 0;
      while (run < total && stepped < budget) {
        stepOnce();
        run += 1;
        stepped += 1;
      }
      return run;
    },
    get done(): boolean {
      return run >= total;
    },
    get progress(): number {
      return total > 0 ? run / total : 1;
    },
    result(): { checksum: string; residues: number; stepsRun: number } {
      const ints = new Array<number>(pos.length);
      for (let i = 0; i < pos.length; i++) ints[i] = Math.round(pos[i]);
      return { checksum: coordsChecksumInts(ints), residues: n, stepsRun: run };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Whole-range runs: the worker's unit and the verifier's recompute    */
/* ------------------------------------------------------------------ */

/**
 * A chunked run of one mission shard (the TileRun shape), or
 * null when the shard names no range / the range names no
 * chain in this structure.
 */
export function createRangeRun(
  structure: MolStructure,
  spec: GenxMissionSpec,
  shardId: number
): RangeRun | null {
  if (!spec.structure) return null;
  const range = rangeForShard(spec, shardId);
  if (!range) return null;
  const inputs = rangeInputs(structure, range);
  if (!inputs) return null;
  return createRelaxRun(
    inputs.start,
    inputs.target,
    inputs.anchorBefore,
    inputs.anchorAfter,
    spec.structure.relaxSteps
  );
}

/** Run one structure shard to completion synchronously (verification, checks). */
export function computeRangeRelaxation(
  structure: MolStructure,
  spec: GenxMissionSpec,
  shardId: number
): { checksum: string; residues: number; stepsRun: number } | null {
  const run = createRangeRun(structure, spec, shardId);
  if (!run) return null;
  run.advance(Number.MAX_SAFE_INTEGER);
  return run.result();
}

/**
 * THE verifier for structure missions: re-run the shard's
 * relaxation from the spec + the real structure and compare
 * coordinate checksums — verifyClaim's door in its structure
 * form. A claim about an unresolvable shard verifies as false;
 * nothing is waved through.
 */
export function verifyStructureClaim(
  structure: MolStructure,
  spec: GenxMissionSpec,
  shardId: number,
  checksum: string
): boolean {
  if (typeof checksum !== "string" || checksum.length === 0) return false;
  const recomputed = computeRangeRelaxation(structure, spec, shardId);
  if (!recomputed) return false;
  return recomputed.checksum === checksum;
}
