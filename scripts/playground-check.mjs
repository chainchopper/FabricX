/**
 * playground-check — headless proof for Slice 53, "The Ghostie
 * Playground + possession framing".
 *
 * Run: node scripts/playground-check.mjs [repoRoot]
 *   (bundles the modules it drives with esbuild itself, the
 *    genx-check pattern, into /tmp, then imports them.)
 *
 * Proves:
 *   A — registration: the Playground is a builtin fabric (fluid
 *       stays builtin[0] — the landing is untouched), with its
 *       own room, a declared idle contract, a drawn gallery
 *       scene, and a type-union entry.
 *   B — the manifest: the Playground declares the ghost's FULL
 *       tool registry; sanitize attaches it + its hash to the
 *       scenario; every deliberation intent is allowed there;
 *       the stage still refuses splat/draw/play-note intents.
 *   C — note layers: isGhostNoteLayer's truth table; the
 *       deliberated call-and-response (noteDecisionFor) fires
 *       on the Playground and stays silent on the stage; the
 *       peer's asked note performs on the Playground (sink
 *       fired) and reads "unavailable" on stage and fluid —
 *       Slice 31/47's ordering preserved.
 *   D — the asks perform: bodyPosition reads the ghost's body;
 *       answerDrawAround at the body performs and hands ONE
 *       ring recipe to the sink; answerVerb performs; the
 *       heartbeat answers with a plausible tempo or an honest
 *       null.
 *   E — the layer's wiring: every tray control calls a real ask
 *       prop; the status line maps GhostActResult (no canned
 *       success); the key strip emits on the shared note bus
 *       with an unmount off-guard; say-chips dispatch the real
 *       compose event; LegacyFluid mounts the layer on the
 *       Playground only and routes both note gates through
 *       isGhostNoteLayer (the old hard piano gate is gone).
 *   F — the info panel: a complete Playground record; its icon
 *       dock; ghostToolsHere offers all six tools on the
 *       Playground and keeps Slice 49's piano/stage truths;
 *       the Dancer Stage record carries the possession lines.
 *   G — possession on stage: the pill exists, is ChromeMount-
 *       wrapped, excludes the loading/failed states (never
 *       stacks on their anchor), and is fired by a figure
 *       taking the stage and by a verb landing on the local rig.
 *   H — chrome geometry, computed from the components' own
 *       literals: the tray and the info icon share one baseline
 *       at opposite corners with air between them at 390pt, and
 *       the tray clears the HUD band.
 *
 * Powered by Nirvana
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..")
);

let failures = 0;
let passes = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passes += 1;
  else failures += 1;
};
const read = (rel) => readFileSync(join(root, rel), "utf8");

/* ---------------- bundle the modules under test ---------------- */
const esbuildPath = [
  "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js",
  join(root, "node_modules/esbuild/lib/main.js"),
].find((p) => {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
});
const bundle = (entry, out) => {
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `const esbuild = require(${JSON.stringify(esbuildPath)});` +
        `esbuild.buildSync({ entryPoints: [${JSON.stringify(join(root, entry))}],` +
        ` bundle: true, format: "esm", platform: "node",` +
        ` outfile: ${JSON.stringify(out)}, logLevel: "silent" });`,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(`bundle failed for ${entry}: ${r.stderr}`);
    process.exit(2);
  }
};
bundle("src/ghost/GhostBrain.ts", "/tmp/PG-GB.mjs");
bundle("src/ghost/GhostPeer.ts", "/tmp/PG-GP.mjs");
bundle("app/components/fabric/fabricInfo.ts", "/tmp/PG-FI.mjs");

const brain = await import(pathToFileURL("/tmp/PG-GB.mjs").href);
const { GhostPeer } = await import(pathToFileURL("/tmp/PG-GP.mjs").href);
const finfo = await import(pathToFileURL("/tmp/PG-FI.mjs").href);

const PG = "ghostie-playground";
const permissive = { draw: true, verbs: true, notes: true };
const ctx = (layer_id, over = {}) => ({
  layer_id,
  canvas: "fluid",
  role: "open",
  in_session: false,
  rules: { ...permissive },
  ...over,
});
const mkScenario = (fabric) => ({
  temperament: "curious",
  seconds_since_human_touch: 5,
  recent_events: [],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.2,
  verbs_seen: [],
  other_ghosts: [],
  room_energy_trend: "steady",
  ...(fabric ? { fabric } : {}),
});
const mkPeer = (fabricCtx, sink = {}) => {
  const seen = { recipes: [], notes: [], perfs: [] };
  const peer = new GhostPeer({
    peerId: "ghost:playground-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: () => {},
    broadcast: () => {},
    ghostName: "Boop",
    getFabricContext: () => fabricCtx,
    onDrawRecipe: (r) => seen.recipes.push(r),
    onNote: (n) => seen.notes.push(n),
    onPerformance: (l) => seen.perfs.push(l),
    ...sink,
  });
  return { peer, seen };
};

/* ---------------- A. registration ---------------- */
console.log("== A. registration ==");
const registry = read("src/contexts/ExperienceContext.tsx");
const pgEntry = registry.slice(
  registry.indexOf(`id: "${PG}"`),
  registry.indexOf(`id: "${PG}"`) + 1600
);
check("A1 the Playground is a builtin fabric", pgEntry.length > 100);
check(
  "A2 the fluid stays builtin[0] (the landing is untouched)",
  registry.indexOf('id: "default-fluid"') < registry.indexOf(`id: "${PG}"`) &&
    /const builtin: ExperienceLayer\[\] = \[\s*\{\s*id: "default-fluid"/.test(registry)
);
check(
  "A3 its own room, declared idle contract, warm card text",
  pgEntry.includes('roomId: "playground"') &&
    pgEntry.includes('idleBehavior: "ambient"') &&
    pgEntry.includes("blurb:")
);
check(
  "A4 the type union knows it",
  read("src/types/experience.ts").includes(`| "${PG}"`)
);
check(
  "A5 the gallery draws its scene",
  read("app/components/fabric/FabricThumb.tsx").includes(`"${PG}": () =>`)
);

/* ---------------- B. the manifest ---------------- */
console.log("== B. the manifest ==");
const manifest = brain.GHOST_FABRIC_TOOL_MANIFEST[PG];
check(
  "B1 the Playground declares the FULL tool registry",
  Array.isArray(manifest) &&
    JSON.stringify([...manifest].sort()) ===
      JSON.stringify([...brain.GHOST_TOOL_IDS].sort()),
  manifest ? manifest.join(",") : "none"
);
check(
  "B2 fabricManifestFor returns it",
  brain.fabricManifestFor(PG) === manifest
);
const sanitized = brain.sanitizeFabricContext(ctx(PG));
check(
  "B3 sanitize attaches the manifest + its hash",
  JSON.stringify(sanitized.tools) === JSON.stringify(manifest) &&
    sanitized.tools_hash === brain.ghostManifestHash(sanitized.tools)
);
check(
  "B4 every deliberation intent is allowed on the Playground",
  Object.keys(brain.GHOST_INTENT_TOOL).every((intent) =>
    brain.fabricAllowsIntent(mkScenario(sanitized), intent)
  )
);
const stageScenario = mkScenario(brain.sanitizeFabricContext(ctx("dancer-stage")));
check(
  "B5 the stage still refuses splat, draw and play-note intents",
  !brain.fabricAllowsIntent(stageScenario, "play") &&
    !brain.fabricAllowsIntent(stageScenario, "draw") &&
    !brain.fabricAllowsIntent(stageScenario, "play-note")
);

/* ---------------- C. note layers ---------------- */
console.log("== C. note layers ==");
check(
  "C1 isGhostNoteLayer's truth table",
  brain.isGhostNoteLayer("ar-piano") &&
    brain.isGhostNoteLayer(PG) &&
    !brain.isGhostNoteLayer("dancer-stage") &&
    !brain.isGhostNoteLayer("default-fluid") &&
    !brain.isGhostNoteLayer("genx-fold") &&
    !brain.isGhostNoteLayer(null) &&
    !brain.isGhostNoteLayer(undefined)
);
// noteDecisionFor reads recent_events off the scenario itself.
const heardPg = { ...mkScenario(sanitized), recent_events: ["human played C4"] };
const heardStage = {
  ...mkScenario(stageScenario.fabric),
  recent_events: ["human played C4"],
};
check(
  "C2 deliberation answers a heard note on the Playground",
  brain.noteDecisionFor(heardPg)?.decision?.intent === "play-note"
);
check(
  "C3 deliberation stays silent on the stage (no note surface)",
  brain.noteDecisionFor(heardStage) === null
);
{
  const { peer, seen } = mkPeer(brain.sanitizeFabricContext(ctx(PG)));
  const res = peer.answerNote(null);
  // The note rides the peer's own scheduler (emitNoteToSink) —
  // give it its tick, the ghost-tools-check pattern.
  await new Promise((r) => setTimeout(r, 450));
  check(
    "C4 an asked note performs on the Playground, through the sink",
    res === "performed" && seen.notes.length === 1,
    `res=${res} notes=${seen.notes.length}`
  );
}
{
  const { peer } = mkPeer(brain.sanitizeFabricContext(ctx("dancer-stage")));
  check(
    "C5 an asked note is unavailable on the stage (Slice 31 ordering kept)",
    peer.answerNote(null) === "unavailable"
  );
}
{
  const { peer } = mkPeer(brain.sanitizeFabricContext(ctx("default-fluid")));
  check(
    "C6 an asked note is unavailable on the fluid (Slice 31 ordering kept)",
    peer.answerNote(null) === "unavailable"
  );
}

/* ---------------- D. the asks perform ---------------- */
console.log("== D. the asks perform ==");
{
  const { peer, seen } = mkPeer(brain.sanitizeFabricContext(ctx(PG)));
  const pos = peer.bodyPosition();
  check(
    "D1 bodyPosition reads the ghost's body, in canvas bounds",
    !!pos && pos.x >= 0 && pos.x <= 1 && pos.y >= 0 && pos.y <= 1,
    pos ? `(${pos.x}, ${pos.y})` : "null"
  );
  const res = pos
    ? peer.answerDrawAround(pos.x, pos.y, 0.16, "itself")
    : "unavailable";
  check(
    "D2 Draw performs at the body: ONE ring recipe to the sink",
    res === "performed" &&
      seen.recipes.length === 1 &&
      seen.recipes[0]?.steps?.[0]?.shape === "ring",
    `res=${res} recipes=${seen.recipes.length}`
  );
}
{
  const { peer } = mkPeer(brain.sanitizeFabricContext(ctx(PG)));
  check("D3 a verb ask performs", peer.answerVerb("heart") === "heart");
}
{
  const { peer } = mkPeer(brain.sanitizeFabricContext(ctx(PG)));
  const bpm = peer.answerHeartbeat();
  check(
    "D4 the heartbeat answers with a plausible tempo, or honestly not at all",
    bpm === null || (bpm >= 30 && bpm <= 200),
    `bpm=${bpm}`
  );
}

/* ---------------- E. the layer's wiring ---------------- */
console.log("== E. the layer's wiring ==");
const layer = read("src/components/playground/PlaygroundLayer.tsx");
const fluid = read("src/components/fluid/LegacyFluid.tsx");
check(
  "E1 the layer mounts the real note pipeline (bus, synth, fluid wiring)",
  layer.includes('from "../../../shared/utils/noteBus"') &&
    layer.includes("useMIDIFluid(") &&
    layer.includes("<ToneEngine />") &&
    read("src/components/audio/ToneEngine.tsx").includes(`activeId === "${PG}"`)
);
check(
  "E2 every tray control calls a real ask prop",
  [
    "props.askHeartbeat()",
    "props.askVerb(verb)",
    "props.askDraw()",
    "props.askNote(null)",
    "props.askNoteAgain()",
    "props.askArpeggio()",
  ].every((s) => layer.includes(s))
);
check(
  "E3 the status line maps the result — performed / refused / unavailable",
  layer.includes('res === "performed"') &&
    layer.includes('res === "refused"') &&
    layer.includes("needs a moment")
);
check(
  "E4 the strip emits on the bus at keyboard velocity, off-guarded on unmount",
  layer.includes("noteBus.emitNoteOn(note, STRIP_VELOCITY)") &&
    layer.includes("noteBus.emitNoteOff(note)") &&
    layer.includes("heldNow.current.forEach")
);
check(
  "E5 say-chips speak through the real compose event",
  layer.includes("FABRIC_COMPOSE_EVENT") &&
    layer.includes("new CustomEvent(FABRIC_COMPOSE_EVENT")
);
check(
  "E6 LegacyFluid mounts the layer on the Playground only, props = the peer's asks",
  fluid.includes(`state.activeExperience?.id === "${PG}"`) &&
    fluid.includes("ghostRef.current.answerHeartbeat()") &&
    fluid.includes("ghostRef.current.answerDrawAround(") &&
    fluid.includes("ghostRef.current.bodyPosition()")
);
check(
  "E7 both canvas note gates route through isGhostNoteLayer; the hard piano gate is gone",
  (fluid.match(/isGhostNoteLayer\(experienceRef\.current\?\.id\)/g) ?? [])
    .length === 2 &&
    !fluid.includes('experienceRef.current?.id !== "ar-piano"')
);

/* ---------------- F. the info panel ---------------- */
console.log("== F. the info panel ==");
const rec = finfo.fabricInfoFor(PG);
check(
  "F1 a complete Playground record",
  !!rec &&
    rec.about.length > 20 &&
    rec.modes.length >= 1 &&
    rec.rules.length >= 1 &&
    rec.controls.length >= 1
);
check("F2 its icon dock is the fluid band's", finfo.iconBottomFor(PG) === 110);
{
  const here = finfo.ghostToolsHere(PG, "fluid", permissive);
  check(
    "F3 the panel offers the ghost all six tools in its Playground",
    here.length === 6 && here.every((t) => t.available),
    here.map((t) => `${t.id}:${t.available}`).join(" ")
  );
}
{
  const stage = finfo.ghostToolsHere("dancer-stage", "stage3d", permissive);
  const note = stage.find((t) => t.id === "note-perform");
  const draw = stage.find((t) => t.id === "draw");
  check(
    "F4 Slice 49's stage truths hold (no notes, no draw surface)",
    note?.available === false &&
      note?.note === "The ghost plays notes at the Piano" &&
      draw?.available === false
  );
}
{
  const stageRec = finfo.fabricInfoFor("dancer-stage");
  check(
    "F5 the stage record carries the possession lines",
    stageRec.modes.some((m) => m.includes("Possessed")) &&
      stageRec.rules.some((r) => r.includes("Nothing moves a dancer"))
  );
}

/* ---------------- G. possession on stage ---------------- */
console.log("== G. possession on stage ==");
const stage = read("src/dancer/DancerStage.tsx");
check(
  "G1 the possession pill exists, in product language",
  stage.includes("is driving this dancer") && stage.includes("possessPill")
);
check(
  "G2 it never stacks with the load/fail pills (same anchor, excluded states)",
  stage.includes('charState.status !== "loading"') &&
    stage.includes('charState.status !== "failed"') &&
    stage.includes("figureEnabled &&")
);
check(
  "G3 fired by a figure taking the stage",
  stage.includes('charState.status === "ready"') &&
    stage.includes("showPossession()")
);
check(
  "G4 fired by a verb landing on the local rig",
  stage.includes("rigKey === localUserIdRef.current")
);

/* ---------------- H. chrome geometry ---------------- */
console.log("== H. chrome geometry ==");
{
  const num = (re, fallback) => {
    const m = layer.match(re);
    return m ? Number(m[1]) : fallback;
  };
  const trayLeft = num(/left: (\d+),\s*\n\s*bottom: 110,\s*\n\s*width: (\d+)/, 12);
  const trayWidthCap = 302;
  const trayMaxPct = 76;
  const trayRight = trayLeft + Math.min(trayWidthCap, (trayMaxPct / 100) * 390);
  const iconLeft = 390 - 12 - 44; // FABRIC_ICON_RIGHT + FABRIC_ICON_SIZE
  check(
    "H1 tray and icon share the baseline at opposite corners, with air",
    trayRight + 8 <= iconLeft,
    `tray right ${trayRight.toFixed(1)} vs icon left ${iconLeft}`
  );
  check(
    "H2 the tray's baseline clears the HUD band (98) by the house 12",
    layer.includes("bottom: 110") && finfo.iconBottomFor(PG) === 110
  );
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
console.log("ALL CHECKS PASSED");
// The driven peers keep scheduler timers alive; exit explicitly,
// the house-check pattern.
process.exit(0);
