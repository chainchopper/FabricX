// settings50-check.mjs — Slice 50 headless proof.
//
// Terrell's direction, Nov 3, 2026:
//
// 1. "There is no vibration toggle in settings I don't think
//    yet." A Haptics switch existed and gated the expo-haptics
//    UI taps — but every FELT vibration (a verb landing, a
//    recipe's haptic steps, a remote shake, the send tick)
//    called navigator.vibrate directly and ignored it. §A
//    drives the ONE gate (src/sensory/vibration) and censuses
//    the tree: the call shape navigator.vibrate( exists in
//    exactly one file, the gate; the React Native shape
//    Vibration.vibrate( exists in ZERO files (the layer
//    route's Pulse button called it directly — caught by a
//    repo-index sweep after the first staging, fixed in this
//    same slice, and pinned here so the shape cannot return);
//    expo-haptics is imported by exactly one file, useHaptics
//    (gated by the same switch).
//
// 2. "The brain should take the name of the ghostie — loading
//    {ghostie's name}'s brain." §B drives brainTransferLabel
//    with two different ghostie names and pins the surfaces:
//    the chip renders "{name}'s brain arriving… 42%" /
//    "{name}'s brain is warming up…"; the settings card's
//    headline is the ghostie's name with the EXACT model id +
//    size still on the card (Slice 46's honesty, one line down).
//
// 3. "The name should remain persistent unless the user changes
//    it specifically in the app's settings." §C drives the
//    sanitizer and censuses the writers: fabric_ghost_v1 is
//    written by exactly one module (useGhostPeer, the record's
//    owner), and the rename EVENT is dispatched from exactly
//    one surface (GhostieHome's settings editor). Birth stays
//    derivation, peer sync stays display, imports don't exist.
//
// 4. "Device granted access to hardware should persist where
//    applicable." §D drives the grant memory (hardwareGrants):
//    remember → known → persisted; the live permissions.query
//    answer wins where the platform offers one (camera/mic),
//    the record is the fallback (and the only source for
//    motion); the wiring sites are pinned (motion hook consults
//    before asking; camera/mic seams remember their outcomes).
//
// Run: node scripts/settings50-check.mjs   (from the repo root)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}
const read = (p) => readFileSync(path.join(root, p), "utf8");

async function bundle(rel, out, extra = []) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`, ...extra],
    { cwd: root, stdio: "pipe" }
  );
  return import(out);
}

// AsyncStorage shim whose Map the check can seed + inspect.
writeFileSync(
  "/tmp/s50-stub-asyncstorage.mjs",
  "const m = new Map();\nglobalThis.__s50store = m;\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);
const ALIAS = [
  "--alias:@react-native-async-storage/async-storage=/tmp/s50-stub-asyncstorage.mjs",
];

/** Every .ts/.tsx under src + app + shared, repo-relative. */
function* walk(dir) {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(path.join(root, rel));
    if (st.isDirectory()) yield* walk(rel);
    else if (/\.tsx?$/.test(name)) yield rel;
  }
}
const ALL_FILES = [...walk("src"), ...walk("app"), ...walk("shared")];
const filesMatching = (re) =>
  ALL_FILES.filter((f) => re.test(read(f)));

// ----------------------------------------------------------------
// A. The vibration gate.
// ----------------------------------------------------------------

const vib = await bundle("src/sensory/vibration.ts", "/tmp/s50-vibration.mjs", ALIAS);

const setNavigator = (v) =>
  Object.defineProperty(globalThis, "navigator", {
    value: v, configurable: true, writable: true,
  });

const vibCalls = [];
setNavigator({
  vibrate: (p) => {
    vibCalls.push(p);
    return true;
  },
});

check("A1 the gate defaults ON (today's behavior) and fires",
  vib.vibrationEnabledNow() === true && vib.vibrate([50, 30, 50]) === true &&
  vibCalls.length === 1,
  `calls=${vibCalls.length}`);

vib.mirrorHapticsPreference(false);
check("A2 the settings switch OFF silences the gate completely",
  vib.vibrationEnabledNow() === false && vib.vibrate(60) === false &&
  vib.vibrate([1, 2, 3]) === false && vibCalls.length === 1);

vib.mirrorHapticsPreference(true);
check("A3 the switch back ON restores vibration",
  vib.vibrate(60) === true && vibCalls.length === 2);

globalThis.__s50store.set(
  "fabric_prefs_v1",
  JSON.stringify({ hapticsEnabled: false })
);
vib.resetVibrationForTests();
vib.ensureVibrationPref();
await new Promise((r) => setTimeout(r, 25));
check("A4 the gate reads the persisted preference (fabric_prefs_v1.hapticsEnabled)",
  vib.vibrationEnabledNow() === false && vib.vibrate(60) === false,
  "seeded hapticsEnabled=false in the settings record");
vib.resetVibrationForTests();
setNavigator(undefined);

check("A5 census: navigator.vibrate( is called in exactly ONE file — the gate",
  JSON.stringify(filesMatching(/navigator\.vibrate\s*\(/).sort()) ===
    JSON.stringify(["src/sensory/vibration.ts"]),
  filesMatching(/navigator\.vibrate\s*\(/).join(", "));

check("A5b census: the RN shape Vibration.vibrate( is called in ZERO files, and nothing imports Vibration from react-native",
  filesMatching(/\bVibration\.vibrate\s*\(/).length === 0 &&
  filesMatching(/import\s*\{[^}]*\bVibration\b[^}]*\}\s*from\s+["']react-native["']/).length === 0,
  filesMatching(/\bVibration\.vibrate\s*\(/).join(", "));

check("A6 census: expo-haptics is imported by exactly ONE file — useHaptics (same switch)",
  JSON.stringify(filesMatching(/from\s+["']expo-haptics["']/).sort()) ===
    JSON.stringify(["app/hooks/useHaptics.ts"]) &&
  read("app/hooks/useHaptics.ts").includes("hapticsEnabled"));

const prefsCtx = read("app/context/PreferencesContext.tsx");
check("A7 the settings owner mirrors every flip into the gate",
  prefsCtx.includes("mirrorHapticsPreference(hapticsEnabled)") &&
  prefsCtx.includes('const STORAGE_KEY = "fabric_prefs_v1"'));

const menu = read("app/components/fabric/FabricMenu.tsx");
const drawer = read("app/components/neo/SettingsDrawer.tsx");
check("A8 both settings surfaces carry the switch, named Vibration in plain words",
  menu.includes('label="Vibration"') && menu.includes("prefs.setHapticsEnabled") &&
  drawer.includes("Vibration: {hapticsEnabled"));

const fluid = read("src/components/fluid/LegacyFluid.tsx");
const multi = read("src/hooks/useFluidMultiUser.ts");
const layerRoute = read("app/fabric/[layerId].tsx");
check("A9 every felt-vibration site routes through the gate",
  fluid.includes('from "../../sensory/vibration"') &&
  (fluid.match(/vibrate\(verb\.vibration\)/g) ?? []).length === 2 &&
  fluid.includes("vibrate(haptic)") && fluid.includes("vibrate(60)") &&
  multi.includes('from "../sensory/vibration"') &&
  multi.includes("vibrate([50, 30, 50])") &&
  layerRoute.includes('from "../../src/sensory/vibration"') &&
  layerRoute.includes("vibrate([80, 40, 80])"));

// ----------------------------------------------------------------
// B. The brain takes the ghostie's name.
// ----------------------------------------------------------------

const brain = await bundle("src/ai/onDeviceBrain.ts", "/tmp/s50-brain.mjs", ALIAS);
const snapFor = (state, progress, model) => ({
  state, progress, model, loadedModelId: null, webgpu: true,
  consent: "granted", askVisible: false, error: null,
});
const DL = brain.DEFAULT_BRAIN_MODEL;

for (const name of ["Boop", "Mango"]) {
  check(`B1 downloading label derives from the ghostie's name (${name})`,
    brain.brainTransferLabel(snapFor("downloading", 0.42, DL), name) ===
      `${name}'s brain arriving… 42%`,
    brain.brainTransferLabel(snapFor("downloading", 0.42, DL), name));
}

check("B2 warming label is the ghostie's brain warming up",
  brain.brainTransferLabel(snapFor("warming", 1, DL), "Boop") ===
    "Boop's brain is warming up…");

check("B3 before the ghost record exists, the model-named fallback stands (Slice 46)",
  brain.brainTransferLabel(snapFor("downloading", 0.42, DL), null) ===
    "Ghostie 1B (Llama 3.2 1B) arriving… 42%" &&
  brain.brainTransferLabel(snapFor("downloading", 0.42, DL), "  ") ===
    "Ghostie 1B (Llama 3.2 1B) arriving… 42%");

check("B4 no label outside the transfer states, named or not",
  brain.brainTransferLabel(snapFor("idle", 0, DL), "Boop") === null);

const chrome = read("app/components/fabric/BrainChrome.tsx");
check("B5 the chip renders the ghostie's name from the ghost store",
  chrome.includes("brainTransferLabel(snap, ghost.ghostName)") &&
  chrome.includes("subscribeGhostState"));

const card = read("app/components/fabric/OnDeviceBrainCard.tsx");
check("B6 the settings card headlines the ghostie's name",
  card.includes("`${ghostName}'s brain — a real model, on this device`") &&
  card.includes("subscribeGhostState"));

check("B7 under the headline, the card still names the EXACT model id + size",
  card.includes("snap.model.id") && card.includes("snap.model.baseNote") &&
  card.includes("snap.model.sizeNote") &&
  (card.match(/brainModelFullName\(snap\.model\)/g) ?? []).length >= 4);

// ----------------------------------------------------------------
// C. The name law: one door, in settings.
// ----------------------------------------------------------------

const ghostStore = await bundle("src/ghost/ghostStore.ts", "/tmp/s50-ghoststore.mjs", ALIAS);

check("C1 the sanitizer trims and collapses whitespace",
  ghostStore.sanitizeGhostName("  Boop  ") === "Boop" &&
  ghostStore.sanitizeGhostName("Sir   Bounce") === "Sir Bounce");

check("C2 empty, over-long, control-char and non-string names are refused",
  ghostStore.sanitizeGhostName("") === null &&
  ghostStore.sanitizeGhostName("   ") === null &&
  ghostStore.sanitizeGhostName("x".repeat(ghostStore.GHOST_NAME_MAX_CHARS + 1)) === null &&
  ghostStore.sanitizeGhostName("x".repeat(ghostStore.GHOST_NAME_MAX_CHARS)) ===
    "x".repeat(ghostStore.GHOST_NAME_MAX_CHARS) &&
  ghostStore.sanitizeGhostName("a\u0007b") === null &&
  ghostStore.sanitizeGhostName(42) === null &&
  ghostStore.sanitizeGhostName(null) === null);

check("C3 census: fabric_ghost_v1 is WRITTEN by exactly one module — its owner",
  JSON.stringify(
    filesMatching(/setJSON\(\s*GHOST_PREF_KEY|setJSON\(\s*["']fabric_ghost_v1["']/).sort()
  ) === JSON.stringify(["src/ghost/useGhostPeer.ts"]),
  filesMatching(/setJSON\(\s*GHOST_PREF_KEY|setJSON\(\s*["']fabric_ghost_v1["']/).join(", "));

const hook = read("src/ghost/useGhostPeer.ts");
check("C4 the owner answers the rename event through the sanitizer, seed untouched",
  hook.includes("FABRIC_GHOST_RENAME_EVENT") &&
  hook.includes("sanitizeGhostName") &&
  hook.includes("{ ...id, name }") &&
  hook.includes("peerRef.current?.setGhostName(name)") &&
  hook.includes("setGhostPublicState({ ghostName: name })"));

const peer = read("src/ghost/GhostPeer.ts");
check("C5 the live peer takes the new name (scenario identity + say-it follow)",
  peer.includes("setGhostName(name: string)") &&
  peer.includes("this.options.ghostName = name"));

check("C6 census: the rename event is DISPATCHED from exactly one surface — settings",
  JSON.stringify(filesMatching(/dispatchGhost\(FABRIC_GHOST_RENAME_EVENT|CustomEvent\(FABRIC_GHOST_RENAME_EVENT/).sort()) ===
    JSON.stringify(["app/components/fabric/GhostieHome.tsx"]),
  filesMatching(/dispatchGhost\(FABRIC_GHOST_RENAME_EVENT|CustomEvent\(FABRIC_GHOST_RENAME_EVENT/).join(", "));

const home = read("app/components/fabric/GhostieHome.tsx");
check("C7 the door is a real settings editor (draft, sanitize-gated save, the law stated)",
  home.includes("Save name") && home.includes("nameDirty") &&
  home.includes("sanitizeGhostName") && home.includes("GHOST_NAME_MAX_CHARS") &&
  home.includes("the only place it can change"));

check("C8 birth is still derivation, not a rename (the creation path is intact)",
  hook.includes("deriveGhostIdentity") && hook.includes("generateBoundIdentity") &&
  hook.includes("used EXACTLY as stored"));

// ----------------------------------------------------------------
// D. Hardware grants persist.
// ----------------------------------------------------------------

const hw = await bundle("src/sensors/hardwareGrants.ts", "/tmp/s50-hw.mjs", ALIAS);

check("D1 an unasked kind reads unknown",
  hw.knownHardwareGrant("camera") === "unknown");

hw.rememberHardwareGrant("camera", "granted");
await new Promise((r) => setTimeout(r, 25));
check("D2 a grant is remembered in memory AND persisted to fabric_hw_grants_v1",
  hw.knownHardwareGrant("camera") === "granted" &&
  (globalThis.__s50store.get("fabric_hw_grants_v1") ?? "").includes('"camera":"granted"'),
  globalThis.__s50store.get("fabric_hw_grants_v1") ?? "(nothing persisted)");

hw.rememberHardwareGrant("motion", "denied");
check("D3 a denial is remembered too (it informs, it does not lock)",
  hw.knownHardwareGrant("motion") === "denied");

setNavigator({
  permissions: {
    query: async ({ name }) => ({ state: name === "camera" ? "denied" : "prompt" }),
  },
});
check("D4 where the platform speaks (permissions.query), its live answer wins",
  (await hw.hardwareGrantState("camera")) === "denied" &&
  (await hw.hardwareGrantState("microphone")) === "unknown",
  "query says camera=denied over a stored granted; mic=prompt falls through to no record");
check("D5 motion has no live API — the record is its source",
  (await hw.hardwareGrantState("motion")) === "denied");

setNavigator({
  permissions: {
    query: async () => {
      throw new TypeError("unknown permission name");
    },
  },
});
check("D6 where the query throws (Safari), the stored record carries the answer",
  (await hw.hardwareGrantState("camera")) === "granted");
setNavigator(undefined);

const motion = read("src/sensors/useDeviceMotion.ts");
check("D7 the motion flow consults the memory before asking, and remembers outcomes",
  motion.includes('knownHardwareGrant("motion") === "granted"') &&
  motion.includes('rememberHardwareGrant("motion", "granted")') &&
  motion.includes('rememberHardwareGrant("motion", "denied")'));

const sam = read("src/components/sam/SamLayer.tsx");
const hands = read("src/components/hands/HandsLayer.tsx");
const voice = read("src/services/voiceCapture.ts");
check("D8 the camera + mic seams remember their real outcomes",
  sam.includes('rememberHardwareGrant("camera", "granted")') &&
  sam.includes('rememberHardwareGrant("camera", "denied")') &&
  hands.includes('rememberHardwareGrant("camera", "granted")') &&
  hands.includes('rememberHardwareGrant("camera", "denied")') &&
  // voiceCapture reports by window event (its zero-import graph
  // is load-bearing); hardwareGrants owns the listening end.
  voice.includes('new CustomEvent("fabric:hw-grant"') &&
  voice.includes('kind: "microphone"') &&
  !/^import /m.test(voice) &&
  read("src/sensors/hardwareGrants.ts").includes('HW_GRANT_EVENT = "fabric:hw-grant"'));

console.log(`\nsettings50-check: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
