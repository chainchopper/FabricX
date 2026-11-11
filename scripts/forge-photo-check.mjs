// forge-photo-check — pins Slice E, photo into the Forge scene.
//
// What Slice E is: a photo the user picks becomes REAL scene
// content on the Forge, two ways. THE PRINT: the photo is the
// material map of a standing slab at the photo's true aspect —
// through the engine's one image route, the sequence map
// (docs/agent-scene.md), with the app as the decoding host:
// the scene session is created with forgePhoto's registry as
// its host sequenceFrames map (the session's third argument),
// the picked photo is decoded in-page and registered under
// the SHA-256 of its pixels, and a two-frame sequence of the
// same image at 1 fps makes the still. THE MOSAIC: the photo
// downsampled in-page (box averages over a cover-fit crop),
// quantized to a bounded palette, and rebuilt as a grid of
// colored blocks standing on a backing slab — ONE ops batch
// through the performer's revision-checked path. Both wear
// photo-* ids (legal under the ghost's node-id law, so the
// ghost's tools can move them), both appear in the scene
// sense, and Clear removes exactly them.
//
// This check drives the REAL modules: forgePhoto + forgeScene
// + forgePerformer + forgeSceneSummary + GhostBrain bundled
// as ONE graph by the tree's esbuild (so the registry the
// check registers into is the registry the builders read),
// and the tree's real agent-scene addon for every scene act.
// The renderer at the seam's far side is a recording double —
// the renderer's contract is the part sync + render(view),
// and its real acceptance of a mapped part is proven against
// the real Renderer67 by Slice E's browser proof
// (~/workspace/fabric-forge/proof-e/). The fixture image is
// generated in-check: four flat-color quadrants, so every
// expected color is known EXACTLY.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

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
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const near3 = (a, b, eps) =>
  Array.isArray(a) && a.length === 3 && b.every((v, i) => Math.abs(a[i] - v) <= eps);

const read = (p) => readFileSync(p, "utf8");
const layerSrc = read("src/components/forge/ForgeLayer.tsx");
const photoSrc = read("src/components/forge/forgePhoto.ts");
const sceneSrc = read("src/components/forge/forgeScene.ts");
const typesSrc = read("src/components/forge/forge67.d.ts");

/* ---- bundles ---------------------------------------------------- */

const esbuild = "./node_modules/.bin/esbuild";
function bundle(entry, out) {
  execFileSync(esbuild, [
    entry,
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${out}`,
    "--log-level=error",
  ]);
}
const entryPath = "/tmp/forge-photo-entry.ts";
const { writeFileSync } = await import("node:fs");
writeFileSync(
  entryPath,
  [
    `export * from ${JSON.stringify(process.cwd() + "/src/ghost/GhostBrain.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePhoto.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeScene.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePerformer.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeSceneSummary.ts")};`,
  ].join("\n")
);
bundle(entryPath, "/tmp/forge-photo-FP.mjs");
const fp = await import("/tmp/forge-photo-FP.mjs");
const agentScene = createRequire(import.meta.url)("67js/addons/agent-scene");
const { createAgentScene, loadAgentSceneModules, agentSceneModulesNeeded, allAgentSceneModulesLoaded } = agentScene;

/* ---- the fixture: four flat quadrants, known exactly -------------- */

function quadrantImage(w = 8, h = 4) {
  const data = new Uint8ClampedArray(w * h * 4);
  const paint = (x, y, r, g, b) => {
    const i = (y * w + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < w / 2 && y < h / 2) paint(x, y, 255, 0, 0);
      else if (x >= w / 2 && y < h / 2) paint(x, y, 0, 255, 0);
      else if (x < w / 2) paint(x, y, 0, 0, 255);
      else paint(x, y, 255, 255, 0);
    }
  }
  return { width: w, height: h, data };
}
const fixture = quadrantImage();
const fixtureId = createHash("sha256")
  .update(Buffer.from(fixture.data))
  .digest("hex");

const recordingRenderer = () => {
  const calls = { updateParts: [], replaceParts: [], render: [] };
  return {
    calls,
    updateParts(parts) {
      calls.updateParts.push(parts);
    },
    replaceParts(parts) {
      calls.replaceParts.push(parts);
    },
    render(view) {
      calls.render.push(view);
    },
  };
};
const handleFor = (scene, renderer) => ({
  scene,
  renderer,
  refreshCamera: () => {},
});
const nodeOf = (scene, id) => scene.exportRecipe().nodes.find((n) => n.id === id);
const materialOf = (scene, id) =>
  scene.exportRecipe().materials.find((m) => m.id === id);
const partOf = (scene, id) => scene.parts.find((p) => p.name === id);

/* ---- P0. source pins ---------------------------------------------- */

check(
  "P0 the layer creates its scene with the photo registry as the host sequenceFrames map",
  layerSrc.includes("sequenceFrames: getForgePhotoSequenceFrames()") &&
    sceneSrc.includes("host") &&
    sceneSrc.includes("createScene(forgeStarterRecipe(), undefined, host)")
);
check(
  "P0 the layer's photo flow is the platform picker + in-page decode + content-id registration",
  layerSrc.includes('document.createElement("input")') &&
    layerSrc.includes('input.accept = "image/*"') &&
    layerSrc.includes("createImageBitmap") &&
    layerSrc.includes('crypto.subtle.digest("SHA-256"') &&
    layerSrc.includes("registerForgePhotoImage(assetId, image)") &&
    layerSrc.includes("FORGE_PHOTO_TEXTURE_MAX_EDGE")
);
check(
  "P0 the assets module loads in exactly one place — the layer's print flow (Slice A discipline)",
  (layerSrc.match(/loadAgentSceneModules/g) || []).length === 1 &&
    !photoSrc.includes("loadAgentSceneModules") &&
    layerSrc.includes("Add a photo — as a print") &&
    layerSrc.includes("Add a photo — as blocks") &&
    layerSrc.includes("Clear photos")
);
check(
  "P0 the print flow imports the renderer's textured-parts addon before performing (the engine's sync law)",
  (layerSrc.match(/import\("67js\/addons\/replace-textured-parts"\)/g) || [])
    .length === 1 &&
    layerSrc.indexOf('import("67js/addons/replace-textured-parts")') <
      layerSrc.indexOf('performForgeOps(build.ops, handle, "photo print")') &&
    typesSrc.includes('declare module "67js/addons/replace-textured-parts"')
);
check(
  "P0 the layer's module load carries the print's sheet geometry as well as its mapped material",
  layerSrc.includes("geometries: [sheet.geometry]") &&
    photoSrc.includes('type: "plane"') &&
    photoSrc.includes("FORGE_PHOTO_SHEET_GEOMETRY_ID")
);
check(
  "P0 forgePhoto is pure data: no runtime 67js import, no loader, colors via hexToLinear",
  !/from\s+"67js/.test(photoSrc) &&
    !photoSrc.includes("loadAgentSceneModules") &&
    photoSrc.includes("hexToLinear")
);
check(
  "P0 the type declarations carry the host-context factory + sequenceTextures",
  typesSrc.includes("sequenceTextures()") &&
    typesSrc.includes("sequenceFrames?: Map<string, unknown>")
);

/* ---- P1. decode math, exact on known colors ------------------------ */

{
  const cells = fp.downsampleForgePhoto(fixture, 2, 2);
  check(
    "P1 a 2x2 downsample of the quadrant fixture is exactly its four colors, top row first",
    JSON.stringify(cells) ===
      JSON.stringify(["#ff0000", "#00ff00", "#0000ff", "#ffff00"]),
    JSON.stringify(cells)
  );
  const cells4 = fp.downsampleForgePhoto(fixture, 4, 4);
  check(
    "P1 a 4x4 downsample keeps every quadrant corner exact",
    cells4[0] === "#ff0000" &&
      cells4[3] === "#00ff00" &&
      cells4[12] === "#0000ff" &&
      cells4[15] === "#ffff00",
    JSON.stringify(cells4)
  );
  const bw = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
  };
  check(
    "P1 a black/white pair averages to #808080",
    fp.downsampleForgePhoto(bw, 1, 1)[0] === "#808080",
    fp.downsampleForgePhoto(bw, 1, 1)[0]
  );
  const g1 = fp.forgeMosaicGridFor(4000, 3000);
  const g2 = fp.forgeMosaicGridFor(3000, 4000);
  const g3 = fp.forgeMosaicGridFor(4000, 2250);
  check(
    "P1 mosaic grids respect the cell cap and follow the photo's aspect",
    g1.cols * g1.rows <= fp.FORGE_MOSAIC_MAX_CELLS &&
      g2.cols * g2.rows <= fp.FORGE_MOSAIC_MAX_CELLS &&
      g3.cols * g3.rows <= fp.FORGE_MOSAIC_MAX_CELLS &&
      near(g1.cols / g1.rows, 4 / 3, 0.25) &&
      g2.rows > g2.cols &&
      g3.cols > g3.rows,
    JSON.stringify({ g1, g2, g3 })
  );
  const { palette, indices } = fp.quantizeForgePalette(
    ["#ff0000", "#00ff00", "#0000ff", "#ffff00"],
    48
  );
  check(
    "P1 the quadrant colors quantize to themselves (palette of exactly 4)",
    palette.length === 4 &&
      indices.length === 4 &&
      indices.every((ix, i) => palette[ix] === ["#ff0000", "#00ff00", "#0000ff", "#ffff00"][i]),
    JSON.stringify(palette)
  );
  const many = [];
  for (let i = 0; i < 200; i++) many.push(`#${((i * 37) % 256).toString(16).padStart(2, "0")}${((i * 91) % 256).toString(16).padStart(2, "0")}${((i * 53) % 256).toString(16).padStart(2, "0")}`);
  const q = fp.quantizeForgePalette(many, 48);
  check(
    "P1 a 200-color input quantizes under the 48-color cap, indices total",
    q.palette.length <= 48 &&
      q.indices.length === 200 &&
      q.indices.every((ix) => ix < q.palette.length),
    `palette ${q.palette.length}`
  );
  const s1 = fp.forgePrintSizeFor(4000, 3000);
  const s2 = fp.forgePrintSizeFor(1000, 4000);
  const s3 = fp.forgePrintSizeFor(6000, 1000);
  check(
    "P1 print sizes preserve the photo's aspect under every clamp",
    near(s1.width / s1.height, 4 / 3, 0.01) &&
      near(s2.width / s2.height, 0.25, 0.01) &&
      s2.height <= 2.4 + 1e-9 &&
      near(s3.width / s3.height, 6, 0.05) &&
      s3.width <= 3.4 + 1e-9,
    JSON.stringify({ s1, s2, s3 })
  );
}

/* ---- P2. the mosaic, for real, no engine module needed ------------- */

{
  const scene = fp.buildForgeStarterScene(createAgentScene);
  const renderer = recordingRenderer();
  const handle = handleFor(scene, renderer);
  const build = fp.buildForgeMosaicOps(scene, { image: fixture });
  check(
    "P2 the mosaic build is one bounded batch (blocks + palette + backing, <= 256 ops)",
    build.blockCount === build.cols * build.rows &&
      build.blockCount <= fp.FORGE_MOSAIC_MAX_CELLS &&
      build.paletteCount <= fp.FORGE_MOSAIC_PALETTE_CAP &&
      build.ops.length ===
        build.blockCount + build.paletteCount + 2 &&
      build.ops.length <= 256,
    `ops ${build.ops.length}, blocks ${build.blockCount}, palette ${build.paletteCount}`
  );
  check(
    "P2 the mosaic needs no on-demand engine module (core ops only)",
    !agentSceneModulesNeeded({
      materials: build.ops
        .filter((o) => o.type === "add-material")
        .map((o) => o.material),
    }).includes("assets"),
    JSON.stringify(
      agentSceneModulesNeeded({
        materials: build.ops
          .filter((o) => o.type === "add-material")
          .map((o) => o.material),
      })
    )
  );
  const revBefore = scene.revision;
  const outcome = fp.performForgeOps(build.ops, handle, "photo mosaic");
  check(
    "P2 the mosaic lands in ONE revision-checked apply (revision +1, first attempt)",
    outcome.kind === "performed" &&
      outcome.attempts === 1 &&
      scene.revision === revBefore + 1 &&
      renderer.calls.replaceParts.length === 1 &&
      renderer.calls.updateParts.length === 0,
    JSON.stringify(outcome)
  );
  check(
    "P2 the mosaic census: starter + backing + every block stands in the scene",
    scene.parts.length === 5 + 1 + build.blockCount &&
      !!partOf(scene, build.backingNodeId) &&
      !!partOf(scene, `photo-mosaic-${build.index}-b-0`) &&
      !!partOf(scene, `photo-mosaic-${build.index}-b-${build.blockCount - 1}`),
    `parts ${scene.parts.length}`
  );
  const firstBlock = nodeOf(scene, `photo-mosaic-${build.index}-b-0`);
  const lastBlock = nodeOf(
    scene,
    `photo-mosaic-${build.index}-b-${build.blockCount - 1}`
  );
  check(
    "P2 corner blocks wear the fixture's corner colors (top-left red, bottom-right yellow, linear)",
    near3(materialOf(scene, firstBlock.material).color, fp.hexToLinear("#ff0000"), 1e-6) &&
      near3(materialOf(scene, lastBlock.material).color, fp.hexToLinear("#ffff00"), 1e-6),
    JSON.stringify({
      first: materialOf(scene, firstBlock.material).color,
      last: materialOf(scene, lastBlock.material).color,
    })
  );

  // The mosaic in the ghost's sense: the backing enumerates
  // inside the summary's 24-node window, in its authored color.
  const summary = fp.buildForgeSceneSummary(scene);
  const sanitized = fp.sanitizeForgeSceneContext(summary);
  const back = sanitized?.nodes.find((n) => n.id === build.backingNodeId);
  check(
    "P4 the mosaic backing stands in the scene sense, box, in its authored hex",
    !!back && back.geometry === "box" && back.color === "#17181c",
    JSON.stringify(back)
  );
}

/* ---- P3. the print, for real, through the host route --------------- */

let printScene;
let printBuild;
{
  fp.__resetForgePhotoRegistryForTests();
  printScene = fp.buildForgeStarterScene(createAgentScene, {
    sequenceFrames: fp.getForgePhotoSequenceFrames(),
  });
  const renderer = recordingRenderer();
  const handle = handleFor(printScene, renderer);
  fp.registerForgePhotoImage(fixtureId, fixture);
  printBuild = fp.buildForgePrintOps(printScene, {
    assetId: fixtureId,
    width: fixture.width,
    height: fixture.height,
  });
  const mapped = printBuild.ops.find(
    (o) => o.type === "add-material" && o.material.map
  );
  const sheet = printBuild.ops.find((o) => o.type === "add-geometry");
  await loadAgentSceneModules({
    materials: [mapped.material],
    ...(sheet ? { geometries: [sheet.geometry] } : {}),
  });
  const outcome = fp.performForgeOps(printBuild.ops, handle, "photo print");
  check(
    "P3 the print lands through the performer (performed, first attempt, replaceParts sync)",
    outcome.kind === "performed" &&
      outcome.attempts === 1 &&
      renderer.calls.replaceParts.length === 1,
    JSON.stringify(outcome)
  );
  const part = partOf(printScene, printBuild.nodeId);
  check(
    "P3 the print part's material map references the registered photo's exact pixels (engine descriptor, srgb)",
    !!part &&
      !!part.material.map &&
      part.material.map.image?.data === fixture.data &&
      part.material.map.image?.width === fixture.width &&
      part.material.map.image?.height === fixture.height &&
      part.material.map.colorSpace === "srgb",
    part ? JSON.stringify(Object.keys(part.material)) : "no part"
  );
  const node = nodeOf(printScene, printBuild.nodeId);
  check(
    "P3 the print sheet wears the photo's true aspect (8x4 -> 2:1) on a frame behind it",
    near(node.scale[0] / node.scale[1], 2, 1e-3) &&
      node.geometry === fp.FORGE_PHOTO_SHEET_GEOMETRY_ID &&
      !!nodeOf(printScene, printBuild.frameNodeId) &&
      nodeOf(printScene, printBuild.frameNodeId).translation[2] <
        node.translation[2],
    JSON.stringify(node?.scale)
  );
  check(
    "P3 the print part's geometry carries UV channel 0 (the renderer's textured-sync precondition, probed)",
    !!part && !!part.geometry?.uvs && part.geometry.uvs.length > 0,
    part ? JSON.stringify(Object.keys(part.geometry ?? {})) : "no part"
  );
  const mat = materialOf(printScene, printBuild.materialId);
  check(
    "P3 the exported recipe carries the sequence map (the still: same frame twice, 1 fps)",
    !!mat.map &&
      JSON.stringify(mat.map.sequence.frames) ===
        JSON.stringify([fixtureId, fixtureId]) &&
      mat.map.sequence.fps === fp.FORGE_PHOTO_SEQUENCE_FPS,
    JSON.stringify(mat?.map)
  );
  const seq = printScene.sequenceTextures();
  check(
    "P3 the engine's own sequenceTextures() reports the print's descriptor (same pixel buffer)",
    seq.length === 1 &&
      seq[0].descriptor.image?.data === fixture.data &&
      seq[0].descriptor === partOf(printScene, printBuild.nodeId)?.material.map,
    `sequences ${seq.length}`
  );

  // The honest refusal: an id the host never decoded.
  const ghostBuild = fp.buildForgePrintOps(printScene, {
    assetId: "c".repeat(64),
    width: 8,
    height: 4,
  });
  const refused = fp.performForgeOps(ghostBuild.ops, handle, "photo print");
  check(
    "P3 an unregistered image id is refused by the engine, in its own words — nothing renders",
    refused.kind === "failed" &&
      /was not loaded/.test(refused.reason) &&
      !partOf(printScene, ghostBuild.nodeId),
    JSON.stringify(refused)
  );

  // The print in the ghost's sense: a white box — the ghost
  // knows a print stands there; what the photo SHOWS is not
  // in the sense (no vision path feeds it), and the sense
  // says exactly that much.
  const summary = fp.buildForgeSceneSummary(printScene);
  const sanitized = fp.sanitizeForgeSceneContext(summary);
  const printNode = sanitized?.nodes.find((n) => n.id === printBuild.nodeId);
  const frameNode = sanitized?.nodes.find(
    (n) => n.id === printBuild.frameNodeId
  );
  check(
    "P4 the print stands in the scene sense (geometry 'other' — the sheet is outside the tool vocabulary; white tint: presence, not content)",
    !!printNode &&
      printNode.geometry === "other" &&
      printNode.color === "#ffffff" &&
      !!frameNode &&
      frameNode.color === "#3a2a1c",
    JSON.stringify({ printNode, frameNode })
  );
}

/* ---- P5. clear restores exactly; checkpoints carry the print ------- */

{
  // Combined scene: print + mosaic, cleared back to the starter.
  const scene = fp.buildForgeStarterScene(createAgentScene, {
    sequenceFrames: fp.getForgePhotoSequenceFrames(),
  });
  const renderer = recordingRenderer();
  const handle = handleFor(scene, renderer);
  const census = () =>
    JSON.stringify(
      [...scene.exportRecipe().nodes]
        .map((n) => ({
          id: n.id,
          geometry: n.geometry,
          material: n.material,
          translation: n.translation,
          scale: n.scale,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
    );
  const before = census();
  const pb = fp.buildForgePrintOps(scene, {
    assetId: fixtureId,
    width: fixture.width,
    height: fixture.height,
  });
  const pm = pb.ops.find((o) => o.type === "add-material" && o.material.map);
  const pgeo = pb.ops.find((o) => o.type === "add-geometry");
  await loadAgentSceneModules({
    materials: [pm.material],
    ...(pgeo ? { geometries: [pgeo.geometry] } : {}),
  });
  fp.performForgeOps(pb.ops, handle, "photo print");
  const mb = fp.buildForgeMosaicOps(scene, { image: fixture });
  fp.performForgeOps(mb.ops, handle, "photo mosaic");
  const creations = fp.forgePhotoCreations(scene.exportRecipe());
  check(
    "P5 the combined scene holds both creations (1 print + frame, 1 mosaic + backing + blocks)",
    creations.prints.length === 1 &&
      creations.mosaics.length === 1 &&
      creations.nodeIds.length === 2 + 1 + mb.blockCount &&
      census() !== before,
    JSON.stringify({
      prints: creations.prints,
      mosaics: creations.mosaics,
      nodes: creations.nodeIds.length,
    })
  );
  const clearOps = fp.buildForgeClearPhotoOps(scene);
  const cleared = fp.performForgeOps(clearOps, handle, "clear photos");
  check(
    "P5 Clear removes exactly the creations — the node census returns to the starter, verbatim",
    cleared.kind === "performed" &&
      census() === before &&
      scene.parts.length === 5 &&
      fp.buildForgeClearPhotoOps(scene) === null,
    `parts ${scene.parts.length}`
  );

  // Checkpoint round-trip with the print standing (printScene
  // from P3): banish the print, restore, and it returns WITH
  // its map — the descriptor is rebuilt from the host map.
  const cp = printScene.checkpoint();
  const renderer2 = recordingRenderer();
  const handle2 = handleFor(printScene, renderer2);
  fp.performForgeOps(
    [{ type: "remove-node", id: printBuild.nodeId, recursive: false }],
    handle2,
    "banish print"
  );
  const gone = !partOf(printScene, printBuild.nodeId);
  printScene.restore(cp, { expectedRevision: printScene.revision });
  const back = partOf(printScene, printBuild.nodeId);
  check(
    "P5 a checkpoint restore brings the print back with its photo map intact (same pixel buffer)",
    gone && !!back && back.material.map?.image?.data === fixture.data,
    `gone ${gone}, back ${!!back}`
  );
  printScene.releaseCheckpoint(cp);
}

check(
  "P6 the print flow loaded only the module it needed (never the whole engine)",
  allAgentSceneModulesLoaded() === false
);

console.log(`\nforge-photo-check: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
