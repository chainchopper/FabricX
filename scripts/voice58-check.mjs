// voice58-check.mjs — Slice 58 headless proof.
//
// Terrell's direction, Nov 3, 2026 (~10:27 PM ET), with his
// design correction the same night (~10:34 PM ET):
//
// 1. "The mic isn't automatically requested." §C + §D: one
//    shared mic owner (src/sensors/micStream) consults the
//    Slice 50 grant memory BEFORE any ask — a known grant or
//    a known refusal resolves with ZERO getUserMedia calls —
//    and the compose bar fires that ask on mount
//    (useAutoMicRequest), framed as the ghostie asking to hear.
//
// 2. "Permission should persist." §C: the audit found the
//    SpeechRecognition path never recorded its outcome, so
//    the memory sat at "unknown" on the app's most common
//    voice path. useComposeVoice + useWakeWord now feed it
//    (noteRecognitionOutcome), pinned in §D. A gesture-starved
//    refusal (no user activation on record) is NOT remembered
//    as a denial — nobody refused anything.
//
// 3. Voice modes, configurable: Tap to talk / Natural / Both,
//    default tap (nothing regresses silently). §A drives the
//    gate (src/sensory/voiceMode): default, labels, cycle,
//    mirror, persisted read from fabric_prefs_v1. §D pins the
//    settings row (FabricMenu, SETTINGS & HELP) and its copy:
//    "Say '{name}' to talk to your ghostie."
//
// 4. NO conversation, NO window (the correction): the ghostie
//    makes no words; being heard is signaled by the ghostie
//    ITSELF. §B drives the attention machine (idle → name →
//    attending → silence relaxes it; whole-word matching; the
//    name is the only thing consumed). §D pins the in-world
//    signal chain — FABRIC_VOICE_ATTENTION_EVENT → LegacyFluid
//    → GhostPeer.expressAttention — and that no surface gained
//    a listening indicator or a "window" state for this.
//
// Run: node scripts/voice58-check.mjs   (from the repo root)

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
  "/tmp/v58-stub-asyncstorage.mjs",
  "const m = new Map();\nglobalThis.__v58store = m;\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);
const ALIAS = [
  "--alias:@react-native-async-storage/async-storage=/tmp/v58-stub-asyncstorage.mjs",
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
    "/tmp/v58-voicemode.mjs",
    ALIAS
  );
  vm.resetVoiceInputModeForTests();
  check("§A default mode is tap (today's behavior)", vm.voiceInputModeNow() === "tap");
  check(
    "§A labels are the settings words",
    vm.voiceInputModeLabel("tap") === "Tap to talk" &&
      vm.voiceInputModeLabel("natural") === "Natural" &&
      vm.voiceInputModeLabel("both") === "Both"
  );
  check(
    "§A cycle runs tap → natural → both → tap",
    vm.nextVoiceInputMode("tap") === "natural" &&
      vm.nextVoiceInputMode("natural") === "both" &&
      vm.nextVoiceInputMode("both") === "tap"
  );
  check(
    "§A the name-listener is armed in natural + both only",
    vm.naturalArmedInMode("tap") === false &&
      vm.naturalArmedInMode("natural") === true &&
      vm.naturalArmedInMode("both") === true
  );
  let seen = null;
  const off = vm.subscribeVoiceInputMode((m) => (seen = m));
  vm.mirrorVoiceInputMode("both");
  check("§A mirror flips the gate + notifies", vm.voiceInputModeNow() === "both" && seen === "both");
  off();
  // Persisted read: the gate reads fabric_prefs_v1 (and never writes it).
  vm.resetVoiceInputModeForTests();
  globalThis.__v58store.set(
    "fabric_prefs_v1",
    JSON.stringify({ voiceInputMode: "natural", hapticsEnabled: true })
  );
  vm.ensureVoiceInputModePref();
  await tick();
  check("§A persisted preference is read from fabric_prefs_v1", vm.voiceInputModeNow() === "natural");
  globalThis.__v58store.delete("fabric_prefs_v1");
}

// ------------------------------------------------- §B attention machine
{
  const ww = await bundle("src/sensory/wakeWord.ts", "/tmp/v58-wakeword.mjs");
  let t = 1_000;
  const m = ww.createWakeWordMachine({ phrase: "Pesto", now: () => t });
  check("§B starts idle", m.state() === "idle");
  let ev = m.hearFinal("what is the weather doing");
  check("§B idle speech without the name is discarded", ev.type === "ignore" && m.state() === "idle");
  ev = m.hearFinal("Pesto, show me your heartbeat");
  check(
    "§B the name wakes it and hands over the ask verbatim",
    ev.type === "wake" && ev.command === "show me your heartbeat" && m.state() === "attending"
  );
  ev = m.hearFinal("and make it slower");
  check("§B attending speech is an ask as spoken (no name needed)", ev.type === "utterance" && ev.text === "and make it slower");
  ev = m.hearFinal("thanks, Pesto");
  check("§B the name inside an ask is consumed, the ask kept", ev.type === "utterance" && ev.text === "thanks");
  ev = m.hearFinal("Pesto");
  check("§B a bare name while attending just refreshes attention", ev.type === "attend" && m.state() === "attending");
  t += ww.ATTENTION_LAPSE_MS + 1;
  check("§B silence relaxes attention (plumbing, not a surface)", m.tick() === true && m.state() === "idle");
  ev = m.hearFinal("make it slower");
  check("§B after the lapse the name is required again", ev.type === "ignore");

  const m2 = ww.createWakeWordMachine({ phrase: "Boo", now: () => t });
  check("§B whole words only: 'Boo' does not fire on 'book'", m2.hearFinal("pass the book please").type === "ignore");
  const m3 = ww.createWakeWordMachine({ phrase: "Sir Bounce", now: () => t });
  const ev3 = m3.hearFinal("hey sir bounce, dance for me");
  check("§B a multi-word name matches as a phrase", ev3.type === "wake" && ev3.command === "dance for me");
  const m4 = ww.createWakeWordMachine({ phrase: "Pesto", now: () => t });
  const ev4 = m4.hearFinal("peSTO!");
  check("§B matching is case- and punctuation-blind", ev4.type === "wake" && ev4.command === "");
  const m5 = ww.createWakeWordMachine({ phrase: "Pesto", now: () => t });
  const ev5 = m5.hearFinal("show me your heartbeat, Pesto");
  check("§B name-last keeps the words before it", ev5.type === "wake" && ev5.command === "show me your heartbeat");
}

// ------------------------------------------------------- §C mic owner
{
  // One entry re-exporting both modules; fresh instances per
  // scenario via query-suffixed imports (separate module state,
  // shared seeded storage — like separate app launches).
  writeFileSync(
    "/tmp/v58-entry.ts",
    `export * as ms from ${JSON.stringify(path.join(root, "src/sensors/micStream.ts"))};\n` +
      `export * as hg from ${JSON.stringify(path.join(root, "src/sensors/hardwareGrants.ts"))};\n`
  );
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    ["/tmp/v58-entry.ts", "--bundle", "--format=esm", "--platform=node", "--outfile=/tmp/v58-mic.mjs", ...ALIAS],
    { cwd: root, stdio: "pipe" }
  );
  const url = pathToFileURL("/tmp/v58-mic.mjs").href;

  let gumCalls = 0;
  let stops = 0;
  const setNav = (over) =>
    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            gumCalls += 1;
            return { getTracks: () => [{ stop: () => (stops += 1) }] };
          },
        },
        userActivation: { hasBeenActive: true },
        ...over,
      },
      configurable: true,
      writable: true,
    });

  // Known grant: the memory answers; the platform is never touched.
  // (Import BEFORE seeding: each bundle inlines its own stub
  // module, whose Map becomes __v58store when the bundle loads.)
  setNav({});
  const a = await import(url);
  globalThis.__v58store.set("fabric_hw_grants_v1", JSON.stringify({ microphone: "granted" }));
  gumCalls = 0;
  check("§C known grant resolves granted with ZERO getUserMedia calls", (await a.ms.ensureMicAccess()) === "granted" && gumCalls === 0);
  a.hg.rememberHardwareGrant("microphone", "denied");
  await tick();
  check("§C known refusal resolves denied, still zero calls (no nagging)", (await a.ms.ensureMicAccess()) === "denied" && gumCalls === 0);

  // Unknown: exactly one shared probe; the stream is let go at once.
  globalThis.__v58store.clear();
  const b = await import(url + "?fresh=1");
  gumCalls = 0;
  stops = 0;
  const [r1, r2] = await Promise.all([b.ms.ensureMicAccess(), b.ms.ensureMicAccess()]);
  check("§C unknown state probes exactly once for concurrent callers", r1 === "granted" && r2 === "granted" && gumCalls === 1);
  check("§C the probe lets go immediately (tracks stopped)", stops === 1);
  await tick();
  check("§C the probe's answer is remembered", b.hg.knownHardwareGrant("microphone") === "granted");

  // Gesture-starved refusal is not a refusal.
  globalThis.__v58store.clear();
  const c = await import(url + "?fresh=2");
  setNav({
    userActivation: { hasBeenActive: false },
    mediaDevices: {
      getUserMedia: async () => {
        const e = new Error("nope");
        e.name = "NotAllowedError";
        throw e;
      },
    },
  });
  check("§C a pre-activation refusal reads 'unavailable', not denied", (await c.ms.ensureMicAccess()) === "unavailable");
  await tick();
  check("§C …and the memory learns nothing from it", c.hg.knownHardwareGrant("microphone") === "unknown");
  setNav({
    userActivation: { hasBeenActive: true },
    mediaDevices: {
      getUserMedia: async () => {
        const e = new Error("nope");
        e.name = "NotAllowedError";
        throw e;
      },
    },
  });
  check("§C an activated refusal IS a denial, and is remembered", (await c.ms.ensureMicAccess()) === "denied" && c.hg.knownHardwareGrant("microphone") === "denied");

  // The recognizer's truth feeds the memory (the persistence fix).
  globalThis.__v58store.clear();
  const d = await import(url + "?fresh=3");
  await d.hg.ensureHardwareGrants();
  d.ms.noteRecognitionOutcome("granted");
  check("§C noteRecognitionOutcome writes the grant memory", d.hg.knownHardwareGrant("microphone") === "granted");
  setNav({});
}

// ------------------------------------------------------- §D wiring census
{
  const bar = read("src/components/sensory/ComposeBar.tsx");
  const voice = read("src/components/sensory/useComposeVoice.ts");
  const wake = read("src/components/sensory/useWakeWord.ts");
  const auto = read("src/components/sensory/useAutoMicRequest.ts");
  const menu = read("app/components/fabric/FabricMenu.tsx");
  const prefs = read("app/context/PreferencesContext.tsx");
  const peer = read("src/ghost/GhostPeer.ts");
  const fluid = read("src/components/fluid/LegacyFluid.tsx");
  const store = read("src/ghost/ghostStore.ts");
  const capture = read("src/services/voiceCapture.ts");
  const machine = read("src/sensory/wakeWord.ts");

  check("§D the bar wires the natural listener into the SAME submit path", bar.includes("useWakeWord") && bar.includes("onAsk: submitText"));
  check("§D the bar fires the automatic ask on mount", bar.includes("useAutoMicRequest"));
  check("§D the automatic ask consults the memory before asking", auto.includes('hardwareGrantState("microphone")') && auto.includes("ensureMicAccess()"));
  check("§D the recognizer path feeds the grant memory (granted + denied)", voice.includes('noteRecognitionOutcome("granted")') && voice.includes('noteRecognitionOutcome("denied")'));
  check("§D the wake loop feeds it too", wake.includes("noteRecognitionOutcome"));
  check("§D the wake loop is continuous + self-restarting", wake.includes("continuous = true") && wake.includes("RESTART_BACKOFF_MS"));
  check("§D settings row: Voice input, cycling the gate's modes", menu.includes('label="Voice input"') && menu.includes("voiceInputModeLabel(prefs.voiceInputMode)") && menu.includes("nextVoiceInputMode(prefs.voiceInputMode)"));
  check("§D settings shows the name as the way in", menu.includes("to talk to your ghostie") && menu.includes("ghost.ghostName"));
  check("§D the preference is written into fabric_prefs_v1 by its owner", prefs.includes("voiceInputMode,") && prefs.includes('const STORAGE_KEY = "fabric_prefs_v1"'));
  check("§D the owner mirrors the mode into the gate", prefs.includes("mirrorVoiceInputMode(voiceInputMode)"));
  check("§D the mic's signal is the ghostie itself (event → canvas → body)", store.includes('FABRIC_VOICE_ATTENTION_EVENT = "fabric:voice-attention"') && fluid.includes("FABRIC_VOICE_ATTENTION_EVENT") && fluid.includes("expressAttention(") && peer.includes("expressAttention(attending: boolean)"));
  check("§D no window state exists in the attention machine", !machine.includes("window") && !machine.includes("Window"));
  check("§D no surface sells a 'Wake word' mode or a listening label for it", !menu.includes("Wake word") && !bar.includes("Listening for"));
  check("§D voiceCapture's zero-import core is untouched", !/^import\s/m.test(capture));
}

console.log(`\nvoice58: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
