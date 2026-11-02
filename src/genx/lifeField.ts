/**
 * lifeField — the shard payload math of The Fold (Slice 36).
 *
 * A room-fold mission evolves a shared Life field — the same
 * B3/S23 toroidal Game of Life that src/identity/fdna.ts runs at
 * 18×12 for the LifePacket fingerprint — generalized here to any
 * field size and cut into tiles. This module is the GENERALIZED
 * implementation, deliberately self-contained (no imports): the
 * shard worker's source is assembled from these very functions
 * (see shardWorker.ts), so the code a phone runs in its Worker
 * and the code the allocator re-runs to verify a claim are the
 * same text, not two copies that could drift. fdna.ts stays the
 * identity surfaces' module; the algorithms are the same family
 * (mulberry32 seeding, double-FNV state keys, lineage renewal).
 *
 * THE MERGE LAW (spec R4): tiles are NON-INTERACTING. A tile's
 * initial state is cut from the one mission field every device
 * seeds identically from the mission seed; the tile then evolves
 * as its own torus. Tiles never exchange halos, so any device can
 * recompute any tile from the mission spec alone — which is what
 * makes verification (and therefore Juice) possible at all.
 *
 * THE RENEWAL LAW (fdna lineage parity): a finite toroidal soup
 * always ends as ash or a loop. When a tile's next state is empty
 * or repeats a state it has already shown, the tile renews from
 * the NEXT derivation of its own seed — deterministically, so a
 * verifier recomputing the tile walks the exact same renewals.
 *
 * Pure module: no imports, no storage, no timers.
 *
 * Powered by Nirvana
 */

/** Same PRNG family as the identity/ghost stores (fdna.ts parity). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit over a string, returned unsigned (fdna.ts parity). */
export function fnv1aStr(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The seed for derivation `n` of a root seed (fdna's
 * deriveFdnaSeed, restated for this module's self-containment):
 * derivation 0 IS the root; n ≥ 1 mixes root and n through two
 * salted FNV-1a rounds with an xorshift stir.
 */
export function deriveSeed(seed: number, derivation: number): number {
  if (derivation <= 0) return seed;
  const root = (seed >>> 0).toString(10);
  let h = fnv1aStr(`fabric-fdna-lineage:${root}:${derivation | 0}`);
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  h = fnv1aStr(`lineage:${(h >>> 0).toString(10)}:${root}`);
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

/** First-state fill: fdna's FDNA_FILL — sparse enough for gliders, dense enough to churn. */
export const FIELD_FILL = 0.27;

/** Seed a w×h field deterministically from a seed. */
export function seedField(seed: number, w: number, h: number): Uint8Array {
  const rng = mulberry32(seed);
  const grid = new Uint8Array(w * h);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng() < FIELD_FILL ? 1 : 0;
  }
  return grid;
}

/** One B3/S23 generation on a w×h torus. */
export function stepField(grid: Uint8Array, w: number, h: number): Uint8Array {
  const next = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + w) % w;
          const ny = (y + dy + h) % h;
          n += grid[ny * w + nx];
        }
      }
      const alive = grid[y * w + x] === 1;
      next[y * w + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
    }
  }
  return next;
}

export function countLive(grid: Uint8Array): number {
  let live = 0;
  for (let i = 0; i < grid.length; i++) live += grid[i];
  return live;
}

/** FNV-1a over the packed cells with a given basis (fdna parity). */
export function fnv1aBytes(grid: Uint8Array, basis: number): number {
  let h = basis | 0;
  for (let i = 0; i < grid.length; i++) {
    h ^= grid[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A grid's checksum: two FNV-1a rounds over the packed cells with
 * decorrelated bases (fdnaStateKey's standard) — a claim's
 * checksum collides only if both rounds agree.
 */
export function gridChecksum(grid: Uint8Array): string {
  const a = fnv1aBytes(grid, 0x811c9dc5);
  const b = fnv1aBytes(grid, 0x811c9dc5 ^ 0x9e3779b9);
  return `${a.toString(36)}:${b.toString(36)}`;
}

/** The per-shard seed root: mission seed mixed with the shard id. */
export function tileSeedFor(missionSeed: number, shardId: number): number {
  let h = fnv1aStr(`fabric-genx-tile:${missionSeed >>> 0}:${shardId | 0}`);
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

/** Cut a tileW×tileH rectangle out of a fieldW-wide field. */
export function extractTile(
  field: Uint8Array,
  fieldW: number,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number
): Uint8Array {
  const tile = new Uint8Array(tileW * tileH);
  for (let y = 0; y < tileH; y++) {
    for (let x = 0; x < tileW; x++) {
      tile[y * tileW + x] = field[(tileY + y) * fieldW + (tileX + x)];
    }
  }
  return tile;
}

/* ------------------------------------------------------------------ */
/* The tile run                                                        */
/* ------------------------------------------------------------------ */

export interface TileSpec {
  missionSeed: number;
  fieldW: number;
  fieldH: number;
  shardId: number;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  generations: number;
}

export interface TileResult {
  checksum: string;
  liveCells: number;
  generationsRun: number;
  renewals: number;
}

export interface TileRun {
  /** Advance up to `maxSteps` generations; returns generations run total. */
  advance(maxSteps: number): number;
  readonly done: boolean;
  /** 0..1 of the requested generations. */
  readonly progress: number;
  /** The final tile state (valid any time; final when done). */
  readonly grid: Uint8Array;
  result(): TileResult;
}

/**
 * One tile's deterministic evolution. Construction cuts the tile
 * from the mission field; stepping applies the renewal law. Two
 * runs of the same spec — on any device, in a Worker or on the
 * main thread — produce the identical final grid and checksum.
 * That determinism IS the verification primitive.
 */
export function createTileRun(spec: TileSpec): TileRun {
  const tileSeed = tileSeedFor(spec.missionSeed, spec.shardId);
  let grid = extractTile(
    seedField(spec.missionSeed, spec.fieldW, spec.fieldH),
    spec.fieldW,
    spec.tileX,
    spec.tileY,
    spec.tileW,
    spec.tileH
  );
  let run = 0;
  let renewals = 0;
  let derivation = 0;
  const seen = new Set<string>();
  seen.add(gridChecksum(grid));

  const renew = (): void => {
    for (let attempt = 0; attempt < 32; attempt++) {
      derivation += 1;
      const fresh = seedField(
        deriveSeed(tileSeed, derivation),
        spec.tileW,
        spec.tileH
      );
      const k = gridChecksum(fresh);
      if (!seen.has(k)) {
        grid = fresh;
        seen.add(k);
        renewals += 1;
        return;
      }
    }
    // Practically unreachable for full tiles; accept the last
    // candidate rather than spin (fdna lineage's own posture).
    grid = seedField(deriveSeed(tileSeed, derivation), spec.tileW, spec.tileH);
    seen.add(gridChecksum(grid));
    renewals += 1;
  };

  return {
    advance(maxSteps: number): number {
      const budget = Math.max(0, Math.floor(maxSteps));
      let stepped = 0;
      while (run < spec.generations && stepped < budget) {
        const next = stepField(grid, spec.tileW, spec.tileH);
        run += 1;
        stepped += 1;
        if (countLive(next) === 0) {
          renew();
        } else {
          const k = gridChecksum(next);
          if (seen.has(k)) {
            renew();
          } else {
            seen.add(k);
            grid = next;
          }
        }
      }
      return run;
    },
    get done(): boolean {
      return run >= spec.generations;
    },
    get progress(): number {
      return spec.generations > 0 ? run / spec.generations : 1;
    },
    get grid(): Uint8Array {
      return grid;
    },
    result(): TileResult {
      return {
        checksum: gridChecksum(grid),
        liveCells: countLive(grid),
        generationsRun: run,
        renewals,
      };
    },
  };
}

/** Run a tile to completion synchronously (verification, checks, benchmark). */
export function computeTile(spec: TileSpec): TileResult {
  const run = createTileRun(spec);
  run.advance(spec.generations);
  return run.result();
}

/* ------------------------------------------------------------------ */
/* The benchmark workload                                              */
/* ------------------------------------------------------------------ */

/**
 * The join benchmark: a FIXED tile workload every device runs to
 * measure its own real shard throughput before it may join a job.
 * Fixed so measurements are comparable across devices; the result
 * (cell-steps actually executed / wall-clock seconds) is the only
 * throughput number the allocator ever sees.
 */
export const BENCH_TILE: TileSpec = {
  missionSeed: 0x6e7831,
  fieldW: 96,
  fieldH: 64,
  shardId: 0,
  tileX: 0,
  tileY: 0,
  tileW: 24,
  tileH: 16,
  generations: 1200,
};

/** Total cell-steps in one benchmark run. */
export const BENCH_CELL_STEPS =
  BENCH_TILE.tileW * BENCH_TILE.tileH * BENCH_TILE.generations;
