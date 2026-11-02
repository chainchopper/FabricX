/**
 * molrun-check.mjs — Slice 41 ("The Fold's structure-mission
 * runner") headless checks.
 *
 * Run: node scripts/molrun-check.mjs [repoRoot]
 *   (bundles the modules it drives with esbuild itself — the
 *    house .tools install — into /tmp, then imports them; the
 *    structures under test are the REAL bundled files, parsed
 *    with the real parser: public/structures/4HHB.pdb and
 *    AF-P01308.pdb, Slice 39's provenance-verified seeds)
 *
 * Proves:
 *   A — the spec: a structure mission spec is built from the
 *       registry's verified metadata alone; its ranges equal
 *       the renderer's cut of the parsed structure, range for
 *       range, on BOTH bundled structures; the reducer builds
 *       mission shards positionally (range i IS shard i) with
 *       per-range residue work; an unresolvable structure id
 *       builds no spec.
 *   B — determinism: the same range relaxed twice gives the
 *       same checksum; across two separate module loads too;
 *       chunked advance == run-to-completion; the assembled
 *       worker source (evaluated under a fake `self`, driven
 *       through the real two-message protocol) reproduces the
 *       direct computation, self-test first.
 *   C — the verify door: a correct claim verifies through
 *       verifyStructureClaim (the allocator's recompute); a
 *       tampered checksum is rejected; another shard's
 *       checksum is rejected; garbage is rejected; a checksum
 *       produced by the WORKER path verifies.
 *   D — the lifecycle, through the real reducer: join →
 *       mission → progress → result → verdict → verified;
 *       contribution shares sum to 1 and Juice splits pro-rata
 *       by verified residues against the def's computed pool;
 *       a rejected claim re-queues clean; a dropped shard is
 *       re-assigned by the allocator's word and can then
 *       verify; an unclaimed shard retires on the allocator's
 *       fail word; origin law holds for structure missions;
 *       a full 16-shard mission completes and settles the
 *       verified ledger at exactly 574.
 *   E — the sanitizers: the structure spec survives the wire
 *       round-trip whole; malformed structure blocks drop the
 *       spec; the bounty def's structureId survives; a tile
 *       spec sanitizes exactly as before (structure: null).
 *   F — LifePacket unchanged: a tile mission runs the standing
 *       flow (computeTile → verifyClaim → verified) against
 *       the edited engine/reducer.
 *   G — wiring pins: the room hook starts structure missions
 *       for structure-bound room-fold jobs only, runs their
 *       shards through the structure runner, and verdicts them
 *       through the structure recompute; the layer's tile
 *       bloom is guarded off for structure missions; the pure
 *       engine carries no randomness, no fetch, no timers.
 *   H — the regression battery stays green (child processes;
 *       sam/understands follow the house /tmp pre-bundle
 *       contract; genx-check must read its full count).
 *
 * Powered by Nirvana
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passes += 1;
  else failures += 1;
};
const read = (rel) => readFileSync(join(root, rel), "utf8");
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const T0 = 1_700_000_000_000;

/* ---------------- bundle the modules under test (twice: A/B loads) ---------------- */
const esbuildPath = [
  "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js",
  join(root, "node_modules/esbuild/lib/main.js"),
].find((p) => existsSync(p));
if (!esbuildPath) {
  console.log("FAIL  esbuild not found (house .tools install expected)");
  process.exit(1);
}
const esbuild = await import(pathToFileURL(esbuildPath).href);

async function buildBundle(tag) {
  const entryPath = `/tmp/molrun-check-entry-${tag}.ts`;
  writeFileSync(
    entryPath,
    [
      `export * as life from ${JSON.stringify(join(root, "src/genx/lifeField.ts"))};`,
      `export * as engine from ${JSON.stringify(join(root, "src/genx/shardEngine.ts"))};`,
      `export * as field from ${JSON.stringify(join(root, "src/genx/fieldState.ts"))};`,
      `export * as pdb from ${JSON.stringify(join(root, "src/genx/pdb.ts"))};`,
      `export * as structures from ${JSON.stringify(join(root, "src/genx/structures.ts"))};`,
      `export * as sengine from ${JSON.stringify(join(root, "src/genx/structureEngine.ts"))};`,
      `export * as sworker from ${JSON.stringify(join(root, "src/genx/structureWorker.ts"))};`,
    ].join("\n")
  );
  const bundlePath = `/tmp/molrun-check-bundle-${tag}.mjs`;
  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: bundlePath,
    logLevel: "silent",
  });
  return import(pathToFileURL(bundlePath).href);
}
const M = await buildBundle("a");
const M2 = await buildBundle("b");
const { life, engine, field, pdb, structures, sengine, sworker } = M;

/* ---------------- the real structures, parsed with the real parser ---------------- */
const hemoText = read("public/structures/4HHB.pdb");
const hemo = pdb.parsePdb(hemoText, { id: "4HHB", name: "Human Deoxyhemoglobin", source: "rcsb" });
const insText = read("public/structures/AF-P01308.pdb");
const insulin = pdb.parsePdb(insText, {
  id: "AF-P01308",
  name: "Human Insulin — AlphaFold prediction (AF-P01308-F1, model v6)",
  source: "alphafold",
});
const hemoMeta = structures.bundledStructureMeta("4HHB");
const hemoSpec = sengine.structureFoldSpec({
  missionId: "molrun-mission",
  jobId: engine.STRUCTURE_FOLD_JOB_ID,
  allocatorId: "host",
  structureId: "4HHB",
  seed: 7,
  startedAt: T0,
  form: "complex",
});
const seedDefs = engine.buildSeedBounties("host", T0);
const hemoDef = seedDefs.find((d) => d.id === engine.STRUCTURE_FOLD_JOB_ID);

/* ---------------- A. the spec ---------------- */
console.log("== A. the spec ==");
{
  check("the bundled hemoglobin parses to the registry's counts",
    hemo.totalResidues === 574 && hemoMeta !== null && hemoMeta.totalResidues === 574);
  check("a structure spec builds from registry metadata alone", hemoSpec !== null);
  check("the spec carries 16 ranges (the Room Fold's shard precedent)",
    hemoSpec.structure.ranges.length === 16,
    `${hemoSpec.structure.ranges.length} ranges`);
  check("relaxSteps derive from the work spec (per-residue × longest range)",
    hemoSpec.structure.relaxSteps ===
      sengine.RELAX_STEPS_PER_RESIDUE *
        Math.max(...hemoSpec.structure.ranges.map((r) => r.end - r.start)),
    `${hemoSpec.structure.relaxSteps} steps`);
  check("the tile geometry is the honest 0 sentinel on a structure spec",
    hemoSpec.fieldW === 0 && hemoSpec.tileW === 0 && hemoSpec.generations === 0);
  const cutParsed = structures.structureShards(hemo, 16).map(
    ({ chainId, start, end }) => ({ chainId, start, end })
  );
  check("spec ranges == the parsed structure's cut, range for range",
    JSON.stringify(hemoSpec.structure.ranges) === JSON.stringify(cutParsed));
  const cutMeta = structures.structureShardsForChains(hemoMeta.chains, 16).map(
    ({ chainId, start, end }) => ({ chainId, start, end })
  );
  check("the chain-length cut == the parsed cut (allocator needs no coordinates)",
    JSON.stringify(cutMeta) === JSON.stringify(cutParsed));
  const insSpec = sengine.structureFoldSpec({
    missionId: "molrun-ins", jobId: "x", allocatorId: "host",
    structureId: "AF-P01308", seed: 1, startedAt: T0, form: "complex",
  });
  const insCut = structures.structureShards(insulin, 16).map(
    ({ chainId, start, end }) => ({ chainId, start, end })
  );
  check("insulin: spec ranges == parsed cut, covering its 110 residues exactly once",
    insSpec !== null &&
      JSON.stringify(insSpec.structure.ranges) === JSON.stringify(insCut) &&
      insSpec.structure.ranges.reduce((a, r) => a + (r.end - r.start), 0) === 110);
  check("an unresolvable structure id builds NO spec (no invented molecule)",
    sengine.structureFoldSpec({
      missionId: "nope", jobId: "x", allocatorId: "host",
      structureId: "9XXX", seed: 1, startedAt: T0, form: "complex",
    }) === null);
  check("the hemoglobin job's posted work IS the mission's total work",
    hemoDef.totalWorkUnits === 574 && engine.missionTotalWork(hemoSpec) === 574 &&
      engine.shardCount(hemoSpec) === 16);

  // Positional contract through the real reducer.
  let f = field.createFieldState();
  f = field.reduceField(f, { kind: "bounty", from: "host", def: hemoDef, at: T0 });
  const assignments = engine.planAssignments(hemoSpec, [
    { id: "host", cellsPerSec: 3000 },
    { id: "w2", cellsPerSec: 1000 },
  ]);
  f = field.reduceField(f, { kind: "mission", from: "host", spec: hemoSpec, assignments, at: T0 });
  check("the reducer builds one shard per range, in range order",
    f.mission.shards.length === 16 &&
      f.mission.shards.every((s, i) => s.shardId === i));
  check("range i IS shard i (Slice 40's positional binding)",
    f.mission.shards.every((s, i) => {
      const r = sengine.rangeForShard(hemoSpec, i);
      return r !== null && s.workUnits === r.end - r.start && s.tileX === 0 && s.tileY === 0;
    }));
  check("assignments deal by measured power (3000:1000 → 12:4 of 16)",
    assignments.filter((a) => a.to === "host").length === 12 &&
      assignments.filter((a) => a.to === "w2").length === 4 &&
      f.mission.shards.filter((s) => s.assignee === "host").length === 12);
  check("a structure mission has no tile targets (the molecule is the visual truth)",
    field.targetsOf(f.mission).length === 0);
  check("the mission marks the bounty running",
    f.bounties[hemoDef.id].status === "running");
}

/* ---------------- B. determinism ---------------- */
console.log("== B. determinism ==");
{
  const a = sengine.computeRangeRelaxation(hemo, hemoSpec, 3);
  const b = sengine.computeRangeRelaxation(hemo, hemoSpec, 3);
  check("the same range relaxed twice → the identical checksum",
    a.checksum === b.checksum && a.residues === 35 && a.stepsRun === hemoSpec.structure.relaxSteps,
    a.checksum);
  const across = M2.sengine.computeRangeRelaxation(
    M2.pdb.parsePdb(hemoText, { id: "4HHB", name: "Human Deoxyhemoglobin", source: "rcsb" }),
    M2.sengine.structureFoldSpec({
      missionId: "molrun-mission", jobId: engine.STRUCTURE_FOLD_JOB_ID,
      allocatorId: "host", structureId: "4HHB", seed: 7, startedAt: T0, form: "complex",
    }),
    3
  );
  check("across two separate module loads → the identical checksum",
    across.checksum === a.checksum);
  const chunked = sengine.createRangeRun(hemo, hemoSpec, 3);
  let guard = 0;
  while (!chunked.done && guard++ < 100000) chunked.advance(37);
  check("chunked advance == run-to-completion (the worker's cadence changes nothing)",
    chunked.result().checksum === a.checksum && chunked.progress === 1);
  const other = sengine.computeRangeRelaxation(hemo, hemoSpec, 4);
  check("a different range → a different checksum", other.checksum !== a.checksum);
  const insA = sengine.computeRangeRelaxation(insulin,
    sengine.structureFoldSpec({
      missionId: "molrun-ins", jobId: "x", allocatorId: "host",
      structureId: "AF-P01308", seed: 1, startedAt: T0, form: "complex",
    }), 0);
  check("the insulin structure relaxes deterministically too",
    insA !== null && insA.residues > 0 &&
      sengine.computeRangeRelaxation(insulin,
        sengine.structureFoldSpec({
          missionId: "molrun-ins", jobId: "x", allocatorId: "host",
          structureId: "AF-P01308", seed: 1, startedAt: T0, form: "complex",
        }), 0).checksum === insA.checksum);

  // The assembled worker source, driven like runStructureShard drives it.
  const src = sworker.buildStructureWorkerSource();
  const posted = [];
  const fakeSelf = { postMessage: (m) => posted.push(m), onmessage: null };
  new Function("self", `${src}\nreturn self;`)(fakeSelf);
  check("worker source installs a handler", typeof fakeSelf.onmessage === "function");
  fakeSelf.onmessage({ data: { input: sworker.STRUCTURE_SELF_TEST_INPUT } });
  const st = sworker.STRUCTURE_SELF_TEST_INPUT;
  const direct = sengine.createRelaxRun(st.start, st.target, st.anchorBefore, st.anchorAfter, st.steps);
  direct.advance(Number.MAX_SAFE_INTEGER);
  const stResult = posted.find((m) => m.type === "result");
  check("the worker's self-test range matches the direct computation",
    !!stResult && stResult.checksum === direct.result().checksum);
  const inputs = sengine.rangeInputs(hemo, sengine.rangeForShard(hemoSpec, 3));
  posted.length = 0;
  fakeSelf.onmessage({
    data: {
      input: {
        start: inputs.start, target: inputs.target,
        anchorBefore: inputs.anchorBefore, anchorAfter: inputs.anchorAfter,
        steps: hemoSpec.structure.relaxSteps,
      },
    },
  });
  const wResult = posted.find((m) => m.type === "result");
  check("the worker's shard 3 == the direct shard 3",
    !!wResult && wResult.checksum === a.checksum && wResult.residues === 35);
  check("the worker reports real intermediate progress",
    posted.filter((m) => m.type === "progress").length > 0);
}

/* ---------------- C. the verify door ---------------- */
console.log("== C. the verify door ==");
{
  const good = sengine.computeRangeRelaxation(hemo, hemoSpec, 3);
  check("a correct claim verifies (the allocator's recompute matches)",
    sengine.verifyStructureClaim(hemo, hemoSpec, 3, good.checksum) === true);
  const tampered = good.checksum.replace(/.$/, (c) => (c === "z" ? "y" : "z"));
  check("a tampered checksum is rejected",
    sengine.verifyStructureClaim(hemo, hemoSpec, 3, tampered) === false);
  const other = sengine.computeRangeRelaxation(hemo, hemoSpec, 4);
  check("another shard's honest checksum is rejected for this shard",
    sengine.verifyStructureClaim(hemo, hemoSpec, 3, other.checksum) === false);
  check("garbage and empty claims are rejected",
    sengine.verifyStructureClaim(hemo, hemoSpec, 3, "not-a-checksum") === false &&
      sengine.verifyStructureClaim(hemo, hemoSpec, 3, "") === false);
  check("a claim about a tile spec / unknown shard verifies as false, never waves through",
    sengine.verifyStructureClaim(hemo, engine.roomFoldSpec({
      missionId: "t", jobId: engine.ROOM_FOLD_JOB_ID, allocatorId: "host", seed: 1, startedAt: T0,
    }), 0, good.checksum) === false &&
      sengine.verifyStructureClaim(hemo, hemoSpec, 99, good.checksum) === false);
}

/* ---------------- D. the lifecycle ---------------- */
console.log("== D. the lifecycle ==");
{
  // Full mission: both workers fold their ranges; every claim
  // passes the recompute door; the mission settles.
  let f = field.createFieldState();
  f = field.reduceField(f, { kind: "bounty", from: "host", def: hemoDef, at: T0 });
  f = field.reduceField(f, { kind: "join", from: "host", jobId: hemoDef.id, cellsPerSec: 3000, at: T0 });
  f = field.reduceField(f, { kind: "join", from: "w2", jobId: hemoDef.id, cellsPerSec: 1000, at: T0 });
  const assignments = engine.planAssignments(hemoSpec, [
    { id: "host", cellsPerSec: 3000 },
    { id: "w2", cellsPerSec: 1000 },
  ]);
  f = field.reduceField(f, { kind: "mission", from: "host", spec: hemoSpec, assignments, at: T0 });
  for (const s of [...f.mission.shards]) {
    const r = sengine.computeRangeRelaxation(hemo, hemoSpec, s.shardId);
    f = field.reduceField(f, {
      kind: "progress", from: s.assignee, missionId: hemoSpec.missionId,
      shardId: s.shardId, progress: 0.5, at: T0 + 1,
    });
    f = field.reduceField(f, {
      kind: "result", from: s.assignee, missionId: hemoSpec.missionId,
      shardId: s.shardId, checksum: r.checksum, liveCells: r.residues, at: T0 + 2,
    });
    const ok = sengine.verifyStructureClaim(hemo, hemoSpec, s.shardId,
      f.mission.shards[s.shardId].checksum);
    f = field.reduceField(f, {
      kind: "verdict", from: "host", missionId: hemoSpec.missionId,
      shardId: s.shardId, ok, at: T0 + 3,
    });
  }
  check("every shard verified through the recompute door",
    f.mission.shards.every((s) => s.status === "verified"));
  check("the mission completes and the bounty completes with it",
    f.mission.status === "complete" && f.bounties[hemoDef.id].status === "complete");
  check("the verified ledger settles at exactly 574 residues",
    (f.verifiedWork.host ?? 0) + (f.verifiedWork.w2 ?? 0) === 574,
    `host ${f.verifiedWork.host}, w2 ${f.verifiedWork.w2}`);
  const contribs = field.contributionsOf(f.mission, hemoDef.juicePool);
  const shareSum = contribs.reduce((a, c) => a + c.share, 0);
  const juiceSum = contribs.reduce((a, c) => a + c.juice, 0);
  check("contribution shares sum to 1",
    approx(shareSum, 1, 1e-12), `sum ${shareSum}`);
  check("Juice splits pro-rata by verified residues against the computed pool",
    approx(juiceSum, hemoDef.juicePool, 1e-9) &&
      contribs.every((c) => approx(c.juice, (c.verifiedWork / 574) * hemoDef.juicePool, 1e-9)),
    `pool ${hemoDef.juicePool}, split ${juiceSum.toFixed(4)}`);
  check("mission progress reads 1 at completion (the view's own number)",
    field.missionProgress(f.mission) === 1);

  // Rejection → re-queue → re-assign → verify; origin law.
  let g = field.createFieldState();
  g = field.reduceField(g, { kind: "bounty", from: "host", def: hemoDef, at: T0 });
  const gAssign = engine.planAssignments(hemoSpec, [
    { id: "host", cellsPerSec: 1000 },
    { id: "w2", cellsPerSec: 1000 },
  ]);
  const forged = field.reduceField(g, { kind: "mission", from: "w2", spec: hemoSpec, assignments: gAssign, at: T0 });
  check("origin law: a mission exists only on its allocator's word",
    forged.mission === null);
  g = field.reduceField(g, { kind: "mission", from: "host", spec: hemoSpec, assignments: gAssign, at: T0 });
  const s0 = g.mission.shards[0];
  const good0 = sengine.computeRangeRelaxation(hemo, hemoSpec, 0);
  const bad0 = good0.checksum.replace(/.$/, (c) => (c === "z" ? "y" : "z"));
  g = field.reduceField(g, {
    kind: "result", from: s0.assignee, missionId: hemoSpec.missionId,
    shardId: 0, checksum: bad0, liveCells: good0.residues, at: T0 + 1,
  });
  check("a claim binds from the assignee and holds the claimed checksum",
    g.mission.shards[0].status === "claimed" && g.mission.shards[0].checksum === bad0);
  const okBad = sengine.verifyStructureClaim(hemo, hemoSpec, 0, g.mission.shards[0].checksum);
  g = field.reduceField(g, {
    kind: "verdict", from: "host", missionId: hemoSpec.missionId, shardId: 0, ok: okBad, at: T0 + 2,
  });
  check("a rejected claim re-queues clean (no checksum, no claimer, no Juice)",
    g.mission.shards[0].status === "queued" &&
      g.mission.shards[0].checksum === null &&
      g.mission.shards[0].claimedBy === null &&
      (g.verifiedWork[s0.assignee] ?? 0) === 0);
  g = field.reduceField(g, {
    kind: "shard", from: "host", missionId: hemoSpec.missionId,
    shardId: 0, to: "host", attempt: 2, at: T0 + 3,
  });
  check("the allocator's word re-assigns the dropped range",
    g.mission.shards[0].status === "assigned" && g.mission.shards[0].assignee === "host" &&
      g.mission.shards[0].attempt === 2);
  g = field.reduceField(g, {
    kind: "result", from: "host", missionId: hemoSpec.missionId,
    shardId: 0, checksum: good0.checksum, liveCells: good0.residues, at: T0 + 4,
  });
  g = field.reduceField(g, {
    kind: "verdict", from: "host", missionId: hemoSpec.missionId, shardId: 0, ok: true, at: T0 + 5,
  });
  check("the re-assigned range verifies on its honest recompute",
    g.mission.shards[0].status === "verified" && g.mission.shards[0].claimedBy === "host");
  const s1 = g.mission.shards[1];
  g = field.reduceField(g, {
    kind: "fail", from: "host", missionId: hemoSpec.missionId, shardId: 1, at: T0 + 6,
  });
  check("an unclaimed shard retires on the allocator's fail word (the drop law)",
    g.mission.shards[1].status === "failed" && s1.status !== "failed");
  const before = g;
  g = field.reduceField(g, {
    kind: "verdict", from: "w2", missionId: hemoSpec.missionId, shardId: 2, ok: true, at: T0 + 7,
  });
  check("origin law: a verdict from anyone but the allocator is inert", g === before);
}

/* ---------------- E. the sanitizers ---------------- */
console.log("== E. the sanitizers ==");
{
  const wire = JSON.parse(JSON.stringify({ ...hemoSpec, assignments: [] }));
  const san = field.sanitizeMissionSpec(wire);
  check("the structure spec survives the wire round-trip whole",
    san !== null && JSON.stringify(san) === JSON.stringify(hemoSpec));
  const bent = (mut) => {
    const c = JSON.parse(JSON.stringify(hemoSpec));
    mut(c.structure);
    return field.sanitizeMissionSpec(c);
  };
  check("a malformed structure block drops the whole spec",
    bent((s) => { s.ranges = []; }) === null &&
      bent((s) => { s.ranges[0].end = s.ranges[0].start; }) === null &&
      bent((s) => { s.ranges[0].chainId = "bad id!"; }) === null &&
      bent((s) => { s.relaxSteps = 0; }) === null &&
      bent((s) => { s.ranges = Array.from({ length: 65 }, () => ({ chainId: "A", start: 0, end: 1 })); }) === null);
  const sanDef = field.sanitizeBountyDef(JSON.parse(JSON.stringify(hemoDef)));
  check("the bounty def's structureId survives the wire",
    sanDef !== null && sanDef.structureId === "4HHB");
  const tileSpec = engine.roomFoldSpec({
    missionId: "t", jobId: engine.ROOM_FOLD_JOB_ID, allocatorId: "host", seed: 1, startedAt: T0,
  });
  const sanTile = field.sanitizeMissionSpec(JSON.parse(JSON.stringify(tileSpec)));
  check("a tile spec sanitizes exactly as before, structure: null",
    sanTile !== null && sanTile.structure === null &&
      sanTile.fieldW === tileSpec.fieldW && sanTile.generations === tileSpec.generations);
}

/* ---------------- F. LifePacket unchanged ---------------- */
console.log("== F. LifePacket unchanged ==");
{
  const spec = engine.roomFoldSpec({
    missionId: "tile-mission", jobId: engine.ROOM_FOLD_JOB_ID,
    allocatorId: "host", seed: 4242, startedAt: T0,
  });
  check("roomFoldSpec carries the tile shape + structure: null",
    spec.structure === null && spec.fieldW === 96 && engine.shardCount(spec) === 16);
  let f = field.createFieldState();
  const roomDef = seedDefs.find((d) => d.id === engine.ROOM_FOLD_JOB_ID);
  f = field.reduceField(f, { kind: "bounty", from: "host", def: roomDef, at: T0 });
  const assignments = engine.planAssignments(spec, [{ id: "host", cellsPerSec: 1000 }]);
  f = field.reduceField(f, { kind: "mission", from: "host", spec, assignments, at: T0 });
  const tile = life.computeTile(engine.tileSpecFor(spec, 0));
  f = field.reduceField(f, {
    kind: "result", from: "host", missionId: spec.missionId, shardId: 0,
    checksum: tile.checksum, liveCells: tile.liveCells, at: T0 + 1,
  });
  f = field.reduceField(f, {
    kind: "verdict", from: "host", missionId: spec.missionId, shardId: 0,
    ok: engine.verifyClaim(spec, 0, tile.checksum), at: T0 + 2,
  });
  check("a tile shard still verifies through verifyClaim, work units untouched",
    f.mission.shards[0].status === "verified" &&
      f.mission.shards[0].workUnits === spec.tileW * spec.tileH * spec.generations &&
      field.targetsOf(f.mission).length > 0);
  const esmDef = seedDefs.find((d) => d.id === engine.NODE_ESMFOLD_JOB_ID);
  check("the ESMFold job stays a node job (its structure binding is view-only)",
    esmDef.kind === "node-job" && esmDef.structureId === "AF-P01308");
}

/* ---------------- G. wiring pins ---------------- */
console.log("== G. wiring pins ==");
{
  const room = read("src/genx/useGenxRoom.ts");
  check("the room hook starts structure missions for structure-bound room-fold jobs",
    room.includes("structureFoldSpec({") && room.includes('bounty.def.kind === "room-fold"') &&
      room.includes("bundledStructureMeta(bounty.def.structureId)"));
  check("the room hook runs structure shards through the structure runner",
    room.includes("runStructureShard(spec, shardId, structure, onProgress)"));
  check("the room hook verdicts structure claims through the structure recompute",
    room.includes("verifyStructureClaim(structure, spec, shardId, claimed)"));
  check("an unloaded structure defers the verdict — it is never guessed",
    room.includes("ensureStructure(spec.structure.structureId)") &&
      room.includes("claim WAITS"));
  const layer = read("src/components/genx/GenxLayer.tsx");
  check("the layer's tile bloom is guarded off for structure missions",
    layer.includes("if (!m.spec.structure)"));
  const eng = read("src/genx/structureEngine.ts");
  check("the pure engine carries no randomness, no fetch, no timers",
    !eng.includes("Math.random") && !eng.includes("fetch(") &&
      !eng.includes("setTimeout") && !eng.includes("setInterval"));
  check("the engine states its own honesty law (a demonstration, not a prediction)",
    eng.includes("NOT a\n * scientific folding prediction") ||
      eng.includes("not a scientific folding prediction"));
}

/* ---------------- H. regression battery ---------------- */
console.log("== H. regression battery ==");
{
  const run = (label, args, prereq) => {
    if (prereq && !existsSync(prereq)) {
      console.log(`SKIP  ${label} — prerequisite ${prereq} not built (house runner contract)`);
      return;
    }
    const r = spawnSync("node", args, { cwd: root, encoding: "utf8", timeout: 300_000 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const failLines = (out.match(/^FAIL /gm) ?? []).length;
    check(`regression: ${label}`, r.status === 0 && failLines === 0,
      r.status !== 0 ? `exit ${r.status}` : `${(out.match(/^PASS /gm) ?? []).length} passes`);
  };
  run("fabrics-gallery-check", ["scripts/fabrics-gallery-check.mjs", root]);
  run("see-acts-check", ["scripts/see-acts-check.mjs"]);
  run("sam-check", ["scripts/sam-check.mjs", "/tmp/samSegment.mjs"], "/tmp/samSegment.mjs");
  run("understands-check", ["scripts/understands-check.mjs", "/tmp/GB33.mjs", "/tmp/GP33.mjs"], "/tmp/GB33.mjs");
  run("senses-check", ["scripts/senses-check.mjs"]);
  run("ghost-tools-check", ["scripts/ghost-tools-check.mjs"]);
  run("slice27-check", ["scripts/slice27-check.mjs"]);
  run("ui-fixes-check", ["scripts/ui-fixes-check.mjs"]);
  run("trauma-choice-check", ["scripts/trauma-choice-check.mjs"]);
  run("moldata-check", ["scripts/moldata-check.mjs"]);
  run("molview-check", ["scripts/molview-check.mjs"]);
  run("genx-check", ["scripts/genx-check.mjs", root]);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
