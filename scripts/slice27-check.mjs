/**
 * Slice 27 — on-device brain (WebLLM tier) contract check.
 * Run: node scripts/slice27-check.mjs
 *
 * Bundles the REAL modules (onDeviceBrain, PatternComposer,
 * RecipeComposer, GhostBrain) with an in-memory storage stub and
 * a MOCKED web-llm module injected through the brain's test seam,
 * and proves:
 *   1. the state machine: no WebGPU -> unavailable; consent asked
 *      once; a No is forever (no nagging); a Yes downloads with
 *      progress-callback % driving the snapshot, then ready;
 *   2. the tier order: cloud beats device, device beats the rule
 *      floor, and a not-ready device falls through WITHOUT any
 *      download being started by a resolution;
 *   3. honest credits: device-authored answers carry source
 *      "device" (the bar captions "Interpreted on this device"),
 *      cloud answers "llm", floor answers "builtin";
 *   4. the ghost consult: the SAME validator guards the device
 *      model — out-of-schema decisions and gate-refused draws
 *      are rejected exactly as on the Spark path.
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

// ---------------------------------------------------------------------------
// Stubs: storage (in-memory map), navigator (per-scenario), web-llm (mock).
// ---------------------------------------------------------------------------
globalThis.__store = new Map();
const storageStub = {
  name: "storage-stub",
  setup(build) {
    build.onResolve({ filter: /app\/utils\/storage$/ }, () => ({
      path: "storage-stub",
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `
        export async function getJSON(key, fallback) {
          return globalThis.__store.has(key) ? globalThis.__store.get(key) : fallback;
        }
        export async function setJSON(key, value) { globalThis.__store.set(key, value); }
        export async function removeItem(key) { globalThis.__store.delete(key); }
      `,
      loader: "js",
    }));
  },
};

function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true,
  });
}

// The mock web-llm module: records every call, replays progress,
// and answers chat from a script the scenarios set.
const mock = {
  importUrls: [],
  createModelIds: [],
  progressScript: [0.42, 0.86, 1],
  reply: "hello from the device",
  failCreate: false,
};
function installMockImporter(brain) {
  brain.setWebLLMImporterForTests(async (url) => {
    mock.importUrls.push(url);
    return {
      CreateMLCEngine: async (modelId, cfg) => {
        mock.createModelIds.push(modelId);
        if (mock.failCreate) throw new Error("mock load failure");
        for (const p of mock.progressScript) {
          cfg?.initProgressCallback?.({ progress: p, text: "loading" });
        }
        return {
          chat: {
            completions: {
              create: async () => ({
                choices: [{ message: { content: mock.reply } }],
              }),
            },
          },
          unload: async () => {},
        };
      },
    };
  });
}

// ONE bundle for all three modules: they must share module
// instances (the composer reads the very brain store the test
// drives), so they are re-exported from a single stdin entry.
async function bundleAll() {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        export * as brain from "./src/ai/onDeviceBrain";
        export * as composer from "./src/ai/RecipeComposer";
        export * as ghost from "./src/ghost/GhostBrain";
      `,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [storageStub],
    logLevel: "silent",
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(
    mod, mod.exports, require
  );
  return mod.exports;
}

const { brain, composer, ghost } = await bundleAll();
installMockImporter(brain);

const tick = () => new Promise((r) => setTimeout(r, 10));
async function settle() { for (let i = 0; i < 30; i++) await tick(); }

function freshBrain(navigatorValue) {
  globalThis.__store = new Map();
  brain.resetOnDeviceBrainForTests();
  mock.importUrls = [];
  mock.createModelIds = [];
  mock.failCreate = false;
  setNavigator(navigatorValue);
}

// ---------------------------------------------------------------------------
// 0. esbuild transform pass over every touched source file.
// ---------------------------------------------------------------------------
console.log("== esbuild pass over touched files");
const touched = [
  "src/ai/onDeviceBrain.ts", "src/ai/PatternComposer.ts",
  "src/ai/RecipeComposer.ts", "src/ai/RecipeCore.ts",
  "src/ai/compositionsStore.ts", "src/ghost/GhostBrain.ts",
  "src/ghost/ghostStore.ts", "src/ghost/GhostPeer.ts",
  "src/ghost/useGhostPeer.ts", "src/ghost/ghostBrainPref.ts",
  "src/components/sensory/ComposeBar.tsx",
  "src/components/fluid/LegacyFluid.tsx",
  "app/components/fabric/OnDeviceBrainCard.tsx",
  "app/components/fabric/BrainChrome.tsx",
  "app/components/fabric/GhostieHome.tsx",
  "app/components/neo/AISettingsDrawer.tsx",
  "app/_layout.tsx",
];
for (const f of touched) {
  try {
    await esbuild.transform(fs.readFileSync(path.join(ROOT, f), "utf8"), {
      loader: f.endsWith(".tsx") ? "tsx" : "ts",
    });
    ok(true, `esbuild ${f}`);
  } catch (e) {
    ok(false, `esbuild ${f}: ${e.message?.split("\n")[0]}`);
  }
}

// ---------------------------------------------------------------------------
// 1. No WebGPU -> unavailable, honest, silent.
// ---------------------------------------------------------------------------
console.log("== probe: no WebGPU");
freshBrain({});
await brain.ensureBrainInit();
let snap = brain.getBrainSnapshot();
ok(snap.state === "unavailable" && snap.webgpu === false, "no navigator.gpu -> state unavailable");
brain.noteBrainWanted();
await settle();
snap = brain.getBrainSnapshot();
ok(snap.askVisible === false, "unavailable device never raises the ask");
ok((await brain.onDeviceChat([{ role: "user", content: "hi" }])) === null, "chat returns null when unavailable");
ok(mock.importUrls.length === 0, "web-llm never imported on an unavailable device");

// ---------------------------------------------------------------------------
// 2. Consent: asked once; a No is forever.
// ---------------------------------------------------------------------------
console.log("== consent: declined once, never nagged");
freshBrain({ gpu: {} });
await brain.ensureBrainInit();
snap = brain.getBrainSnapshot();
ok(snap.state === "idle" && snap.webgpu === true, "WebGPU present -> idle");
brain.noteBrainWanted();
await settle();
snap = brain.getBrainSnapshot();
ok(snap.askVisible === true && snap.consent === null, "first want raises the one-time ask");
await brain.answerBrainConsent(false);
snap = brain.getBrainSnapshot();
ok(snap.consent === "declined" && snap.askVisible === false, "No records declined and hides the ask");
brain.noteBrainWanted();
await settle();
ok(brain.getBrainSnapshot().askVisible === false, "a later want never re-raises the ask");
ok(mock.importUrls.length === 0, "declined -> no import, no download");

// ---------------------------------------------------------------------------
// 3. Consent granted: progress drives the snapshot, then ready.
// ---------------------------------------------------------------------------
console.log("== consent: granted -> downloading (real %) -> ready");
freshBrain({ gpu: {} });
await brain.ensureBrainInit();
const seen = [];
const unsub = brain.subscribeOnDeviceBrain((s) => seen.push(`${s.state}:${s.progress}`));
brain.noteBrainWanted();
await settle();
ok(brain.getBrainSnapshot().askVisible === true, "ask rises before the answer");
await brain.answerBrainConsent(true);
await settle();
unsub();
snap = brain.getBrainSnapshot();
ok(snap.state === "ready" && snap.progress === 1, "download completes -> ready at 100%");
ok(seen.some((x) => x.startsWith("downloading:0.42")), "progress callback drove the snapshot (42%)");
ok(mock.importUrls[0] === "https://esm.sh/@mlc-ai/web-llm@0.2.79", "library imported from the Conduit-proven CDN URL");
ok(mock.createModelIds[0] === "Llama-3.2-1B-Instruct-q4f16_1-MLC", "default model is Llama-3.2-1B-Instruct-q4f16_1-MLC");
ok(brain.isOnDeviceBrainReady() === true, "isOnDeviceBrainReady() true when ready");
mock.reply = "hello from the device";
ok((await brain.onDeviceChat([{ role: "user", content: "hi" }])) === "hello from the device", "ready -> chat completions route through the engine");
brain.noteBrainWanted();
await settle();
ok(brain.getBrainSnapshot().askVisible === false, "ready brain never raises the ask");

// ---------------------------------------------------------------------------
// 4. Tier order at the compose entry.
// ---------------------------------------------------------------------------
console.log("== tiers: device beats floor, cloud beats device, idle never downloads");
delete process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY;

// 4a. Device ready + a valid device performance -> source "device".
mock.reply = JSON.stringify({
  kind: "recipe",
  recipe: {
    version: 2, name: "Galaxy", seed: 7,
    steps: [{ shape: "spiral", cx: 0.5, cy: 0.5, scale: 0.38, hue: 265, durationMs: 5200, style: "draw" }],
  },
});
let out = await composer.composeWithShapesDetailed("show me something cosmic");
ok(out.path === "device", "no cloud + device ready -> path device");
ok(out.result?.kind === "recipe" && out.result.recipe.source === "device", "device-authored recipe carries source device (caption: Interpreted on this device)");

const effSource = (o) =>
  o.result == null ? null : o.result.kind === "recipe" ? o.result.recipe.source : o.result.pattern.source;

// 4b. Device ready but answering garbage -> the floor still answers.
mock.reply = "definitely not json";
out = await composer.composeWithShapesDetailed("gentle rain on a tin roof");
ok(out.result !== null && effSource(out) === "builtin", "device garbage -> built-ins still answer (source builtin)");
ok(effSource(out) !== "device", "garbage is never credited to the device");

// 4c. Cloud locked in beats the device (tried first, wins).
process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY = "check-key";
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify({
      kind: "pattern",
      pattern: { name: "Cloud Rain", steps: [{ atMs: 0, kind: "haptic", hapticId: "tap", intensity: 0.5 }] },
    }) } }],
    usage: {}, model: "stub",
  }),
  text: async () => "",
});
out = await composer.composeWithShapesDetailed("make it rain");
ok(out.path === "model" && effSource(out) === "llm", "built-in cloud resolved -> cloud answers first (source llm)");

// 4d. Cloud answering garbage -> device catches it with its own credit.
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: "cloud garbage" } }], usage: {}, model: "stub" }),
  text: async () => "",
});
mock.reply = JSON.stringify({
  kind: "pattern",
  pattern: { name: "Device Rain", steps: [{ atMs: 0, kind: "haptic", hapticId: "wave", intensity: 0.6 }] },
});
out = await composer.composeWithShapesDetailed("make it rain");
ok(effSource(out) === "device", "cloud garbage -> device answers, credited as device");
delete process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY;

// 4e. Device NOT downloaded: resolution falls to the floor and
//     starts NO download (the want only raises the ask).
freshBrain({ gpu: {} });
await brain.ensureBrainInit();
out = await composer.composeWithShapesDetailed("lemme see your heartbeat");
ok(out.result !== null && out.path === "builtin", "device idle -> built-in floor answers on the builtin path");
ok(mock.importUrls.length === 0, "a resolution never imports web-llm");
ok(brain.getBrainSnapshot().state === "idle", "a resolution never starts a download");
ok(brain.getBrainSnapshot().askVisible === true, "the want raised the one-time ask instead");

// ---------------------------------------------------------------------------
// 5. Ghost consult: same validator, same law, smaller budget.
// ---------------------------------------------------------------------------
console.log("== ghost: device consult under the same validator");
const scenario = {
  temperament: "curious",
  seconds_since_human_touch: 30,
  recent_events: ["soft splat"],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.2,
  verbs_seen: [],
  other_ghosts: [],
  room_energy_trend: "steady",
  ghost_identity: { name: "Boop", hue: 200, seed_traits: ["curious"] },
};
let capturedOpts = null;
const validDecision = { mood_shift: null, intent: "drift", pattern_id: null, draw_shape: null, intensity: 0.4, linger_s: 6 };
let decision = await ghost.consultDeviceBrain(
  scenario,
  async (messages, opts) => { capturedOpts = opts; return JSON.stringify(validDecision); },
  1000
);
ok(decision?.intent === "drift", "valid device decision validates and returns");
ok(capturedOpts?.maxTokens === 256 && capturedOpts?.temperature === 0.2, "device consult budget: 256 tokens, temperature 0.2");

decision = await ghost.consultDeviceBrain(
  scenario,
  async () => JSON.stringify({ ...validDecision, intent: "teleport", intensity: 5 }),
  1000
);
ok(decision === null, "out-of-schema device decision rejected by the same validator");

const refusingScenario = {
  ...scenario,
  fabric: {
    layer_id: "fluid",
    canvas: "fluid",
    role: "open",
    in_session: false,
    rules: { draw: false, verbs: true, notes: true },
  },
};
let refusalHeard = null;
decision = await ghost.consultDeviceBrain(
  refusingScenario,
  async () => JSON.stringify({ ...validDecision, intent: "draw", draw_shape: "heart" }),
  1000,
  undefined,
  undefined,
  (text) => { refusalHeard = text; }
);
ok(decision === null && typeof refusalHeard === "string" && refusalHeard.includes("draw"), "draw under a refusing fabric rejected, refusal named");

const deviceMsgs = ghost.buildDeviceMessages(scenario);
const sparkMsgs = ghost.buildSparkMessages(scenario);
ok(deviceMsgs.length === sparkMsgs.length, "device messages reuse the full Spark context (few-shot + notes)");
ok(deviceMsgs[0].content.length < sparkMsgs[0].content.length && deviceMsgs[0].content.includes("ONLY one JSON object"), "device system prompt is the tightened preamble");

// ---------------------------------------------------------------------------
// 6. Model preference: persists; switching away from the loaded
//    model drops the tier back to idle (no silent swap).
// ---------------------------------------------------------------------------
console.log("== model preference");
freshBrain({ gpu: {} });
await brain.ensureBrainInit();
await brain.answerBrainConsent(true);
await settle();
ok(brain.getBrainSnapshot().state === "ready", "ready on the default model");
await brain.selectBrainModel("Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
snap = brain.getBrainSnapshot();
ok(snap.model.id === "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "model selection applies");
ok(globalThis.__store.get("fabric_brain_model_v1") === "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "model selection persists (fabric_brain_model_v1)");
ok(snap.state === "idle" && brain.isOnDeviceBrainReady() === false, "switching models drops to idle until its download");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
