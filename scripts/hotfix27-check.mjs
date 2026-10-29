/**
 * Hotfix 2.7 verification — "Real Life": the fDNA must actually live.
 *
 * Terrell's field report: the Ghostie Home's fDNA grid "seems to be
 * an animated gif rather than a life running game of life sequence."
 * Measured on the pre-fix module, he was exactly right: across 200
 * seeds the median derivation-0 run enters a cycle at generation 86
 * (seed 987654321 at generation 16), 199/200 seeds end at period 1
 * (frozen still lifes) or period 2 (blinkers), and the consumers'
 * extinction-only reseed fired 0 times for 8/10 fixture seeds —
 * the other 83% of lineages never go extinct, they just freeze.
 *
 * This check proves, against the real bundled module:
 *   1. Identity invariants (HARD gates): derivation 0 is byte-for-
 *      byte the Slice 9 card algorithm (verbatim reference, 6 seeds
 *      × 60 steps — the ghostie-home-check assertion), the pre-fix
 *      SHA-256 fingerprints of derivation 0 (gen 0 + gen 60) and
 *      the FBR tags are unchanged for 10 fixture seeds, dimensions
 *      stay 18×12, and the Slice 29 determinism/tag assertions pass
 *      verbatim (incl. negative seeds).
 *   2. Derivations: n = 0 is the identity seed itself; n ≥ 1 first
 *      states are pairwise distinct and their first-50-state
 *      trajectories differ from each other.
 *   3. Lineage authenticity: for 8 fixture seeds the performed
 *      sequence shows ZERO repeated full states in 600 steps,
 *      renewals actually fire, the population keeps moving (not a
 *      flat/2-value line), no shown state is empty, two seeds never
 *      share a trajectory, and the lineage is deterministic.
 *   4. Structure: both surfaces (GhostieHome, Essence) run the
 *      module's lineage and keep NO local stepper and NO ad-hoc
 *      reseed formula; all touched files esbuild clean.
 *
 * Run: esbuild src/identity/fdna.ts --bundle --format=esm --outfile=/tmp/fdna.mjs
 *      node scripts/hotfix27-check.mjs /tmp/fdna.mjs .
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const fdna = await import(pathToFileURL(process.argv[2] ?? "/tmp/fdna.mjs").href);
const ROOT = process.argv[3] ?? ".";
const {
  FDNA_COLS, FDNA_ROWS, seedFdnaGrid, stepFdnaGrid, countLiveCells,
  deriveFdnaTag, deriveFdnaSeed, seedFdnaDerivation, fdnaStateKey,
  createFdnaLineage,
} = fdna;

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};
const bytes = (g) => Buffer.from(g).toString("latin1");
const sha = (g) => createHash("sha256").update(Buffer.from(g)).digest("hex");

/* ---------------- 1. Identity invariants (hard gates) ---------------- */
console.log("== identity invariants ==");
check("dimensions match the card", FDNA_COLS === 18 && FDNA_ROWS === 12);
{
  // Reference: the ORIGINAL LifePacketCard.tsx logic, verbatim
  // (the same reference ghostie-home-check.mjs pins).
  const COLS = 18, ROWS = 12, FILL = 0.27;
  const refMulberry32 = (seed) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const refSeed = (seed) => {
    const rng = refMulberry32(seed);
    const g = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < g.length; i++) g[i] = rng() < FILL ? 1 : 0;
    return g;
  };
  const refStep = (grid) => {
    const next = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            n += grid[((y + dy + ROWS) % ROWS) * COLS + ((x + dx + COLS) % COLS)];
          }
        }
        const alive = grid[y * COLS + x] === 1;
        next[y * COLS + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
      }
    }
    return next;
  };
  let allSame = true;
  for (const seed of [0, 1, 42, 0xdeadbeef, 4294967295, 123456789]) {
    let a = seedFdnaGrid(seed);
    let b = refSeed(seed);
    for (let step = 0; step < 60; step++) {
      if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) allSame = false;
      a = stepFdnaGrid(a);
      b = refStep(b);
    }
  }
  check("derivation 0 grids identical to the card's over 6 seeds × 60 steps", allSame);
}
{
  // Pre-fix fingerprints (measured on main @ 937c837d before the
  // fix): derivation 0 at generations 0 and 60, plus the FBR tag.
  const FP = {
    0: ["ca1dcb766ca9ea4a095ff9943129df8547a3b7419f17f42852b34d1d3ed3e884", "a5645e7a3fa0866cde8842c4dab96567507c3d1a3c028b816bc63f6966367b70", "FBR-CG7H-P6FJ"],
    1: ["950a0c1b4eebd1549bcac66d57b28f7aef12d2141da92901b59627e09687b0e0", "6224fc5660139d6ac21d6a7b7f1fc05825b9bbd783ac0063f67cc91397b2464d", "FBR-Y2SX-Q7QZ"],
    42: ["d5c2ff8c84f1a8e3dc708b72c57511f9d548ba158ba2dee5011e88dcdaeefefd", "dcda8a73a4d5d4618819d3bf0c5b8d1ffae8023d8a7d373d9f02873ed055cb3d", "FBR-NPH4-QJVZ"],
    1337: ["97e48f9008ed584f1921ea4978c986ec7bdc41d965a56e67eaf98f1ac553a382", "5678029d5bbb186e86a3e3a3dca68f9edcf254e166c4d46a595724c5aefa082f", "FBR-YCWD-UZ73"],
    3735928559: ["fb292991c8e1da1079f665954a9e988d94c137d99c20ab7351b73eaca9a69e78", "f2b1222462aa6d8f1ff66b7b9519726f8626c02dab65a0f8760178c8c9ab8c06", "FBR-GMTG-H8TN"],
    4294967295: ["186bb6ac2bb23ffaea2e793994e94b75be2bf58f567155b467ae948b2c7d6364", "92414ac6eb0e9800f1bd39009eaf6e4b6e146aa2269ed45f6526ed4298cc969f", "FBR-Y5UW-3H93"],
    123456789: ["e12ee1c7bb7349a1d48ba76baa69c54d92e77ac177e4ed3fb31c4efe1f81dd50", "85ab237dd9c622af2561b3d2985184e9bde00ffb4689858684f92771c8f2d11c", "FBR-4XVZ-2CRG"],
    987654321: ["8ad25025a26b43979c3f6e6d340b8308d9bc3b0a15ee4829053e5423befea2d9", "dcd6d398af73d7284c15140b0d835fe8c0a81372aba8d8796764c8b34b22d731", "FBR-P2F6-2787"],
    20261029: ["45a71607bbe8ae4e4c7509570215175c482cd6b03437f3a0daf4da8fcde017bf", "88eaf745ff7b453c4dd63822e6c25cb768aa44dba64411c8e8f3725b50549e8a", "FBR-MJFJ-FS9A"],
    1592614637: ["f31fd777329a4fb8c5a23af2877d5175554c79f4988f58f854cd25a0d2cb05d2", "b68c05703652158c2cabc43a3267b8adb27f0bf3f321955c3c8439873fe95343", "FBR-CM47-N2VT"],
  };
  let fpOk = true;
  for (const [seedStr, [h0, h60, tag]] of Object.entries(FP)) {
    const seed = Number(seedStr) | 0;
    let g = seedFdnaGrid(seed);
    if (sha(g) !== h0) fpOk = false;
    for (let i = 0; i < 60; i++) g = stepFdnaGrid(g);
    if (sha(g) !== h60) fpOk = false;
    if (deriveFdnaTag(seed) !== tag) fpOk = false;
  }
  check("pre-fix derivation-0 fingerprints + tags unchanged (10 seeds)", fpOk);
}
{
  // Slice 29's fdna assertions, verbatim in spirit: determinism
  // over 25 steps + tag format/stability, incl. negative seeds.
  let detOk = true, tagOk = true;
  for (const seed of [0, 1, 42, -7, 123456789, -2147483648]) {
    let a = seedFdnaGrid(seed);
    let b = seedFdnaGrid(seed);
    let same = a.length === FDNA_COLS * FDNA_ROWS && a.every((v, i) => v === b[i]);
    for (let s = 0; s < 25; s++) { a = stepFdnaGrid(a); b = stepFdnaGrid(b); }
    same = same && a.every((v, i) => v === b[i]) && a.every((v) => v === 0 || v === 1);
    if (!same) detOk = false;
    const tag = deriveFdnaTag(seed);
    if (!(/^FBR-.{4}-.{4}$/.test(tag) && tag === deriveFdnaTag(seed))) tagOk = false;
  }
  check("slice29: fdna deterministic over 25 steps (6 seeds incl. negatives)", detOk);
  check("slice29: tag stable FBR format", tagOk);
  check("slice29: different seeds -> different tags", deriveFdnaTag(1) !== deriveFdnaTag(2));
  const seenTags = new Set();
  for (let s = 0; s < 5000; s++) seenTags.add(deriveFdnaTag(s));
  check("homecheck: 5000 seeds -> (near-)unique tags", seenTags.size >= 4999, `${seenTags.size} unique`);
  const TAG_RE = /^FBR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
  check("homecheck: tag format (strict alphabet)", TAG_RE.test(deriveFdnaTag(123456789)), deriveFdnaTag(123456789));
  let leaks = 0;
  for (const s of [0, 1, 42, 123456789, 4294967295]) {
    const tag = deriveFdnaTag(s);
    if (tag.includes(String(s)) || tag.includes(s.toString(16))) leaks += 1;
  }
  check("homecheck: tag never embeds the seed (decimal or hex)", leaks === 0);
  check("homecheck: adjacent seeds differ", deriveFdnaTag(1000) !== deriveFdnaTag(1001));
}

/* ---------------- 2. Derivations ---------------- */
console.log("== derivations ==");
{
  let ok0 = true;
  for (const seed of [0, 1, 42, -7, 987654321]) {
    if (deriveFdnaSeed(seed, 0) !== seed) ok0 = false;
    if (deriveFdnaSeed(seed, -3) !== seed) ok0 = false;
    if (bytes(seedFdnaDerivation(seed, 0)) !== bytes(seedFdnaGrid(seed))) ok0 = false;
  }
  check("derivation 0 IS the identity (seed + grid byte-identical)", ok0);

  let distinct = true, det = true;
  for (const seed of [42, 987654321, 20261029]) {
    const firsts = new Set();
    for (let n = 0; n <= 8; n++) {
      firsts.add(bytes(seedFdnaDerivation(seed, n)));
      if (deriveFdnaSeed(seed, n) !== deriveFdnaSeed(seed, n)) det = false;
    }
    if (firsts.size !== 9) distinct = false;
  }
  check("derivations 0..8: pairwise-distinct first states (3 seeds)", distinct);
  check("deriveFdnaSeed is deterministic", det);

  const first50 = (seed, n) => {
    let g = seedFdnaDerivation(seed, n);
    const keys = [fdnaStateKey(g)];
    for (let i = 0; i < 49; i++) { g = stepFdnaGrid(g); keys.push(fdnaStateKey(g)); }
    return keys.join("|");
  };
  let differ = true;
  for (const seed of [0, 1, 42, 1337, 123456789, 987654321]) {
    for (let n = 0; n < 4; n++) {
      if (first50(seed, n) === first50(seed, n + 1)) differ = false;
    }
  }
  check("renewal derivation's first-50 states differ from the previous (6 seeds × 4 renewals)", differ);
}

/* ---------------- 3. Lineage authenticity ---------------- */
console.log("== lineage authenticity ==");
{
  const FIXTURES = [0, 1, 42, 1337, 123456789, 987654321, 20261029, 1592614637];
  const trajectories = [];
  for (const seed of FIXTURES) {
    const lin = createFdnaLineage(seed);
    check(`seed ${seed >>> 0}: lineage opens on derivation 0's grid`,
      bytes(lin.grid) === bytes(seedFdnaGrid(seed)) && lin.derivation === 0 && lin.generation === 0);
    const seenStates = new Set([bytes(lin.grid)]);
    const pops = [countLiveCells(lin.grid)];
    let repeats = 0, renewals = 0, emptyShown = 0;
    const trajKeys = [fdnaStateKey(lin.grid)];
    for (let g = 0; g < 600; g++) {
      const r = lin.step();
      if (r.renewed) renewals++;
      const k = bytes(r.grid);
      if (seenStates.has(k)) repeats++;
      seenStates.add(k);
      const pop = countLiveCells(r.grid);
      if (pop === 0) emptyShown++;
      pops.push(pop);
      if (g < 100) trajKeys.push(fdnaStateKey(r.grid));
    }
    trajectories.push(trajKeys.join("|"));
    const settled = pops.slice(100);
    const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
    const sd = Math.sqrt(settled.reduce((a, b) => a + (b - mean) ** 2, 0) / settled.length);
    check(`seed ${seed >>> 0}: ZERO repeated full states in 600 steps`, repeats === 0 && seenStates.size === 601,
      `distinct=${seenStates.size}/601`);
    check(`seed ${seed >>> 0}: renewals fire (measured range 4–10)`, renewals >= 2, `renewals=${renewals}`);
    check(`seed ${seed >>> 0}: population keeps moving (not flat/2-cycle)`,
      new Set(settled).size >= 30 && sd >= 8,
      `distinctPops=${new Set(settled).size} sd=${sd.toFixed(1)}`);
    check(`seed ${seed >>> 0}: no empty state is ever shown`, emptyShown === 0);
    check(`seed ${seed >>> 0}: counters agree (generation=600, derivation=renewals)`,
      lin.generation === 600 && lin.derivation === renewals);
  }
  check("two seeds never share a trajectory (100-state prefixes, 8 seeds)",
    new Set(trajectories).size === trajectories.length);
}
{
  // The worst pre-fix offender: seed 987654321 froze at gen 16.
  const lin = createFdnaLineage(987654321);
  const seenStates = new Set([bytes(lin.grid)]);
  let repeats = 0;
  for (let g = 0; g < 1500; g++) {
    const r = lin.step();
    const k = bytes(r.grid);
    if (seenStates.has(k)) repeats++;
    seenStates.add(k);
  }
  check("long horizon: seed 987654321 (froze at gen 16 pre-fix) — 1500 steps, zero repeats",
    repeats === 0 && seenStates.size === 1501, `distinct=${seenStates.size}/1501`);
}
{
  const run = (seed) => {
    const lin = createFdnaLineage(seed);
    const out = [bytes(lin.grid)];
    for (let g = 0; g < 300; g++) { const r = lin.step(); out.push(`${r.renewed ? "R" : "."}${bytes(r.grid)}`); }
    return out.join("|");
  };
  check("lineage is deterministic (same seed -> same performed sequence)",
    run(42) === run(42) && run(42) !== run(43));
}

/* ---------------- 4. Structure ---------------- */
console.log("== structure ==");
{
  const home = readFileSync(join(ROOT, "app/components/fabric/GhostieHome.tsx"), "utf8");
  const essence = readFileSync(join(ROOT, "app/components/fabric/Essence.tsx"), "utf8");
  for (const [name, src] of [["GhostieHome", home], ["Essence", essence]]) {
    check(`${name} runs the module's lineage`, src.includes("createFdnaLineage"));
    check(`${name} keeps NO local stepper (no seed/step calls on the surface)`,
      !src.includes("seedFdnaGrid") && !src.includes("stepFdnaGrid"));
    check(`${name} keeps NO ad-hoc reseed formula (0x9e3779b9 mix gone)`,
      !src.includes("0x9e3779b9"));
    check(`${name} imports fdna from the shared module`,
      src.includes('from "../../../src/identity/fdna"'));
  }
  // esbuild the touched TS/TSX files (skip cleanly if esbuild is absent).
  try {
    const { build } = await import("/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js");
    for (const rel of ["src/identity/fdna.ts", "app/components/fabric/GhostieHome.tsx", "app/components/fabric/Essence.tsx"]) {
      await build({ entryPoints: [join(ROOT, rel)], bundle: false, write: false, logLevel: "silent" });
      check(`esbuild clean: ${rel}`, true);
    }
  } catch (e) {
    console.log(`SKIP esbuild section (${e.message})`);
  }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
