/**
 * genx-check.mjs — Slice 36 ("The Fold") headless checks.
 *
 * Run: node scripts/genx-check.mjs [repoRoot]
 *   (bundles the modules it drives with esbuild itself — the
 *    house .tools install — into /tmp, then imports them; the
 *    bridge section runs against a REAL local HTTP fixture
 *    server speaking the GenX node-controller's documented
 *    response shapes, read from chainchopper/GenX
 *    node-controller/server.js)
 *
 * Proves:
 *   A — registration: the experience, its thumb scene, the
 *       layer mount, the menu settings + probe surface, the
 *       wire family.
 *   B — shard determinism: the same spec computes the same
 *       checksum twice, and inside the assembled Web Worker
 *       source (evaluated under a fake `self`, driven through
 *       the real two-message protocol runShard uses) as on the
 *       direct path.
 *   C — estimates are COMPUTED: ETA = total work / summed
 *       measured room power (null at zero power — rendered
 *       "—"), share previews pro-rata, the Juice pool derived
 *       from total work; a grep guard keeps hardcoded ETAs
 *       out of the genx sources.
 *   D — the field laws: Juice accrues ONLY for verified
 *       shards (a corrupted checksum earns nothing and the
 *       shard re-queues), shares sum to exactly 1, origin law
 *       (only the allocator assigns/verdicts; only the
 *       assignee reports), re-queue + attempt cap, the
 *       allocator's retire word, and order-independence of
 *       the fold for causally-valid interleavings.
 *   E — the ghost's genx sense: sanitized (garbage clamps or
 *       drops), carried by the scenario while fresh, one-shot
 *       transitions consumed exactly once, and the brain's
 *       fold reactions; absent sense = legacy decisions.
 *   F — the node bridge against the fixture: probe reachable,
 *       FAH OFFLINE reads OFFLINE, job submit/status/results
 *       read for real; probe offline on a dead port; probe
 *       blocked when reads are refused but a server answers.
 *   G — the store: Juice settles once per mission from the
 *       verified ledger; follow alerts fire on real progress
 *       milestones for followed jobs.
 *   H — the regression battery stays green (child processes;
 *       sam/understands SKIP with a note when their /tmp
 *       pre-bundles are absent — the house runner contract).
 *
 * Powered by Nirvana
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
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

/* ---------------- bundle the modules under test ---------------- */
const esbuildPath = [
  "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js",
  join(root, "node_modules/esbuild/lib/main.js"),
].find((p) => existsSync(p));
if (!esbuildPath) {
  console.log("FAIL  esbuild not found (house .tools install expected)");
  process.exit(1);
}
const esbuild = await import(pathToFileURL(esbuildPath).href);

const stubPath = "/tmp/genx-check-async-stub.mjs";
writeFileSync(
  stubPath,
  `const m = new Map();
export default {
  getItem: async (k) => (m.has(k) ? m.get(k) : null),
  setItem: async (k, v) => { m.set(k, String(v)); },
  removeItem: async (k) => { m.delete(k); },
  multiGet: async (ks) => ks.map((k) => [k, m.has(k) ? m.get(k) : null]),
  multiSet: async (pairs) => { for (const [k, v] of pairs) m.set(k, String(v)); },
  multiRemove: async (ks) => { for (const k of ks) m.delete(k); },
  getAllKeys: async () => [...m.keys()],
  clear: async () => { m.clear(); },
};`
);
const entryPath = "/tmp/genx-check-entry.ts";
writeFileSync(
  entryPath,
  [
    `export * as life from ${JSON.stringify(join(root, "src/genx/lifeField.ts"))};`,
    `export * as engine from ${JSON.stringify(join(root, "src/genx/shardEngine.ts"))};`,
    `export * as field from ${JSON.stringify(join(root, "src/genx/fieldState.ts"))};`,
    `export * as worker from ${JSON.stringify(join(root, "src/genx/shardWorker.ts"))};`,
    `export * as bridge from ${JSON.stringify(join(root, "src/genx/nodeBridge.ts"))};`,
    `export * as board from ${JSON.stringify(join(root, "src/genx/boardData.ts"))};`,
    `export * as store from ${JSON.stringify(join(root, "src/genx/genxStore.ts"))};`,
    `export * as brain from ${JSON.stringify(join(root, "src/ghost/GhostBrain.ts"))};`,
    `export * as peerMod from ${JSON.stringify(join(root, "src/ghost/GhostPeer.ts"))};`,
  ].join("\n")
);
const bundlePath = "/tmp/genx-check-bundle.mjs";
await esbuild.build({
  entryPoints: [entryPath],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: bundlePath,
  logLevel: "silent",
  alias: { "@react-native-async-storage/async-storage": stubPath },
});
const M = await import(pathToFileURL(bundlePath).href);
const { life, engine, field, worker, bridge, board, store, brain, peerMod } = M;

/* ---------------- A. registration ---------------- */
console.log("== A. registration ==");
{
  const ctx = read("src/contexts/ExperienceContext.tsx");
  check("experience registered", ctx.includes('id: "genx-fold"'));
  check("experience named The Fold", ctx.includes('name: "The Fold"'));
  check("idle contract declared (breathe)", /genx-fold[\s\S]{0,2400}idleBehavior: "breathe"/.test(ctx));
  check("own room + lending default OFF", ctx.includes('roomId: "genx"') && ctx.includes("lendDevice: false"));
  check("type union carries genx-fold", read("src/types/experience.ts").includes('"genx-fold"'));
  const thumb = read("app/components/fabric/FabricThumb.tsx");
  check("gallery thumb scene registered", thumb.includes('"genx-fold": () => <FoldScene />'));
  const fluid = read("src/components/fluid/LegacyFluid.tsx");
  check("layer mounts on the fluid when the Fold is loaded",
    fluid.includes('state.activeExperience?.id === "genx-fold"') && fluid.includes("<GenxLayer"));
  check("ghost sense forwarded from the field store",
    fluid.includes("noteGenx") && fluid.includes("subscribeGenx"));
  const menu = read("app/components/fabric/FabricMenu.tsx");
  check("menu: lend toggle in THIS LAYER", menu.includes("genxAppliesHere") && menu.includes("Lend this device"));
  check("menu: node address field", menu.includes("genxNodeUrl"));
  check("menu: probe verdicts surfaced (reachable/blocked/offline)",
    menu.includes("Probe: reachable") && menu.includes("Probe: blocked") && menu.includes("Probe: offline"));
  const hook = read("src/hooks/useFluidMultiUser.ts");
  check("wire family on the room transport",
    hook.includes('msg.type.startsWith("genx-")') && hook.includes("sendGenx"));
  const room = read("src/genx/useGenxRoom.ts");
  check("allocator verifies by recompute + retires stalled shards",
    room.includes("verifyClaim(") && room.includes("GENX_STALL_MS") && room.includes('"genx-fail"'));
}

/* ---------------- B. shard determinism ---------------- */
console.log("== B. shard determinism ==");
{
  const mission = engine.roomFoldSpec({
    missionId: "m-check", jobId: engine.ROOM_FOLD_JOB_ID,
    allocatorId: "host", seed: 4242, startedAt: 0,
  });
  const spec = engine.tileSpecFor(mission, 5);
  const a = life.computeTile(spec);
  const b = life.computeTile(spec);
  check("same spec → same checksum, twice", a.checksum === b.checksum && a.liveCells === b.liveCells,
    `checksum ${a.checksum}`);
  const other = life.computeTile(engine.tileSpecFor(
    engine.roomFoldSpec({ missionId: "m2", jobId: engine.ROOM_FOLD_JOB_ID, allocatorId: "host", seed: 4243, startedAt: 0 }), 5));
  check("different seed → different field", other.checksum !== a.checksum);
  check("shard work is the spec's own arithmetic",
    engine.shardWorkUnits(mission) === mission.tileW * mission.tileH * mission.generations);

  // The assembled worker source, evaluated under a fake self
  // and driven exactly the way runShard drives a real Worker:
  // first the self-test spec, then the real one.
  const src = worker.buildShardWorkerSource();
  const posted = [];
  const fakeSelf = { postMessage: (m) => posted.push(m), onmessage: null };
  new Function("self", `${src}\nreturn self;`)(fakeSelf);
  check("worker source installs a handler", typeof fakeSelf.onmessage === "function");
  fakeSelf.onmessage({ data: { spec: worker.WORKER_SELF_TEST_SPEC } });
  const stResult = posted.find((m) => m.type === "result");
  check("worker's self-test tile matches the direct computation",
    !!stResult && stResult.checksum === life.computeTile(worker.WORKER_SELF_TEST_SPEC).checksum);
  posted.length = 0;
  fakeSelf.onmessage({ data: { spec } });
  const result = posted.find((m) => m.type === "result");
  const progresses = posted.filter((m) => m.type === "progress");
  check("worker result == direct result", !!result && result.checksum === a.checksum);
  check("worker reports real intermediate progress",
    progresses.length > 0 &&
    progresses.every((p) => p.progress > 0 && p.progress <= 1) &&
    progresses[progresses.length - 1].progress === 1);
  const cps = engine.measureThroughput();
  check("benchmark measures real throughput", cps > 0, `${Math.round(cps).toLocaleString()} cell-steps/s`);
}

/* ---------------- C. estimates are computed ---------------- */
console.log("== C. estimates ==");
const T0 = 1_700_000_000_000;
const seedDefs = engine.buildSeedBounties("host", T0);
const roomDef = seedDefs.find((d) => d.id === engine.ROOM_FOLD_JOB_ID);
const smallSpec = (allocatorId, seed = 99, jobId = engine.ROOM_FOLD_JOB_ID) => ({
  missionId: `mission-${seed}`,
  jobId,
  allocatorId,
  seed,
  fieldW: 48,
  fieldH: 32,
  tileW: 24,
  tileH: 16,
  generations: 60,
  form: "helix",
  startedAt: T0,
});
{
  let f = field.createFieldState();
  f = field.reduceField(f, { kind: "bounty", from: "host", def: roomDef, at: T0 });
  const cold = board.bountyCardData(f, roomDef, "w1");
  check("no measured power → ETA is null (rendered —), never a guess",
    cold !== null && cold.roomPower === 0 && cold.etaSeconds === null && board.fmtEta(null) === "—");
  f = field.reduceField(f, { kind: "join", from: "w1", jobId: roomDef.id, cellsPerSec: 3000, at: T0 });
  f = field.reduceField(f, { kind: "join", from: "w2", jobId: roomDef.id, cellsPerSec: 1000, at: T0 });
  const card = board.bountyCardData(f, roomDef, "w1");
  const totalWork = engine.missionTotalWork(
    engine.roomFoldSpec({ missionId: "t", jobId: roomDef.id, allocatorId: "host", seed: 1, startedAt: T0 }));
  check("the seed card's work figure IS the template's computed work",
    roomDef.totalWorkUnits === totalWork);
  check("room power = the sum of measured benchmarks", card.roomPower === 4000);
  check("ETA = total work / room power, computed",
    card.etaSeconds !== null && approx(card.etaSeconds, totalWork / 4000, 1e-6),
    `${card.etaSeconds?.toFixed(1)}s`);
  check("Juice pool derives from total work",
    approx(roomDef.juicePool ?? 0, totalWork / 1_000_000, 1e-9));
  check("share preview is pro-rata",
    approx(engine.estimatedShare(3000, 4000), 0.75) && approx(card.myShareEstimate, 0.75));
  check("zero-power share preview is 0, not NaN",
    engine.estimatedShare(0, 0) === 0 && engine.estimateEtaSeconds(100, 0) === null);
  check("the node card carries nulls where the truth is the node's",
    seedDefs.find((d) => d.id === engine.NODE_ESMFOLD_JOB_ID).juicePool === null &&
    seedDefs.find((d) => d.id === engine.NODE_ESMFOLD_JOB_ID).framework === "esmfold" &&
    seedDefs.find((d) => d.id === engine.NODE_ESMFOLD_JOB_ID).params.sequence === "GIVEQCCTSICSLYQLENYCN");
  // The grep guard: no hardcoded ETA/pool literals in genx code.
  // Structural, not naive: a literal counts as hardcoded when it
  // sits in property position (`{ ..., etaSeconds: 30 }`) or is
  // directly assigned (`x.juicePool = 12`) — a ternary's `: 0`
  // fallback after a computed expression is not a hardcoded
  // estimate and must not trip the guard.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const sources = [
    "src/genx/boardData.ts", "src/genx/shardEngine.ts", "src/genx/fieldState.ts",
    "src/components/genx/BountyBoard.tsx", "src/components/genx/GenxLayer.tsx",
  ].map((p) => strip(read(p))).join("\n");
  const hardcoded = (src) => {
    const re = /(etaSeconds|juicePool)\s*([:=])\s*\d/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[2] === "=") return true;
      let i = m.index - 1;
      while (i >= 0 && /\s/.test(src[i])) i -= 1;
      if (src[i] === "{" || src[i] === ",") return true;
    }
    return false;
  };
  check("no hardcoded ETA or pool literals in the genx sources", !hardcoded(sources));
  check("the board's numbers flow through the estimators",
    read("src/genx/boardData.ts").includes("estimateEtaSeconds(") &&
    read("src/genx/shardEngine.ts").includes("juicePoolFor("));
}

/* ---------------- D. the field laws ---------------- */
console.log("== D. field laws ==");
function missionField(spec, joins) {
  let f = field.createFieldState();
  f = field.reduceField(f, { kind: "bounty", from: "host", def: roomDef, at: T0 });
  for (const [id, cps] of joins) {
    f = field.reduceField(f, { kind: "join", from: id, jobId: spec.jobId, cellsPerSec: cps, at: T0 });
  }
  const assignments = engine.planAssignments(spec, joins.map(([id, cellsPerSec]) => ({ id, cellsPerSec })));
  f = field.reduceField(f, { kind: "mission", from: spec.allocatorId, spec, assignments, at: T0 });
  return f;
}
const claim = (st, spec, shardId, by, checksumOverride) => {
  const res = life.computeTile(engine.tileSpecFor(spec, shardId));
  return field.reduceField(st, {
    kind: "result", from: by, missionId: spec.missionId, shardId,
    checksum: checksumOverride ?? res.checksum, liveCells: res.liveCells, at: T0,
  });
};
const verdict = (st, spec, shardId, ok, by = "host") =>
  field.reduceField(st, { kind: "verdict", from: by, missionId: spec.missionId, shardId, ok, at: T0 });
{
  const spec = smallSpec("host");
  let f = missionField(spec, [["w1", 3000], ["w2", 1000]]);
  check("mission plans shards across both workers by measured power",
    f.mission.shards.filter((s) => s.assignee === "w1").length === 3 &&
    f.mission.shards.filter((s) => s.assignee === "w2").length === 1 &&
    f.mission.shards.every((s) => s.status === "assigned"));
  f = claim(f, spec, 0, "w1");
  check("a claim binds from the assignee", f.mission.shards[0].status === "claimed");
  const forged = verdict(f, spec, 0, true, "w2");
  check("a verdict from anyone but the allocator is inert",
    forged.mission.shards[0].status === "claimed");
  const stranger = field.reduceField(f, {
    kind: "progress", from: "w1", missionId: spec.missionId, shardId: 1, progress: 0.9, at: T0,
  });
  check("progress from a non-assignee is inert", stranger.mission.shards[1].progress === 0);
  const hijack = field.reduceField(f, {
    kind: "shard", from: "w2", missionId: spec.missionId, shardId: 1, to: "w1", attempt: 2, at: T0,
  });
  check("an assignment from anyone but the allocator is inert",
    hijack.mission.shards[1].assignee === "w2");
  f = verdict(f, spec, 0, true);
  for (const s of [...f.mission.shards]) {
    if (s.status === "verified") continue;
    f = claim(f, spec, s.shardId, s.assignee);
    f = verdict(f, spec, s.shardId, true);
  }
  check("mission completes when every shard verifies", f.mission.status === "complete");
  const pool = engine.juicePoolFor(engine.missionTotalWork(spec));
  const contribs = field.contributionsOf(f.mission, pool);
  check("verified shares sum to exactly 1",
    approx(contribs.reduce((a, c) => a + c.share, 0), 1, 1e-9));
  check("settled Juice == the pool, to the last drop",
    approx(contribs.reduce((a, c) => a + c.juice, 0), pool, 1e-9));
  check("the bigger benchmark earned the bigger share",
    (contribs.find((c) => c.participantId === "w1")?.share ?? 0) === 0.75);
  check("the room ledger records verified work per device",
    f.verifiedWork.w1 === 3 * engine.shardWorkUnits(spec) &&
    f.verifiedWork.w2 === 1 * engine.shardWorkUnits(spec));
}
{
  // A corrupted checksum earns NOTHING and the shard re-queues.
  const spec = smallSpec("host", 7);
  let f = missionField(spec, [["w1", 2000]]);
  const real = life.computeTile(engine.tileSpecFor(spec, 0));
  check("verifyClaim rejects a corrupted checksum",
    engine.verifyClaim(spec, 0, "deadbeef") === false &&
    engine.verifyClaim(spec, 0, real.checksum) === true);
  f = claim(f, spec, 0, "w1", "deadbeef");
  f = verdict(f, spec, 0, false);
  check("failed verification re-queues the shard",
    f.mission.shards[0].status === "queued" && f.mission.shards[0].assignee === null);
  check("unverified work earns zero Juice",
    field.contributionsOf(f.mission, 10).length === 0 && field.missionProgress(f.mission) === 0);
  // Reassign → fail → reassign → fail: the cap retires it.
  for (const attempt of [2, 3]) {
    f = field.reduceField(f, { kind: "shard", from: "host", missionId: spec.missionId, shardId: 0, to: "w1", attempt, at: T0 });
    check(`the allocator can reassign at attempt ${attempt}`,
      f.mission.shards[0].status === "assigned" && f.mission.shards[0].attempt === attempt);
    f = claim(f, spec, 0, "w1", "deadbeef");
    f = verdict(f, spec, 0, false);
  }
  check("the attempt cap retires a hopeless shard as failed",
    f.mission.shards[0].status === "failed");
  // The allocator's retire word (a worker that vanished mid-shard).
  let g = missionField(smallSpec("host", 8), [["w1", 2000]]);
  g = field.reduceField(g, { kind: "fail", from: "host", missionId: g.mission.spec.missionId, shardId: 1, at: T0 });
  check("the allocator can retire a stalled shard outright",
    g.mission.shards[1].status === "failed");
  const forgedFail = field.reduceField(g, { kind: "fail", from: "w1", missionId: g.mission.spec.missionId, shardId: 2, at: T0 });
  check("a retire word from a non-allocator is inert",
    forgedFail.mission.shards[2].status === "assigned");
}
{
  // Order-independence for causally-valid interleavings: shard
  // claim/verdict pairs may interleave across shards in any
  // order; progress and node readings may land anywhere. (A
  // verdict preceding its claim is not a causal interleaving —
  // the allocator speaks only after seeing the claim — and the
  // transport preserves that causality.)
  const spec = smallSpec("host", 21);
  const base = missionField(spec, [["w1", 3000], ["w2", 1000]]);
  const pair = (shardId) => {
    const assignee = base.mission.shards[shardId].assignee;
    const res = life.computeTile(engine.tileSpecFor(spec, shardId));
    return [
      { kind: "progress", from: assignee, missionId: spec.missionId, shardId, progress: 0.5, at: T0 },
      { kind: "result", from: assignee, missionId: spec.missionId, shardId, checksum: res.checksum, liveCells: res.liveCells, at: T0 },
      { kind: "verdict", from: "host", missionId: spec.missionId, shardId, ok: true, at: T0 },
    ];
  };
  const nodeEv = {
    kind: "node", from: "bridge1", at: T0,
    reading: { label: "n", at: T0, reachable: true, fahStatus: "OFFLINE", fahPointsPerDay: 0, fahSlots: [], nodes: 1, queuedTasks: 0, activeTasks: 0, providersInstalled: [], cpuLoadReported: null },
  };
  const runStream = (events) => events.reduce((st, ev) => field.reduceField(st, ev), base);
  const fa = runStream([...pair(0), ...pair(1), nodeEv, ...pair(2), ...pair(3)]);
  const fb = runStream([...pair(3), nodeEv, ...pair(2), ...pair(1), ...pair(0)]);
  check("interleaved causal streams converge to the same field",
    JSON.stringify(fa.mission) === JSON.stringify(fb.mission) && fa.mission.status === "complete");
}

/* ---------------- E. the ghost's genx sense ---------------- */
console.log("== E. ghost sense ==");
{
  const clean = brain.sanitizeGenxContext({
    nodes_online: 9999, field_load: 7, mission_progress: -2,
    shards_done: 3.9, shards_total: 16,
    fold_just_completed: "yes", shard_just_stalled: true,
  });
  check("sanitizer clamps ranges and floors counts",
    clean.nodes_online === 256 && clean.field_load === 1 && clean.mission_progress === 0 &&
    clean.shards_done === 3 && clean.stalled === 0);
  check("one-shots require literal true",
    clean.fold_just_completed === false && clean.shard_just_stalled === true);
  check("garbage in → no sense at all",
    brain.sanitizeGenxContext(null) === null && brain.sanitizeGenxContext("x") === null &&
    brain.sanitizeGenxContext(42) === null && brain.sanitizeGenxContext([1, 2]) === null);

  const scenario = (over = {}) => ({
    temperament: "playful",
    seconds_since_human_touch: 40,
    recent_events: ["quiet room"],
    pets_in_last_5s: 0,
    nearby_splat_intensity: 0.1,
    verbs_seen: [],
    other_ghosts: [],
    room_energy_trend: "steady",
    ghost_identity: { name: "Boop", hue: 210, seed_traits: ["bouncy", "giggly"] },
    ...over,
  });
  const genxBase = {
    nodes_online: 2, field_load: 0.5, mission_progress: 0.5,
    shards_done: 8, shards_total: 16, fah_online: false,
    stalled: 0, fold_just_completed: false, shard_just_stalled: false,
  };
  const done = brain.decideOnDevice(scenario({ genx: { ...genxBase, fold_just_completed: true } }));
  check("a completed fold makes the ghost celebrate",
    done.ruleId === "genx-fold-complete" && done.decision.intent === "play");
  const stalled = brain.decideOnDevice(scenario({ genx: { ...genxBase, stalled: 2, shard_just_stalled: true } }));
  check("a stalled shard makes the ghost investigate",
    stalled.ruleId === "genx-shard-stalled" && stalled.decision.intent === "sniff");
  const legacy = brain.decideOnDevice(scenario());
  check("no genx sense → no genx decision (legacy path untouched)",
    !String(legacy.ruleId).startsWith("genx-"));

  // The peer carries the sense while fresh, consumes one-shots.
  const peer = new peerMod.GhostPeer({
    peerId: "ghost:genx-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: () => {},
    broadcast: () => {},
    ghostName: "Boop",
    getFabricContext: () => null,
    onPerformance: () => {},
  });
  const sense = (stalledCount) => ({
    nodesOnline: 1, fieldLoad: 0.25, missionProgress: 0.25,
    shardsDone: 1, shardsTotal: 4, fahOnline: false, stalled: stalledCount,
  });
  peer.noteGenx(sense(0));
  peer.noteGenx(sense(2));
  const s1 = peer.buildScenario();
  check("peer scenario carries the fresh genx sense + the stall one-shot",
    !!s1.genx && s1.genx.nodes_online === 1 && s1.genx.stalled === 2 &&
    s1.genx.shard_just_stalled === true);
  const s2 = peer.buildScenario();
  check("the stall one-shot is consumed by exactly one scenario",
    !!s2.genx && s2.genx.shard_just_stalled === false && s2.genx.stalled === 2);
  peer.noteGenx(sense(2));
  const s3 = peer.buildScenario(Date.now() + 46_000);
  check("a stale sense is absent, not guessed", s3.genx === undefined);
}

/* ---------------- F. the node bridge (real fixture) ---------------- */
console.log("== F. node bridge ==");
{
  const server = createServer((req, res) => {
    const json = (obj) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.url === "/health") {
      return json({ status: "online", timestamp: Date.now(), providers: { foldingathome: { installed: false, version: null }, colabfold: { installed: true, version: "1.5" } } });
    }
    if (req.url === "/fah/stats") {
      return json({ points: 0, pointsPerDay: 0, slots: [], status: "OFFLINE", lastUpdated: new Date().toISOString() });
    }
    if (req.url === "/tasks/status") {
      return json({ nodes: [{ id: "local-node" }], queuedTasks: 2, activeTasks: 1, stats: { totalNodes: 1, completedTasks: 3, failedTasks: 0 } });
    }
    if (req.url === "/telemetry") {
      return json({ cpu: { load: 42 }, gpu: {}, memory: {}, network: {}, timestamp: Date.now() });
    }
    if (req.url === "/jobs/submit" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        return json(parsed.framework === "noid" ? { status: "queued" } : { jobId: "job-1", status: "submitted" });
      });
      return;
    }
    if (req.url === "/jobs/esmfold/job-1/status") return json({ status: "completed", progress: 100 });
    if (req.url === "/jobs/esmfold/job-1/results") return json({ pdb: "ATOM      1  N   GLY A   1" });
    res.writeHead(404);
    res.end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const probe = await bridge.probeNode(base);
    check("probe: a readable node is REACHABLE", probe.state === "reachable");
    const reading = await bridge.fetchNodeReading(base);
    check("FAH OFFLINE reads OFFLINE — never dressed up",
      reading.reachable === true && reading.fahStatus === "OFFLINE" && reading.fahPointsPerDay === 0);
    check("the reading carries the node's own allocator truth",
      reading.nodes === 1 && reading.queuedTasks === 2 && reading.activeTasks === 1 &&
      reading.providersInstalled.join(",") === "colabfold");
    check("node load rides as node-reported, in its own field",
      reading.cpuLoadReported === 42);
    const submitted = await bridge.submitNodeJob(base, "esmfold", { sequence: "GIVEQCCTSICSLYQLENYCN" });
    check("submit returns the node's own job id",
      submitted.ok === true && submitted.jobId === "job-1");
    const noId = await bridge.submitNodeJob(base, "noid", {});
    check("a submit without a job id is flagged, not invented",
      noId.ok === true && noId.jobId === null);
    const status = await bridge.fetchNodeJobStatus(base, "esmfold", "job-1");
    check("job status is the node's, percent normalized, results checked at terminal",
      status.status === "completed" && status.progress === 1 && status.hasResults === true);
    const dead = await bridge.probeNode("http://127.0.0.1:59998");
    check("probe: a dead port is OFFLINE", dead.state === "offline");
    const blocked = await bridge.probeNode(base, async (url, init) => {
      if (init && init.mode === "no-cors") return { type: "opaque", ok: false };
      throw new TypeError("Failed to fetch");
    });
    check("probe: answered-but-unreadable is BLOCKED (the R1 verdict)",
      blocked.state === "blocked");
    check("node addresses normalize or refuse honestly",
      bridge.sanitizeNodeUrl("192.168.1.5:3005") === "http://192.168.1.5:3005" &&
      bridge.sanitizeNodeUrl("") === null &&
      bridge.sanitizeNodeUrl("http://node.local:3005/") === "http://node.local:3005");
  } finally {
    server.close();
  }
}

/* ---------------- G. the store: settlement + follow alerts ---------------- */
console.log("== G. store settlement ==");
{
  const SMALL_JOB_ID = "bounty-test-small";
  const smallDef = {
    ...roomDef,
    id: SMALL_JOB_ID,
    totalWorkUnits: 48 * 32 * 60,
    juicePool: (48 * 32 * 60) / 1_000_000,
    createdAt: T0,
  };
  const spec = smallSpec("host", 33, SMALL_JOB_ID);
  store.setGenxSelfId("w1");
  store.setGenxFollowed(SMALL_JOB_ID, true);
  const wire = (msg) => store.ingestGenxWire({ from: "host", ...msg });
  wire({ type: "genx-bounty", bounty: smallDef });
  wire({ from: "w1", type: "genx-join", jobId: SMALL_JOB_ID, cellsPerSec: 2000 });
  wire({ from: "w2", type: "genx-join", jobId: SMALL_JOB_ID, cellsPerSec: 2000 });
  const assignments = engine.planAssignments(spec, [
    { id: "w1", cellsPerSec: 2000 },
    { id: "w2", cellsPerSec: 2000 },
  ]);
  wire({ type: "genx-mission", mission: { ...spec, assignments } });
  const snap1 = store.getGenxSnapshot();
  check("the store holds the live mission", snap1.field.mission?.spec.missionId === spec.missionId);
  for (const s of [...snap1.field.mission.shards]) {
    const res = life.computeTile(engine.tileSpecFor(spec, s.shardId));
    wire({ from: s.assignee, type: "genx-result", missionId: spec.missionId, shardId: s.shardId, checksum: res.checksum, liveCells: res.liveCells, ms: 10 });
    wire({ type: "genx-verdict", missionId: spec.missionId, shardId: s.shardId, ok: true });
  }
  const settled = store.getGenxSnapshot();
  check("Juice settles from the verified ledger — my half of the pool",
    settled.field.mission?.status === "complete" &&
    approx(settled.juiceLifetime, smallDef.juicePool / 2, 1e-9),
    `lifetime ${settled.juiceLifetime}`);
  check("following the job produced real progress alerts",
    settled.alerts.some((a) => /passed 50% verified/.test(a.text)) &&
    settled.alerts.some((a) => /fold finished — 4 of 4 shards verified/.test(a.text)));
  // Replay the mission start: settlement must not double-count.
  wire({ type: "genx-mission", mission: { ...spec, assignments } });
  const after = store.getGenxSnapshot();
  check("replayed wire traffic never settles twice",
    approx(after.juiceLifetime, settled.juiceLifetime, 1e-12));
  store.setGenxFollowed(SMALL_JOB_ID, false);
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
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
