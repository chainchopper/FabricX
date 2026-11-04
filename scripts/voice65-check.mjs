// voice65-check.mjs — Slice 65 headless proof.
//
// Terrell's correction, Nov 4, 2026 (~11:04 AM ET), verbatim:
//
//   "With the voice there is no natural or both. Natural
//    doesn't require tap or push to talk so there is no both
//    it's one or the other .. both is a compatibility layer
//    not a rule ... one keeps hands off the screen one
//    requires them."
//
// Slice 58 shipped three modes (Tap to talk / Natural /
// Both, default tap). This check pins the corrected model:
//
// §A drives the gate (src/sensory/voiceMode): exactly two
//    modes; "both" is not a mode (not in the type, not in
//    the cycle, no label); the name-listener arms in Natural
//    ONLY (so Tap starts no wake listener, ever); the
//    fresh-install default is natural; a stored Slice 58
//    "both" MIGRATES to "natural" on read, stored tap /
//    natural pass through, junk is ignored.
// §B censuses the surfaces: no "both" in the settings row's
//    copy or comparisons; the wake listener's enable comes
//    ONLY from the mode gate (Slice 58's arm/disarm coupling
//    to the mic button is deleted — Natural starts no
//    tap-coupled listener path); the only press branches
//    left in Natural are the two platform-compatibility
//    paths (a gesture for a blocked start; the capture door
//    where no recognizer exists); PreferencesContext loads
//    through the normalizer and defaults from the gate.
//
// Run: node scripts/voice65-check.mjs   (from the repo root)

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}
const read = (p) => readFileSync(path.join(root, p), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 10));

// AsyncStorage shim whose Map the check can seed + inspect.
writeFileSync(
  "/tmp/v65-stub-asyncstorage.mjs",
  "const m = new Map();\nglobalThis.__v65store = m;\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);
const ALIAS = [
  "--alias:@react-native-async-storage/async-storage=/tmp/v65-stub-asyncstorage.mjs",
];

async function bundle(rel, out, extra = []) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`, ...extra],
    { cwd: root, stdio: "pipe" }
  );
  return import(pathToFileURL(out).href);
}

// ---------------------------------------------------------- §A gate
{
  const vm = await bundle(
    "src/sensory/voiceMode.ts",
    "/tmp/v65-voicemode.mjs",
    ALIAS
  );
  check(
    "§A the mode list is exactly two: natural, tap",
    vm.VOICE_INPUT_MODES.length === 2 &&
      vm.VOICE_INPUT_MODES[0] === "natural" &&
      vm.VOICE_INPUT_MODES[1] === "tap"
  );
  check(
    "§A 'both' is not a mode (the type gate rejects it)",
    vm.isVoiceInputMode("both") === false &&
      vm.isVoiceInputMode("natural") === true &&
      vm.isVoiceInputMode("tap") === true &&
      vm.isVoiceInputMode("junk") === false
  );
  vm.resetVoiceInputModeForTests();
  check(
    "§A fresh-install default is natural (hands-free first)",
    vm.DEFAULT_VOICE_INPUT_MODE === "natural" && vm.voiceInputModeNow() === "natural"
  );
  check(
    "§A labels: Natural / Tap to talk — no Both anywhere",
    vm.voiceInputModeLabel("natural") === "Natural" &&
      vm.voiceInputModeLabel("tap") === "Tap to talk"
  );
  check(
    "§A the listener arms in natural ONLY (tap starts no wake listener)",
    vm.naturalArmedInMode("natural") === true &&
      vm.naturalArmedInMode("tap") === false
  );
  check(
    "§A normalize: stored 'both' migrates to 'natural'",
    vm.normalizeVoiceInputMode("both") === "natural"
  );
  check(
    "§A normalize: stored tap / natural pass through untouched",
    vm.normalizeVoiceInputMode("tap") === "tap" &&
      vm.normalizeVoiceInputMode("natural") === "natural"
  );
  check(
    "§A normalize: junk and absence read as no preference",
    vm.normalizeVoiceInputMode("junk") === null &&
      vm.normalizeVoiceInputMode(undefined) === null &&
      vm.normalizeVoiceInputMode(null) === null
  );

  // Persisted reads through the gate's own lazy load.
  vm.resetVoiceInputModeForTests();
  globalThis.__v65store.set(
    "fabric_prefs_v1",
    JSON.stringify({ voiceInputMode: "both", hapticsEnabled: true })
  );
  vm.ensureVoiceInputModePref();
  await tick();
  check(
    "§A persisted 'both' lands as 'natural' (migration on read)",
    vm.voiceInputModeNow() === "natural"
  );
  vm.resetVoiceInputModeForTests();
  globalThis.__v65store.set(
    "fabric_prefs_v1",
    JSON.stringify({ voiceInputMode: "tap" })
  );
  vm.ensureVoiceInputModePref();
  await tick();
  check("§A persisted 'tap' passes through", vm.voiceInputModeNow() === "tap");
  vm.resetVoiceInputModeForTests();
  globalThis.__v65store.set(
    "fabric_prefs_v1",
    JSON.stringify({ voiceInputMode: "junk" })
  );
  vm.ensureVoiceInputModePref();
  await tick();
  check(
    "§A persisted junk is ignored (the default stands)",
    vm.voiceInputModeNow() === "natural"
  );
  globalThis.__v65store.delete("fabric_prefs_v1");
}

// ------------------------------------------------------- §B census
{
  const gate = read("src/sensory/voiceMode.ts");
  const bar = read("src/components/sensory/ComposeBar.tsx");
  const wake = read("src/components/sensory/useWakeWord.ts");
  const menu = read("app/components/fabric/FabricMenu.tsx");
  const prefs = read("app/context/PreferencesContext.tsx");

  check(
    "§B the gate's type is the two-mode union, verbatim",
    gate.includes('export type VoiceInputMode = "natural" | "tap";')
  );
  check(
    "§B no 'Both' label exists in the gate",
    !gate.includes('"Both"') && !gate.includes("return \"Both\"")
  );
  check(
    "§B the settings row exists and cycles the two modes",
    menu.includes('label="Voice input"') &&
      menu.includes("voiceInputModeLabel(prefs.voiceInputMode)") &&
      menu.includes("nextVoiceInputMode(prefs.voiceInputMode)")
  );
  check(
    "§B the settings row never compares against 'both'",
    !menu.includes('"both"')
  );
  check(
    "§B the blended caption is gone ('Tap the mic, or say …')",
    !menu.includes("Tap the mic, or say")
  );
  check(
    "§B each mode's caption is its own (tap = the mic; natural = the name)",
    menu.includes('"Tap the mic to talk to your ghostie."') &&
      menu.includes("perks up when it hears its name")
  );
  check(
    "§B the listener's enable comes ONLY from the mode gate",
    bar.includes("enabled: naturalArmedInMode(mode),")
  );
  check(
    "§B Slice 58's arm/disarm coupling is deleted (no button state gates the listener)",
    !bar.includes("setNaturalArmed") && !bar.includes("[naturalArmed")
  );
  check(
    "§B the bar never branches on a 'both' mode",
    !bar.includes('mode === "both"') && !bar.includes('"both"')
  );
  check(
    "§B compatibility path 1: a press in Natural restarts a gesture-blocked listener, nothing more",
    bar.includes('wake.state === "blocked"') && bar.includes("wake.restart()")
  );
  check(
    "§B compatibility path 2: no recognizer at all → the capture door, named unsupported",
    bar.includes('wake.state === "unsupported"')
  );
  check(
    "§B the wake hook itself stays mode-blind (the gate decides, the hook obeys)",
    !wake.includes("voiceInputMode") && !wake.includes("VoiceInputMode")
  );
  check(
    "§B the owner loads through the normalizer (migration lives at the read)",
    prefs.includes("normalizeVoiceInputMode(saved.voiceInputMode)")
  );
  check(
    "§B the owner's initial state is the gate's default, not a hardcoded mode",
    prefs.includes("useState<VoiceInputMode>(DEFAULT_VOICE_INPUT_MODE)") &&
      !prefs.includes('useState<VoiceInputMode>("tap")')
  );
}

console.log(`\nvoice65: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
