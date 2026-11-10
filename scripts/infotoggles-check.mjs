/**
 * infotoggles-check.mjs — Slice 63: the info panel carries the
 * loaded fabric's feature toggles.
 *
 * Terrell (Nov 3, 2026): "Let's put toggles for the supported
 * and active features of a particular fabric in the info panel
 * behind that icon as well."
 *
 * Proves, headlessly:
 *   A. The ground truth parses: the registry's builtin fabrics
 *      and their declared capabilities, THIS LAYER's rendered
 *      toggle blocks + gates + read expressions, the generic
 *      LayerControls' MIDI toggle, the fluid stack's bool
 *      controls, and the FABRICS editor's curated fields.
 *   B. The panel's derivation (fabricInfo.layerFeaturesFor)
 *      EQUALS the set re-derived from those sources — keys and
 *      resting states, per fabric — with the universal three in
 *      THIS LAYER's relative order and no duplicates. A fabric
 *      the derivation doesn't know gets exactly the universal
 *      three: the blocks THIS LAYER renders for any layer.
 *   C. The editor agrees: every bool field the FABRICS editor
 *      curates for a fabric is in the panel's list with the
 *      same resting state; every choice field (picks, not
 *      features) is absent from every list; The Fold and the
 *      Playground, which the editor does not curate, still get
 *      their features from THIS LAYER alone.
 *   D. Names are THIS LAYER's own: each feature's label is the
 *      heading/button text of the surface that renders the
 *      toggle, checked against that surface's source file.
 *   E. States read as THIS LAYER reads them: an untouched layer
 *      shows every feature at its resting state; a stored true
 *      reads on and a stored false reads off, for default-on
 *      and default-off features alike.
 *   F. One store, proven at the key: a toggle write built by
 *      the panel's own withLayerFeature is persisted through
 *      the app's REAL storage module and read back by the
 *      literal store key (fabric_layer_settings_v1:<layerId>) —
 *      the flipped value landed, sibling keys unclobbered,
 *      another layer's slot untouched. The key itself is the
 *      mirror's: its prefix and key-builder body are pinned
 *      verbatim from LayerSettingsMirror (the mirror component
 *      imports React, which these trees deliberately never
 *      install — house checks execute the pure modules and pin
 *      the React seams textually, cf. settings50). The wiring
 *      pins tie the chain together: FabricInfo writes via
 *      updateConfig, the reducer merges specific shallowly, the
 *      mirror persists the config under the active layer's key.
 *   G. Panel wiring: the FEATURES section sits in the panel's
 *      order (after CONTROLS, before YOUR GHOSTIE HERE), the
 *      Slice 60 ghostie block above it is untouched, there are
 *      no per-fabric branches in the view (content resolves
 *      through the data module), the empty-state line exists,
 *      and the touched TSX parses.
 *
 * Run: node scripts/infotoggles-check.mjs   (from the repo root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const esbuild = require("esbuild");

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const read = (p) => readFileSync(path.join(root, p), "utf8");

/* ------------------------------------------------------------------ */
/* Bundle the pure data module (the panel's content source)           */
/* ------------------------------------------------------------------ */

const BUNDLE = "/tmp/infotoggles-fabricInfo.mjs";
await esbuild.build({
  entryPoints: [path.join(root, "app/components/fabric/fabricInfo.ts")],
  bundle: true,
  format: "esm",
  outfile: BUNDLE,
  logLevel: "silent",
});
const data = await import(BUNDLE);
const { layerFeaturesFor, layerFeatureActive, withLayerFeature, UNIVERSAL_LAYER_FEATURES } = data;

const menu = read("app/components/fabric/FabricMenu.tsx");
const finfo = read("app/components/fabric/FabricInfo.tsx");
const fdata = read("app/components/fabric/fabricInfo.ts");
const registrySrc = read("src/contexts/ExperienceContext.tsx");
const layerControls = read("app/components/LayerControls.tsx");
const ambienceControls = read("app/components/controls/AmbienceControls.tsx");
const musicControls = read("app/components/controls/MusicControls.tsx");
const mirror = read("app/components/fabric/LayerSettingsMirror.ts");

/* ------------------------------------------------------------------ */
/* A. Ground truth, parsed from the sources                           */
/* ------------------------------------------------------------------ */

// The registry: builtin fabrics in order + declared midi capability.
const builtinStart = registrySrc.indexOf("const builtin");
const builtinBlock = registrySrc.slice(builtinStart, registrySrc.indexOf("];", builtinStart));
const dcStart = registrySrc.indexOf("const defaultCapabilities");
const dcBlock = registrySrc.slice(dcStart, registrySrc.indexOf("};", dcStart));
const defaultMidi = /midi: (true|false)/.exec(dcBlock)?.[1] === "true";
const regHeads = [...builtinBlock.matchAll(/\n\s{4}id: "([a-z0-9-]+)",/g)];
const REGISTRY = regHeads.map((m, i) => {
  const seg = builtinBlock.slice(m.index, i + 1 < regHeads.length ? regHeads[i + 1].index : builtinBlock.length);
  const cap = /capabilities: \{[^}]*\}/.exec(seg);
  let midi = defaultMidi;
  if (cap) {
    const mm = /midi: (true|false)/.exec(cap[0]);
    if (mm) midi = mm[1] === "true";
  }
  return { id: m[1], midi };
});
check(
  "A1 the registry parses: 8 builtin fabrics, capabilities read per entry (Slice A adds the Forge — no midi, like See and the Fold)",
  REGISTRY.length === 8 &&
    REGISTRY.map((e) => e.id).join(",") ===
      "default-fluid,ar-piano,sam-see,dancer-stage,camera-effects,genx-fold,ghostie-playground,forge" &&
    REGISTRY.filter((e) => e.midi).map((e) => e.id).join(",") ===
      "default-fluid,ar-piano,dancer-stage,ghostie-playground",
  REGISTRY.map((e) => `${e.id}:${e.midi ? "midi" : "-"}`).join(" ")
);

// THIS LAYER's gates + read expressions + rendered toggles.
const handsGate = /const handsAppliesHere =\s*state\.activeExperience\?\.id === "([a-z-]+)" \|\|\s*state\.activeExperience\?\.id === "([a-z-]+)"/.exec(menu);
const HANDS_IDS = new Set(handsGate ? [handsGate[1], handsGate[2]] : []);
const STAGE_ID = /const isStageLayer = active\?\.id === "([a-z-]+)"/.exec(menu)?.[1];
const GENX_ID = /const genxAppliesHere = state\.activeExperience\?\.id === "([a-z-]+)"/.exec(menu)?.[1];
check(
  "A2 THIS LAYER's gates parse: Hands on fluid+See, stage block on the Stage, Fold block on the Fold",
  HANDS_IDS.has("default-fluid") && HANDS_IDS.has("sam-see") && HANDS_IDS.size === 2 &&
    STAGE_ID === "dancer-stage" && GENX_ID === "genx-fold"
);
check(
  "A3 THIS LAYER's read expressions are the derivation's defaults (=== true rests off, !== false rests on)",
  [
    "?.ghostEnabled !== false",
    "?.ambientEnabled !== false",
    "?.motionEnabled === true",
    "?.handsEnabled === true",
    "?.stageDancerEnabled !== false",
    "?.stageCameraDrift !== false",
    "?.lendDevice === true",
  ].every((pin) => menu.includes(pin))
);
check(
  "A4 THIS LAYER renders every toggle the derivation claims (BoolPillRow values, all seven)",
  [
    "value={ghostInLayer}",
    "value={ambientInLayer}",
    "value={motionInLayer}",
    "value={handsInLayer}",
    "value={lendInLayer}",
    "value={stageDancer}",
    "value={stageDrift}",
  ].every((pin) => menu.includes(pin))
);
check(
  "A5 LayerControls' MIDI toggle: capability-gated, resting on, rendered by THIS LAYER for non-fluid layers",
  layerControls.includes("Boolean((s?.midiEnabled as boolean) ?? true)") &&
    layerControls.includes("caps.midi") &&
    menu.includes("<LayerControls />") &&
    menu.includes("isFluid ? (")
);
check(
  "A6 the fluid stack's bool controls render only on the fluid and ride THIS LAYER's fluid branch",
  ambienceControls.includes('active.id !== "default-fluid"') &&
    ambienceControls.includes("ambienceEnabled") &&
    musicControls.includes('active.id !== "default-fluid"') &&
    musicControls.includes("musicEnabled") &&
    // Slice 70 (disclosed in-slice): the chorale opt-out is a
    // bool toggle in the same fluid-only controls.
    musicControls.includes("choraleEnabled") &&
    menu.includes("<AmbienceControls />") &&
    menu.includes("<MusicControls />")
);

// The FABRICS editor's curated fields.
const lefStart = menu.indexOf("const LAYER_EDIT_FIELDS");
const lefBlock = menu.slice(lefStart, menu.indexOf("\n};", lefStart));
const lefHeads = [...lefBlock.matchAll(/\n  "([a-z0-9-]+)": \[/g)].map((m) => ({ id: m[1], idx: m.index }));
const FIELD_RE = /\{\s*key: "(\w+)",\s*label: "([^"]*)",\s*kind: "(bool|choice)",(?:\s*options: \[[\s\S]*?\],)?\s*defaultValue: (true|false|"[^"]*")\s*,?\s*\}/g;
const EDIT_FIELDS = [...lefBlock.matchAll(FIELD_RE)].map((m) => {
  let layer = null;
  for (const h of lefHeads) if (h.idx < m.index) layer = h.id;
  return { layer, key: m[1], kind: m[3], def: m[4] };
});
check(
  "A7 the editor's curated fields parse: 13 fields (10 bool + 3 choice) across 5 curated fabrics",
  EDIT_FIELDS.length === 13 &&
    EDIT_FIELDS.filter((f) => f.kind === "bool").length === 10 &&
    EDIT_FIELDS.filter((f) => f.kind === "choice").map((f) => f.key).join(",") ===
      "pianoVoice,stageTheme,stageTraumaIdle" &&
    lefHeads.map((h) => h.id).join(",") === "default-fluid,ar-piano,dancer-stage,sam-see,camera-effects",
  EDIT_FIELDS.map((f) => `${f.layer}.${f.key}:${f.kind}`).join(" ")
);

/* ------------------------------------------------------------------ */
/* B. The panel's derivation equals the re-derived ground truth       */
/* ------------------------------------------------------------------ */

const UNIVERSAL_KEYS = ["ghostEnabled", "ambientEnabled", "motionEnabled"];
function expectedFor(entry) {
  const map = new Map([
    ["ghostEnabled", true],
    ["ambientEnabled", true],
    ["motionEnabled", false],
  ]);
  if (HANDS_IDS.has(entry.id)) map.set("handsEnabled", false);
  if (entry.id === STAGE_ID) {
    map.set("stageDancerEnabled", true);
    map.set("stageCameraDrift", true);
  }
  if (entry.id === GENX_ID) map.set("lendDevice", false);
  if (entry.midi && entry.id !== "default-fluid") map.set("midiEnabled", true);
  if (entry.id === "default-fluid") {
    map.set("ambienceEnabled", false);
    map.set("musicEnabled", false);
    // Slice 70 (disclosed in-slice, Slice 63/68 precedent):
    // the fluid's MusicControls gains the chorale opt-out,
    // resting ON.
    map.set("choraleEnabled", true);
  }
  return map;
}

for (const entry of REGISTRY) {
  const expected = expectedFor(entry);
  const panel = layerFeaturesFor(entry.id);
  const panelMap = new Map(panel.map((f) => [f.key, f.defaultOn]));
  const sameSet =
    panelMap.size === expected.size &&
    [...expected.entries()].every(([k, v]) => panelMap.get(k) === v);
  const idx = UNIVERSAL_KEYS.map((k) => panel.findIndex((f) => f.key === k));
  const universalOrder = idx.every((v) => v >= 0) && idx[0] < idx[1] && idx[1] < idx[2];
  check(
    `B ${entry.id}: panel features == derived set (${[...expected.keys()].join(", ")})`,
    sameSet && universalOrder && panel.length === panelMap.size,
    `panel=${panel.map((f) => `${f.key}:${f.defaultOn ? "on" : "off"}`).join(",")}`
  );
}
check(
  "B-unknown an unlisted fabric gets exactly the universal three (THIS LAYER renders them for any layer)",
  layerFeaturesFor("no-such-fabric").map((f) => f.key).join(",") === UNIVERSAL_KEYS.join(",") &&
    layerFeaturesFor(null).map((f) => f.key).join(",") === UNIVERSAL_KEYS.join(",") &&
    UNIVERSAL_LAYER_FEATURES.map((f) => f.key).join(",") === UNIVERSAL_KEYS.join(",")
);
check(
  "B-exclusions picks and values are never features (pianoVoice/stageTheme/stageTraumaIdle/genxNodeUrl/roomId appear in no list)",
  REGISTRY.every((e) =>
    ["pianoVoice", "stageTheme", "stageTraumaIdle", "genxNodeUrl", "roomId"].every(
      (k) => !layerFeaturesFor(e.id).some((f) => f.key === k)
    )
  )
);

/* ------------------------------------------------------------------ */
/* C. The editor cross-check                                          */
/* ------------------------------------------------------------------ */

for (const layer of lefHeads.map((h) => h.id)) {
  const panelMap = new Map(layerFeaturesFor(layer).map((f) => [f.key, f.defaultOn]));
  const bools = EDIT_FIELDS.filter((f) => f.layer === layer && f.kind === "bool");
  check(
    `C ${layer}: every curated bool field is a panel feature with the same resting state`,
    bools.every((f) => panelMap.get(f.key) === (f.def === "true")),
    bools.map((f) => f.key).join(",") || "(none curated)"
  );
}
check(
  "C-uncurated The Fold and the Playground are absent from the editor's record — their panel features come from THIS LAYER alone",
  !lefHeads.some((h) => h.id === "genx-fold" || h.id === "ghostie-playground") &&
    layerFeaturesFor("genx-fold").some((f) => f.key === "lendDevice") &&
    layerFeaturesFor("ghostie-playground").some((f) => f.key === "midiEnabled")
);

/* ------------------------------------------------------------------ */
/* D. Names are THIS LAYER's own                                      */
/* ------------------------------------------------------------------ */

const LABEL_SOURCE = {
  ghostEnabled: ["app/components/fabric/FabricMenu.tsx", "Ghost in this layer"],
  ambientEnabled: ["app/components/fabric/FabricMenu.tsx", "Ambient life"],
  motionEnabled: ["app/components/fabric/FabricMenu.tsx", "Motion — tilt & shake"],
  handsEnabled: ["app/components/fabric/FabricMenu.tsx", "Hands — gesture input"],
  stageDancerEnabled: ["app/components/fabric/FabricMenu.tsx", "Dancer figure dances"],
  stageCameraDrift: ["app/components/fabric/FabricMenu.tsx", "Camera drift"],
  lendDevice: ["app/components/fabric/FabricMenu.tsx", "Lend this device"],
  midiEnabled: ["app/components/LayerControls.tsx", "Notes → Fabric"],
  ambienceEnabled: ["app/components/controls/AmbienceControls.tsx", "Ambience"],
  musicEnabled: ["app/components/controls/MusicControls.tsx", "Generative Music"],
  // Slice 70 (disclosed in-slice): the chorale opt-out's label
  // is THIS LAYER's own words, in the same controls file.
  choraleEnabled: ["app/components/controls/MusicControls.tsx", "Sing with other ghosties"],
};
{
  const seen = new Map();
  let labelsOk = true;
  for (const entry of REGISTRY) {
    for (const f of layerFeaturesFor(entry.id)) {
      if (seen.has(f.key) && seen.get(f.key) !== f.label) labelsOk = false;
      seen.set(f.key, f.label);
      const src = LABEL_SOURCE[f.key];
      if (!src) { labelsOk = false; continue; }
      const text = read(src[0]);
      if (!(text.includes(f.label) || src[1].toLowerCase().startsWith(f.label.toLowerCase()))) {
        labelsOk = false;
      }
    }
  }
  check(
    "D every feature's label is its own surface's heading, and one key never wears two labels",
    labelsOk && seen.size === Object.keys(LABEL_SOURCE).length,
    [...seen.entries()].map(([k, v]) => `${k}="${v}"`).join(" ")
  );
}

/* ------------------------------------------------------------------ */
/* E. States read as THIS LAYER reads them                            */
/* ------------------------------------------------------------------ */

{
  let readsOk = true;
  for (const entry of REGISTRY) {
    for (const f of layerFeaturesFor(entry.id)) {
      if (layerFeatureActive(f, {}) !== f.defaultOn) readsOk = false;
      if (layerFeatureActive(f, { [f.key]: true }) !== true) readsOk = false;
      if (layerFeatureActive(f, { [f.key]: false }) !== false) readsOk = false;
      if (layerFeatureActive(f, null) !== f.defaultOn) readsOk = false;
    }
  }
  check(
    "E untouched reads rest, stored true reads on, stored false reads off — every feature, every fabric",
    readsOk
  );
}

/* ------------------------------------------------------------------ */
/* F. One store, proven at the key                                    */
/* ------------------------------------------------------------------ */

writeFileSync(
  "/tmp/s63-stub-asyncstorage.mjs",
  "const m = new Map();\nglobalThis.__s63store = m;\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);
// The app's REAL storage module, bundled with AsyncStorage
// swapped for an inspectable shim (settings50's pattern). The
// mirror's key is pinned verbatim from its source below — the
// key builder is three lines and they are quoted, not re-run.
await esbuild.build({
  entryPoints: [path.join(root, "app/utils/storage.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "/tmp/s63-store.mjs",
  logLevel: "silent",
  plugins: [
    {
      name: "s63-asyncstorage-shim",
      setup(build) {
        build.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({
          path: "/tmp/s63-stub-asyncstorage.mjs",
        }));
      },
    },
  ],
});
const store = await import("/tmp/s63-store.mjs");

const PINNED_PREFIX = /export const LAYER_SETTINGS_PREFIX = "([^"]+)";/.exec(mirror)?.[1];
check(
  "F1 the store key is the mirror's own: prefix + key-builder body pinned verbatim from LayerSettingsMirror",
  PINNED_PREFIX === "fabric_layer_settings_v1:" &&
    mirror.includes("return `${LAYER_SETTINGS_PREFIX}${layerId}`;") &&
    `${PINNED_PREFIX}default-fluid` === "fabric_layer_settings_v1:default-fluid"
);
{
  const ghost = layerFeaturesFor("default-fluid").find((f) => f.key === "ghostEnabled");
  const before = { roomId: "main" };
  const after = withLayerFeature(before, ghost, false);
  check(
    "F2 the panel's write builder flips one key and clobbers nothing (input untouched, siblings kept)",
    after.ghostEnabled === false && after.roomId === "main" && !("ghostEnabled" in before) &&
      Object.keys(after).length === 2
  );
  const KEY = `${PINNED_PREFIX}default-fluid`;
  await store.setJSON(KEY, { common: { backgroundColor: "#0b1020" }, specific: after });
  const back = await store.getJSON("fabric_layer_settings_v1:default-fluid", null);
  check(
    "F3 read back by the literal store key: the flip landed in fabric_layer_settings_v1:default-fluid",
    back?.specific?.ghostEnabled === false && back?.specific?.roomId === "main" &&
      back?.common?.backgroundColor === "#0b1020" &&
      layerFeatureActive(ghost, back.specific) === false &&
      layerFeatureActive(ghost, before) === true,
    `stored keys: ${[...globalThis.__s63store.keys()].join(",")}`
  );
  const other = await store.getJSON("fabric_layer_settings_v1:ar-piano", null);
  check(
    "F4 another layer's slot is untouched by the fluid's write (per-layer means per-layer)",
    other === null
  );
}
check(
  "F5 the chain is the app's own: FabricInfo -> updateConfig, reducer merges specific, mirror persists under the active layer's key",
  finfo.includes("const { state, updateConfig } = useExperience();") &&
    finfo.includes("updateConfig({ specific: withLayerFeature(") &&
    registrySrc.includes("...(action.payload.specific ?? {})") &&
    mirror.includes("setJSON(layerSettingsKey(activeId), state.experienceConfig)") &&
    mirror.includes("getJSON<ExperienceConfig | null>(layerSettingsKey(activeId), null)")
);

/* ------------------------------------------------------------------ */
/* G. Panel wiring                                                    */
/* ------------------------------------------------------------------ */

const sec = (t) => finfo.indexOf(`<SectionTitle>${t}</SectionTitle>`);
check(
  "G1 section order preserved, FEATURES in its slot: ghostie / what it is / controls / FEATURES / ghostie here / this room",
  sec("YOUR GHOSTIE") >= 0 &&
    sec("YOUR GHOSTIE") < sec("WHAT THIS FABRIC IS") &&
    sec("WHAT THIS FABRIC IS") < sec("CONTROLS") &&
    sec("CONTROLS") < sec("FEATURES") &&
    sec("FEATURES") < sec("YOUR GHOSTIE HERE") &&
    sec("YOUR GHOSTIE HERE") < sec("THIS ROOM")
);
check(
  "G2 the Slice 60 ghostie block is untouched above FEATURES (Essence renders under its own title, before the fabric's sections)",
  finfo.includes("<Essence />") &&
    sec("YOUR GHOSTIE") < finfo.indexOf("<Essence />") &&
    finfo.indexOf("<Essence />") < sec("FEATURES")
);
check(
  "G3 the view carries NO per-fabric branches — features resolve through the data module like all panel content",
  !/active\.id === "/.test(finfo) &&
    finfo.includes("layerFeaturesFor(active.id)") &&
    finfo.includes("layerFeatureActive(feature, specific)") &&
    !/from "\.\/FabricMenu"/.test(fdata)
);
check(
  "G4 the honest edges: a fabric with nothing toggleable says so in one line, and the panel names the one-store truth",
  finfo.includes("This fabric has nothing to switch") &&
    finfo.includes("The same switches as F menu → This layer")
);
{
  let parseOk = true;
  try {
    await esbuild.build({
      entryPoints: [path.join(root, "app/components/fabric/FabricInfo.tsx")],
      bundle: false,
      outfile: "/tmp/s63-finfo-parse.js",
      logLevel: "silent",
    });
  } catch {
    parseOk = false;
  }
  check("G5 the touched TSX parses clean under esbuild", parseOk);
}

console.log(`\ninfotoggles-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
