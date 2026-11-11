// forge-check — pins Slice A, the Forge fabric.
//
// What Slice A is: a new fabric ("forge") whose ground is a
// 3D scene made of plain data — a 67js agent-scene recipe —
// drawn by the 67js WebGL2 renderer (Renderer67). It follows
// the realignment's own-canvas precedent (Slice 64's See):
// the fabric declares its own canvas kind ("forge67") in
// ExperienceCanvasKind, ExperienceContext registers it, and
// ExperienceRenderer routes on the DECLARATION — never on the
// experience id. The ghost's scene tools are Slice B; this
// check pins the canvas, the routing, the dependency, and the
// two Metro integration pieces the engine needs, plus the
// scene source exercised FOR REAL in Node (the agent-scene
// addon is pure JS): the color helper's math, the starter
// scene's shape, and the revision contract Slice B will drive.
//
// The Metro pieces, pinned so they cannot silently rot:
//   - babel.config.js carries an inline plugin rewriting
//     `import.meta` — Metro's classic bundles cannot parse
//     it, and exactly one 67js chunk (the kernel-offload
//     worker factory) uses it. Without the rewrite the whole
//     bundle is a parse error (proven in the slice's Chrome
//     drive: pageerror "Cannot use 'import.meta' outside a
//     module", nothing ran).
//   - metro.config.js maps the OPTIONAL peer "manifold-3d"
//     to a local stub ONLY when the real package fails to
//     resolve — Metro statically resolves the dynamic import
//     inside 67js's mesh-lod chunk and refuses to bundle
//     without an answer, while the engine itself treats the
//     missing peer as a supported state.
// The bundling proof itself (Metro bundle + headless-Chrome
// render + mutation) lives in ~/workspace/fabric-forge/proof/
// with its output in the slice's build record; this check pins
// the source-level facts that proof rests on.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) {
    pass++;
    console.log("PASS  " + label);
  } else {
    fail++;
    console.log("FAIL  " + label + (detail ? " — " + detail : ""));
  }
}
function near(a, b, eps) {
  return Math.abs(a - b) <= eps;
}
function near3(a, b, eps) {
  return (
    Array.isArray(a) && a.length === 3 && b.every((v, i) => near(a[i], v, eps))
  );
}

const read = (p) => readFileSync(p, "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const types = read("src/types/experience.ts");
const registry = read("src/contexts/ExperienceContext.tsx");
const renderer = read("src/components/experiences/ExperienceRenderer.tsx");
const layer = read("src/components/forge/ForgeLayer.tsx");
const sceneSrc = read("src/components/forge/forgeScene.ts");
const dts = read("src/components/forge/forge67.d.ts");
const metro = read("metro.config.js");
const babelCfg = read("babel.config.js");
const info = read("app/components/fabric/fabricInfo.ts");

/* ---- A. the dependency ---------------------------------------- */

check(
  "A1 package.json carries the 67js alias at the pinned version",
  pkg.dependencies && pkg.dependencies["67js"] === "npm:@codepawlhq/67js@0.17.0",
  JSON.stringify(pkg.dependencies && pkg.dependencies["67js"])
);
const lockEntry = lock.packages && lock.packages["node_modules/67js"];
check(
  "A2 package-lock.json resolves node_modules/67js to @codepawlhq/67js 0.17.0 (npm ci cannot desync)",
  !!lockEntry &&
    lockEntry.version === "0.17.0" &&
    lockEntry.name === "@codepawlhq/67js" &&
    typeof lockEntry.resolved === "string" &&
    lockEntry.resolved.includes("@codepawlhq/67js"),
  lockEntry ? `${lockEntry.name}@${lockEntry.version}` : "no lock entry"
);

/* ---- B. the declaration + the registry entry ------------------- */

check(
  "B1 ExperienceCanvasKind declares the Forge's own kind, \"forge67\"",
  /ExperienceCanvasKind\s*=\s*"fluid" \| "stage3d" \| "camera" \| "forge67"/.test(types)
);
check(
  "B2 ExperienceType declares \"forge\"",
  /\| "forge"\n/.test(types) || types.includes('| "forge"')
);
const forgeSeg = registry.slice(registry.indexOf('id: "forge"'));
check(
  "B3 the registry registers the Forge fabric (id \"forge\", its own room)",
  forgeSeg.startsWith('id: "forge"') &&
    forgeSeg.includes('name: "Forge"') &&
    forgeSeg.includes('roomId: "forge"'),
  forgeSeg.slice(0, 80)
);
check(
  "B4 the Forge entry declares canvas: \"forge67\" and type \"forge\" (the renderer keys on the declaration)",
  forgeSeg.includes('canvas: "forge67"') &&
    forgeSeg.includes('type: "forge" as ExperienceType')
);
check(
  "B5 the Forge entry declares the \"breathe\" idle contract and the honest Slice A capabilities (no midi, no camera, no AR)",
  forgeSeg.includes('idleBehavior: "breathe"') &&
    forgeSeg.includes("midi: false") &&
    forgeSeg.includes("camera: false") &&
    forgeSeg.includes("ar: false")
);
check(
  "B6 the card blurb is the house line — a canvas where your ghostie builds in 3D",
  forgeSeg.includes("A canvas where your ghostie builds in 3D")
);

/* ---- C. the routing -------------------------------------------- */

check(
  "C1 ExperienceRenderer keys the Forge branch on the declared canvas kind",
  renderer.includes('const isForgeCanvas = activeExperience?.canvas === "forge67";')
);
check(
  "C2 the Forge branch mounts ForgeLayer (lazy, with the shared markReady)",
  renderer.includes('import("../forge/ForgeLayer")') &&
    renderer.includes("<ForgeLayerLazy onReady={markReady} />")
);
check(
  "C3 no id-string routing for the Forge anywhere in the renderer (declaration only, the Slice 64 rule)",
  !/activeExperience\?\.id === "forge"/.test(renderer) &&
    !/experienceId === "forge"/.test(renderer)
);

/* ---- D. the layer ---------------------------------------------- */

check(
  "D1 ForgeLayer loads the engine through web-only dynamic imports (no static 67js value import — module evaluation stays engine-free on native)",
  layer.includes('import("67js")') &&
    layer.includes('import("67js/addons/agent-scene")') &&
    !/^import \{[^}]*\} from "67js";/m.test(layer.replace(/import type[^\n]*/g, ""))
);
check(
  "D2 ForgeLayer constructs Renderer67 over the starter scene's parts",
  layer.includes("new Renderer67(canvas, scene.parts, {") &&
    layer.includes("buildForgeStarterScene(agentScene.createAgentScene") &&
    // Slice E amendment: the creation now carries the photo
    // registry as the session's host sequenceFrames map.
    layer.includes("sequenceFrames: getForgePhotoSequenceFrames()")
);
check(
  "D3 ForgeLayer disposes the renderer on unmount and cancels its frame loop",
  layer.includes("renderer?.dispose()") && layer.includes("cancelAnimationFrame(raf)")
);
check(
  "D4 the render loop pauses while the tab is hidden (the camera layers' discipline)",
  layer.includes("document.hidden")
);
check(
  "D5 WebGL2 is probed before construction, and failure lands on the labeled fallback — never a silent blank",
  layer.includes('getContext("webgl2")') &&
    layer.includes("ForgeFallback") &&
    layer.includes("The Forge needs WebGL2")
);
check(
  "D6 the layer is web-only by guard (native gets the labeled panel, not a crash)",
  layer.includes('Platform.OS !== "web"') && layer.includes('Platform.OS !== "web" || failed')
);
check(
  "D7 the scene source declares its own hand-written 67js typings (the package ships none)",
  dts.includes('declare module "67js"') &&
    dts.includes('declare module "67js/addons/agent-scene"') &&
    dts.includes("class Renderer67")
);
check(
  "D8 the scene module is runtime-import-free (types only) — the factory is injected",
  !/^import \{[^}]*\} from "67js/m.test(sceneSrc) &&
    // Slice E amendment: the injected factory's signature
    // widened by the optional host context (limits + host).
    sceneSrc.includes("recipe: AgentSceneRecipe,") &&
    sceneSrc.includes("host?: { sequenceFrames?: Map<string, unknown> }")
);

/* ---- E. the Metro integration pieces ---------------------------- */

check(
  "E1 babel.config.js carries the inline import.meta rewrite (Metro's classic bundles cannot parse it; one 67js chunk uses it)",
  babelCfg.includes("import-meta-for-metro") && babelCfg.includes("MetaProperty")
);
check(
  "E2 metro.config.js maps the optional manifold-3d peer to the local stub ONLY as a resolve fallback (real resolution is tried first — installing the peer makes the mapping dead)",
  metro.includes('moduleName === "manifold-3d"') &&
    metro.includes("return context.resolveRequest(context, moduleName, platform);") &&
    metro.includes("manifold3dStub.js")
);
check(
  "E3 the manifold stub exists and fails honestly (a named error, never a fake mesh)",
  existsSync("src/components/forge/manifold3dStub.js") &&
    read("src/components/forge/manifold3dStub.js").includes("manifold-3d is not installed")
);

/* ---- F. the info panel record ----------------------------------- */

const infoSeg = info.slice(info.indexOf("\n  forge: {"));
check(
  "F1 FABRIC_INFO carries the Forge's record (about / modes / rules / controls, the sibling shape)",
  infoSeg.startsWith("\n  forge: {") &&
    infoSeg.includes("about:") &&
    infoSeg.includes("modes:") &&
    infoSeg.includes("rules:") &&
    infoSeg.includes("controls:")
);
check(
  "F2 the Forge's record states the WebGL2 floor honestly",
  infoSeg.includes("WebGL2")
);

/* ---- G. the scene, exercised for real --------------------------- */

// Bundle forgeScene.ts with the tree's esbuild and run it
// against the tree's real agent-scene in Node.
const tmp = "/tmp/forge-check-scene.mjs";
execFileSync("./node_modules/.bin/esbuild", [
  "src/components/forge/forgeScene.ts",
  "--bundle",
  "--format=esm",
  "--platform=node",
  `--outfile=${tmp}`,
  "--log-level=error",
]);
const sceneMod = await import(tmp);
const { createAgentScene } = createRequire(import.meta.url)("67js/addons/agent-scene");

check(
  "G1 hexToLinear converts the anchors exactly (black, white)",
  near3(sceneMod.hexToLinear("#000000"), [0, 0, 0], 1e-9) &&
    near3(sceneMod.hexToLinear("#ffffff"), [1, 1, 1], 1e-9)
);
check(
  "G2 hexToLinear follows the sRGB curve (mid-gray is ~0.2159 linear, not 0.5)",
  near3(sceneMod.hexToLinear("#808080"), [0.215861, 0.215861, 0.215861], 1e-3)
);
check(
  "G3 hexToLinear converts the palette true (coral #e2492f, teal #0e7c86 — the ACES-pastel trap stays shut)",
  near3(sceneMod.hexToLinear("#e2492f"), [0.760525, 0.066626, 0.028426], 1e-3) &&
    near3(sceneMod.hexToLinear("#0e7c86"), [0.004391, 0.201556, 0.238398], 1e-3)
);

const scene = sceneMod.buildForgeStarterScene(createAgentScene);
check(
  "G4 the starter scene builds: five retained parts, named for their nodes",
  scene.parts.length === 5 &&
    scene.parts.map((p) => p.name).join(",") ===
      "floor-node,cube-node,ball-node,post-node,ring-node",
  scene.parts.map((p) => p.name).join(",")
);
check(
  "G5 the starter scene carries its authored camera and a normalized studio environment",
  scene.camera.eye.join(",") === "4.2,3,5.6" &&
    Array.isArray(scene.environment.lightDirection)
);
const tealPart = scene.parts.find((p) => p.name === "ball-node");
check(
  "G6 the scene's materials are the converted palette (the ball's teal is linear, not raw sRGB)",
  !!tealPart && near3(tealPart.material.color, [0.004391, 0.201556, 0.238398], 1e-3),
  tealPart ? JSON.stringify(tealPart.material.color) : "no ball part"
);
const rev0 = scene.revision;
scene.apply(
  [{ type: "set-node", id: "ball-node", translation: [0.8, 1.6, 0.6] }],
  { expectedRevision: rev0 }
);
check(
  "G7 the revision contract works: a checked apply lands and advances the revision (Slice B's door)",
  scene.revision === rev0 + 1
);
let staleThrew = false;
try {
  scene.apply(
    [{ type: "set-node", id: "ball-node", translation: [0, 0, 0] }],
    { expectedRevision: rev0 }
  );
} catch {
  staleThrew = true;
}
check(
  "G8 a stale-revision apply is refused (the contract is enforced, not decorative)",
  staleThrew && scene.revision === rev0 + 1
);

console.log(`\nforge-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
