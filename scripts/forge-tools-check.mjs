// forge-tools-check — pins Slice B, the Forge ghost tools.
//
// What Slice B is: the ghost gains seven scene tools on the
// Forge fabric — forge-summon, forge-banish, forge-move,
// forge-recolor, forge-reshape, forge-relight, forge-camera —
// declared in the ghost tool registry, offered by the brain's
// fabric manifest ONLY on the Forge, carried as validated
// decisions with a forge_spec payload, and performed for real
// against the live 67js scene: ForgeLayer publishes a scene
// handle through the seam (forgeSceneStore), and the performer
// (forgePerformer) translates each decision to agent-scene
// ops, applies them under the engine's revision contract
// (read at apply time, one retry on a stale refusal, then the
// act drops), and hands the renderer the scene's parts.
//
// This check drives the REAL modules: GhostBrain + ghostTools
// bundled by the tree's esbuild, the performer + seam + scene
// source bundled as ONE graph (so the seam the check registers
// into is the seam the performer reads), and the tree's real
// agent-scene addon for every scene act. The renderer at the
// seam's far side is a recording double — the renderer's
// contract is the part sync (replaceParts when the scene's
// topologyRevision moved, updateParts otherwise) + render(view),
// and its real acceptance of a grown part set is proven against
// the real Renderer67 by Slice B's browser proof
// (~/workspace/fabric-forge/proof-b/). Everything on the near
// side of the seam (translation, revision discipline, sync
// selection, outcomes) is the real code against the real scene.
//
// Load-order pin (Slice A's hazard): Slice A proved
// loadAllAgentSceneModules() BEFORE scene creation breaks the
// renderer's part identity. Slice B's answer is stronger than
// an ordering: the forge tools use CORE agent-scene ops only,
// so no on-demand module is ever loaded on the tool path —
// this check never calls a loader, performs every act, and
// asserts the addon's modules are still not all loaded at the
// end (T7), plus the static pin that the performer names no
// loader at all (T6).
import { readFileSync } from "node:fs";
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
function near3(a, b, eps) {
  return (
    Array.isArray(a) && a.length === 3 && b.every((v, i) => Math.abs(a[i] - v) <= eps)
  );
}

const read = (p) => readFileSync(p, "utf8");
const brainSrc = read("src/ghost/GhostBrain.ts");
const peerSrc = read("src/ghost/GhostPeer.ts");
const hookSrc = read("src/ghost/useGhostPeer.ts");
const fluidSrc = read("src/components/fluid/LegacyFluid.tsx");
const layerSrc = read("src/components/forge/ForgeLayer.tsx");
const performerSrc = read("src/components/forge/forgePerformer.ts");
const homeSrc = read("app/components/fabric/GhostieHome.tsx");
const infoSrc = read("app/components/fabric/fabricInfo.ts");

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
bundle("src/ghost/GhostBrain.ts", "/tmp/forge-tools-GB.mjs");
bundle("src/ghost/ghostTools.ts", "/tmp/forge-tools-GT.mjs");
// One graph for performer + seam + scene source + brain, so the
// store instance the check drives is the performer's own.
const entryPath = "/tmp/forge-tools-entry.ts";
const { writeFileSync } = await import("node:fs");
writeFileSync(
  entryPath,
  [
    `export * from ${JSON.stringify(process.cwd() + "/src/ghost/GhostBrain.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePerformer.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeSceneStore.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeScene.ts")};`,
  ].join("\n")
);
bundle(entryPath, "/tmp/forge-tools-FP.mjs");

const brain = await import("/tmp/forge-tools-GB.mjs");
const tools = await import("/tmp/forge-tools-GT.mjs");
const fp = await import("/tmp/forge-tools-FP.mjs");
const agentScene = createRequire(import.meta.url)("67js/addons/agent-scene");
const { createAgentScene } = agentScene;

const FORGE_IDS = [
  "forge-summon",
  "forge-banish",
  "forge-move",
  "forge-recolor",
  "forge-reshape",
  "forge-relight",
  "forge-camera",
];
const FORGE_INTENTS = FORGE_IDS; // one intent per tool, same names

/* ---- T1. the manifest law, at the data level --------------------- */

check(
  "T1 the brain's manifest offers exactly the seven forge tools on the Forge",
  JSON.stringify([...brain.GHOST_FABRIC_TOOL_MANIFEST.forge].sort()) ===
    JSON.stringify([...FORGE_IDS].sort()),
  JSON.stringify(brain.GHOST_FABRIC_TOOL_MANIFEST.forge)
);
check(
  "T1 no other declared fabric offers a forge tool",
  Object.entries(brain.GHOST_FABRIC_TOOL_MANIFEST)
    .filter(([id]) => id !== "forge")
    .every(([, list]) => list.every((t) => !FORGE_IDS.includes(t)))
);
check(
  "T1 the tool vocabulary (GHOST_TOOL_IDS) carries all seven forge ids",
  FORGE_IDS.every((id) => brain.GHOST_TOOL_IDS.includes(id))
);
check(
  "T1 the registry declares the seven forge tools, one intent each, named for the intent",
  FORGE_IDS.every((id) => {
    const def = tools.GHOST_TOOL_REGISTRY.find((t) => t.id === id);
    return def && JSON.stringify(def.intents) === JSON.stringify([id]);
  })
);
check(
  "T1 every forge intent reaches for the forge tool of the same name (GHOST_INTENT_TOOL)",
  FORGE_INTENTS.every((i) => brain.GHOST_INTENT_TOOL[i] === i)
);
check(
  "T1 the performer's vocabularies mirror the brain's exactly (geometry kinds, light presets)",
  JSON.stringify(Object.keys(fp.FORGE_GEOMETRY_IDS)) ===
    JSON.stringify([...brain.GHOST_FORGE_GEOMETRIES]) &&
    JSON.stringify(Object.keys(fp.FORGE_LIGHT_PRESETS)) ===
      JSON.stringify([...brain.GHOST_FORGE_LIGHT_PRESETS])
);
check(
  "T1 every geometry id the performer names resolves in the real starter scene",
  (() => {
    const ids = new Set(fp.forgeStarterRecipe().geometries.map((g) => g.id));
    return Object.values(fp.FORGE_GEOMETRY_IDS).every((id) => ids.has(id));
  })()
);

/* ---- T2. the validator + router law ------------------------------ */

const ctxFor = (layerId, canvas) =>
  brain.sanitizeFabricContext({
    layer_id: layerId,
    canvas,
    role: "open",
    in_session: false,
    rules: { draw: true, verbs: true, notes: true },
  });
const scenarioFor = (layerId, canvas) => ({ fabric: ctxFor(layerId, canvas) });
const wellFormedForge = (intent) => {
  const d = { intent, intensity: 0.5, linger_s: 5 };
  if (intent === "forge-summon") d.forge_spec = { geometry: "sphere", color: "#e2492f" };
  if (intent === "forge-banish") d.forge_spec = { node: "ball-node" };
  if (intent === "forge-move") d.forge_spec = { node: "ball-node", position: [0, 1, 0] };
  if (intent === "forge-recolor") d.forge_spec = { node: "ball-node", color: "#0e7c86" };
  if (intent === "forge-reshape") d.forge_spec = { node: "ball-node", geometry: "torus" };
  if (intent === "forge-relight") d.forge_spec = { preset: "warm" };
  if (intent === "forge-camera") d.forge_spec = { direction: "orbit-left" };
  return d;
};

check(
  "T2 a Forge fabric context keeps its own canvas kind through sanitization (\"forge67\", not \"fluid\")",
  ctxFor("forge", "forge67").canvas === "forge67"
);
check(
  "T2 every well-formed forge decision validates on the Forge (and keeps its spec)",
  FORGE_INTENTS.every((intent) => {
    const v = brain.validateGhostDecision(wellFormedForge(intent), scenarioFor("forge", "forge67"));
    return v && v.forge_spec && typeof v.forge_spec === "object";
  })
);
for (const [id, canvas] of [
  ["default-fluid", "fluid"],
  ["ar-piano", "fluid"],
  ["dancer-stage", "stage3d"],
  ["genx-fold", "fluid"],
  ["sam-see", "camera"],
]) {
  check(
    `T2 every forge decision is refused on "${id}" (validator + router gate + named refusal agree)`,
    FORGE_INTENTS.every(
      (intent) =>
        brain.validateGhostDecision(wellFormedForge(intent), scenarioFor(id, canvas)) === null &&
        (tools.ghostToolRefusal(intent, scenarioFor(id, canvas)) ?? "").includes("doesn't offer") &&
        (brain.ghostManifestRefusal(wellFormedForge(intent), scenarioFor(id, canvas)) ?? "").includes(
          "doesn't offer"
        )
    )
  );
}
check(
  "T2 the router gate lets forge intents through on the Forge (refusal null)",
  FORGE_INTENTS.every(
    (intent) => tools.ghostToolRefusal(intent, scenarioFor("forge", "forge67")) === null
  )
);
check(
  "T2 malformed forge specs do not validate even on the Forge (bad hex, unknown geometry/preset/direction, missing fields, spaced node id)",
  [
    { intent: "forge-summon", forge_spec: { geometry: "sphere", color: "red" } },
    { intent: "forge-summon", forge_spec: { geometry: "pyramid", color: "#e2492f" } },
    { intent: "forge-recolor", forge_spec: { node: "ball-node", color: "#12345" } },
    { intent: "forge-move", forge_spec: { node: "ball-node" } },
    { intent: "forge-banish", forge_spec: { node: "ball node" } },
    { intent: "forge-relight", forge_spec: { preset: "midnight" } },
    { intent: "forge-camera", forge_spec: { direction: "spin" } },
    { intent: "forge-summon" },
  ].every(
    (d) =>
      brain.validateGhostDecision(
        { intensity: 0.5, linger_s: 5, ...d },
        scenarioFor("forge", "forge67")
      ) === null
  )
);
check(
  "T2 a forge_spec riding a non-forge intent is dropped, not carried (draw on the playground validates with forge_spec null)",
  (() => {
    const v = brain.validateGhostDecision(
      {
        intent: "draw",
        draw_shape: "ring",
        forge_spec: { geometry: "sphere", color: "#e2492f" },
        intensity: 0.5,
        linger_s: 5,
      },
      scenarioFor("ghostie-playground", "fluid")
    );
    return v && v.forge_spec === null;
  })()
);
check(
  "T2 a legacy scenario (no fabric context) still validates a forge decision — no fabric authority in the picture, the dataset discipline",
  FORGE_INTENTS.every(
    (intent) => brain.validateGhostDecision(wellFormedForge(intent)) !== null
  )
);

/* ---- T3/T4. fabric-context honesty: the panel reads --------------- */

check(
  "T3 fabricInfo's canvasKindFor derives \"forge67\" from the declaration (Slice A's borrowed \"fluid\" read is fixed for tool purposes)",
  infoSrc.includes('if (exp.canvas === "forge67") return "forge67";') &&
    infoSrc.includes('"forge67"') &&
    /export type FabricCanvasKind =[^;]*"forge67"/.test(infoSrc)
);
check(
  "T4 the panel's tool list offers the forge tools on the Forge alone, with the honest note elsewhere",
  infoSrc.includes('case "forge-summon":') &&
    infoSrc.includes('case "forge-camera":') &&
    infoSrc.includes('layerId === "forge"') &&
    infoSrc.includes("The ghost shapes scenes in the Forge") &&
    FORGE_IDS.every((id) => infoSrc.includes(`"${id}": {`))
);
check(
  "T4 the Ghostie Home carries a plain-words label for every forge tool (its manifest surface)",
  FORGE_IDS.every((id) => homeSrc.includes(`"${id}": {`))
);
check(
  "T4 both brain prompts carry the forge contract (the tiers that may speak forge intents know the shape)",
  brainSrc.includes("forge_spec is only for the FORGE intents") &&
    brainSrc.includes("forge_spec is only for the forge intents")
);

/* ---- T5. the seam's lifecycle (module level) ---------------------- */

{
  fp.__resetForgeSceneForTests();
  let fires = 0;
  const unsub = fp.subscribeForgeScene(() => fires++);
  const handle = { scene: null, renderer: null, refreshCamera: () => {} };
  const s0 = fp.getForgeSceneSnapshot();
  fp.registerForgeScene(handle);
  const s1 = fp.getForgeSceneSnapshot();
  fp.registerForgeScene(handle); // same state: deduped, no re-fire
  fp.registerForgeScene(null);
  const s2 = fp.getForgeSceneSnapshot();
  unsub();
  check(
    "T5 the seam starts dark, lights on register, dedups repeat state, and clears on unregister",
    s0.live === false &&
      s1.live === true &&
      s2.live === false &&
      fires === 2,
    `fires=${fires}`
  );
  check(
    "T5 the handle is pulled at the moment of use (register -> get returns the same object; clear -> null)",
    (() => {
      fp.__resetForgeSceneForTests();
      if (fp.getForgeSceneHandle() !== null) return false;
      fp.registerForgeScene(handle);
      const got = fp.getForgeSceneHandle() === handle;
      fp.registerForgeScene(null);
      return got && fp.getForgeSceneHandle() === null;
    })()
  );
  fp.__resetForgeSceneForTests();
}

/* ---- T6. the layer binding + the performer's load discipline ------ */

check(
  "T6 ForgeLayer publishes the handle on mount (scene + renderer + the camera re-sync)",
  layerSrc.includes("registerForgeScene({ scene, renderer, refreshCamera })")
);
check(
  "T6 ForgeLayer clears the seam on unmount BEFORE disposing the renderer (no act lands on a tearing-down scene)",
  layerSrc.includes("registerForgeScene(null)") &&
    layerSrc.indexOf("registerForgeScene(null)") <
      layerSrc.indexOf("renderer?.dispose()")
);
check(
  "T6 the layer's camera re-sync re-derives the orbit from the authored camera (scene.camera)",
  layerSrc.includes("const refreshCamera = () => {") &&
    layerSrc.includes("orbit.baseAngle = Math.atan2(dz, dx) - tNow * ORBIT_SPEED;")
);
check(
  "T6 the performer names no module loader — the tool path never preloads (Slice A's hazard, answered by construction)",
  !performerSrc.includes("loadAgentSceneModules") &&
    !performerSrc.includes("loadAllAgentSceneModules") &&
    !performerSrc.includes("import(")
);

/* ---- T7. the acts, for real, against the real agent-scene --------- */

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
const freshScene = () => fp.buildForgeStarterScene(createAgentScene);
const decision = (intent, forge_spec) =>
  brain.validateGhostDecision(
    { intent, forge_spec, intensity: 0.5, linger_s: 5 },
    scenarioFor("forge", "forge67")
  );
const nodeOf = (scene, id) => scene.exportRecipe().nodes.find((n) => n.id === id);
const partOf = (scene, id) => scene.parts.find((p) => p.name === id);

{
  const scene = freshScene();
  const renderer = recordingRenderer();
  let refreshed = 0;
  const handle = {
    scene,
    renderer,
    refreshCamera: () => refreshed++,
  };
  const starterParts = [...scene.parts];

  // summon — a sphere, coral, at a chosen place.
  const out1 = fp.performForgeDecision(
    decision("forge-summon", { geometry: "sphere", color: "#e2492f", position: [1, 0.6, -1] }),
    handle
  );
  const summoned = partOf(scene, "ghost-node-1");
  check(
    "T7 summon performs: a new part lands, painted through the linear conversion, at the decided place",
    out1.kind === "performed" &&
      out1.attempts === 1 &&
      scene.parts.length === 6 &&
      !!summoned &&
      near3(summoned.material.color, fp.hexToLinear("#e2492f"), 1e-6) &&
      near3(
        [summoned.matrix[12], summoned.matrix[13], summoned.matrix[14]],
        [1, 0.6, -1],
        1e-6
      ),
    JSON.stringify(out1)
  );
  check(
    "T7 the performed act syncs the renderer with the scene's own parts and renders once with the scene's look",
    // A summon changes the part SET: the engine's topology rule
    // syncs it with replaceParts, not updateParts (updateParts
    // refuses unknown part identities — Slice B's browser proof
    // caught the refusal before this rule was applied).
    renderer.calls.replaceParts.length === 1 &&
      renderer.calls.replaceParts[0] === scene.parts &&
      renderer.calls.updateParts.length === 0 &&
      renderer.calls.render.length === 1 &&
      // The session hands out a fresh environment snapshot per
      // read, so the look is compared by value, not identity.
      JSON.stringify(renderer.calls.render[0].environment) ===
        JSON.stringify(scene.environment)
  );
  check(
    "T7 surviving parts keep their identity across the apply (the updateParts contract Slice A pinned)",
    starterParts.every((p, i) => scene.parts[i] === p)
  );

  // summon again — box, no position: the next free id, the default place.
  const out2 = fp.performForgeDecision(
    decision("forge-summon", { geometry: "box", color: "#0e7c86" }),
    handle
  );
  check(
    "T7 a second summon takes the next free ghost id and the default place",
    out2.kind === "performed" &&
      !!partOf(scene, "ghost-node-2") &&
      near3(
        (() => {
          const m = partOf(scene, "ghost-node-2").matrix;
          return [m[12], m[13], m[14]];
        })(),
        [0, 0.6, 2.2],
        1e-6
      )
  );

  // move — the summoned sphere to a new place.
  const syncBeforeMove = {
    u: renderer.calls.updateParts.length,
    r: renderer.calls.replaceParts.length,
  };
  const out3 = fp.performForgeDecision(
    decision("forge-move", { node: "ghost-node-1", position: [-2, 0.6, 0] }),
    handle
  );
  check(
    "T7 move performs: the node's matrix carries the new translation",
    out3.kind === "performed" &&
      near3(
        (() => {
          const m = partOf(scene, "ghost-node-1").matrix;
          return [m[12], m[13], m[14]];
        })(),
        [-2, 0.6, 0],
        1e-6
      )
  );
  check(
    "T7 an in-place act (move) syncs with updateParts, not replaceParts (the topology rule, both directions)",
    renderer.calls.updateParts.length === syncBeforeMove.u + 1 &&
      renderer.calls.replaceParts.length === syncBeforeMove.r
  );

  // recolor — the starter's own ball, through its material.
  const out4 = fp.performForgeDecision(
    decision("forge-recolor", { node: "ball-node", color: "#123456" }),
    handle
  );
  check(
    "T7 recolor performs: the node's material color becomes the converted hex",
    out4.kind === "performed" &&
      near3(partOf(scene, "ball-node").material.color, fp.hexToLinear("#123456"), 1e-6),
    JSON.stringify(out4)
  );

  // reshape — the ball becomes a torus (the shared ring geometry).
  const syncBeforeReshape = {
    u: renderer.calls.updateParts.length,
    r: renderer.calls.replaceParts.length,
  };
  const out5 = fp.performForgeDecision(
    decision("forge-reshape", { node: "ball-node", geometry: "torus" }),
    handle
  );
  check(
    "T7 reshape performs: the node's geometry rebinds to the shared ring",
    out5.kind === "performed" && nodeOf(scene, "ball-node").geometry === "ring"
  );
  check(
    "T7 a reshape re-identifies the part, so it syncs with replaceParts (updateParts would refuse the geometry change)",
    renderer.calls.replaceParts.length === syncBeforeReshape.r + 1 &&
      renderer.calls.updateParts.length === syncBeforeReshape.u
  );

  // banish — the second summon leaves.
  const out6 = fp.performForgeDecision(
    decision("forge-banish", { node: "ghost-node-2" }),
    handle
  );
  check(
    "T7 banish performs: the part and the node are gone",
    out6.kind === "performed" &&
      !partOf(scene, "ghost-node-2") &&
      !nodeOf(scene, "ghost-node-2") &&
      scene.parts.length === 6
  );

  // banish a node that does not exist — refused, scene untouched.
  const revBefore = scene.revision;
  const out7 = fp.performForgeDecision(
    decision("forge-banish", { node: "nope-node" }),
    handle
  );
  check(
    "T7 an act naming a missing node is refused with its reason — never improvised, scene untouched",
    out7.kind === "refused" &&
      out7.reason.includes("nope-node") &&
      scene.revision === revBefore,
    JSON.stringify(out7)
  );

  // relight — warm.
  const out8 = fp.performForgeDecision(decision("forge-relight", { preset: "warm" }), handle);
  check(
    "T7 relight performs: the scene's environment takes the preset's key light and intensity",
    out8.kind === "performed" &&
      scene.environment.pointLights?.[0]?.intensity === 80 &&
      near3(scene.environment.pointLights[0].color, [1, 0.62, 0.34], 1e-9) &&
      scene.environment.environmentIntensity === 0.8,
    JSON.stringify(scene.environment.pointLights)
  );

  // camera — orbit-left rotates the authored eye by the step.
  const eyeBefore = [...scene.camera.eye];
  const target = scene.camera.target;
  const angleBefore = Math.atan2(eyeBefore[2] - target[2], eyeBefore[0] - target[0]);
  const radiusBefore = Math.hypot(eyeBefore[0] - target[0], eyeBefore[2] - target[2]);
  const out9 = fp.performForgeDecision(
    decision("forge-camera", { direction: "orbit-left" }),
    handle
  );
  const eyeAfter = scene.camera.eye;
  const angleAfter = Math.atan2(eyeAfter[2] - target[2], eyeAfter[0] - target[0]);
  const radiusAfter = Math.hypot(eyeAfter[0] - target[0], eyeAfter[2] - target[2]);
  check(
    "T7 camera performs: the authored eye orbits by the step at the same radius, and the layer is asked to re-sync",
    out9.kind === "performed" &&
      Math.abs(angleAfter - angleBefore - Math.PI / 6) < 1e-9 &&
      Math.abs(radiusAfter - radiusBefore) < 1e-9 &&
      refreshed === 1,
    `dAngle=${angleAfter - angleBefore}`
  );

  // camera — closer shrinks the radius by the step factor.
  const out10 = fp.performForgeDecision(
    decision("forge-camera", { direction: "closer" }),
    handle
  );
  const radiusCloser = Math.hypot(
    scene.camera.eye[0] - target[0],
    scene.camera.eye[2] - target[2]
  );
  check(
    "T7 camera closer performs: the authored radius scales by 0.75",
    out10.kind === "performed" && Math.abs(radiusCloser - radiusAfter * 0.75) < 1e-9
  );
}

/* ---- T7b. the revision discipline: retry once, then drop ---------- */

// The scene object seals its own methods, so a stale scene is
// simulated the honest way: a facade at the seam whose apply
// first lands a CONCURRENT editor's op on the real scene —
// advancing the real revision — and then presents the
// performer's apply, which the REAL engine refuses as stale,
// in its own words. No error is fabricated; the refusal the
// performer retries against is the engine's genuine one.
const concurrentFacade = (real, interfere) => {
  let calls = 0;
  const facade = {
    get parts() {
      return real.parts;
    },
    get camera() {
      return real.camera;
    },
    get environment() {
      return real.environment;
    },
    get effects() {
      return real.effects;
    },
    get revision() {
      return real.revision;
    },
    exportRecipe: () => real.exportRecipe(),
    apply(ops, opts) {
      calls++;
      if (interfere(calls)) {
        real.apply(
          [{ type: "set-node", id: "ball-node", translation: [0.8, 0.61, 0.6] }],
          { expectedRevision: real.revision }
        );
      }
      return real.apply(ops, opts);
    },
  };
  return { facade, calls: () => calls };
};

{
  // Interference on the first apply only: the act must land on
  // the single retry, translated against the fresh scene.
  const scene = freshScene();
  const renderer = recordingRenderer();
  const { facade, calls } = concurrentFacade(scene, (n) => n === 1);
  const handle = { scene: facade, renderer, refreshCamera: () => {} };
  const rev0 = scene.revision;
  const out = fp.performForgeDecision(
    decision("forge-move", { node: "ball-node", position: [0, 2, 0] }),
    handle
  );
  check(
    "T7b a genuine stale refusal is retried ONCE against the fresh scene and the act lands (attempts = 2)",
    out.kind === "performed" &&
      out.attempts === 2 &&
      calls() === 2 &&
      scene.revision === rev0 + 2 &&
      near3(
        (() => {
          const m = partOf(scene, "ball-node").matrix;
          return [m[12], m[13], m[14]];
        })(),
        [0, 2, 0],
        1e-6
      ),
    JSON.stringify(out) + ` calls=${calls()} rev=${scene.revision}`
  );
}
{
  // Interference on EVERY apply: the act drops after the single
  // retry — reported as stale-dropped, never looped.
  const scene = freshScene();
  const renderer = recordingRenderer();
  const { facade, calls } = concurrentFacade(scene, () => true);
  const handle = { scene: facade, renderer, refreshCamera: () => {} };
  const out = fp.performForgeDecision(
    decision("forge-move", { node: "ball-node", position: [0, 2, 0] }),
    handle
  );
  check(
    "T7b a scene that keeps moving drops the act after exactly one retry (stale-dropped, 2 applies, no loop)",
    out.kind === "stale-dropped" && calls() === 2,
    JSON.stringify(out) + ` calls=${calls()}`
  );
}
{
  // No scene at all: the act does not happen, honestly.
  const out = fp.performForgeDecision(
    decision("forge-summon", { geometry: "box", color: "#e2492f" }),
    null
  );
  check(
    "T7b with no live scene the outcome is no-scene — nothing is faked",
    out.kind === "no-scene"
  );
  // Through the seam itself: register, perform with no explicit
  // handle, clear, and the same decision finds no scene.
  fp.__resetForgeSceneForTests();
  const scene = freshScene();
  const renderer = recordingRenderer();
  fp.registerForgeScene({ scene, renderer, refreshCamera: () => {} });
  const viaSeam = fp.performForgeDecision(
    decision("forge-relight", { preset: "cool" })
  );
  fp.registerForgeScene(null);
  const afterClear = fp.performForgeDecision(
    decision("forge-relight", { preset: "cool" })
  );
  fp.__resetForgeSceneForTests();
  check(
    "T7b the performer reads the seam by default: registered scene performs, cleared seam is no-scene",
    viaSeam.kind === "performed" && afterClear.kind === "no-scene",
    `${viaSeam.kind}/${afterClear.kind}`
  );
}
check(
  "T7 after every forge act above, the addon's on-demand modules were never loaded (core ops only — the load-order answer)",
  agentScene.allAgentSceneModulesLoaded() === false
);

/* ---- T8. the peer + host wiring ----------------------------------- */

check(
  "T8 GhostPeer carries the forge sink and routes every forge intent through the one performance",
  peerSrc.includes("onForgeDecision?: (decision: GhostDecision) => void") &&
    peerSrc.includes('case "forge-summon":') &&
    peerSrc.includes('case "forge-camera":') &&
    peerSrc.includes("this.performForge(decision);") &&
    peerSrc.includes("private performForge(decision: GhostDecision): void")
);
check(
  "T8 the hook forwards the forge sink to the peer (the ref idiom of its sibling sinks)",
  hookSrc.includes("onForgeDecisionRef") &&
    hookSrc.includes("onForgeDecision: (decision) => {")
);
check(
  "T8 the host wires the sink to the real performer (LegacyFluid -> forgePerformer)",
  fluidSrc.includes('from "../forge/forgePerformer"') &&
    fluidSrc.includes("performForgeDecision(decision)")
);
check(
  // Slice L amended this pin: Slice B held the forge intents
  // silent (null) because the peer emitted no cue for a scene
  // act; Slice L voices every act, so the honest map is the
  // assigned families — pinned here, and measured for real in
  // forge-sounds-check.
  "T8 the voice map is honest about the forge intents: every act carries its Slice L family",
  read("src/ghost/ghostVoice.ts").includes('"forge-summon": "waking"') &&
    read("src/ghost/ghostVoice.ts").includes('"forge-banish": "sleepy"') &&
    read("src/ghost/ghostVoice.ts").includes('"forge-move": "play"') &&
    read("src/ghost/ghostVoice.ts").includes('"forge-recolor": "echo"') &&
    read("src/ghost/ghostVoice.ts").includes('"forge-reshape": "surprised"') &&
    read("src/ghost/ghostVoice.ts").includes('"forge-relight": "cheer"') &&
    read("src/ghost/ghostVoice.ts").includes('"forge-camera": "thinking"')
);

console.log(`\nforge-tools-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
