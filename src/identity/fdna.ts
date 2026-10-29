/**
 * fDNA — the LifePacket's living fingerprint (pure module).
 *
 * The grid half is the logic Slice 9's LifePacketCard established:
 * a Game of Life (B3/S23, toroidal so a lineage never dies against
 * an edge) seeded deterministically from the identity seed with the
 * same mulberry32 family the identity and ghost stores use. Slice 20
 * ("Ghostie Home") moves it here so the big Home grid and any future
 * surface share ONE implementation — the packet's life must be the
 * same life everywhere it is shown.
 *
 * The lineage half (Hotfix 2.7) is the performance contract the
 * surfaces render by. A finite toroidal soup ALWAYS ends as ash —
 * measured on this module: across 200 seeds the median run enters
 * a cycle at generation 86, and 199/200 end at period 1 (frozen
 * still lifes) or period 2 (blinkers). When renewal only fired on
 * total extinction, the 5/6 of lineages that never go extinct
 * froze or blinked forever — a GIF, not a life. So the module owns
 * the watching: a lineage (createFdnaLineage) remembers every state
 * it has shown, and the moment a state would repeat — the exact
 * moment life becomes a loop — it renews from the identity's NEXT
 * derivation (deriveFdnaSeed / seedFdnaDerivation). Derivation 0
 * is the seed itself, byte-for-byte the canonical Slice 9 first
 * state; later derivations are new patterns of the SAME identity.
 * The seed never changes, the tag never changes, and no surface
 * keeps its own reseed rule anymore.
 *
 * The tag half is new: a SHORT display fingerprint derived from a
 * seed by a one-way hash mix (FNV-1a, two rounds with a domain
 * salt). The tag is a label for humans — "which ghostie is this,
 * at a glance" — never a credential: it is derived FROM the seed
 * and cannot be turned back into it (the mix is many-to-one and
 * only ~40 bits are shown), and the seed's real protection is the
 * standing rule: it never leaves the device.
 *
 * No imports — the node check exercises this module directly.
 *
 * Powered by Nirvana
 */

export const FDNA_COLS = 18;
export const FDNA_ROWS = 12;
/** First-state fill: sparse enough for gliders, dense enough to churn. */
export const FDNA_FILL = 0.27;

/** Same PRNG family as the identity/ghost stores, so the DNA derives from the seed. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFdnaGrid(seed: number): Uint8Array {
  const rng = mulberry32(seed);
  const grid = new Uint8Array(FDNA_COLS * FDNA_ROWS);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng() < FDNA_FILL ? 1 : 0;
  }
  return grid;
}

/** One B3/S23 generation on a torus — the packet wraps, never walls. */
export function stepFdnaGrid(grid: Uint8Array): Uint8Array {
  const next = new Uint8Array(FDNA_COLS * FDNA_ROWS);
  for (let y = 0; y < FDNA_ROWS; y++) {
    for (let x = 0; x < FDNA_COLS; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + FDNA_COLS) % FDNA_COLS;
          const ny = (y + dy + FDNA_ROWS) % FDNA_ROWS;
          n += grid[ny * FDNA_COLS + nx];
        }
      }
      const alive = grid[y * FDNA_COLS + x] === 1;
      next[y * FDNA_COLS + x] = alive
        ? n === 2 || n === 3
          ? 1
          : 0
        : n === 3
          ? 1
          : 0;
    }
  }
  return next;
}

/** Count live cells (extinction is one of the lineage's two renewal triggers). */
export function countLiveCells(grid: Uint8Array): number {
  let live = 0;
  for (let i = 0; i < grid.length; i++) live += grid[i];
  return live;
}

/* ------------------------------------------------------------------ */
/* Derivations: one identity, many first states                        */
/* ------------------------------------------------------------------ */

/**
 * The seed for derivation `n` of an identity. Derivation 0 IS the
 * identity seed itself — the canonical first state every surface
 * has always shown. Derivation n ≥ 1 mixes the seed and n through
 * two salted FNV-1a rounds with an xorshift stir (the tag's family):
 * deterministic per (seed, n), decorrelated from derivation n−1,
 * and derived ONLY from the seed — the identity persists while the
 * pattern is new. Never a replay: renewal walks n upward, forever.
 */
export function deriveFdnaSeed(seed: number, derivation: number): number {
  if (derivation <= 0) return seed;
  const root = (seed >>> 0).toString(10);
  let h = fnv1a(`fabric-fdna-lineage:${root}:${derivation | 0}`);
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  h = fnv1a(`lineage:${(h >>> 0).toString(10)}:${root}`);
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

/**
 * The first state of derivation `n`. For n = 0 this is exactly
 * seedFdnaGrid(seed) — byte-for-byte the lineage every surface
 * has always opened with.
 */
export function seedFdnaDerivation(seed: number, derivation: number): Uint8Array {
  return seedFdnaGrid(deriveFdnaSeed(seed, derivation));
}

/* ------------------------------------------------------------------ */
/* The lineage: a life that notices when it has become a loop          */
/* ------------------------------------------------------------------ */

/** FNV-1a over the packed cells (the string fnv1a below is for text). */
function fnv1aBytes(grid: Uint8Array, basis: number): number {
  let h = basis | 0;
  for (let i = 0; i < grid.length; i++) {
    h ^= grid[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A state's fingerprint for loop detection: two FNV-1a rounds over
 * the packed cells with decorrelated bases, so a collision needs
 * both rounds to agree. Used by the lineage to remember what it
 * has already shown — and by the checks to prove it never repeats.
 */
export function fdnaStateKey(grid: Uint8Array): string {
  const a = fnv1aBytes(grid, 0x811c9dc5);
  const b = fnv1aBytes(grid, 0x811c9dc5 ^ 0x9e3779b9);
  return `${a.toString(36)}:${b.toString(36)}`;
}

/**
 * How many shown states a lineage remembers. Within the memory,
 * the watched sequence CANNOT repeat a state — renewal fires
 * first. 8192 states is ~41 minutes at the Home's 300 ms cadence
 * (and hours at the Essence's slower ones) before the memory —
 * the only capped resource — resets and the horizon restarts.
 */
export const FDNA_LINEAGE_MEMORY = 8192;

export interface FdnaLineageStep {
  /** The state to show now (a renewed first state when renewed). */
  grid: Uint8Array;
  /** True when this step renewed the lineage (extinct or looping). */
  renewed: boolean;
  /** The derivation the shown state belongs to. */
  derivation: number;
  /** Total steps taken across all derivations. */
  generation: number;
}

export interface FdnaLineage {
  readonly grid: Uint8Array;
  readonly generation: number;
  readonly derivation: number;
  step(): FdnaLineageStep;
}

/**
 * One identity's performed life. Surfaces hold a lineage and call
 * step() on their cadence; everything else — stepping, watching
 * for extinction, watching for the first repeated state, renewing
 * from the next derivation — is the module's job, identical on
 * every surface.
 *
 * Renewal fires when the next state is empty (extinction) OR when
 * its key is already in the memory (the trajectory has entered a
 * cycle: still-life ash, blinkers, a glider loop — any loop). The
 * looping/empty state is never shown; the next derivation's first
 * state takes its place in the same step, and that state is itself
 * checked against the memory (bounded retries) so the performed
 * sequence stays repeat-free within the memory window.
 */
export function createFdnaLineage(seed: number): FdnaLineage {
  let grid = seedFdnaGrid(seed);
  let generation = 0;
  let derivation = 0;
  const seen = new Set<string>();
  const remember = (k: string): void => {
    if (seen.size >= FDNA_LINEAGE_MEMORY) seen.clear();
    seen.add(k);
  };
  remember(fdnaStateKey(grid));

  const renew = (): void => {
    for (let attempt = 0; attempt < 32; attempt++) {
      derivation += 1;
      const fresh = seedFdnaDerivation(seed, derivation);
      const k = fdnaStateKey(fresh);
      if (!seen.has(k)) {
        grid = fresh;
        remember(k);
        return;
      }
    }
    // No fresh first state in 32 derivations (a practical
    // impossibility for full grids) — accept the last candidate
    // rather than spin; later steps keep watching regardless.
    grid = seedFdnaDerivation(seed, derivation);
    remember(fdnaStateKey(grid));
  };

  return {
    get grid() {
      return grid;
    },
    get generation() {
      return generation;
    },
    get derivation() {
      return derivation;
    },
    step(): FdnaLineageStep {
      const next = stepFdnaGrid(grid);
      generation += 1;
      let renewed = false;
      if (countLiveCells(next) === 0) {
        renew();
        renewed = true;
      } else {
        const k = fdnaStateKey(next);
        if (seen.has(k)) {
          renew();
          renewed = true;
        } else {
          remember(k);
          grid = next;
        }
      }
      return { grid, renewed, derivation, generation };
    },
  };
}

/* ------------------------------------------------------------------ */
/* The secure tag                                                      */
/* ------------------------------------------------------------------ */

/** Unambiguous display alphabet (no 0/O, 1/I/L) — a tag is read aloud. */
const TAG_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** FNV-1a 32-bit over a string, returned unsigned. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Derive the ghostie's secure tag from a seed. One-way by
 * construction: the seed passes through two salted FNV-1a rounds
 * interleaved with an xorshift mix, and only 8 alphabet characters
 * (~40 bits of display) are taken. The same seed always yields the
 * same tag (it is an identity label, stable across sessions); a
 * different seed yields a different tag with overwhelming
 * probability. The tag is NOT the seed, not an encoding of it, and
 * not reversible into it — and it is safe to show precisely because
 * the seed itself is never displayed or transmitted.
 */
export function deriveFdnaTag(seed: number): string {
  const root = (seed >>> 0).toString(10);
  let h = fnv1a(`fabric-fdna-tag:${root}`);
  let out = "";
  // Each character is drawn from a FRESH salted round over the
  // running hash (with an xorshift stir), so the eight characters
  // are decorrelated rather than one sequence's low bits — and
  // every intermediate is kept unsigned.
  for (let i = 0; i < 8; i++) {
    h = fnv1a(`ghostie:${(h >>> 0).toString(10)}:${i}:${root}`);
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h = h >>> 0;
    out += TAG_ALPHABET[h % TAG_ALPHABET.length];
  }
  return `FBR-${out.slice(0, 4)}-${out.slice(4)}`;
}
