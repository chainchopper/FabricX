/**
 * structures — The Fold's molecular registry and the shard
 * mapping for structure jobs (Slice 39, Track A).
 *
 * The bounty board's structure jobs are about REAL structures:
 * the bundled seeds in public/structures/ (fetched from RCSB
 * and the AlphaFold DB; provenance in structureIndex.ts, every
 * count there computed by the real parser, src/genx/pdb.ts) and,
 * at runtime, the .pdb outputs of a GenX node's own compute
 * engines. This module is the bridge between a parsed structure
 * (pdb.ts's contract) and a room job:
 *
 * - the registry resolves a job's `structureId` to the bundled
 *   structure's verified metadata (and its asset path);
 * - `structureShards` cuts a structure into shard domains:
 *   deterministic contiguous residue ranges, each range lying
 *   inside ONE chain, together covering every residue exactly
 *   once. A shard's domain is the section of the molecule that
 *   device folds — the domain-claiming visual the renderer
 *   track draws (a verified shard's range settles into its
 *   target Cα shape, in the verifier's hue);
 * - work and Juice for a structure job are formulas over the
 *   structure itself, stated here like shardEngine's: one work
 *   unit per residue in the target, one Juice per
 *   RESIDUES_PER_JUICE residues of VERIFIED work.
 *
 * Pure module: no fetches (the renderer loads the .pdb text
 * and parses it with pdb.ts), no timers, no deps beyond the
 * generated index.
 *
 * Powered by Nirvana
 */

import type { GenxStructure } from "./pdb";
import { STRUCTURE_INDEX, type BundledStructureMeta } from "./structureIndex";

/** Bundled structure ids (the registry keys jobs bind to). */
export const HEMOGLOBIN_STRUCTURE_ID = "4HHB";
export const INSULIN_STRUCTURE_ID = "AF-P01308";

/** The bundled structures' verified metadata, in index order. */
export const BUNDLED_STRUCTURES: BundledStructureMeta[] = STRUCTURE_INDEX;

/** Registry lookup: a job's structureId → bundled metadata, or null. */
export function bundledStructureMeta(
  structureId: string | null | undefined
): BundledStructureMeta | null {
  if (!structureId) return null;
  return STRUCTURE_INDEX.find((s) => s.id === structureId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Work + Juice for structure jobs (formulas, never constants)         */
/* ------------------------------------------------------------------ */

/** One work unit per residue of the target structure. */
export function structureWorkUnits(totalResidues: number): number {
  return Math.max(0, Math.floor(totalResidues));
}

/** 1 Juice per 100 residues of verified structure work. */
export const RESIDUES_PER_JUICE = 100;

export function structureJuicePool(totalResidues: number): number {
  return structureWorkUnits(totalResidues) / RESIDUES_PER_JUICE;
}

/* ------------------------------------------------------------------ */
/* Shard mapping — residue ranges are the domains                      */
/* ------------------------------------------------------------------ */

/**
 * One shard's domain: a contiguous range of residues inside a
 * single chain, identified by the chain id and the 0-based
 * [start, end) indices into that chain's Cα trace. The range's
 * target coordinates are `caSliceFor(structure, range)`.
 */
export interface StructureShardRange {
  shardId: number;
  chainId: string;
  start: number;
  end: number;
}

/**
 * Cut a structure into shard domains. Deterministic: the same
 * structure and shard count always produce the same ranges.
 *
 * Allocation: every non-empty chain receives at least one
 * shard (a domain never spans chains, so coverage requires
 * it); the remaining shards are dealt to chains in proportion
 * to their lengths (largest remainder, ties to the earlier
 * chain). Within a chain, its range is cut into contiguous
 * sub-ranges whose sizes differ by at most one residue, the
 * larger cuts first. When shardCount ≥ totalResidues the cut
 * bottoms out at one residue per shard. When shardCount <
 * chain count, each chain still gets its one shard — coverage
 * of every residue wins over the requested count, and the
 * returned length says so honestly.
 */
export function structureShards(
  structure: GenxStructure,
  shardCount: number
): StructureShardRange[] {
  const chains = structure.chains.filter((c) => c.residues > 0);
  if (chains.length === 0 || !(shardCount > 0)) return [];
  const total = chains.reduce((a, c) => a + c.residues, 0);
  const wanted = Math.min(Math.floor(shardCount), total);

  // Per-chain shard allocation (≥1 each; the rest pro-rata by
  // length — largest remainder, ties to the earlier chain).
  const alloc = chains.map(() => 1);
  if (wanted > chains.length) {
    const ideal = chains.map((c) => (c.residues / total) * wanted - 1);
    const base = ideal.map((v) => Math.max(0, Math.floor(v)));
    for (let i = 0; i < chains.length; i++) alloc[i] += base[i];
    let dealt = alloc.reduce((a, v) => a + v, 0);
    const remainders = chains
      .map((_, i) => ({ i, frac: ideal[i] - Math.floor(ideal[i]) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const r of remainders) {
      if (dealt >= wanted) break;
      alloc[r.i] += 1;
      dealt += 1;
    }
  }

  const out: StructureShardRange[] = [];
  let shardId = 0;
  for (let ci = 0; ci < chains.length; ci++) {
    const chain = chains[ci];
    const cuts = Math.min(alloc[ci], chain.residues);
    const size = Math.floor(chain.residues / cuts);
    const larger = chain.residues % cuts; // first `larger` cuts get +1
    let start = 0;
    for (let k = 0; k < cuts; k++) {
      const len = size + (k < larger ? 1 : 0);
      out.push({ shardId: shardId++, chainId: chain.id, start, end: start + len });
      start += len;
    }
  }
  return out;
}

/**
 * The target Cα coordinates of one shard's domain — the slice
 * of the real structure this shard is responsible for. Returns
 * [] for a range that names no chain in this structure.
 */
export function caSliceFor(
  structure: GenxStructure,
  range: StructureShardRange
): [number, number, number][] {
  const chain = structure.chains.find((c) => c.id === range.chainId);
  if (!chain) return [];
  return chain.ca.slice(range.start, range.end);
}
