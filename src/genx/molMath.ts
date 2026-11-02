/**
 * Slice 40 — The Fold's molecular view: pure morph math.
 *
 * The structure on screen is a PURE FUNCTION of verified work. This module
 * holds everything testable about that: the deterministic unfolded layout,
 * the per-range morph, the thermal jitter field, colors, and normalization.
 * No React, no three.js, no clocks, no Math.random — the same inputs give
 * the same positions on every device, which is what lets a room of
 * spectators watch the identical fold.
 *
 * Types mirror the data contract owned by Slice 39: parsePdb
 * (src/genx/pdb.ts) yields a structure { id, name, source, chains:
 * [{ id, residues, ca }] }, and structureShards (src/genx/structures.ts)
 * gives deterministic contiguous single-chain residue ranges, one range
 * per shard. Structural typing means the contract types drop straight in.
 */

export type MolVec3 = [number, number, number];

export interface MolChain {
  id: string;
  residues: number;
  ca: MolVec3[];
}

export interface MolStructure {
  id: string;
  name: string;
  source: string;
  chains: MolChain[];
  totalResidues: number;
  /** Distinct heme groups, when the parser counted them (4HHB: 4). */
  ligands?: number;
}

/**
 * One shard's claim on the structure: a contiguous span of one chain.
 * Shape and semantics mirror the data contract's StructureShardRange
 * (src/genx/structures.ts): `start`/`end` are 0-based [start, end)
 * indices into that chain's ca array; `shardId` is the range's index
 * in the structureShards cut.
 */
export interface MolShardRange {
  shardId: number;
  chainId: string;
  /** Inclusive start index into the chain's ca array. */
  start: number;
  /** EXCLUSIVE end index into the chain's ca array. */
  end: number;
}

/** Jitter amplitude (normalized render units) at zero progress. */
export const JITTER_K = 0.55;
/** A verified range still hums a little while the rest of the job runs. */
export const JITTER_SETTLED_FACTOR = 0.15;
/** Settle ease length once a range verifies (presentation only). */
export const SETTLE_MS = 900;

/** Deterministic 0..1 hash — same string in, same number out, every device. */
export function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** easeOutCubic — the settle curve for a freshly verified range. */
export function easeSettle(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return 1 - Math.pow(1 - c, 3);
}

/** Flat index of every residue: chains in order, residues in order. */
export function flattenResidues(
  structure: MolStructure,
): { chainIndex: number; residueIndex: number; pos: MolVec3 }[] {
  const out: { chainIndex: number; residueIndex: number; pos: MolVec3 }[] = [];
  structure.chains.forEach((chain, chainIndex) => {
    chain.ca.forEach((pos, residueIndex) => out.push({ chainIndex, residueIndex, pos }));
  });
  return out;
}

/** The real folded coordinates, flat, in flattenResidues order. */
export function targetPositions(structure: MolStructure): MolVec3[] {
  return flattenResidues(structure).map((r) => r.pos);
}

/**
 * The unfolded layout: each chain stretched into a long wavy strand.
 * Deterministic from (structure.id, chain.id, residue index) only — no
 * clocks, no randomness — so every screen in the room starts from the
 * identical tangle. Consecutive Cα sit ~3.8 Å apart along the strand,
 * like a real chain pulled straight.
 */
export function unfoldedPositions(structure: MolStructure): MolVec3[] {
  const out: MolVec3[] = [];
  structure.chains.forEach((chain, chainIndex) => {
    const seed = `${structure.id}:${chain.id}`;
    const phaseY = hash01(`${seed}:py`) * Math.PI * 2;
    const phaseZ = hash01(`${seed}:pz`) * Math.PI * 2;
    const wobbleY = 2.2 + hash01(`${seed}:wy`) * 2.4;
    const wobbleZ = 2.2 + hash01(`${seed}:wz`) * 2.4;
    const freqY = 0.16 + hash01(`${seed}:fy`) * 0.14;
    const freqZ = 0.13 + hash01(`${seed}:fz`) * 0.14;
    // Chains stack along y by their flat offset so multi-chain structures
    // (hemoglobin's four chains) read as separate strands, not one knot.
    const yBase = chainIndex * 9 - (structure.chains.length - 1) * 4.5;
    const n = chain.ca.length;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 3.8;
      const y = yBase + Math.sin(i * freqY + phaseY) * wobbleY + (hash01(`${seed}:${i}:ny`) - 0.5) * 1.1;
      const z = Math.cos(i * freqZ + phaseZ) * wobbleZ + (hash01(`${seed}:${i}:nz`) - 0.5) * 1.1;
      out.push([x, y, z]);
    }
  });
  return out;
}

/**
 * Centroid + uniform scale fitted on the TARGET layout, applied to both
 * layouts so the morph happens in one shared frame and the folded protein
 * lands centered at a known size. Render units: target fits ~4.4 across.
 */
export function normalizerFor(structure: MolStructure): {
  center: MolVec3;
  scale: number;
} {
  const pts = targetPositions(structure);
  if (pts.length === 0) return { center: [0, 0, 0], scale: 1 };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    scale: 4.4 / span,
  };
}

export function applyNormalizer(
  pts: MolVec3[],
  norm: { center: MolVec3; scale: number },
): MolVec3[] {
  const [cx, cy, cz] = norm.center;
  return pts.map(([x, y, z]) => [
    (x - cx) * norm.scale,
    (y - cy) * norm.scale,
    (z - cz) * norm.scale,
  ]);
}

/**
 * Map every flat residue index to exactly one range index (or -1 when the
 * ranges don't cover it — the checks pin full coverage for real inputs).
 */
export function residueRangeMap(
  structure: MolStructure,
  ranges: MolShardRange[],
): number[] {
  const flat: { chainId: string; residueIndex: number }[] = [];
  structure.chains.forEach((chain) => {
    chain.ca.forEach((_pos, residueIndex) => flat.push({ chainId: chain.id, residueIndex }));
  });
  return flat.map(({ chainId, residueIndex }) => {
    for (let r = 0; r < ranges.length; r++) {
      const range = ranges[r];
      if (range.chainId === chainId && residueIndex >= range.start && residueIndex < range.end) {
        return r;
      }
    }
    return -1;
  });
}

/** Centroid of one range's TARGET positions (bloom placement), normalized. */
export function rangeCentroid(
  structure: MolStructure,
  range: MolShardRange,
  norm: { center: MolVec3; scale: number },
): MolVec3 {
  const chain = structure.chains.find((c) => c.id === range.chainId);
  if (!chain || chain.ca.length === 0) return [0, 0, 0];
  const start = Math.max(0, range.start);
  const end = Math.min(chain.ca.length, range.end);
  let x = 0, y = 0, z = 0, n = 0;
  for (let i = start; i < end; i++) {
    x += chain.ca[i][0];
    y += chain.ca[i][1];
    z += chain.ca[i][2];
    n++;
  }
  if (n === 0) return [0, 0, 0];
  return [
    (x / n - norm.center[0]) * norm.scale,
    (y / n - norm.center[1]) * norm.scale,
    (z / n - norm.center[2]) * norm.scale,
  ];
}

export interface MorphFrameInput {
  /** Normalized target positions (flattenResidues order). */
  target: MolVec3[];
  /** Normalized unfolded positions (same order, same normalizer). */
  unfolded: MolVec3[];
  /** Per-residue range index, from residueRangeMap. */
  rangeOf: number[];
  /** Per-range morph amount 0..1 (0 = unverified, 1 = settled). */
  rangeT: number[];
  /** Whole-job verified fraction 0..1 — drives the thermal jitter. */
  progress: number;
  /** Seconds — feeds the deterministic jitter field only. */
  timeSec: number;
}

/**
 * One rendered position per residue:
 *   pos = lerp(unfolded, target, rangeT[range]) + jitter
 * Jitter amplitude = (1 - progress) * JITTER_K, damped further inside
 * ranges that have already settled — so an untouched job shakes hard,
 * verified domains sit nearly still, and at progress 1 the whole frame
 * is exactly the folded structure. Jitter is a deterministic sine field
 * over (residue index, time): identical math on every device.
 */
export function morphFrame(input: MorphFrameInput): MolVec3[] {
  const { target, unfolded, rangeOf, rangeT, progress, timeSec } = input;
  const baseAmp = (1 - Math.min(1, Math.max(0, progress))) * JITTER_K;
  const out: MolVec3[] = new Array(target.length);
  for (let i = 0; i < target.length; i++) {
    const r = rangeOf[i];
    const t = r >= 0 ? Math.min(1, Math.max(0, rangeT[r] ?? 0)) : 0;
    const u = unfolded[i];
    const g = target[i];
    const amp = baseAmp * (1 - (1 - JITTER_SETTLED_FACTOR) * t);
    let jx = 0, jy = 0, jz = 0;
    if (amp > 0) {
      const f = i * 0.6180339887;
      jx = amp * (Math.sin(timeSec * 2.1 + f * 3.1) + 0.6 * Math.sin(timeSec * 3.7 + f * 5.3)) / 1.6;
      jy = amp * (Math.sin(timeSec * 1.7 + f * 4.3) + 0.6 * Math.sin(timeSec * 3.1 + f * 6.1)) / 1.6;
      jz = amp * (Math.sin(timeSec * 2.6 + f * 2.7) + 0.6 * Math.sin(timeSec * 4.3 + f * 4.9)) / 1.6;
    }
    out[i] = [
      u[0] + (g[0] - u[0]) * t + jx,
      u[1] + (g[1] - u[1]) * t + jy,
      u[2] + (g[2] - u[2]) * t + jz,
    ];
  }
  return out;
}

/** Pure HSL -> RGB (h in degrees, s/l 0..1) — mirrors identity hueCss math. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

/** Base colors per chain index — calm structural hues, cycled. */
export const CHAIN_PALETTE_HUES = [210, 160, 265, 25, 330, 120, 45, 195];

export function chainBaseColor(chainIndex: number): [number, number, number] {
  const hue = CHAIN_PALETTE_HUES[chainIndex % CHAIN_PALETTE_HUES.length];
  return hslToRgb(hue, 0.42, 0.52);
}

/** A participant's signature hue as a saturated render color. */
export function claimerColor(hue: number): [number, number, number] {
  return hslToRgb(hue, 0.85, 0.58);
}

/**
 * The color of one residue right now: the chain's base color while its
 * range is unverified, blending to the verifying participant's signature
 * hue as the range settles (t follows the same settle as the geometry).
 */
export function residueColor(
  chainIndex: number,
  rangeIdx: number,
  rangeT: number[],
  rangeClaimerHue: (number | null)[],
): [number, number, number] {
  const base = chainBaseColor(chainIndex);
  if (rangeIdx < 0) return base;
  const hue = rangeClaimerHue[rangeIdx];
  if (hue === null || hue === undefined) return base;
  const t = Math.min(1, Math.max(0, rangeT[rangeIdx] ?? 0));
  if (t <= 0) return base;
  const claimed = claimerColor(hue);
  return [
    base[0] + (claimed[0] - base[0]) * t,
    base[1] + (claimed[1] - base[1]) * t,
    base[2] + (claimed[2] - base[2]) * t,
  ];
}
