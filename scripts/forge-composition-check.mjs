// forge-composition-check — pins Slice G, "The Forge opens composed".
//
// What Slice G is: the visuals equivalent of Felt Strokes — one
// missing thesis event, fixed properly. The thesis event is the
// opening frame: the starter scene reads as five shapes in a
// place, the whole board fits its frame on a ground, and a new
// photo lands where it can be seen. Everything in scope is
// data-only: arrangement, camera, anchors. No new engine
// features, no new chrome, no ghost changes.
//
// Proven here, headlessly, against the REAL modules throughout:
//   C0 source pins: the arrangement constants (floor, ball,
//      ring, game camera, markers, photo anchor, crown).
//   C1 starter composition: the real starter scene, raycast
//      visibility per shape through the ENGINE's own
//      scene-query — every shape >= 80% visible from the
//      authored camera (the old scene fails: the cube 0.71,
//      the ring 0.67); the ring and the ball rest on the
//      floor; the floor's near/side edges are out of frame
//      and its far edge reads as a horizon.
//   C2 board framing: a real game seated on the real scene —
//      the game camera is the authored FORGE_GAME_CAMERA and
//      all 64 square centers + both markers + the border
//      corners project inside NDC +/-0.96 at 4:3 and 16:9
//      (the old camera fails at worst |NDC| 3.51).
//   C3 board ground: the floor stays under the board, the
//      markers rest on it, the border frame stands, 95 parts;
//      End restores the free scene exactly, camera included.
//   C4 photo sightlines: a real print and a real mosaic on
//      the real starter scene — the ray from the authored eye
//      to each creation's center first hits the creation
//      itself, never a starter node.
//   C5 info panel: the Forge's record says "its own world",
//      never "its own room", and its modes name checkers +
//      photos.
//   C6 crown: a king's crown is a bigger brass disc, distinct
//      from its side's color (it reads at the game camera).
//
// Run: node scripts/forge-composition-check.mjs
// (bundles the real modules with the tree's esbuild.)
import { readFileSync, writeFileSync } from "node:fs";
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
function near(a, b, eps) {
  return Math.abs(a - b) <= eps;
}
function near3(a, b, eps) {
  return (
    Array.isArray(a) && a.length === 3 && b.every((v, i) => near(a[i], v, eps))
  );
}

const read = (p) => readFileSync(p, "utf8");
const sceneSrc = read("src/components/forge/forgeScene.ts");
const boardSrc = read("src/components/forge/checkersScene.ts");
const gameSrc = read("src/components/forge/checkersGame.ts");
const photoSrc = read("src/components/forge/forgePhoto.ts");
const layerSrc = read("src/components/forge/ForgeLayer.tsx");
const infoSrc = read("app/components/fabric/fabricInfo.ts");

/* ---- harness: the real modules, bundled ---------------------------- */

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
const entryPath = "/tmp/forge-composition-entry.ts";
writeFileSync(
  entryPath,
  [
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeScene.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/checkersEngine.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/checkersScene.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/checkersGame.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePicking.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePhoto.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePerformer.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeSceneStore.ts")};`,
  ].join("\n")
);
bundle(entryPath, "/tmp/forge-composition-FP.mjs");
const fp = await import("/tmp/forge-composition-FP.mjs");
const agentScene = createRequire(import.meta.url)("67js/addons/agent-scene");
const { createAgentScene, loadAgentSceneModules } = agentScene;
const sceneQueryModule = createRequire(import.meta.url)(
  "67js/addons/scene-query"
);

function makeRenderer() {
  return {
    calls: { updateParts: [], replaceParts: [], render: [] },
    updateParts(parts) {
      this.calls.updateParts.push(parts);
    },
    replaceParts(parts) {
      this.calls.replaceParts.push(parts);
    },
    render(view) {
      this.calls.render.push(view);
    },
  };
}
function recipeNodes(scene) {
  return scene.exportRecipe().nodes ?? [];
}
function nodeOf(scene, id) {
  return recipeNodes(scene).find((n) => n.id === id);
}

/* ---- C0. source pins: the arrangement ------------------------------ */

check(
  "C0 the starter floor is wide (30 units) so its near/side edges leave the frame",
  /floor-node[\s\S]{0,200}scale: \[30, 0\.1, 30\]/.test(sceneSrc),
  "floor scale"
);
check(
  "C0 the ball is smaller and pulled back (scale 0.85 at [1.2, 0.85, 0.9] — it rests on the floor at its radius, it no longer eats the cube)",
  sceneSrc.includes('translation: [1.2, 0.85, 0.9], scale: [0.85, 0.85, 0.85]'),
  "ball placement"
);
check(
  "C0 the ring is small and grounded (scale 0.5 at y 0.54 — its 1.08 outer radius at unit scale rests it on the floor; far left-back so the ball's silhouette clears it)",
  sceneSrc.includes('translation: [-3.2, 0.54, -2.8], scale: [0.5, 0.5, 0.5]'),
  "ring placement"
);
check(
  "C0 the free scene's authored camera is unchanged (the composition is arrangement, not a new viewpoint)",
  /camera: \{ eye: \[4\.2, 3\.0, 5\.6\], target: \[0, 0\.7, 0\], fov: 42 \}/.test(sceneSrc),
  "free camera"
);
check(
  "C0 the game camera is its own authored constant (raised and pulled back from the free eye)",
  boardSrc.includes("FORGE_GAME_CAMERA") &&
    /eye: \[7\.0, 6\.5, 10\.5\]/.test(boardSrc) &&
    /target: \[0, 0\.2, 0\]/.test(boardSrc),
  "game camera constant"
);
check(
  "C0 a marker rests on the floor (y 0.55 = its ball radius on the engine's unit sphere — the audit's 'hovering' read was wrong about the height; the real defect was the cleared floor, fixed by keeping it)",
  /CHECKERS_MARKER_Y = 0\.55/.test(boardSrc),
  "marker rest height"
);
check(
  "C0 photo creations anchor forward of the starter cluster (z 2.2, past the ball's front at ~1.33)",
  /FORGE_PHOTO_ANCHOR_Z = 2\.2/.test(photoSrc),
  "photo anchor"
);
check(
  "C0 the game keeps the floor (start clears every free-scene node except floor-node)",
  gameSrc.includes('.filter((id) => id !== "floor-node")'),
  "floor kept"
);
check(
  "C0 the game seats the game camera and re-derives the orbit on start and end (refreshCamera both ways)",
  gameSrc.includes("handle.refreshCamera()") &&
    (gameSrc.match(/handle\.refreshCamera\(\)/g) || []).length >= 2,
  "orbit re-derivation"
);
check(
  "C0 a marker's dip is the dim only — a resting ball cannot sink into the floor (no y - 0.16)",
  !gameSrc.includes("y - 0.16") && gameSrc.includes("seat does not move"),
  "dip is dim-only"
);

/* ---- C1. starter composition, raycast for real ---------------------- */

// Surface sample points for one node, in world space — inset
// from edges, so a sample exactly on the floor plane (y=0)
// doesn't graze the floor and report it instead of the node:
// that measures the shared plane, not occlusion.
function surfaceSamples(node, eye) {
  const [x, y, z] = node.translation;
  const s = node.scale ?? [1, 1, 1];
  const pts = [];
  if (node.geometry === "unit-box") {
    const hw = [0.5 * s[0], 0.5 * s[1], 0.5 * s[2]];
    // Five faces — the bottom (-y) is flush with the floor and
    // visible from no camera; it is not occlusion.
    for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [2, 1], [2, -1]]) {
      for (const a of [-0.375, -0.125, 0.125, 0.375])
        for (const b of [-0.375, -0.125, 0.125, 0.375]) {
          const p = [x, y, z];
          const o = [0, 1, 2].filter((i) => i !== axis);
          p[axis] += sign * hw[axis];
          p[o[0]] += a * 2 * hw[o[0]];
          p[o[1]] += b * 2 * hw[o[1]];
          pts.push(p);
        }
    }
  } else if (node.geometry === "ball") {
    // The engine's sphere is radius 1.0 in geometry space
    // (measured from the part's own positions), so the world
    // radius is the node's scale, not half of it.
    const r = 1.0 * s[0];
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 6; j++) {
        const th = (i / 10) * Math.PI * 2;
        const ph = (j / 5) * Math.PI;
        pts.push([
          x + r * Math.sin(ph) * Math.cos(th),
          y + r * Math.cos(ph),
          z + r * Math.sin(ph) * Math.sin(th),
        ]);
      }
  } else if (node.geometry === "post") {
    // The engine's cylinder is radius 1.0 in geometry space
    // (measured from the part's own positions), height 1.0 —
    // so the world radius is the node's x scale. Side samples
    // sit at mid-height and the top only: the bottom ring is
    // on the floor plane (y=0) and grazes it, reporting the
    // floor instead of the post.
    const r = 1.0 * s[0];
    const h = 0.5 * s[1];
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * Math.PI * 2;
      for (const yy of [0, h])
        pts.push([x + r * Math.cos(th), y + yy, z + r * Math.sin(th)]);
      pts.push([x + r * 0.5 * Math.cos(th), y + h, z + r * 0.5 * Math.sin(th)]);
    }
  } else if (node.geometry === "ring") {
    // Torus in the XY plane: major radius 1.0, tube 0.08
    // (the generator's fixed shape), scaled by the node.
    // Only the tube's FRONT side is sampled: the tube is
    // thin (0.04 at this scale), so a ray aimed at its back
    // side slips past the front tube and reports the floor —
    // that measures the tube's thinness, not occlusion. A
    // sample counts only when its surface normal faces the
    // eye, the same front-facing rule the fat shapes get for
    // free (their back-side rays hit their own fronts first).
    const R = 1.0 * s[0];
    const t = 0.08 * s[0];
    const toEye = [eye[0] - x, eye[1] - y, eye[2] - z];
    const el = Math.hypot(...toEye);
    const e = [toEye[0] / el, toEye[1] / el, toEye[2] / el];
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 8; j++) {
        const th = (i / 16) * Math.PI * 2;
        const ph = (j / 8) * Math.PI * 2;
        const n = [
          Math.cos(ph) * Math.cos(th),
          Math.cos(ph) * Math.sin(th),
          Math.sin(ph),
        ];
        if (n[0] * e[0] + n[1] * e[1] + n[2] * e[2] <= 0) continue;
        pts.push([
          x + (R + t * Math.cos(ph)) * Math.cos(th),
          y + (R + t * Math.cos(ph)) * Math.sin(th),
          z + t * Math.sin(ph),
        ]);
      }
  }
  return pts;
}

function visibleFraction(scene, picker, node, eye, target, fov, aspect) {
  const pts = surfaceSamples(node, eye);
  let vis = 0;
  let skipped = 0;
  for (const p of pts) {
    const ndc = fp.projectToNdc(p, eye, target, fov, aspect);
    if (!ndc) {
      skipped++;
      continue;
    }
    const ray = fp.rayFromCamera(eye, target, fov, aspect, ndc[0], ndc[1]);
    const hit = picker.pick(scene.parts, ray.origin, ray.direction, scene.revision);
    if (hit === node.id) vis++;
  }
  return { fraction: pts.length ? vis / pts.length : 0, vis, total: pts.length, skipped };
}

{
  const scene = fp.buildForgeStarterScene(createAgentScene);
  const picker = fp.createForgePicker(sceneQueryModule);
  const cam = scene.camera;
  const aspect = 800 / 600;
  const results = {};
  for (const node of recipeNodes(scene)) {
    if (node.id === "floor-node") continue;
    results[node.id] = visibleFraction(
      scene, picker, node, cam.eye, cam.target, cam.fov, aspect
    );
  }
  const summary = Object.entries(results)
    .map(([id, r]) => `${id.replace("-node", "")}:${r.fraction.toFixed(2)}`)
    .join(" ");
  check(
    "C1 every starter shape is >= 80% visible from the authored camera (raycast, real engine — the old scene fails: cube 0.71, ring 0.67)",
    Object.values(results).every((r) => r.fraction >= 0.8 && r.skipped === 0),
    summary
  );
  // Resting, measured from the engine's own geometry: the
  // ring's lowest extent and the ball's lowest extent sit on
  // the floor top (y 0).
  const ringPart = scene.parts.find((p) => p.name === "ring-node");
  const ringPos = ringPart.geometry.positions;
  let ringExtent = 0;
  for (let i = 1; i < ringPos.length; i += 3)
    ringExtent = Math.max(ringExtent, Math.abs(ringPos[i]));
  const ringNode = nodeOf(scene, "ring-node");
  const ringScale = ringNode.scale?.[1] ?? 1;
  const ringLow = ringNode.translation[1] - ringExtent * ringScale;
  check(
    "C1 the ring rests on the floor (its lowest point, measured from the engine geometry, is the floor top)",
    near(ringLow, 0, 0.02),
    `ring lowest y=${ringLow.toFixed(3)} (extent ${ringExtent.toFixed(3)} x scale ${ringScale})`
  );
  const ballPart = scene.parts.find((p) => p.name === "ball-node");
  const ballPos = ballPart.geometry.positions;
  let ballExtent = 0;
  for (let i = 1; i < ballPos.length; i += 3)
    ballExtent = Math.max(ballExtent, Math.abs(ballPos[i]));
  const ballNode = nodeOf(scene, "ball-node");
  const ballLow =
    ballNode.translation[1] - ballExtent * (ballNode.scale?.[1] ?? 1);
  check(
    "C1 the ball rests on the floor (its lowest point is the floor top)",
    near(ballLow, 0, 0.02),
    `ball lowest y=${ballLow.toFixed(3)}`
  );
  // Horizon: the floor's near and side edges are out of frame
  // (or behind the camera); its far edge, where visible, sits
  // above NDC y 0.35 — a horizon line, not a slab edge cutting
  // the mid-frame.
  const floorCorners = [
    [-15, 15], [15, 15], [-15, -15], [15, -15],
  ];
  const projected = floorCorners.map(([fx, fz]) =>
    fp.projectToNdc([fx, 0, fz], cam.eye, cam.target, cam.fov, aspect)
  );
  const nearOut = projected.slice(0, 2).every(
    (n) => n === null || Math.abs(n[0]) > 1 || Math.abs(n[1]) > 1
  );
  const farSamples = [];
  for (let fx = -15; fx <= 15; fx += 1) {
    const n = fp.projectToNdc([fx, 0, -15], cam.eye, cam.target, cam.fov, aspect);
    if (n && Math.abs(n[0]) <= 1 && Math.abs(n[1]) <= 1) farSamples.push(n);
  }
  check(
    "C1 the floor's near/side edges are out of frame and its far edge reads as a horizon (visible segment above NDC y 0.35)",
    nearOut && farSamples.every((n) => n[1] >= 0.35),
    `near=${JSON.stringify(projected.slice(0, 2))} far-visible=${farSamples.length} min-y=${farSamples.length ? Math.min(...farSamples.map((n) => n[1])).toFixed(2) : "n/a"}`
  );
  picker.dispose();
}

/* ---- C2 + C3. the board: framing, ground, restore ------------------- */

function makeGame(extraDeps = {}) {
  const log = { snapshots: [], events: [], sfx: [], senses: [] };
  const game = new fp.CheckersGame({
    getHandle: () => fp.getForgeSceneHandle(),
    onSnapshot: (s) => log.snapshots.push(s),
    onEvent: (e) => log.events.push(e),
    playSfx: (kind, hue) => log.sfx.push({ kind, hue }),
    feedGameSense: (ctx) => log.senses.push(ctx),
    markerHexesFor: () => ({ near: "#3b82f6", far: "#f59e0b" }),
    sfxHuesFor: () => ({ coral: 210, teal: 186 }),
    ...extraDeps,
  });
  return { game, log };
}

{
  fp.__resetForgeSceneForTests();
  const scene = fp.buildForgeStarterScene(createAgentScene);
  const renderer = makeRenderer();
  let refreshes = 0;
  fp.registerForgeScene({
    scene,
    renderer,
    refreshCamera: () => {
      refreshes++;
    },
  });
  const starterIds = recipeNodes(scene).map((n) => n.id).sort();
  const { game } = makeGame();
  const started = game.start("pass-and-play");
  const cam = scene.camera;
  check(
    "C2 the seated game carries the authored game camera (eye [7, 6.5, 10.5], target [0, 0.2, 0])",
    started === true &&
      near3(cam.eye, [7.0, 6.5, 10.5], 1e-9) &&
      near3(cam.target, [0, 0.2, 0], 1e-9) &&
      cam.fov === 42,
    `eye=${JSON.stringify(cam.eye)} target=${JSON.stringify(cam.target)}`
  );
  check(
    "C2 starting the game re-derives the layer's orbit from the game camera (refreshCamera called)",
    refreshes >= 1,
    `refreshes=${refreshes}`
  );
  // Framing: every square center, both markers, every border
  // corner projects inside NDC +/-0.96 at 4:3 and 16:9.
  const framePoints = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      framePoints.push([`sq ${r},${c}`, [c - 3.5, 0.1, r - 3.5]]);
  framePoints.push(["marker-near", [0, fp.CHECKERS_MARKER_Y, fp.CHECKERS_MARKER_Z]]);
  framePoints.push(["marker-far", [0, fp.CHECKERS_MARKER_Y, -fp.CHECKERS_MARKER_Z]]);
  for (const [x, z] of [[-4.3, -4.3], [4.3, -4.3], [-4.3, 4.3], [4.3, 4.3]])
    framePoints.push([`border ${x},${z}`, [x, 0.05, z]]);
  for (const aspect of [800 / 600, 1280 / 720]) {
    let worst = null;
    let worstVal = 0;
    for (const [name, p] of framePoints) {
      const ndc = fp.projectToNdc(p, cam.eye, cam.target, cam.fov, aspect);
      const m = ndc ? Math.max(Math.abs(ndc[0]), Math.abs(ndc[1])) : 99;
      if (m > worstVal) {
        worstVal = m;
        worst = `${name} ${ndc ? ndc.map((v) => v.toFixed(2)).join(",") : "BEHIND"}`;
      }
    }
    check(
      `C2 the whole board + both markers + the border fit the game frame at aspect ${aspect.toFixed(2)} (worst |NDC| <= 0.96)`,
      worstVal <= 0.96,
      `worst=${worstVal.toFixed(3)} at ${worst}`
    );
  }
  const nodes = recipeNodes(scene);
  const ids = nodes.map((n) => n.id);
  check(
    "C3 the board seats on a ground: the floor stays, 95 parts, both markers present",
    ids.includes("floor-node") && scene.parts.length === 95,
    `parts=${scene.parts.length}`
  );
  const markerRest = ["near", "far"].every((end) => {
    const n = nodeOf(scene, fp.checkersMarkerId(end));
    return (
      !!n &&
      near(n.translation[1], fp.CHECKERS_MARKER_Y, 0.01) &&
      Math.abs(n.translation[2]) <= 15
    );
  });
  check(
    "C3 both markers rest on the floor (y = the rest height, inside the floor's reach)",
    markerRest,
    `near=${JSON.stringify(nodeOf(scene, "checkers-marker-near")?.translation)} far=${JSON.stringify(nodeOf(scene, "checkers-marker-far")?.translation)}`
  );
  const borderOk = ["n", "s", "e", "w"].every((side) =>
    ids.includes(fp.checkersBorderId(side))
  );
  check(
    "C3 the border frame stands (all four bars present)",
    borderOk,
    `borders=${["n", "s", "e", "w"].map((s) => fp.checkersBorderId(s)).join(",")}`
  );
  check(
    "C3 the referee's census is clean on the seated board (border included)",
    fp.checkersCensus(nodes, game.getState()).ok,
    JSON.stringify(fp.checkersCensus(nodes, game.getState()).problems.slice(0, 3))
  );
  const refreshesBeforeEnd = refreshes;
  game.end();
  const afterIds = recipeNodes(scene).map((n) => n.id).sort();
  check(
    "C3 End restores the free scene exactly — five parts, and the free camera back (checkpoint owns the camera)",
    JSON.stringify(afterIds) === JSON.stringify(starterIds) &&
      scene.parts.length === 5 &&
      near3(scene.camera.eye, [4.2, 3.0, 5.6], 1e-9) &&
      near3(scene.camera.target, [0, 0.7, 0], 1e-9),
    `after=${JSON.stringify(afterIds)} eye=${JSON.stringify(scene.camera.eye)}`
  );
  check(
    "C3 ending the game re-derives the orbit from the restored free camera",
    refreshes > refreshesBeforeEnd,
    `refreshes=${refreshes}`
  );
}

/* ---- C4. photo sightlines, raycast for real -------------------------- */

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

{
  const fixture = quadrantImage();
  const fixtureId = createHash("sha256")
    .update(Buffer.from(fixture.data))
    .digest("hex");
  fp.__resetForgePhotoRegistryForTests();
  const scene = fp.buildForgeStarterScene(createAgentScene, {
    sequenceFrames: fp.getForgePhotoSequenceFrames(),
  });
  const renderer = makeRenderer();
  const handle = { scene, renderer, refreshCamera: () => {} };
  fp.registerForgePhotoImage(fixtureId, fixture);
  const picker = fp.createForgePicker(sceneQueryModule);
  const cam = scene.camera;
  const aspect = 800 / 600;
  const rayTo = (point) => {
    const ndc = fp.projectToNdc(point, cam.eye, cam.target, cam.fov, aspect);
    if (!ndc) return { hit: null, ndc: null };
    const ray = fp.rayFromCamera(cam.eye, cam.target, cam.fov, aspect, ndc[0], ndc[1]);
    return { hit: picker.pick(scene.parts, ray.origin, ray.direction, scene.revision), ndc };
  };

  const printBuild = fp.buildForgePrintOps(scene, {
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
  const printOutcome = fp.performForgeOps(printBuild.ops, handle, "photo print");
  const printNode = nodeOf(scene, printBuild.nodeId);
  const printCenter = [
    printNode.translation[0],
    printNode.translation[1],
    printNode.translation[2],
  ];
  const printRay = rayTo(printCenter);
  check(
    "C4 the print lands (performed) and its center is in frame with margin",
    printOutcome.kind === "performed" &&
      !!printRay.ndc &&
      Math.abs(printRay.ndc[0]) <= 0.96 &&
      Math.abs(printRay.ndc[1]) <= 0.96,
    `outcome=${printOutcome.kind} center=${JSON.stringify(printCenter)} ndc=${printRay.ndc ? printRay.ndc.map((v) => v.toFixed(2)).join(",") : "BEHIND"}`
  );
  check(
    "C4 the ray from the authored eye to the print's center first hits the print itself (never a starter node)",
    printRay.hit === printBuild.nodeId || printRay.hit === printBuild.frameNodeId,
    `first hit=${printRay.hit} (print=${printBuild.nodeId})`
  );

  const mosaicBuild = fp.buildForgeMosaicOps(scene, { image: fixture });
  const mosaicOutcome = fp.performForgeOps(mosaicBuild.ops, handle, "photo mosaic");
  const backNode = nodeOf(scene, mosaicBuild.backingNodeId);
  const mosaicCenter = [
    backNode.translation[0],
    backNode.translation[1],
    backNode.translation[2] + 0.085,
  ];
  const mosaicRay = rayTo(mosaicCenter);
  check(
    "C4 the mosaic lands (performed) and its center is in frame with margin",
    mosaicOutcome.kind === "performed" &&
      !!mosaicRay.ndc &&
      Math.abs(mosaicRay.ndc[0]) <= 0.96 &&
      Math.abs(mosaicRay.ndc[1]) <= 0.96,
    `outcome=${mosaicOutcome.kind} center=${JSON.stringify(mosaicCenter)} ndc=${mosaicRay.ndc ? mosaicRay.ndc.map((v) => v.toFixed(2)).join(",") : "BEHIND"}`
  );
  check(
    "C4 the ray from the authored eye to the mosaic's center first hits the mosaic itself (never a starter node)",
    typeof mosaicRay.hit === "string" &&
      mosaicRay.hit.startsWith("photo-mosaic-1"),
    `first hit=${mosaicRay.hit}`
  );
  picker.dispose();
}

/* ---- C5. info panel --------------------------------------------------- */

{
  const forgeSeg = infoSrc.slice(infoSrc.indexOf("\n  forge: {"));
  check(
    "C5 the Forge's record calls its canvas its own world, never its own room",
    forgeSeg.includes("Its own canvas, its own world") &&
      !forgeSeg.includes("its own room"),
    "rules line"
  );
  check(
    "C5 the Forge's modes name checkers and photos (the panel is the fabric's home base, and it was stale)",
    forgeSeg.includes("Checkers") && forgeSeg.includes("Photos"),
    "modes list"
  );
}

/* ---- C6. the crown reads ---------------------------------------------- */

{
  const state = {
    cells: new Array(64).fill(null),
    turn: "coral",
    winner: null,
  };
  state.cells[0 * 8 + 1] = { id: "coral-1", side: "coral", king: true };
  const ops = fp.checkersSetupOps(state, {
    nearMarkerHex: "#3b82f6",
    farMarkerHex: "#f59e0b",
    clearNodeIds: [],
  });
  const crownOp = ops.find(
    (o) => o.type === "add-node" && o.node?.id === "checkers-crown-coral-1"
  );
  const crownMatOp = ops.find(
    (o) => o.type === "add-material" && o.material?.id === fp.CHECKERS_CROWN_MAT
  );
  check(
    "C6 a king's crown is a bigger disc (0.62 across, not the old 0.46 puck)",
    !!crownOp &&
      near(crownOp.node.scale[0], 0.62, 1e-9) &&
      near(crownOp.node.scale[2], 0.62, 1e-9) &&
      near(crownOp.node.scale[1], 0.16, 1e-9),
    crownOp ? JSON.stringify(crownOp.node.scale) : "no crown op"
  );
  check(
    "C6 the crown wears brass, distinct from both sides' colors (it reads at the game camera)",
    !!crownMatOp &&
      near3(crownMatOp.material.color, fp.hexToLinear("#d9932c"), 1e-9) &&
      crownMatOp.material.color.join(",") !==
        fp.hexToLinear("#e2492f").join(",") &&
      crownMatOp.material.color.join(",") !==
        fp.hexToLinear("#0e7c86").join(","),
    crownMatOp ? JSON.stringify(crownMatOp.material.color) : "no crown material"
  );
}

console.log(`\nforge-composition-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
