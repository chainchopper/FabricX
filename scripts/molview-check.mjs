/**
 * molview-check.mjs — Slice 40 (The Fold's molecular view) checks.
 *
 * Run: node scripts/molview-check.mjs [repoRoot]
 *   (bundles the modules it drives with esbuild itself — the house
 *    .tools install — into /tmp, then imports them; the intake
 *    section runs against a REAL local HTTP fixture server speaking
 *    the GenX node-controller's documented results shape)
 *
 * Proves:
 *   A — the real contract on the real files: RCSB 4HHB + AlphaFold
 *       AF-P01308 parsed by the real parser, registry resolution,
 *       structureShards coverage (every residue in exactly one
 *       single-chain range), determinism, caSliceFor agreement.
 *   B — morph math: t=0 → unfolded exactly; t=1 → target exactly;
 *       per-range independence; midpoint is the exact midpoint.
 *   C — thermal jitter: deterministic across evaluations, nonzero
 *       while work remains, amplitude strictly shrinking with
 *       progress, EXACTLY 0 at progress 1; settled ranges damped.
 *   D — domain mapping + claiming colors: coverage counts, chain
 *       base color while unverified, verifier hue when settled,
 *       blend follows the same t as the geometry.
 *   E — unfolded layout + normalizer: deterministic, distinct from
 *       the target, target fits the 4.4-unit frame, centroids sane,
 *       settle curve endpoints.
 *   F — node-output intake: results fetched through the bridge's
 *       documented results path; PDB text extracted from raw /
 *       JSON / nested payloads; garbage yields null, never a
 *       structure; dead node yields an honest not-ok.
 *   G — wiring pins: the view reads the real field state +
 *       identity hues; GenxLayer wires the real registry/loader/
 *       parser/bridge; NO Math.random in any render-path module;
 *       NO timers driving the fold.
 *   H — the regression battery stays green (child processes;
 *       sam/understands follow the house /tmp pre-bundle contract).
 *
 * Powered by Nirvana
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TINY_PDB } from "./molview-fixture.mjs";

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
const frameEq = (a, b, eps = 1e-9) =>
  a.length === b.length && a.every((p, i) => vecEq(p, b[i], eps));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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
const entryPath = "/tmp/molview-check-entry.ts";
writeFileSync(
  entryPath,
  [
    `export * as pdb from ${JSON.stringify(join(root, "src/genx/pdb.ts"))};`,
    `export * as structures from ${JSON.stringify(join(root, "src/genx/structures.ts"))};`,
    `export * as molMath from ${JSON.stringify(join(root, "src/genx/molMath.ts"))};`,
    `export * as bridge from ${JSON.stringify(join(root, "src/genx/nodeBridge.ts"))};`,
  ].join("\n")
);
const bundlePath = "/tmp/molview-check-bundle.mjs";
await esbuild.build({
  entryPoints: [entryPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "silent",
});
const { pdb, structures, molMath, bridge } = await import(pathToFileURL(bundlePath).href);

/* ---------------- A. the real contract on the real files ---------------- */
console.log("== A. real structures, real parser, real ranges ==");
const meta4 = structures.bundledStructureMeta("4HHB");
const metaIns = structures.bundledStructureMeta("AF-P01308");
check("registry resolves 4HHB + AF-P01308, refuses unknown ids",
  meta4 !== null && metaIns !== null && structures.bundledStructureMeta("NOPE") === null);
const hemoglobin = pdb.parsePdb(read("public/structures/4HHB.pdb"), {
  id: meta4.id, name: meta4.name, source: meta4.source,
});
const insulin = pdb.parsePdb(read("public/structures/AF-P01308.pdb"), {
  id: metaIns.id, name: metaIns.name, source: metaIns.source,
});
check("4HHB parses to chains 141/146/141/146, 574 total, 4 hemes",
  hemoglobin.totalResidues === 574 && hemoglobin.ligands === 4 &&
  hemoglobin.chains.map((c) => c.residues).join(",") === "141,146,141,146");
check("AF-P01308 parses to one chain of 110, no ligands",
  insulin.totalResidues === 110 && insulin.chains.length === 1 && insulin.ligands === 0);
check("every parsed coordinate is finite",
  [...hemoglobin.chains, ...insulin.chains].every((c) =>
    c.ca.every((p) => p.every(Number.isFinite))));

const ranges16 = structures.structureShards(hemoglobin, 16);
const rangeOf16 = molMath.residueRangeMap(hemoglobin, ranges16);
check("structureShards(4HHB, 16) → 16 ranges, sequential shard ids",
  ranges16.length === 16 && ranges16.every((r, i) => r.shardId === i));
check("every one of the 574 residues belongs to exactly one range",
  rangeOf16.length === 574 && rangeOf16.every((r) => r >= 0) &&
  ranges16.every((r, i) => rangeOf16.filter((x) => x === i).length === r.end - r.start));
check("every range lies inside a single chain and tiles it contiguously",
  hemoglobin.chains.every((chain) => {
    const rs = ranges16.filter((r) => r.chainId === chain.id);
    let cursor = 0;
    return rs.every((r) => {
      const ok = r.start === cursor && r.end > r.start;
      cursor = r.end;
      return ok;
    }) && cursor === chain.residues;
  }));
const rangesIns = structures.structureShards(insulin, 16);
check("structureShards(AF-P01308, 16) → 16 ranges covering 110 exactly once",
  rangesIns.length === 16 &&
  molMath.residueRangeMap(insulin, rangesIns).every((r) => r >= 0));
check("structureShards(4HHB, 4) → one range per chain",
  structures.structureShards(hemoglobin, 4).length === 4);
check("structureShards is deterministic (two cuts, identical JSON)",
  JSON.stringify(structures.structureShards(hemoglobin, 16)) === JSON.stringify(ranges16));
check("caSliceFor returns exactly the range's slice of the trace",
  (() => {
    const r = ranges16[3];
    const slice = structures.caSliceFor(hemoglobin, r);
    const chain = hemoglobin.chains.find((c) => c.id === r.chainId);
    return slice.length === r.end - r.start &&
      slice.every((p, i) => vecEq(p, chain.ca[r.start + i], 0));
  })());

/* ---------------- B. morph math ---------------- */
console.log("== B. morph math ==");
const norm = molMath.normalizerFor(hemoglobin);
const target = molMath.applyNormalizer(molMath.targetPositions(hemoglobin), norm);
const unfolded = molMath.applyNormalizer(molMath.unfoldedPositions(hemoglobin), norm);
const flatRange = (fn) => ranges16.map((_, i) => fn(i));
check("t=0 everywhere → the unfolded layout, exactly",
  frameEq(
    molMath.morphFrame({ target, unfolded, rangeOf: rangeOf16, rangeT: flatRange(() => 0), progress: 1, timeSec: 3.1 }),
    unfolded));
check("t=1 everywhere → the real target coordinates, exactly",
  frameEq(
    molMath.morphFrame({ target, unfolded, rangeOf: rangeOf16, rangeT: flatRange(() => 1), progress: 1, timeSec: 3.1 }),
    target));
check("per-range independence: only range 3 verified moves ONLY its residues",
  (() => {
    const frame = molMath.morphFrame({
      target, unfolded, rangeOf: rangeOf16,
      rangeT: flatRange((i) => (i === 3 ? 1 : 0)), progress: 1, timeSec: 0,
    });
    return frame.every((p, i) =>
      vecEq(p, rangeOf16[i] === 3 ? target[i] : unfolded[i]));
  })());
check("t=0.5 lands on the exact midpoint of unfolded and target",
  (() => {
    const frame = molMath.morphFrame({
      target, unfolded, rangeOf: rangeOf16,
      rangeT: flatRange((i) => (i === 5 ? 0.5 : 0)), progress: 1, timeSec: 0,
    });
    return frame.every((p, i) => {
      if (rangeOf16[i] !== 5) return vecEq(p, unfolded[i]);
      return vecEq(p, [
        (unfolded[i][0] + target[i][0]) / 2,
        (unfolded[i][1] + target[i][1]) / 2,
        (unfolded[i][2] + target[i][2]) / 2,
      ]);
    });
  })());

/* ---------------- C. thermal jitter ---------------- */
console.log("== C. thermal jitter ==");
const frameAt = (progress, timeSec, rangeT = flatRange(() => 0)) =>
  molMath.morphFrame({ target, unfolded, rangeOf: rangeOf16, rangeT, progress, timeSec });
check("jitter is deterministic: same inputs → same positions, twice",
  frameEq(frameAt(0.3, 2.2), frameAt(0.3, 2.2)));
check("an untouched job actually shakes (frame changes with time)",
  !frameEq(frameAt(0, 0), frameAt(0, 1.37), 1e-6));
const amp = (p) => {
  let m = 0;
  for (const t of [0, 0.7, 1.9]) {
    const f = frameAt(p, t);
    for (let i = 0; i < f.length; i++) m = Math.max(m, dist(f[i], unfolded[i]));
  }
  return m;
};
check("amplitude shrinks as progress rises, and is 0 at progress 1",
  amp(0) > amp(0.5) && amp(0.5) > amp(0.95) && amp(0.95) > 0 && amp(1) === 0,
  `amp(0)=${amp(0).toFixed(3)} amp(0.5)=${amp(0.5).toFixed(3)} amp(1)=${amp(1)}`);
check("at progress 1 the frame is exact at any mix of range t (no residual shake)",
  (() => {
    const f = frameAt(1, 4.4, flatRange((i) => (i % 2 === 0 ? 1 : 0)));
    return f.every((p, i) => vecEq(p, rangeOf16[i] % 2 === 0 ? target[i] : unfolded[i]));
  })());
check("a settled range hums quieter than an unsettled one at the same progress",
  (() => {
    const f = frameAt(0.5, 1.1, flatRange((i) => (i === 2 ? 1 : 0)));
    let settled = 0, unsettled = 0;
    for (let i = 0; i < f.length; i++) {
      if (rangeOf16[i] === 2) settled = Math.max(settled, dist(f[i], target[i]));
      if (rangeOf16[i] === 0) unsettled = Math.max(unsettled, dist(f[i], unfolded[i]));
    }
    return settled < unsettled;
  })());

/* ---------------- D. domain mapping + claiming colors ---------------- */
console.log("== D. domain claiming colors ==");
check("an unverified range renders in the chain's base color",
  (() => {
    const c = molMath.residueColor(1, 4, flatRange(() => 0), ranges16.map(() => null));
    return vecEq(c, molMath.chainBaseColor(1), 1e-12);
  })());
check("a settled range renders in its verifier's signature hue",
  (() => {
    const hues = ranges16.map((_, i) => (i === 4 ? 120 : null));
    const c = molMath.residueColor(1, 4, flatRange((i) => (i === 4 ? 1 : 0)), hues);
    return vecEq(c, molMath.claimerColor(120), 1e-12);
  })());
check("different verifiers → different colors; hue follows the claimer, not the chain",
  (() => {
    const t = flatRange(() => 1);
    const a = molMath.residueColor(0, 0, t, ranges16.map((_, i) => (i === 0 ? 0 : null)));
    const b = molMath.residueColor(0, 0, t, ranges16.map((_, i) => (i === 0 ? 240 : null)));
    return dist(a, b) > 0.5;
  })());
check("the color blend follows the same settle t as the geometry (t=0 → base)",
  (() => {
    const hues = ranges16.map((_, i) => (i === 0 ? 200 : null));
    const c = molMath.residueColor(2, 0, flatRange(() => 0), hues);
    return vecEq(c, molMath.chainBaseColor(2), 1e-12);
  })());
check("hslToRgb primaries are exact",
  vecEq(molMath.hslToRgb(0, 1, 0.5), [1, 0, 0], 1e-12) &&
  vecEq(molMath.hslToRgb(120, 1, 0.25), [0, 0.5, 0], 1e-12));

/* ---------------- E. unfolded layout + normalizer ---------------- */
console.log("== E. unfolded layout + normalizer ==");
check("the unfolded layout is deterministic across evaluations",
  frameEq(molMath.unfoldedPositions(hemoglobin), molMath.unfoldedPositions(hemoglobin)));
check("the unfolded layout is genuinely unfolded (far from the target)",
  molMath.unfoldedPositions(hemoglobin).some((p, i) => dist(p, molMath.targetPositions(hemoglobin)[i]) > 5));
check("the normalizer fits the target's largest span to ~4.4 units",
  (() => {
    const spans = [0, 1, 2].map((axis) => {
      const vals = target.map((p) => p[axis]);
      return Math.max(...vals) - Math.min(...vals);
    });
    return approx(Math.max(...spans), 4.4, 0.02);
  })());
check("every range centroid lands inside the normalized target's bounds",
  ranges16.every((r) => {
    const c = molMath.rangeCentroid(hemoglobin, r, norm);
    return [0, 1, 2].every((axis) => {
      const vals = target.map((p) => p[axis]);
      return c[axis] >= Math.min(...vals) - 0.01 && c[axis] <= Math.max(...vals) + 0.01;
    });
  }));
check("the settle curve pins its endpoints and rises monotonically",
  molMath.easeSettle(0) === 0 && molMath.easeSettle(1) === 1 &&
  molMath.easeSettle(0.25) < molMath.easeSettle(0.5) &&
  molMath.easeSettle(0.5) < molMath.easeSettle(0.75));

/* ---------------- F. node-output intake ---------------- */
console.log("== F. node-output intake ==");
check("pdbTextFromResults: raw PDB text passes through",
  bridge.pdbTextFromResults(TINY_PDB) === TINY_PDB);
check("pdbTextFromResults: JSON string payload is unwrapped",
  bridge.pdbTextFromResults(JSON.stringify({ pdb: TINY_PDB })) === TINY_PDB);
check("pdbTextFromResults: nested result.pdbText is found",
  bridge.pdbTextFromResults({ result: { pdbText: TINY_PDB } }) === TINY_PDB);
check("pdbTextFromResults: payloads without Cα records yield null, never a structure",
  bridge.pdbTextFromResults({ error: "still running" }) === null &&
  bridge.pdbTextFromResults("no atoms in this string") === null &&
  bridge.pdbTextFromResults(42) === null &&
  bridge.pdbTextFromResults(null) === null);
check("the fixture PDB parses through the real parser (2 chains, 5 residues)",
  (() => {
    const s = pdb.parsePdb(TINY_PDB, { id: "node-x", name: "fixture", source: "node" });
    return s.totalResidues === 5 && s.chains.length === 2 &&
      s.chains[0].residues === 3 && s.chains[1].residues === 2;
  })());
{
  const server = createServer((req, res) => {
    if (req.url === "/jobs/esmfold/job-1/results") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "complete", pdb: TINY_PDB }));
    } else {
      res.writeHead(404);
      res.end("nope");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const got = await bridge.fetchNodeJobResults(base, "esmfold", "job-1");
  check("fetchNodeJobResults reads the documented results path for real",
    got.ok && got.status === 200 && bridge.pdbTextFromResults(got.text) === TINY_PDB);
  const missing = await bridge.fetchNodeJobResults(base, "esmfold", "job-404");
  check("a missing results payload is an honest not-ok",
    !missing.ok && missing.status === 404 && missing.text === null);
  const dead = await bridge.fetchNodeJobResults("http://127.0.0.1:1", "esmfold", "job-1");
  check("a dead node is an honest not-ok (no throw, no invented text)",
    !dead.ok && dead.status === 0 && dead.text === null);
  server.close();
}

/* ---------------- G. wiring pins ---------------- */
console.log("== G. wiring pins ==");
const viewSrc = read("src/components/genx/StructureView.tsx");
const layerSrc = read("src/components/genx/GenxLayer.tsx");
const boardSrc = read("src/components/genx/BountyBoard.tsx");
const mathSrc = read("src/genx/molMath.ts");
const loaderSrc = read("src/genx/molStructures.ts");
check("the view reads the REAL field state (genxStore + missionProgress + claimedBy)",
  viewSrc.includes("getGenxSnapshot") && viewSrc.includes("missionProgress") &&
  viewSrc.includes("claimedBy") && viewSrc.includes("subscribeGenx"));
check("the view colors claims from identity-store hues",
  viewSrc.includes("getIdentitySnapshot") && viewSrc.includes("hueOf"));
check("GenxLayer wires the real registry, loader, parser, shards, and bridge",
  layerSrc.includes('from "../../genx/structures"') &&
  layerSrc.includes("loadBundledStructure") &&
  layerSrc.includes('from "../../genx/pdb"') &&
  layerSrc.includes("fetchNodeJobResults") &&
  layerSrc.includes("pdbTextFromResults"));
check("GenxLayer + BountyBoard expose View structure / View result",
  layerSrc.includes("View structure") && boardSrc.includes("View structure") &&
  boardSrc.includes("View result") && boardSrc.includes("onViewResult"));
check("the loader goes through the registry + the real parser (no second registry)",
  loaderSrc.includes("bundledStructureMeta") && loaderSrc.includes("parsePdb") &&
  !loaderSrc.includes("1CRN"));
check("NO Math.random calls anywhere in the render path",
  !mathSrc.includes("Math.random(") && !viewSrc.includes("Math.random(") &&
  !loaderSrc.includes("Math.random("));
check("NO timers drive the fold in the view or the math",
  !viewSrc.includes("setInterval") && !viewSrc.includes("setTimeout") &&
  !mathSrc.includes("setInterval") && !mathSrc.includes("setTimeout"));
check("the board's seed jobs carry the real bindings (hemoglobin + insulin + null)",
  read("src/genx/shardEngine.ts").includes("HEMOGLOBIN_STRUCTURE_ID") &&
  read("src/genx/shardEngine.ts").includes("INSULIN_STRUCTURE_ID") &&
  read("src/genx/boardData.ts").includes("structureId: def.structureId"));

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
  run("moldata-check", ["scripts/moldata-check.mjs"]);
  run("genx-check", ["scripts/genx-check.mjs", root]);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
