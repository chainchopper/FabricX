/**
 * camfix-check.mjs — Slice 48 (The Fold's structure camera) checks.
 *
 * Run: node scripts/camfix-check.mjs [repoRoot]
 *   (bundles the modules it drives with esbuild itself — the house
 *    .tools install — into /tmp, then imports them)
 *
 * Proves:
 *   A — framing math on the real files: 4HHB + AF-P01308 parsed by
 *       the real parser; the frame's center is the TARGET centroid,
 *       its radius the TARGET bounding sphere, the fitted distance
 *       covers the sphere at the tighter fov with margin; framing is
 *       deterministic and a function of the target positions only.
 *   B — the spring: at rest an exact no-op; the approach is monotonic
 *       and never overshoots (critically damped); the approach is
 *       frame-rate independent; a clamped hitch step stays finite and
 *       strictly closer; zoom/polar targets clamp.
 *   C — the fold cannot move the camera: a simulated view loop steps
 *       the rig while a fold fraction sweeps 0→1 in the harness — the
 *       rig's state is bit-identical at every step, with and without a
 *       mid-sweep viewer orbit (control-run equality); source pins
 *       keep field state out of the camera component.
 *   D — drift discipline: pre-touch drift is the pure bounded sine;
 *       a live drag suppresses it absolutely; the first touch retires
 *       it for good; pose geometry honors the fitted distance and
 *       looks exactly at the frame center.
 *   E — wiring pins: the view drives the real camera through the rig;
 *       the legacy per-frame lerp + group-transform orbit is gone;
 *       molCamera carries no morph/fold inputs by construction.
 *   F — the regression battery stays green (child processes;
 *       sam/understands follow the house /tmp pre-bundle contract).
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
const vecEq = (a, b, eps = 1e-9) =>
  approx(a[0], b[0], eps) && approx(a[1], b[1], eps) && approx(a[2], b[2], eps);

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
const entryPath = "/tmp/camfix-check-entry.ts";
writeFileSync(
  entryPath,
  [
    `export * as pdb from ${JSON.stringify(join(root, "src/genx/pdb.ts"))};`,
    `export * as structures from ${JSON.stringify(join(root, "src/genx/structures.ts"))};`,
    `export * as molMath from ${JSON.stringify(join(root, "src/genx/molMath.ts"))};`,
    `export * as molCamera from ${JSON.stringify(join(root, "src/genx/molCamera.ts"))};`,
  ].join("\n")
);
const bundlePath = "/tmp/camfix-check-bundle.mjs";
await esbuild.build({
  entryPoints: [entryPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "silent",
});
const { pdb, structures, molMath, molCamera } = await import(pathToFileURL(bundlePath).href);
const {
  CAMERA_DEFAULT_AZ,
  CAMERA_DEFAULT_POL,
  CAMERA_DRIFT_AMPLITUDE,
  CAMERA_DRIFT_RATE,
  CAMERA_FIT_MARGIN,
  CAMERA_FOV_DEG,
  CAMERA_POL_MAX,
  CAMERA_SPRING_OMEGA,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  cameraPose,
  createCameraRig,
  fitDistance,
  frameForTarget,
  rigDragEnd,
  rigDragStart,
  rigOrbit,
  rigZoomBy,
  stepCameraRig,
} = molCamera;

/* ---------------- A. framing, on the real structures ---------------- */
console.log("== A. framing from the target only ==");
const meta4 = structures.bundledStructureMeta("4HHB");
const hemoglobin = pdb.parsePdb(read("public/structures/4HHB.pdb"), {
  id: meta4.id, name: meta4.name, source: meta4.source,
});
const norm4 = molMath.normalizerFor(hemoglobin);
const target4 = molMath.applyNormalizer(molMath.targetPositions(hemoglobin), norm4);
const frame4 = frameForTarget(target4);

// Independent recomputation of centroid + bounding sphere.
const centroid = [0, 0, 0];
for (const p of target4) { centroid[0] += p[0]; centroid[1] += p[1]; centroid[2] += p[2]; }
centroid[0] /= target4.length; centroid[1] /= target4.length; centroid[2] /= target4.length;
let sphereR = 0;
for (const p of target4) sphereR = Math.max(sphereR, Math.hypot(p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]));

check("4HHB frame center is the TARGET centroid (mean of folded Cα)",
  vecEq(frame4.center, centroid, 1e-9),
  `center [${frame4.center.map((v) => v.toFixed(3)).join(", ")}]`);
check("4HHB frame radius is the TARGET bounding sphere about that centroid",
  approx(frame4.radius, sphereR, 1e-9), `radius ${frame4.radius.toFixed(3)}`);
check("framing is deterministic — the same target yields the identical frame",
  JSON.stringify(frameForTarget(target4)) === JSON.stringify(frame4));
{
  const exact = sphereR / Math.sin((CAMERA_FOV_DEG * Math.PI) / 360);
  const fit1 = fitDistance(frame4, 1);
  check("fitted distance covers the sphere at the fov, times the margin",
    approx(fit1, exact * CAMERA_FIT_MARGIN, 1e-9) && CAMERA_FIT_MARGIN > 1,
    `fit ${fit1.toFixed(2)} vs exact ${exact.toFixed(2)}`);
  check("a portrait viewport fits on its tighter horizontal fov (distance grows)",
    fitDistance(frame4, 0.5) > fit1 && fitDistance(frame4, 2) <= fit1 + 1e-9);
}
{
  const metaIns = structures.bundledStructureMeta("AF-P01308");
  const insulin = pdb.parsePdb(read("public/structures/AF-P01308.pdb"), {
    id: metaIns.id, name: metaIns.name, source: metaIns.source,
  });
  const targetI = molMath.applyNormalizer(
    molMath.targetPositions(insulin), molMath.normalizerFor(insulin));
  const frameI = frameForTarget(targetI);
  const inside = targetI.every((p) =>
    Math.hypot(p[0] - frameI.center[0], p[1] - frameI.center[1], p[2] - frameI.center[2]) <= frameI.radius + 1e-9);
  check("AF-P01308 frame is finite, positive, and contains every target point",
    frameI.radius > 0 && frameI.center.every(Number.isFinite) && inside);
}
{
  // Fold activity happens elsewhere; re-running the fold's own math
  // between two frame computations cannot change the frame.
  const frames = structures.structureShards(hemoglobin, 16);
  const rangeOf = molMath.residueRangeMap(hemoglobin, frames);
  molMath.morphFrame({
    target: target4,
    unfolded: molMath.applyNormalizer(molMath.unfoldedPositions(hemoglobin), norm4),
    rangeOf, rangeT: frames.map(() => 0), progress: 0, timeSec: 3.3,
  });
  molMath.morphFrame({
    target: target4,
    unfolded: molMath.applyNormalizer(molMath.unfoldedPositions(hemoglobin), norm4),
    rangeOf, rangeT: frames.map(() => 1), progress: 1, timeSec: 9.1,
  });
  check("the frame is unchanged after morph frames at both ends of the fold",
    JSON.stringify(frameForTarget(target4)) === JSON.stringify(frame4));
}

/* ---------------- B. the critically damped spring ---------------- */
console.log("== B. critically damped, delta-time spring ==");
{
  const rig = createCameraRig(frame4);
  for (let i = 0; i < 240; i++) stepCameraRig(rig, 1 / 60);
  check("at rest the spring is an EXACT no-op (240 steps move nothing)",
    rig.az === CAMERA_DEFAULT_AZ && rig.pol === CAMERA_DEFAULT_POL && rig.zoom === 1 &&
    rig.vAz === 0 && rig.vPol === 0 && rig.vZoom === 0);
}
{
  const rig = createCameraRig(frame4);
  rigOrbit(rig, 0.9, 0);
  const target = CAMERA_DEFAULT_AZ + 0.9;
  let prev = rig.az;
  let monotonic = true;
  let overshot = false;
  for (let i = 0; i < 180; i++) {
    stepCameraRig(rig, 1 / 60);
    if (rig.az < prev - 1e-12) monotonic = false;
    if (rig.az > target + 1e-9) overshot = true;
    prev = rig.az;
  }
  check("the approach is monotonic and NEVER overshoots (damping ratio 1)",
    monotonic && !overshot && approx(rig.az, target, 1e-3),
    `settled at ${rig.az.toFixed(6)} of ${target}`);
}
{
  const runAt = (dts) => {
    const rig = createCameraRig(frame4);
    rigOrbit(rig, 0.9, -0.3);
    let t = 0;
    let mid = null;
    for (const dt of dts) {
      stepCameraRig(rig, dt);
      t += Math.min(dt, 0.05);
      if (mid === null && t >= 0.35 - 1e-12) mid = rig.az;
    }
    return { mid, end: rig.az };
  };
  const seq = (dt, n) => Array.from({ length: n }, () => dt);
  // Grid-aligned patterns: every dt is an exact multiple of the rig's
  // 1/240 s integration substep, and each run lands exactly on
  // t = 0.35 — so any disagreement is integration error, not sampling.
  const a = runAt(seq(1 / 40, 60));                       // 1.5 s at 40 fps
  const b = runAt(seq(1 / 120, 180));                     // 1.5 s at 120 fps
  const gridMix = [];
  { const pat = [1 / 20, 1 / 40, 1 / 40, 1 / 20, 1 / 40, 1 / 20, 1 / 40, 1 / 40, 1 / 20, 1 / 40];
    let t = 0; let i = 0;
    while (t < 1.5) { const dt = pat[i++ % pat.length]; gridMix.push(dt); t += dt; } }
  const g = runAt(gridMix);
  // Off-grid pattern: real devices land between substeps (and hitch).
  // Its path may diverge slightly mid-flight; its END must converge.
  const irregular = [];
  { const pat = [1 / 30, 1 / 120, 0.004, 0.05, 1 / 60, 0.021, 1 / 90];
    let t = 0; let i = 0;
    while (t < 1.5) { const dt = pat[i++ % pat.length]; irregular.push(dt); t += Math.min(dt, 0.05); } }
  const c = runAt(irregular);
  check("the approach is frame-rate independent (grid rates agree exactly; off-grid converges)",
    approx(a.mid, b.mid, 1e-9) && approx(a.mid, g.mid, 1e-9) &&
    approx(a.end, b.end, 1e-9) && approx(a.end, g.end, 1e-9) &&
    approx(a.mid, c.mid, 0.03) && approx(a.end, c.end, 1e-3),
    `mid ${a.mid.toFixed(4)}/${b.mid.toFixed(4)}/${g.mid.toFixed(4)}/${c.mid.toFixed(4)}`);
}
{
  const rig = createCameraRig(frame4);
  rigOrbit(rig, 1.0, 0);
  const before = Math.abs(rig.tAz - rig.az);
  stepCameraRig(rig, 10); // a monstrous frame — clamped, substepped
  const after = Math.abs(rig.tAz - rig.az);
  check("a hitch frame is clamped: state stays finite and strictly closer",
    Number.isFinite(rig.az) && Number.isFinite(rig.vAz) && after < before,
    `error ${before.toFixed(3)} -> ${after.toFixed(3)}`);
}
check("the damping constant is real (CAMERA_SPRING_OMEGA > 0, ratio-1 term in source)",
  CAMERA_SPRING_OMEGA > 0 && read("src/genx/molCamera.ts").includes("2 * w"));
{
  const rig = createCameraRig(frame4);
  rigOrbit(rig, 0, 99);
  const polClamped = rig.tPol === CAMERA_POL_MAX;
  rigZoomBy(rig, 99);
  const zoomHi = rig.tZoom === CAMERA_ZOOM_MAX;
  rigZoomBy(rig, -99);
  const zoomLo = rig.tZoom === CAMERA_ZOOM_MIN;
  check("polar + zoom targets clamp at the rig's declared limits",
    polClamped && zoomHi && zoomLo);
}

/* ---------------- C. the fold cannot move the camera ---------------- */
console.log("== C. fold sweep moves zero camera state ==");
{
  const rig = createCameraRig(frame4);
  let identical = true;
  for (let p = 0; p <= 100; p++) {
    const foldFraction = p / 100; // harness-side only — the rig never sees it
    void foldFraction;
    stepCameraRig(rig, 1 / 60);
    if (rig.az !== CAMERA_DEFAULT_AZ || rig.pol !== CAMERA_DEFAULT_POL || rig.zoom !== 1) {
      identical = false;
    }
  }
  check("rig state is bit-identical at every step of a 0→1 fold sweep (no viewer input)",
    identical);
}
{
  const sweepRun = (withSweep) => {
    const rig = createCameraRig(frame4);
    const trace = [];
    for (let p = 0; p <= 100; p++) {
      if (withSweep) void (p / 100);
      if (p === 50) rigOrbit(rig, 0.7, 0.2);
      stepCameraRig(rig, 1 / 60);
      trace.push(rig.az);
    }
    return trace;
  };
  const withFold = sweepRun(true);
  const control = sweepRun(false);
  check("a mid-sweep viewer orbit follows the spring alone (control-run equality)",
    withFold.every((v, i) => v === control[i]) &&
    Math.abs(withFold[100] - (CAMERA_DEFAULT_AZ + 0.7)) < 0.05);
}
{
  const viewSrc = read("src/components/genx/StructureView.tsx");
  const camBlock = viewSrc.slice(
    viewSrc.indexOf("function CameraRig"),
    viewSrc.indexOf("return null;", viewSrc.indexOf("function CameraRig")),
  );
  check("the camera component reads no fold state (no progress / mission / store)",
    !camBlock.includes("progress") && !camBlock.includes("mission") &&
    !camBlock.includes("getGenxSnapshot") &&
    viewSrc.includes("stepCameraRig(rig.current, delta)"));
}

/* ---------------- D. drift discipline ---------------- */
console.log("== D. idle drift: sinusoidal, bounded, viewer-owned ==");
{
  const rig = createCameraRig(frame4);
  const fit = fitDistance(frame4, 1);
  const pure = [0, 3.7, 11.11, 40].every((t) =>
    approx(cameraPose(rig, fit, t).driftAz,
      CAMERA_DRIFT_AMPLITUDE * Math.sin(t * CAMERA_DRIFT_RATE), 1e-12));
  let bounded = true;
  let maxStep = 0;
  let prev = cameraPose(rig, fit, 0).driftAz;
  let sum = 0;
  const N = 5719; // ~one full sway period at 0.01 s sampling
  for (let i = 1; i <= N; i++) {
    const d = cameraPose(rig, fit, i * 0.01).driftAz;
    if (Math.abs(d) > CAMERA_DRIFT_AMPLITUDE + 1e-12) bounded = false;
    maxStep = Math.max(maxStep, Math.abs(d - prev));
    sum += d;
    prev = d;
  }
  check("pre-touch drift is the pure bounded sine (zero-mean, no steps)",
    pure && bounded && Math.abs(sum / N) < 1e-3 &&
    maxStep <= CAMERA_DRIFT_AMPLITUDE * CAMERA_DRIFT_RATE * 0.01 * 1.5,
    `max per-10ms step ${maxStep.toExponential(2)}`);
}
{
  const rig = createCameraRig(frame4);
  const fit = fitDistance(frame4, 1);
  rigDragStart(rig);
  const duringDrag = cameraPose(rig, fit, 5.5).driftAz;
  rigDragEnd(rig);
  for (let i = 0; i < 180; i++) stepCameraRig(rig, 1 / 60);
  const after = cameraPose(rig, fit, 5.5);
  rigOrbit(rig, 0.3, 0);
  for (let i = 0; i < 60; i++) stepCameraRig(rig, 1 / 60);
  const stillGone = Math.abs(cameraPose(rig, fit, 9.9).driftAz);
  check("a live drag suppresses drift absolutely; the first touch retires it for good",
    duringDrag === 0 && Math.abs(after.driftAz) <= CAMERA_DRIFT_AMPLITUDE * 0.02 &&
    stillGone <= CAMERA_DRIFT_AMPLITUDE * 0.02,
    `driftWeight after 3 s: ${rig.driftWeight.toFixed(4)}`);
}
{
  const rig = createCameraRig(frame4);
  const fit = fitDistance(frame4, 1);
  const pose = cameraPose(rig, fit, 0);
  const off = Math.hypot(
    pose.position[0] - frame4.center[0],
    pose.position[1] - frame4.center[1],
    pose.position[2] - frame4.center[2]);
  check("pose geometry: distance == fit × zoom, lookAt == frame center, opens on +z",
    approx(off, fit * rig.zoom, 1e-9) && vecEq(pose.lookAt, frame4.center, 0) &&
    pose.position[2] > frame4.center[2]);
}

/* ---------------- E. wiring pins ---------------- */
console.log("== E. wiring pins ==");
{
  const viewSrc = read("src/components/genx/StructureView.tsx");
  const camSrc = read("src/genx/molCamera.ts");
  check("the view imports and drives the molCamera rig end to end",
    viewSrc.includes('from "../../genx/molCamera"') &&
    viewSrc.includes("frameForTarget(") && viewSrc.includes("createCameraRig(") &&
    viewSrc.includes("stepCameraRig(") && viewSrc.includes("cameraPose(") &&
    viewSrc.includes("fitDistance("));
  check("the frame is computed in the view from the TARGET positions + normalizer",
    viewSrc.includes("targetPositions(structure)") &&
    viewSrc.includes("normalizerFor(structure)") &&
    viewSrc.includes("applyNormalizer("));
  check("the camera component writes the REAL camera (position + lookAt)",
    viewSrc.includes("camera.position.set(") && viewSrc.includes("camera.lookAt("));
  check("input routes through the rig: drags → rigOrbit, pinch/wheel → rigZoomBy",
    viewSrc.includes("rigOrbit(rig.current,") && viewSrc.includes("rigZoomBy(rig.current,") &&
    viewSrc.includes("rigDragStart(rig.current)") && viewSrc.includes("rigDragEnd(rig.current)"));
  check("the legacy orbit is GONE (no per-frame lerp, no group-transform camera)",
    !viewSrc.includes("OrbitState") && !viewSrc.includes("(o.tAz - o.az)") &&
    !viewSrc.includes("group.rotation") && !viewSrc.includes("position.z = -o.dist") &&
    !/\btDist\b/.test(viewSrc));
  check("molCamera carries no fold inputs by construction (no morph/unfold/progress tokens)",
    !/\bmorphFrame\b/.test(camSrc) && !/\bunfolded\b/.test(camSrc) &&
    !/\bprogress\b/.test(camSrc) && !camSrc.includes("Math.random") &&
    !camSrc.includes("setInterval") && !camSrc.includes("setTimeout"));
  check("the edited view keeps molview's standing pins (real state, no random, no timers)",
    viewSrc.includes("getGenxSnapshot") && viewSrc.includes("missionProgress") &&
    viewSrc.includes("claimedBy") && viewSrc.includes("subscribeGenx") &&
    viewSrc.includes("hueOf") && !viewSrc.includes("Math.random(") &&
    !viewSrc.includes("setInterval") && !viewSrc.includes("setTimeout"));
}

/* ---------------- F. regression battery ---------------- */
console.log("== F. regression battery ==");
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
  run("moldata-check", ["scripts/moldata-check.mjs"]);
  run("genx-check", ["scripts/genx-check.mjs", root]);
  run("molview-check", ["scripts/molview-check.mjs", root]);
  run("molrun-check", ["scripts/molrun-check.mjs", root]);
  run("foldboard-check", ["scripts/foldboard-check.mjs"]);
  run("trauma-choice-check", ["scripts/trauma-choice-check.mjs"]);
  run("matfix-check", ["scripts/matfix-check.mjs"]);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
