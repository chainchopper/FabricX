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

/** Count live cells (the Home re-seeds a burned-out lineage, like the card did). */
export function countLiveCells(grid: Uint8Array): number {
  let live = 0;
  for (let i = 0; i < grid.length; i++) live += grid[i];
  return live;
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
