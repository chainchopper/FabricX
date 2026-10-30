/**
 * fabrics-gallery-check — headless proof for Slice 32 "The Fabrics
 * Gallery".
 *
 * Run: node scripts/fabrics-gallery-check.mjs
 *
 * Proves:
 *   1. FabricThumb EXECUTES: bundled with react / react-native
 *      stubs, every registered fabric id renders its own scene
 *      (fingerprinted by the scene's signature elements — the
 *      piano's 11 white + 7 black keys, the stage's two spotlight
 *      cones, See's SAM box, the fluid's streamlines, Effects'
 *      aperture ring), and an unregistered id renders the generic
 *      fallback with the F glyph.
 *   2. FabricMenu PARSES (esbuild transform) and carries the
 *      gallery: the FabricThumb import, ONE horizontal ScrollView
 *      rail with snap, the editor below the rail.
 *   3. Slice 19's session authority survived the re-presentation
 *      untouched in the source: the guest leave-warning, its
 *      confirm path (divergence noted, follower never yanks
 *      back), the host pick recording, the guest-rules editor —
 *      and the old swelling vertical card stack is gone.
 *   4. Registry coverage: every fabric id in ExperienceContext
 *      has a drawn scene in FabricThumb (no silent fallbacks for
 *      fabrics that actually ship).
 *
 * Powered by Nirvana
 */

import { build, transform } from "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0,
  fail = 0;
const failures = [];
function ok(cond, name, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL ${name} ${extra}`);
  }
}
const read = (p) => readFileSync(join(REPO, p), "utf8");

// ------------------------------------------------------------------
// 1. FabricThumb executes — scenes fingerprinted
// ------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "fabrics-gallery-"));
writeFileSync(
  join(tmp, "react.js"),
  `const React = { createElement: (t, p, ...c) => ({ t, p: p || {}, c: c.flat(9) }) };
   module.exports = React; module.exports.default = React;`
);
writeFileSync(
  join(tmp, "react-native.js"),
  `exports.View = "View"; exports.Text = "Text";`
);
const bundlePath = join(tmp, "thumb.cjs");
await build({
  entryPoints: [join(REPO, "app/components/fabric/FabricThumb.tsx")],
  bundle: true,
  platform: "node",
  format: "cjs",
  jsx: "transform",
  outfile: bundlePath,
  alias: { react: join(tmp, "react.js"), "react-native": join(tmp, "react-native.js") },
  logLevel: "silent",
});
const thumbModule = await import(pathToFileURL(bundlePath));
const FabricThumb = thumbModule.default.default ?? thumbModule.default;

function walk(node, out = []) {
  if (!node || typeof node !== "object") return out;
  // Function components (scenes, Blob, Stream, …) are invoked so
  // the tree holds only host elements ("View" / "Text").
  if (typeof node.t === "function") return walk(node.t({ ...(node.p || {}), children: node.c }), out);
  if (node.t) out.push(node);
  for (const child of node.c || []) walk(child, out);
  return out;
}
const styles = (tree) => tree.map((n) => n.p.style || {});

for (const id of ["default-fluid", "ar-piano", "dancer-stage", "sam-see", "camera-effects"]) {
  const tree = walk(FabricThumb({ layerId: id }));
  ok(tree.length > 12, `${id}: scene renders a real composition`, `(${tree.length} elements)`);
}
{
  const s = styles(walk(FabricThumb({ layerId: "default-fluid" })));
  ok(s.filter((x) => x.height === 3 && x.borderRadius === 2).length >= 3, "fluid: streamlines over the pools");
  ok(!s.some((x) => x.backgroundColor === "#DCE9ED"), "fluid: no piano keys");
}
{
  const s = styles(walk(FabricThumb({ layerId: "ar-piano" })));
  ok(s.filter((x) => x.backgroundColor === "#DCE9ED").length === 11, "piano: 11 white keys");
  ok(s.filter((x) => x.backgroundColor === "#0A0F12").length === 7, "piano: 7 black keys");
}
{
  const s = styles(walk(FabricThumb({ layerId: "dancer-stage" })));
  ok(s.filter((x) => x.borderBottomWidth === 108).length === 2, "stage: two spotlight cones");
  ok(s.some((x) => x.borderRadius === 999 && x.borderWidth === 1), "stage: floor ripple rings");
}
{
  const s = styles(walk(FabricThumb({ layerId: "sam-see" })));
  ok(s.some((x) => x.width === 66 && x.height === 46 && x.borderColor === "#22D3EE"), "see: SAM's box over the found thing");
  ok(s.filter((x) => x.borderTopWidth === 2).length >= 2, "see: viewfinder corners");
}
{
  const s = styles(walk(FabricThumb({ layerId: "camera-effects" })));
  ok(s.some((x) => x.width === 84 && x.borderRadius === 42 && x.borderWidth === 2), "effects: aperture ring");
}
{
  const tree = walk(FabricThumb({ layerId: "some-community-fabric" }));
  const texts = tree.filter((n) => n.t === "Text");
  ok(texts.some((n) => n.c.includes("F")), "generic: unregistered fabric gets the F fallback scene");
}

// ------------------------------------------------------------------
// 2 + 3. FabricMenu: parse, gallery present, authority intact
// ------------------------------------------------------------------
const menu = read("app/components/fabric/FabricMenu.tsx");
await transform(menu, { loader: "tsx" });
ok(true, "FabricMenu.tsx parses (esbuild transform)");
ok(menu.includes(`import FabricThumb, { THUMB_W } from "./FabricThumb";`), "menu imports FabricThumb");
const fabricsAt = menu.indexOf("FABRICS (Slice 19 · gallery Slice 32)");
const peopleAt = menu.indexOf("---------------- PEOPLE", fabricsAt);
const section = menu.slice(fabricsAt, peopleAt);
ok(section.includes("horizontal") && section.includes("snapToInterval={THUMB_W + spacing.md}"), "gallery: one horizontal snapping rail");
ok(section.includes("<FabricThumb layerId={exp.id} />"), "gallery: every card carries its fabric's thumbnail");
ok(section.includes("SESSION"), "gallery: session-fabric chip on the card");
ok(!section.includes("gap: spacing.sm, marginBottom: spacing.sm"), "gallery: the old vertical card stack is gone");
ok(section.indexOf("Editing ${editExp.name}") > section.indexOf("</ScrollView>"), "editor renders BELOW the rail, not inside a card");
ok(menu.includes("const editExp ="), "editor target resolved from the registry (editExp)");
// Session authority — the Slice 19 machinery, verbatim strings:
for (const [needle, name] of [
  ["Leave this session?", "authority: leave-warning banner"],
  ["setLeaveWarn(exp)", "authority: guest pick raises the warning"],
  ["noteFabricDivergence(fabric.layerId)", "authority: confirmed leave notes the divergence"],
  ["setHostFabric(exp.id, rulesFor(exp.id))", "authority: host pick recorded for broadcast"],
  ["FABRIC_RULE_KEYS.map", "authority: guest-rules editor present"],
  ["applyEditField(editExp, field", "authority: editor writes through the same per-layer store path"],
  ["carrySessionRoom", "authority: session room carries across the switch"],
]) {
  ok(menu.includes(needle), name);
}

// ------------------------------------------------------------------
// 4. Registry coverage — every shipped fabric has a drawn scene
// ------------------------------------------------------------------
const registry = read("src/contexts/ExperienceContext.tsx");
const thumb = read("app/components/fabric/FabricThumb.tsx");
const ids = [...registry.matchAll(/id: "([a-z0-9-]+)",\n\s+name:/g)].map((m) => m[1]);
ok(ids.length >= 5, `registry lists ${ids.length} fabrics`, ids.join(","));
for (const id of ids) {
  ok(thumb.includes(`"${id}": () =>`), `scene drawn for ${id}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("FAILURES:", failures.join(" · "));
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
