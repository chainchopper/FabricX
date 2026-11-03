/**
 * vehicle-check.mjs — Slice 54 (The Fold's participant vehicles) checks.
 *
 * Run: node scripts/vehicle-check.mjs [repoRoot]
 *   (bundles the modules it drives with esbuild itself — the house
 *    .tools install — into /tmp, then imports them)
 *
 * Proves:
 *   A — the roster is the verified record, driven through the REAL
 *       reducer on the REAL 4HHB structure mission: no mission →
 *       the local vehicle alone at zero; assignments alone earn
 *       nobody a vehicle; a CLAIM earns nobody a vehicle; the
 *       allocator's verdict is the door — a remote appears at its
 *       first verified shard, a rejected verdict keeps it out;
 *       roster counts equal contributionsOf's, entry for entry
 *       (the same table the bounty board renders).
 *   B — the mobility law: mobilityFor is 0 at zero verified,
 *       strictly rising, saturating below 1; every derived channel
 *       (orbit closeness, speed, bob, excursion, size) moves
 *       monotonically with the verified count and the zero-verified
 *       spec is exactly the edge hover.
 *   C — the pose law on the real parsed 4HHB frame: poses are
 *       deterministic; a zero-verified vehicle holds the edge ring
 *       at every instant (horizontal distance exactly EDGE × R, no
 *       excursion); no pose at any mobility ever enters the
 *       structure's bounding sphere; mean orbit closes with
 *       mobility.
 *   D — identity binding: the pure module carries no hue and no
 *       identity import (a spec is an id + verified counts); the
 *       view resolves vehicle color through the same hueOf the
 *       verifier blooms use, and renders no name labels for
 *       vehicles.
 *   E — the camera is untouched: molCamera carries no vehicle
 *       input; the view still drives the real camera through
 *       Slice 48's rig and mounts Vehicles inside the Canvas.
 *   F — the Fold battery stays green (child processes).
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
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

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
const entryPath = "/tmp/vehicle-check-entry.ts";
writeFileSync(
  entryPath,
  [
    `export * as pdb from ${JSON.stringify(join(root, "src/genx/pdb.ts"))};`,
    `export * as structures from ${JSON.stringify(join(root, "src/genx/structures.ts"))};`,
    `export * as molMath from ${JSON.stringify(join(root, "src/genx/molMath.ts"))};`,
    `export * as molCamera from ${JSON.stringify(join(root, "src/genx/molCamera.ts"))};`,
    `export * as field from ${JSON.stringify(join(root, "src/genx/fieldState.ts"))};`,
    `export * as engine from ${JSON.stringify(join(root, "src/genx/shardEngine.ts"))};`,
    `export * as sengine from ${JSON.stringify(join(root, "src/genx/structureEngine.ts"))};`,
    `export * as vehicle from ${JSON.stringify(join(root, "src/genx/vehicleMath.ts"))};`,
  ].join("\n")
);
const bundlePath = "/tmp/vehicle-check-bundle.mjs";
await esbuild.build({
  entryPoints: [entryPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "silent",
});
const { pdb, structures, molMath, molCamera, field, engine, sengine, vehicle } =
  await import(pathToFileURL(bundlePath).href);

const T0 = 1_700_000_000_000;

/* ---------------- A. the roster is the verified record ---------------- */
console.log("== A. roster from verified state (real reducer, real 4HHB mission) ==");
const SELF = "self-p";
const RA = "remote-a";
const RB = "remote-b";
const spec = sengine.structureFoldSpec({
  missionId: "vehicle-mission",
  jobId: engine.STRUCTURE_FOLD_JOB_ID,
  allocatorId: "host",
  structureId: "4HHB",
  seed: 7,
  startedAt: T0,
  form: "complex",
});
const seedDefs = engine.buildSeedBounties("host", T0);
const hemoDef = seedDefs.find((d) => d.id === engine.STRUCTURE_FOLD_JOB_ID);
const assignments = [
  { shardId: 0, to: SELF, attempt: 1 },
  { shardId: 1, to: SELF, attempt: 1 },
  { shardId: 2, to: SELF, attempt: 1 },
  { shardId: 3, to: RA, attempt: 1 },
  { shardId: 4, to: RB, attempt: 1 },
];
const missionField = () => {
  let f = field.createFieldState();
  f = field.reduceField(f, { kind: "bounty", from: "host", def: hemoDef, at: T0 });
  f = field.reduceField(f, { kind: "mission", from: "host", spec, assignments, at: T0 });
  return f;
};
const claim = (st, shardId, by) =>
  field.reduceField(st, {
    kind: "result", from: by, missionId: spec.missionId, shardId,
    checksum: "cafe0123", liveCells: 10, at: T0,
  });
const verdict = (st, shardId, ok) =>
  field.reduceField(st, {
    kind: "verdict", from: "host", missionId: spec.missionId, shardId, ok, at: T0,
  });
const byId = (roster, id) => roster.find((v) => v.participantId === id);
{
  const empty = field.createFieldState();
  const solo = vehicle.vehiclesOf(empty, SELF);
  check("no mission: the roster is the local vehicle alone",
    solo.length === 1 && solo[0].participantId === SELF && solo[0].isSelf);
  check("no mission: the local vehicle is at zero verified, zero mobility",
    solo[0].verifiedShards === 0 && solo[0].mobility === 0);
  check("no self id and no verified work: the roster is empty",
    vehicle.vehiclesOf(empty, null).length === 0);

  let f = missionField();
  let roster = vehicle.vehiclesOf(f, SELF);
  check("assignments alone earn nobody a vehicle — roster is still self only",
    roster.length === 1 && roster[0].verifiedShards === 0);

  f = claim(f, 3, RA);
  roster = vehicle.vehiclesOf(f, SELF);
  check("a CLAIMED-but-unverified shard earns no vehicle (the claim is not the door)",
    roster.length === 1 && byId(roster, RA) === undefined);
  f = claim(f, 0, SELF);
  roster = vehicle.vehiclesOf(f, SELF);
  check("the local claim likewise buys nothing before the verdict",
    roster[0].verifiedShards === 0 && roster[0].mobility === 0);

  f = verdict(f, 3, true);
  roster = vehicle.vehiclesOf(f, SELF);
  const ra = byId(roster, RA);
  check("the verdict is the door: the remote appears at its first verified shard",
    roster.length === 2 && ra !== undefined && ra.verifiedShards === 1 && !ra.isSelf);
  check("one verified shard buys exactly mobilityFor(1)",
    ra !== undefined && approx(ra.mobility, vehicle.mobilityFor(1), 1e-12));

  f = claim(f, 4, RB);
  f = verdict(f, 4, false);
  roster = vehicle.vehiclesOf(f, SELF);
  check("a REJECTED verdict keeps its claimant out of the field",
    byId(roster, RB) === undefined && roster.length === 2);

  f = verdict(f, 0, true);
  f = claim(f, 1, SELF);
  f = verdict(f, 1, true);
  f = claim(f, 2, SELF);
  f = verdict(f, 2, true);
  roster = vehicle.vehiclesOf(f, SELF);
  const mine = byId(roster, SELF);
  check("three verified shards: the local vehicle carries all three",
    mine !== undefined && mine.verifiedShards === 3 && approx(mine.mobility, 0.5, 1e-12));
  check("mobility orders by verified count: 3 shards move more than 1",
    mine !== undefined && ra !== undefined && mine.mobility > ra.mobility);

  const table = field.contributionsOf(f.mission, null);
  const parity = table.every((c) => {
    const v = byId(roster, c.participantId);
    return v !== undefined && v.verifiedShards === c.verifiedShards && v.verifiedWork === c.verifiedWork;
  }) && roster.every((v) => v.isSelf || table.some((c) => c.participantId === v.participantId));
  check("roster counts equal contributionsOf's, entry for entry (the board's own table)", parity);

  const noSelf = vehicle.vehiclesOf(f, null);
  check("with no local identity, verified remotes still render — and none is marked self",
    noSelf.length === 2 && noSelf.every((v) => !v.isSelf));
}

/* ---------------- B. the mobility law ---------------- */
console.log("== B. mobility law ==");
{
  const m = vehicle.mobilityFor;
  check("mobilityFor(0) is exactly 0", m(0) === 0);
  check("mobilityFor hits the published points (1→¼, 3→½, 9→¾)",
    approx(m(1), 0.25, 1e-12) && approx(m(3), 0.5, 1e-12) && approx(m(9), 0.75, 1e-12));
  let rising = true;
  for (let n = 0; n < 24; n++) if (!(m(n + 1) > m(n))) rising = false;
  check("mobility is strictly rising in the verified count", rising);
  check("mobility saturates below 1 and swallows garbage as 0",
    m(100000) < 1 && m(100000) > 0.9999 && m(-2) === 0 && m(Number.NaN) === 0);

  const s0 = vehicle.vehicleSpecFor("p", true, 0, 0);
  check("the zero-verified spec IS the edge hover (edge factor, no excursion, base drift)",
    s0.orbitRadiusFactor === vehicle.VEHICLE_EDGE_FACTOR &&
    s0.radialExcursion === 0 &&
    approx(Math.abs(s0.angularSpeed), vehicle.VEHICLE_BASE_SPEED, 1e-12) &&
    s0.mobility === 0);
  let mono = true;
  for (let n = 0; n < 20; n++) {
    const a = vehicle.vehicleSpecFor("p", true, n, 0);
    const b = vehicle.vehicleSpecFor("p", true, n + 1, 0);
    if (!(b.orbitRadiusFactor < a.orbitRadiusFactor)) mono = false;
    if (!(Math.abs(b.angularSpeed) > Math.abs(a.angularSpeed))) mono = false;
    if (!(b.bobAmplitude > a.bobAmplitude)) mono = false;
    if (!(b.radialExcursion > a.radialExcursion)) mono = false;
    if (!(b.sizeFactor > a.sizeFactor)) mono = false;
  }
  check("every mobility channel moves monotonically with the verified count", mono);
  const d1 = vehicle.vehicleSpecFor("folder-1", false, 4, 100);
  const d2 = vehicle.vehicleSpecFor("folder-1", false, 4, 100);
  check("specs are deterministic — same participant, same counts, same spec",
    JSON.stringify(d1) === JSON.stringify(d2));
  const other = vehicle.vehicleSpecFor("folder-2", false, 4, 100);
  check("different participants get different phases (no synchronized fleet)",
    d1.phase !== other.phase || d1.lane !== other.lane);
}

/* ---------------- C. the pose law on the real frame ---------------- */
console.log("== C. pose law (real 4HHB frame) ==");
{
  const hemoText = read("public/structures/4HHB.pdb");
  const hemo = pdb.parsePdb(hemoText, { id: "4HHB", name: "Human Deoxyhemoglobin", source: "rcsb" });
  const norm = molMath.normalizerFor(hemo);
  const target = molMath.applyNormalizer(molMath.targetPositions(hemo), norm);
  const frame = molCamera.frameForTarget(target);
  const dist = (p) => Math.hypot(p[0] - frame.center[0], p[1] - frame.center[1], p[2] - frame.center[2]);
  const distXZ = (p) => Math.hypot(p[0] - frame.center[0], p[2] - frame.center[2]);

  const edgeSpec = vehicle.vehicleSpecFor("edge-p", true, 0, 0);
  let edgeOk = true;
  for (const t of [0, 0.5, 7.3, 61.7, 1000]) {
    if (!approx(distXZ(vehicle.vehiclePose(edgeSpec, frame, t)), vehicle.VEHICLE_EDGE_FACTOR * frame.radius, 1e-9)) {
      edgeOk = false;
    }
  }
  check("a zero-verified vehicle holds the edge ring at every instant", edgeOk,
    `ring = ${(vehicle.VEHICLE_EDGE_FACTOR * frame.radius).toFixed(3)}`);

  const p1 = vehicle.vehiclePose(vehicle.vehicleSpecFor("p", true, 3, 30), frame, 3.7);
  const p2 = vehicle.vehiclePose(vehicle.vehicleSpecFor("p", true, 3, 30), frame, 3.7);
  check("poses are deterministic — same spec, same clock, same pose",
    p1[0] === p2[0] && p1[1] === p2[1] && p1[2] === p2[2]);

  let annulus = true;
  let yBound = true;
  for (const n of [0, 1, 3, 9, 40]) {
    const s = vehicle.vehicleSpecFor(`p${n}`, false, n, n * 37);
    for (let t = 0; t <= 120; t += 0.37) {
      const d = dist(vehicle.vehiclePose(s, frame, t));
      if (!(d >= 1.1 * frame.radius && d <= 2.45 * frame.radius)) annulus = false;
      const p = vehicle.vehiclePose(s, frame, t);
      if (Math.abs(p[1] - frame.center[1]) > 0.49 * frame.radius) yBound = false;
    }
  }
  check("no pose at any mobility ever enters the structure's bounding sphere", annulus);
  check("the vertical lane stays a lane (bounded bob about the centroid plane)", yBound);

  const meanFactor = (n) => {
    const s = vehicle.vehicleSpecFor("mean-p", false, n, 0);
    let acc = 0;
    let cnt = 0;
    for (let t = 0; t <= 200; t += 0.5) {
      acc += distXZ(vehicle.vehiclePose(s, frame, t)) / frame.radius;
      cnt += 1;
    }
    return acc / cnt;
  };
  // The closing gaps are the law's own arithmetic: mobility steps
  // 0 → ¼ → ¾ across 0 → 1 → 9 verified shards, over the 1.0-wide
  // EDGE→CLOSE span — gaps of exactly 0.25 and 0.50 orbit factors.
  check("mean orbit closes with mobility: 9 verified orbits inside 1, inside 0",
    meanFactor(9) < meanFactor(1) - 0.4 && meanFactor(1) < meanFactor(0) - 0.2 &&
    approx(meanFactor(0), vehicle.VEHICLE_EDGE_FACTOR, 0.02) &&
    approx(meanFactor(1), 2.05, 0.02) && approx(meanFactor(9), 1.55, 0.02),
    `0→${meanFactor(0).toFixed(2)} 1→${meanFactor(1).toFixed(2)} 9→${meanFactor(9).toFixed(2)}`);
}

/* ---------------- D. identity binding ---------------- */
console.log("== D. identity binding ==");
{
  const vm = strip(read("src/genx/vehicleMath.ts"));
  check("the pure module imports no identity store and names no hue",
    !vm.includes("identityStore") && !/hue/i.test(vm));
  const specKeys = Object.keys(vehicle.vehicleSpecFor("p", true, 2, 20));
  check("a vehicle spec carries an id + verified counts — no color, no name",
    specKeys.includes("participantId") && !specKeys.includes("hue") && !specKeys.includes("name"));
  const view = read("src/components/genx/StructureView.tsx");
  check("the view resolves vehicle color through the verifier hues' own hueOf",
    view.includes("hueOf(spec.participantId)"));
  const vehiclesBlock = view.slice(view.indexOf("function Vehicles"), view.indexOf("export default function StructureView"));
  check("vehicles render label-free (no Text, no names in the vehicle component)",
    vehiclesBlock.length > 0 && !vehiclesBlock.includes("<Text") && !vehiclesBlock.includes("nameOf("));
}

/* ---------------- E. the camera is untouched ---------------- */
console.log("== E. camera + wiring pins ==");
{
  const cam = strip(read("src/genx/molCamera.ts"));
  check("molCamera carries no vehicle input (Slice 48's rig is untouched in kind)",
    !/vehicle/i.test(cam));
  const view = read("src/components/genx/StructureView.tsx");
  check("the view still drives the real camera through the rig",
    view.includes("stepCameraRig") && view.includes("<CameraRig"));
  check("Vehicles mount inside the Canvas, beside the molecule",
    view.includes("<Vehicles frame={frame} />") &&
    view.indexOf("<Vehicles frame={frame} />") > view.indexOf("<Canvas") &&
    view.indexOf("<Vehicles frame={frame} />") < view.indexOf("</Canvas>"));
  check("the roster is read from the genx store's field, fresh in the frame loop",
    view.includes("vehiclesOf(field, identity.self?.id ?? null)"));
}

/* ---------------- F. the Fold battery ---------------- */
console.log("== F. regression battery ==");
{
  const run = (label, args) => {
    const r = spawnSync("node", args, { cwd: root, encoding: "utf8", timeout: 300_000 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const failLines = (out.match(/^FAIL /gm) ?? []).length;
    check(`regression: ${label}`, r.status === 0 && failLines === 0,
      r.status !== 0 ? `exit ${r.status}` : `${(out.match(/^PASS /gm) ?? []).length} passes`);
  };
  run("genx-check", ["scripts/genx-check.mjs", root]);
  run("molview-check", ["scripts/molview-check.mjs", root]);
  run("molrun-check", ["scripts/molrun-check.mjs", root]);
  run("foldboard-check", ["scripts/foldboard-check.mjs"]);
  run("camfix-check", ["scripts/camfix-check.mjs", root]);
}

console.log(`\nvehicle-check: ${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
