/**
 * moldata-check.mjs — Slice 39 (Track A: molecular data
 * pipeline) headless checks.
 *
 * Run: node scripts/moldata-check.mjs [repoRoot]
 *   (bundles the modules it drives with esbuild itself — the
 *    house .tools install — into /tmp, then imports them)
 *
 * Proves:
 *   A — the PDB parser on the REAL bundled files: hemoglobin
 *       (RCSB 4HHB) parses to 4 chains A/B/C/D of 141/146/141/
 *       146 residues, 574 total, exactly 4 heme ligands, Cα
 *       count == residue count on every chain, all coordinates
 *       finite; the AlphaFold insulin model (AF-P01308-F1 v6)
 *       parses to a single 110-residue chain; parsing is
 *       deterministic (two parses are identical).
 *   B — provenance: public/structures/INDEX.json and the
 *       generated src/genx/structureIndex.ts agree field by
 *       field; each entry's SHA-256 equals the actual bundled
 *       file's hash; each entry's counts equal a FRESH parse
 *       of the actual file (the index cannot drift from the
 *       bytes or the parser).
 *   C — the shard mapping (structures.structureShards):
 *       ranges are contiguous, single-chain, non-overlapping,
 *       cover every residue exactly once, carry sequential
 *       shard ids, and are deterministic across two runs —
 *       for both structures at several shard counts, plus the
 *       one-residue-per-shard floor and the empty cases;
 *       caSliceFor returns exactly the range's target slice
 *       of the real parsed structure.
 *   D — board binding: the seed board carries three real
 *       jobs; the hemoglobin room job and the ESMFold insulin
 *       node job resolve their structureId through the
 *       registry to the bundled structures (with work/pool
 *       computed from the registry's counts); the LifePacket
 *       Room Fold keeps structureId null; card data carries
 *       the binding through.
 *   E — the regression battery stays green (child processes;
 *       the sam/understands /tmp pre-bundles are built first,
 *       per their own runners' contracts).
 *
 * Powered by Nirvana
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..")
);

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  if (ok) {
    passes++;
    console.log(`PASS  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

const require = createRequire(import.meta.url);
const esbuildPath = [
  "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js",
  join(root, "node_modules/esbuild/lib/main.js"),
].find((p) => existsSync(p));
if (!esbuildPath) {
  console.log("FAIL  esbuild not found (house .tools install)");
  process.exit(1);
}
const esbuild = require(esbuildPath);

const bundleDir = "/tmp/moldata-check-bundles";
await esbuild.build({
  entryPoints: {
    pdb: join(root, "src/genx/pdb.ts"),
    structures: join(root, "src/genx/structures.ts"),
    structureIndex: join(root, "src/genx/structureIndex.ts"),
    shardEngine: join(root, "src/genx/shardEngine.ts"),
    boardData: join(root, "src/genx/boardData.ts"),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outdir: bundleDir,
  outExtension: { ".js": ".mjs" },
});
const pdb = await import(pathToFileURL(join(bundleDir, "pdb.mjs")).href);
const structures = await import(
  pathToFileURL(join(bundleDir, "structures.mjs")).href
);
const structureIndex = await import(
  pathToFileURL(join(bundleDir, "structureIndex.mjs")).href
);
const engine = await import(
  pathToFileURL(join(bundleDir, "shardEngine.mjs")).href
);
const board = await import(pathToFileURL(join(bundleDir, "boardData.mjs")).href);

/* ------------------------------------------------------------------ */
/* A — the parser on the real bundled files                            */
/* ------------------------------------------------------------------ */
console.log("== A. parser on the real bundled files ==");

const hemoText = readFileSync(join(root, "public/structures/4HHB.pdb"), "utf8");
const insText = readFileSync(
  join(root, "public/structures/AF-P01308.pdb"),
  "utf8"
);
const hemo = pdb.parsePdb(hemoText, {
  id: "4HHB",
  name: "Human Deoxyhemoglobin",
  source: "rcsb",
});
const ins = pdb.parsePdb(insText, {
  id: "AF-P01308",
  name: "Human Insulin",
  source: "alphafold",
});

check(
  "hemoglobin: 4 chains A/B/C/D",
  hemo.chains.map((c) => c.id).join(",") === "A,B,C,D",
  hemo.chains.map((c) => c.id).join(",")
);
check(
  "hemoglobin: chain residues 141/146/141/146",
  hemo.chains.map((c) => c.residues).join(",") === "141,146,141,146",
  hemo.chains.map((c) => c.residues).join(",")
);
check("hemoglobin: totalResidues 574", hemo.totalResidues === 574);
check(
  "hemoglobin: exactly 4 heme ligands",
  hemo.ligands === 4,
  `got ${hemo.ligands}`
);
check(
  "hemoglobin: Cα count == residue count on every chain, total 574 Cα",
  hemo.chains.every((c) => c.ca.length === c.residues) &&
    hemo.chains.reduce((a, c) => a + c.ca.length, 0) === 574
);
check(
  "hemoglobin: every coordinate finite",
  hemo.chains.every((c) =>
    c.ca.every((p) => p.every((v) => Number.isFinite(v)))
  )
);
check(
  "insulin: single chain A of 110 residues",
  ins.chains.length === 1 &&
    ins.chains[0].id === "A" &&
    ins.chains[0].residues === 110 &&
    ins.totalResidues === 110,
  JSON.stringify(ins.chains.map((c) => [c.id, c.residues]))
);
check(
  "insulin: Cα count == residue count, coordinates finite, 0 ligands",
  ins.chains[0].ca.length === 110 &&
    ins.ligands === 0 &&
    ins.chains[0].ca.every((p) => p.every((v) => Number.isFinite(v)))
);
const hemoAgain = pdb.parsePdb(hemoText, {
  id: "4HHB",
  name: "Human Deoxyhemoglobin",
  source: "rcsb",
});
check(
  "parser is deterministic (two parses identical)",
  JSON.stringify(hemoAgain) === JSON.stringify(hemo)
);

/* ------------------------------------------------------------------ */
/* B — provenance: index == TS module == files == fresh parse          */
/* ------------------------------------------------------------------ */
console.log("== B. provenance ==");

const indexJson = JSON.parse(
  readFileSync(join(root, "public/structures/INDEX.json"), "utf8")
);
const tsIndex = structureIndex.STRUCTURE_INDEX;
check(
  "INDEX.json and structureIndex.ts carry the same entries",
  JSON.stringify(indexJson) === JSON.stringify(tsIndex)
);
for (const entry of indexJson) {
  const bytes = readFileSync(join(root, "public", entry.file));
  const sha = createHash("sha256").update(bytes).digest("hex");
  check(
    `${entry.id}: SHA-256 in the index == the actual file's hash`,
    sha === entry.sha256,
    `${sha.slice(0, 12)} vs ${entry.sha256.slice(0, 12)}`
  );
  const fresh = pdb.parsePdb(bytes.toString("utf8"), {
    id: entry.id,
    name: entry.name,
    source: entry.source,
  });
  check(
    `${entry.id}: index counts == a fresh parse of the actual file`,
    fresh.totalResidues === entry.totalResidues &&
      fresh.ligands === entry.ligands &&
      JSON.stringify(fresh.chains.map((c) => ({ id: c.id, residues: c.residues }))) ===
        JSON.stringify(entry.chains)
  );
  check(
    `${entry.id}: origin URL + source + fetched date recorded`,
    typeof entry.originUrl === "string" &&
      entry.originUrl.startsWith("https://") &&
      ["rcsb", "alphafold", "node"].includes(entry.source) &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.fetchedDate)
  );
}

/* ------------------------------------------------------------------ */
/* C — the shard mapping                                               */
/* ------------------------------------------------------------------ */
console.log("== C. shard mapping ==");

function verifyMapping(structure, shardCount, label) {
  const ranges = structures.structureShards(structure, shardCount);
  const ranges2 = structures.structureShards(structure, shardCount);
  check(
    `${label} ×${shardCount}: deterministic across two runs`,
    JSON.stringify(ranges) === JSON.stringify(ranges2)
  );
  check(
    `${label} ×${shardCount}: shard ids sequential from 0`,
    ranges.every((r, i) => r.shardId === i)
  );
  // Coverage grid: every residue covered exactly once.
  const grid = new Map(
    structure.chains.map((c) => [c.id, new Array(c.residues).fill(0)])
  );
  let shapeOk = ranges.length > 0;
  for (const r of ranges) {
    const cells = grid.get(r.chainId);
    if (!cells || !(r.start >= 0 && r.end > r.start && r.end <= cells.length)) {
      shapeOk = false;
      break;
    }
    for (let i = r.start; i < r.end; i++) cells[i]++;
  }
  check(
    `${label} ×${shardCount}: every range inside one chain, non-empty`,
    shapeOk
  );
  check(
    `${label} ×${shardCount}: every residue covered exactly once`,
    [...grid.values()].every((cells) => cells.every((v) => v === 1))
  );
  // Contiguity within each chain: sorted ranges tile [0, len).
  let contiguous = true;
  for (const c of structure.chains) {
    const rs = ranges
      .filter((r) => r.chainId === c.id)
      .sort((a, b) => a.start - b.start);
    let next = 0;
    for (const r of rs) {
      if (r.start !== next) contiguous = false;
      next = r.end;
    }
    if (next !== c.residues) contiguous = false;
  }
  check(`${label} ×${shardCount}: ranges tile each chain contiguously`, contiguous);
  return ranges;
}

for (const n of [4, 8, 16]) verifyMapping(hemo, n, "hemoglobin");
for (const n of [1, 4, 11]) verifyMapping(ins, n, "insulin");
const floorRanges = verifyMapping(hemo, 10000, "hemoglobin (floor)");
check(
  "hemoglobin (floor): one residue per shard at the floor",
  floorRanges.length === 574 &&
    floorRanges.every((r) => r.end - r.start === 1),
  `${floorRanges.length} ranges`
);
check(
  "empty cases: shardCount 0 and residueless structure yield []",
  structures.structureShards(hemo, 0).length === 0 &&
    structures.structureShards(
      { id: "x", name: "x", source: "node", chains: [], totalResidues: 0, ligands: 0 },
      4
    ).length === 0
);
// caSliceFor returns exactly the range's slice of the real trace.
{
  const ranges = structures.structureShards(hemo, 8);
  const r = ranges[3];
  const slice = structures.caSliceFor(hemo, r);
  const chain = hemo.chains.find((c) => c.id === r.chainId);
  check(
    "caSliceFor returns exactly the range's target Cα slice",
    slice.length === r.end - r.start &&
      JSON.stringify(slice) === JSON.stringify(chain.ca.slice(r.start, r.end))
  );
  check(
    "caSliceFor on an unknown chain returns []",
    structures.caSliceFor(hemo, { shardId: 0, chainId: "Z", start: 0, end: 1 })
      .length === 0
  );
}

/* ------------------------------------------------------------------ */
/* D — board binding                                                   */
/* ------------------------------------------------------------------ */
console.log("== D. board binding ==");

const defs = engine.buildSeedBounties("host", 0);
check(
  "the seed board carries three jobs",
  defs.length === 3,
  `${defs.length} defs`
);
const hemoDef = defs.find((d) => d.id === engine.STRUCTURE_FOLD_JOB_ID);
const esmDef = defs.find((d) => d.id === engine.NODE_ESMFOLD_JOB_ID);
const roomDef = defs.find((d) => d.id === engine.ROOM_FOLD_JOB_ID);
check(
  "hemoglobin job binds structureId 4HHB and it resolves in the registry",
  hemoDef?.structureId === "4HHB" &&
    structures.bundledStructureMeta(hemoDef.structureId)?.totalResidues === 574
);
check(
  "hemoglobin job work/pool computed from the structure (574 residues)",
  hemoDef?.totalWorkUnits === 574 &&
    Math.abs((hemoDef?.juicePool ?? 0) - 574 / 100) < 1e-9,
  `work=${hemoDef?.totalWorkUnits} pool=${hemoDef?.juicePool}`
);
check(
  "ESMFold insulin job binds AF-P01308 and it resolves in the registry",
  esmDef?.structureId === "AF-P01308" &&
    structures.bundledStructureMeta(esmDef.structureId)?.id === "AF-P01308"
);
check(
  "the LifePacket Room Fold keeps structureId null (Slice 36 job unchanged)",
  roomDef?.structureId === null
);
check(
  "every def's structureId is null or resolves — no invented molecules",
  defs.every(
    (d) =>
      d.structureId === null ||
      structures.bundledStructureMeta(d.structureId) !== null
  )
);
{
  const field = {
    bounties: Object.fromEntries(
      defs.map((d) => [
        d.id,
        { def: d, status: "open", joins: {}, nodeJob: null },
      ])
    ),
    mission: null,
    node: null,
    verifiedWork: {},
  };
  const cards = board.allCardData(field, "host");
  check(
    "card data carries the structure binding through",
    cards.length === 3 &&
      cards.find((c) => c.def.id === hemoDef.id)?.structureId === "4HHB" &&
      cards.find((c) => c.def.id === esmDef.id)?.structureId === "AF-P01308" &&
      cards.find((c) => c.def.id === roomDef.id)?.structureId === null
  );
}

/* ------------------------------------------------------------------ */
/* E — regression battery                                              */
/* ------------------------------------------------------------------ */
console.log("== E. regression battery ==");

// Pre-bundles per the sam/understands runners' own contracts.
await esbuild.build({
  entryPoints: [join(root, "src/sam/samSegment.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "/tmp/samSegment.mjs",
});
await esbuild.build({
  entryPoints: [join(root, "src/ghost/GhostBrain.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "/tmp/GB33.mjs",
});
await esbuild.build({
  entryPoints: [join(root, "src/ghost/GhostPeer.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "/tmp/GP33.mjs",
});

const battery = [
  "genx-check",
  "fabrics-gallery-check",
  "see-acts-check",
  "sam-check",
  "understands-check",
  "senses-check",
  "ghost-tools-check",
  "slice27-check",
  "ui-fixes-check",
];
for (const name of battery) {
  const script = join(root, "scripts", `${name}.mjs`);
  if (!existsSync(script)) {
    check(`regression: ${name}`, false, "script missing");
    continue;
  }
  const args =
    name === "understands-check" ? [script, "/tmp/GB33.mjs", "/tmp/GP33.mjs"] : [script];
  const run = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
  });
  const tail = (run.stdout ?? "")
    .split("\n")
    .filter((l) => /passed|ALL PASS/.test(l))
    .pop();
  check(
    `regression: ${name}${tail ? ` — ${tail.trim()}` : ""}`,
    run.status === 0,
    run.status === 0 ? "" : (run.stdout ?? "").slice(-400)
  );
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
