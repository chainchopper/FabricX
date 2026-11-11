// forge-presence-check — pins Slice C, Forge presence.
//
// What Slice C is: the ghostie is HOSTED on the Forge canvas.
// While the Forge is the loaded fabric, ForgeLayer runs the
// app's one ghost host (useGhostPeer — the same hook, peer
// lifecycle, deliberation cadence and brain-tier routing the
// fluid host uses; the renderer's canvas branches are
// exclusive, so exactly one host is ever mounted) with a
// fabric context naming the Forge (canvas "forge67"), and
// wires the sinks that are real there: onForgeDecision to
// Slice B's performer through the seam, onSfx to the shared
// ghost voice. The scene is a SENSE: the layer feeds the peer
// a bounded summary of the live scene (nodes + revision,
// forgeSceneSummary), the peer sanitizes it into the
// scenario's forge_scene (GhostBrain), and a changed summary
// re-arms deliberation through the signature gate — an
// unchanged one never does.
//
// The presence ORB was evaluated and CUT, and this check pins
// the fact that forced the cut: forge-summon's sanitized spec
// carries {geometry, color, position?} and NO node id — a
// summon cannot name its node (the performer allocates
// ghost-node-<k>), so a "reserved-id orb" would need special
// cases in the decision schema and the performer. Presence on
// the Forge is deliberated acts plus the established ghost
// signals (presence / brain line / journal), nothing faked.
//
// Proven here, headlessly:
//   P0 source pins: the layer hosts via the shared hook (no
//      second peer construction, no Forge-only brain path),
//      the context names the Forge, the fluid host is intact.
//   P1 the sense reaches the scenario: sanitized, bounded,
//      absent when unfed, stale-proof against garbled feeds.
//   P2 the signature gate's units + the color round-trip the
//      summary's honesty rests on.
//   P3 the summary builder against the REAL agent-scene: the
//      starter scene reads back as its authored self.
//   P4 the dirty gate over real time: birth deliberation sees
//      the fed scene; a change re-arms exactly at the floor;
//      silence after the floor when nothing changed.
//   P5 the full loop: a peer deliberates on the Forge, a stub
//      brain (the router's last mile: refusal gate +
//      applyBrainDecision) chooses a summon from the scenario
//      it was handed, the peer performs it, and the REAL
//      performer advances the REAL scene's revision.
//   P6 the peer's own forge gate follows the LIVE fabric
//      context: refused off-Forge, performed on it.
//   P7 the orb cut, pinned: no reserved-id mechanism exists.
//
// Run: node scripts/forge-presence-check.mjs
// (bundles the real modules with the tree's esbuild; the
// dirty-gate section waits out two real deliberation floors,
// so the whole run takes ~30s.)
import { readFileSync, writeFileSync } from "node:fs";
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, stepMs = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(stepMs);
  }
  return fn();
}
function near3(a, b, eps) {
  return (
    Array.isArray(a) && a.length === 3 && b.every((v, i) => Math.abs(a[i] - v) <= eps)
  );
}
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const read = (p) => readFileSync(p, "utf8");
const brainSrc = read("src/ghost/GhostBrain.ts");
const peerSrc = read("src/ghost/GhostPeer.ts");
const hookSrc = read("src/ghost/useGhostPeer.ts");
const fluidSrc = read("src/components/fluid/LegacyFluid.tsx");
const layerSrc = read("src/components/forge/ForgeLayer.tsx");
const summarySrc = read("src/components/forge/forgeSceneSummary.ts");

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
// One graph for brain + peer + performer + seam + scene +
// summary, so the store instance the check drives is the
// performer's own (the forge-tools discipline).
const entryPath = "/tmp/forge-presence-entry.ts";
writeFileSync(
  entryPath,
  [
    `export * from ${JSON.stringify(process.cwd() + "/src/ghost/GhostBrain.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/ghost/GhostPeer.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePerformer.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeSceneStore.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeScene.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeSceneSummary.ts")};`,
  ].join("\n")
);
bundle(entryPath, "/tmp/forge-presence-FP.mjs");
bundle("src/ghost/ghostTools.ts", "/tmp/forge-presence-GT.mjs");
const fp = await import("/tmp/forge-presence-FP.mjs");
const tools = await import("/tmp/forge-presence-GT.mjs");
const { createAgentScene } = createRequire(import.meta.url)(
  "67js/addons/agent-scene"
);

const FORGE_CTX = () =>
  fp.sanitizeFabricContext({
    layer_id: "forge",
    canvas: "forge67",
    role: "open",
    in_session: false,
    rules: { draw: true, verbs: true, notes: true },
  });

function makePeer(extra = {}) {
  const seen = { injects: [], sink: [], deliberations: [] };
  const peer = new fp.GhostPeer({
    peerId: "ghost:presence-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: (i) => seen.injects.push(i),
    broadcast: (i) => seen.injects.push(i),
    getFabricContext: FORGE_CTX,
    onForgeDecision: (d) => seen.sink.push(d),
    onDeliberate: (s) => seen.deliberations.push(s),
    ...extra,
  });
  return { peer, seen };
}

const S1 = {
  revision: 3,
  nodes: [
    { id: "cube-node", geometry: "box", color: "#e2492f" },
    { id: "ball-node", geometry: "sphere", color: "#0e7c86" },
  ],
};

/* ---- P0. source pins: one host, honestly wired ------------------ */

check(
  "P0 ForgeLayer hosts the ghost through the shared hook (useGhostPeer) — no second host machinery",
  layerSrc.includes("useGhostPeer({") &&
    layerSrc.includes("onForgeDecision: (decision)") &&
    layerSrc.includes("performForgeDecision(decision)"),
  "the Slice B sink, hosted on the layer"
);
check(
  "P0 ForgeLayer constructs no GhostPeer itself and imports no brain tier (no Forge-only brain path)",
  !layerSrc.includes("new GhostPeer") &&
    !layerSrc.includes('from "../../ghost/GhostPeer"') &&
    !layerSrc.includes("LLMService") &&
    !layerSrc.includes("decideOnDevice") &&
    !layerSrc.includes("WebLLM"),
  "deliberation routes through the one hook, app-wide tiers unchanged"
);
check(
  "P0 the layer's fabric context names the Forge (canvas \"forge67\", the layer's own id, session role + rules)",
  layerSrc.includes('canvas: "forge67" as const') &&
    layerSrc.includes("layer_id: state.activeExperience?.id") &&
    layerSrc.includes("getSessionFabricState().rules"),
  "the same context discipline the fluid host builds"
);
check(
  "P0 the layer feeds the scene sense (summary builder -> the hook's noteForgeScene) and canvas activity",
  layerSrc.includes("buildForgeSceneSummary(handle.scene)") &&
    layerSrc.includes("noteForgeScene(summary)") &&
    layerSrc.includes("noteUserActivity()") &&
    hookSrc.includes("noteForgeScene") &&
    peerSrc.includes("noteForgeScene(raw: unknown)"),
  "layer -> hook -> peer, the genx sense's path"
);
check(
  "P0 the fluid host is untouched by the Forge host (LegacyFluid still hosts its own peer + forge sink)",
  fluidSrc.includes("useGhostPeer({") &&
    fluidSrc.includes("onForgeDecision: (decision)"),
  "exclusive renderer branches: one host mounted at a time"
);
check(
  "P0 the scenario sense is freshness-windowed like its siblings (forge_scene rides buildScenario inside 45s)",
  peerSrc.includes("forge_scene: forgeScene") &&
    peerSrc.includes("this.forgeSceneDigest.at < 45_000") &&
    brainSrc.includes("forge_scene?: GhostForgeSceneContext"),
  "a stale scene is never deliberated about"
);

/* ---- P1. the sense reaches the scenario -------------------------- */

{
  const { peer } = makePeer();
  peer.noteForgeScene(S1);
  const sc = peer.buildScenario(Date.now());
  check(
    "P1 a fed summary rides the scenario, sanitized to the sense's shape",
    deepEq(sc.forge_scene, S1),
    JSON.stringify(sc.forge_scene)
  );
  check(
    "P1 the same scenario's fabric context names the Forge and offers exactly the seven forge tools",
    sc.fabric?.canvas === "forge67" &&
      sc.fabric?.layer_id === "forge" &&
      deepEq(sc.fabric?.tools, [...fp.GHOST_FORGE_TOOL_IDS]),
    JSON.stringify(sc.fabric?.tools)
  );
  peer.destroy();
}
{
  const { peer } = makePeer();
  const sc = peer.buildScenario(Date.now());
  check(
    "P1 an unfed peer's scenario carries no forge_scene key at all (absence changes nothing)",
    !("forge_scene" in sc),
    "legacy scenarios stay byte-identical"
  );
  peer.destroy();
}
{
  const { peer } = makePeer();
  peer.noteForgeScene(S1);
  peer.noteForgeScene(null);
  peer.noteForgeScene("junk");
  peer.noteForgeScene({
    revision: -2,
    nodes: [
      { id: "bad id!", geometry: "box", color: "#ffffff" },
      { id: "ok-node", geometry: "pyramid", color: "red" },
      "junk",
      { id: "third", geometry: "torus", color: "#00FF00" },
    ],
  });
  const sc = peer.buildScenario(Date.now());
  check(
    "P1 garbled feeds never reach the brain as fact (bad ids dropped, geometry clamps to other, color to null, revision floors at 0)",
    deepEq(sc.forge_scene, {
      revision: 0,
      nodes: [
        { id: "ok-node", geometry: "other", color: null },
        { id: "third", geometry: "torus", color: "#00ff00" },
      ],
    }),
    JSON.stringify(sc.forge_scene)
  );
  peer.destroy();
}
{
  const { peer } = makePeer();
  peer.noteForgeScene({
    revision: 1,
    nodes: Array.from({ length: 30 }, (_, i) => ({
      id: `node-${i}`,
      geometry: "box",
      color: "#101010",
    })),
  });
  const sc = peer.buildScenario(Date.now());
  check(
    "P1 the summary is bounded (30 fed nodes ride as the 24-node cap)",
    sc.forge_scene?.nodes.length === fp.FORGE_SCENE_SUMMARY_MAX_NODES,
    `${sc.forge_scene?.nodes.length} nodes`
  );
  peer.destroy();
}

/* ---- P2. signature + color units --------------------------------- */

{
  const a = fp.sanitizeForgeSceneContext(S1);
  const same = fp.sanitizeForgeSceneContext(JSON.parse(JSON.stringify(S1)));
  const recolored = fp.sanitizeForgeSceneContext({
    ...S1,
    nodes: [S1.nodes[0], { ...S1.nodes[1], color: "#e2492f" }],
  });
  const bumped = fp.sanitizeForgeSceneContext({ ...S1, revision: 4 });
  check(
    "P2 the change signature is stable for the same room and moves on color or revision change",
    fp.forgeSceneSignature(a) === fp.forgeSceneSignature(same) &&
      fp.forgeSceneSignature(a) !== fp.forgeSceneSignature(recolored) &&
      fp.forgeSceneSignature(a) !== fp.forgeSceneSignature(bumped),
    "the dirty gate's key"
  );
  const roundTrips = Object.values(fp.FORGE_PALETTE).every(
    (h) => fp.linearToHex(fp.hexToLinear(h)) === h
  );
  check(
    "P2 authored colors round-trip exactly (linearToHex inverts hexToLinear over the whole palette)",
    roundTrips &&
      fp.linearToHex(null) === null &&
      fp.linearToHex([0, 0]) === null &&
      fp.linearToHex(["x", 0, 0]) === null,
    "the summary reports the color its author meant"
  );
}

/* ---- P3. the summary builder against the real scene -------------- */

{
  const scene = fp.buildForgeStarterScene(createAgentScene);
  const summary = fp.buildForgeSceneSummary(scene);
  check(
    "P3 the starter scene summarizes as its authored self (kinds via the performer's vocabulary, colors back in hex)",
    deepEq(summary, {
      revision: 0,
      nodes: [
        { id: "floor-node", geometry: "box", color: "#59606e" },
        { id: "cube-node", geometry: "box", color: "#e2492f" },
        { id: "ball-node", geometry: "sphere", color: "#0e7c86" },
        { id: "post-node", geometry: "cylinder", color: "#d9932c" },
        { id: "ring-node", geometry: "torus", color: "#7a4fd0" },
      ],
    }),
    JSON.stringify(summary)
  );
  check(
    "P3 an unreadable scene summarizes as null (never a fabricated empty room)",
    fp.buildForgeSceneSummary({
      revision: 0,
      exportRecipe() {
        throw new Error("boom");
      },
    }) === null,
    "the peer keeps its last honest digest"
  );
}

/* ---- P4. the dirty gate over real time ---------------------------- */

{
  const { peer, seen } = makePeer();
  peer.noteUserActivity();
  peer.noteForgeScene(S1);
  const born = await waitFor(() => seen.deliberations.length >= 1, 4000);
  check(
    "P4 the birth deliberation on the Forge already carries the fed scene",
    born && deepEq(seen.deliberations[0]?.forge_scene, S1),
    born ? `forge_scene=${JSON.stringify(seen.deliberations[0]?.forge_scene)}` : "no deliberation"
  );
  // Identical re-feeds: no change, no re-arm. Then ONE change.
  peer.noteForgeScene(JSON.parse(JSON.stringify(S1)));
  peer.noteForgeScene(JSON.parse(JSON.stringify(S1)));
  await sleep(1500);
  check(
    "P4 identical re-feeds do not re-arm (still one deliberation, the floor unexpired)",
    seen.deliberations.length === 1,
    `${seen.deliberations.length} deliberations`
  );
  const S2 = {
    revision: 4,
    nodes: [S1.nodes[0], { ...S1.nodes[1], color: "#e2492f" }],
  };
  peer.noteForgeScene(S2);
  await sleep(4000);
  check(
    "P4 a changed scene waits for the deliberation floor (no spam the moment it changes)",
    seen.deliberations.length === 1,
    `${seen.deliberations.length} deliberations mid-floor`
  );
  const second = await waitFor(() => seen.deliberations.length >= 2, 9000);
  check(
    "P4 the change deliberates at the floor, carrying the LATEST summary",
    second && deepEq(seen.deliberations[1]?.forge_scene, S2),
    second ? `forge_scene=${JSON.stringify(seen.deliberations[1]?.forge_scene)}` : "no second deliberation"
  );
  // Silence proof: the floor expires again with nothing changed.
  await sleep(10600);
  check(
    "P4 after the floor, silence: no deliberation while nothing changed (the gate, not the clock)",
    seen.deliberations.length === 2,
    `${seen.deliberations.length} deliberations`
  );
  peer.destroy();
}

/* ---- P5. the full loop: deliberate -> decide -> perform ---------- */

{
  fp.__resetForgeSceneForTests();
  const scene = fp.buildForgeStarterScene(createAgentScene);
  // forge-tools' recording double, verbatim shape: the performer
  // syncs parts, then renders one frame with the scene's camera.
  const renderer = {
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
  let refreshed = 0;
  fp.registerForgeScene({
    scene,
    renderer,
    refreshCamera: () => refreshed++,
  });

  const outcomes = [];
  const captured = [];
  let summoned = false;
  const { peer } = makePeer({
    onForgeDecision: (d) => outcomes.push(fp.performForgeDecision(d)),
    onDeliberate: (scenario) => {
      captured.push(scenario);
      // The stub brain: the router's last mile, honestly — the
      // refusal gate, then the peer's own apply path. It reads
      // the scenario it was handed and summons once, from what
      // the scene sense showed it.
      const decision = !summoned
        ? {
            mood_shift: null,
            intent: "forge-summon",
            pattern_id: null,
            draw_shape: null,
            note_name: null,
            sound_spec: null,
            music_phrase: null,
            forge_spec: { geometry: "sphere", color: "#ff8800", position: [0, 1.6, 2.6] },
            intensity: 0.5,
            linger_s: 5,
          }
        : {
            mood_shift: null,
            intent: "idle",
            pattern_id: null,
            draw_shape: null,
            note_name: null,
            sound_spec: null,
            music_phrase: null,
            forge_spec: null,
            intensity: 0.2,
            linger_s: 5,
          };
      if (!tools.ghostToolRefusal(decision.intent, scenario)) {
        summoned = true;
        peer.applyBrainDecision(decision, "device");
      }
    },
  });
  peer.noteUserActivity();
  peer.noteForgeScene(fp.buildForgeSceneSummary(scene));
  const revBefore = scene.revision;
  const landed = await waitFor(
    () => outcomes.some((o) => o.kind === "performed"),
    6000
  );
  const recipe = scene.exportRecipe();
  const summonedNode = recipe.nodes.find((n) => n.id === "ghost-node-1");
  const summonedMat = recipe.materials?.find(
    (m) => m.id === summonedNode?.material
  );
  check(
    "P5 a deliberated forge act lands on the REAL scene (performer outcome 'performed', revision +1, part set grows)",
    landed &&
      scene.revision === revBefore + 1 &&
      scene.parts.length === 6 &&
      !!summonedNode,
    `outcomes=${JSON.stringify(outcomes)} revision=${scene.revision}`
  );
  check(
    "P5 the summon is the decision's own (ball geometry, the decided color through the linear conversion)",
    !!summonedNode &&
      summonedNode.geometry === "ball" &&
      !!summonedMat &&
      near3(summonedMat.color, fp.hexToLinear("#ff8800"), 1e-6),
    JSON.stringify(summonedNode)
  );
  check(
    "P5 the deliberation that summoned saw the starter scene (the sense fed the decision, revision 0, five nodes)",
    captured.length >= 1 &&
      captured[0]?.forge_scene?.revision === 0 &&
      captured[0]?.forge_scene?.nodes.length === 5,
    `captured=${captured.length}`
  );
  check(
    "P5 the renderer was re-synced by replace (a topology change), the performer's own rule",
    renderer.calls.replaceParts.some((parts) => parts.length === 6) &&
      renderer.calls.render.length >= 1,
    JSON.stringify({
      replace: renderer.calls.replaceParts.length,
      update: renderer.calls.updateParts.length,
      render: renderer.calls.render.length,
    })
  );
  // Post-act awareness: the ghost's next scenario sees its own act.
  peer.noteForgeScene(fp.buildForgeSceneSummary(scene));
  const scAfter = peer.buildScenario(Date.now());
  const ghostNode = scAfter.forge_scene?.nodes.find(
    (n) => n.id === "ghost-node-1"
  );
  check(
    "P5 the scene sense tracks the act (the next summary names the summoned node, its kind and color)",
    scAfter.forge_scene?.revision === revBefore + 1 &&
      !!ghostNode &&
      ghostNode.geometry === "sphere" &&
      ghostNode.color === "#ff8800",
    JSON.stringify(ghostNode)
  );
  peer.destroy();
  fp.registerForgeScene(null);
  fp.__resetForgeSceneForTests();
}

/* ---- P6. the peer's forge gate follows the live context ---------- */

{
  // A REAL non-Forge manifest key (the fluid home's own): an
  // unknown layer id would fall back to the full registry —
  // the manifest's designed default — which is not "off-Forge".
  let ctx = fp.sanitizeFabricContext({
    layer_id: "default-fluid",
    canvas: "fluid",
    role: "open",
    in_session: false,
    rules: { draw: true, verbs: true, notes: true },
  });
  const { peer, seen } = makePeer({ getFabricContext: () => ctx });
  const summon = {
    mood_shift: null,
    intent: "forge-summon",
    pattern_id: null,
    draw_shape: null,
    note_name: null,
    sound_spec: null,
    music_phrase: null,
    forge_spec: { geometry: "box", color: "#3366ff" },
    intensity: 0.5,
    linger_s: 5,
  };
  peer.applyBrainDecision(summon, "device");
  const refusedOffForge = seen.sink.length === 0;
  ctx = FORGE_CTX();
  peer.applyBrainDecision(summon, "device");
  check(
    "P6 the same decision is refused off-Forge and performed on it (the gate is the live fabric context)",
    refusedOffForge && seen.sink.length === 1,
    `sink=${seen.sink.length}`
  );
  peer.destroy();
}

/* ---- P7. the orb cut, pinned -------------------------------------- */

{
  const spec = fp.sanitizeForgeSpec("forge-summon", {
    geometry: "sphere",
    color: "#ff8800",
    node: "ghost-orb",
    position: [0, 1, 0],
  });
  check(
    "P7 a summon's spec cannot carry a node id (the schema fact that cut the presence orb)",
    !!spec && !("node" in spec) && deepEq(Object.keys(spec).sort(), [
      "color",
      "geometry",
      "position",
    ]),
    JSON.stringify(spec)
  );
  const orbFree =
    !brainSrc.includes("ghost-orb") &&
    !peerSrc.includes("ghost-orb") &&
    !layerSrc.includes("ghost-orb") &&
    !summarySrc.includes("ghost-orb");
  check(
    "P7 no reserved-orb mechanism exists anywhere in the presence path (presence = acts + signals)",
    orbFree,
    "the cut is disclosed in the slice's PR body"
  );
}

console.log(`\nforge-presence-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
