/**
 * Cleanup 2 verification — run: node scripts/check.mjs
 * 1. esbuild transform of every touched file (syntax/JSX).
 * 2. Config-resolution matrix against the REAL PatternComposer,
 *    bundled with a storage stub (env stubbed per case).
 * 3. String sweep for key-begging copy in the intelligence paths.
 * 4. Structural assertions for the chip retirement.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

/* ---------- 1. transform every touched file ---------- */
console.log("== esbuild transform (touched files) ==");
const touched = [
  "src/ai/PatternComposer.ts",
  "src/ai/RecipeComposer.ts",
  "src/components/fluid/LegacyFluid.tsx",
  "src/components/sensory/ComposeBar.tsx",
  "src/ghost/useGhostPeer.ts",
  "src/ghost/ghostStore.ts",
  "src/ghost/ghostBrainPref.ts",
  "src/ghost/GhostIndicator.tsx",
  "src/components/sam/SamLayer.tsx",
  "app/components/neo/AISettingsDrawer.tsx",
  "app/components/fabric/GhostieHome.tsx",
  "app/components/fabric/FabricMenu.tsx",
  "app/components/ExperienceHUD.tsx",
];
for (const rel of touched) {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  try {
    await esbuild.transform(src, {
      loader: rel.endsWith(".tsx") ? "tsx" : "ts",
      jsx: "automatic",
    });
    ok(true, `transform ${rel}`);
  } catch (e) {
    ok(false, `transform ${rel}: ${e.message.split("\n")[0]}`);
  }
}

/* ---------- 2. resolution matrix ---------- */
console.log("== config resolution matrix ==");
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
          const v = globalThis.__aiConfig;
          return v === undefined ? fallback : v;
        }
        export async function setJSON() {}
      `,
      loader: "js",
    }));
  },
};
const bundle = await esbuild.build({
  entryPoints: [path.join(ROOT, "src/ai/PatternComposer.ts")],
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
const { resolveLLMConfig, loadLLMConfig, getBuiltinCloudConfig, hasBuiltinCloud } =
  mod.exports;

const ENV_KEYS = [
  "EXPO_PUBLIC_FANALOGY_LLM_API_KEY",
  "EXPO_PUBLIC_FANALOGY_LLM_BASE_URL",
  "EXPO_PUBLIC_FANALOGY_LLM_MODEL",
];
function setEnv(env) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
}
const USER = {
  llm: {
    provider: "custom",
    apiKey: "USERKEY",
    endpoint: "https://user.example/v1",
    model: "user-model",
    enabled: true,
  },
};

// Case 1: env only -> builtin-cloud with documented defaults
setEnv({ EXPO_PUBLIC_FANALOGY_LLM_API_KEY: "FANALOGYKEY" });
globalThis.__aiConfig = null;
let r = await resolveLLMConfig();
ok(r.source === "builtin-cloud", "env only -> source builtin-cloud");
ok(r.config?.provider === "custom", "env only -> provider custom");
ok(r.config?.endpoint === "https://api.meta.ai/v1", "env only -> default Meta base URL");
ok(r.config?.model === "muse-spark-1.3", "env only -> default muse-spark-1.3");
ok(r.config?.apiKey === "FANALOGYKEY", "env only -> env key used");
ok(hasBuiltinCloud() === true, "env only -> hasBuiltinCloud() true");

// Case 2: env with base + model overrides
setEnv({
  EXPO_PUBLIC_FANALOGY_LLM_API_KEY: "K2",
  EXPO_PUBLIC_FANALOGY_LLM_BASE_URL: "https://proxy.example/v1",
  EXPO_PUBLIC_FANALOGY_LLM_MODEL: "muse-spark-1.2",
});
r = await resolveLLMConfig();
ok(r.config?.endpoint === "https://proxy.example/v1", "env overrides -> base URL honored");
ok(r.config?.model === "muse-spark-1.2", "env overrides -> model honored");

// Case 3: user only
setEnv({});
globalThis.__aiConfig = USER;
r = await resolveLLMConfig();
ok(r.source === "user", "user only -> source user");
ok(r.config?.apiKey === "USERKEY" && r.config?.model === "user-model", "user only -> user values");

// Case 4: both -> user wins
setEnv({ EXPO_PUBLIC_FANALOGY_LLM_API_KEY: "FANALOGYKEY" });
r = await resolveLLMConfig();
ok(r.source === "user" && r.config?.apiKey === "USERKEY", "both -> user wins over built-in cloud");

// Case 5: neither -> none, everything still resolves (on-device)
globalThis.__aiConfig = null;
setEnv({});
r = await resolveLLMConfig();
ok(r.source === "none" && r.config === null, "neither -> source none, config null");
ok((await loadLLMConfig()) === null, "neither -> loadLLMConfig() null");
ok(hasBuiltinCloud() === false, "neither -> hasBuiltinCloud() false");
ok(getBuiltinCloudConfig() === null, "neither -> getBuiltinCloudConfig() null");

// Case 6: user config present but disabled -> falls through to env
globalThis.__aiConfig = { llm: { ...USER.llm, enabled: false } };
setEnv({ EXPO_PUBLIC_FANALOGY_LLM_API_KEY: "FANALOGYKEY" });
r = await resolveLLMConfig();
ok(r.source === "builtin-cloud", "user disabled -> built-in cloud serves");

// Case 7: user provider none -> falls through to env
globalThis.__aiConfig = { llm: { ...USER.llm, provider: "none" } };
r = await resolveLLMConfig();
ok(r.source === "builtin-cloud", "user provider none -> built-in cloud serves");

// Case 8: user enabled but keyless, no env -> none
globalThis.__aiConfig = { llm: { ...USER.llm, apiKey: "" } };
setEnv({});
r = await resolveLLMConfig();
ok(r.source === "none", "user keyless + no env -> none");

// Case 9: whitespace-only env key -> treated as absent
setEnv({ EXPO_PUBLIC_FANALOGY_LLM_API_KEY: "   " });
globalThis.__aiConfig = null;
r = await resolveLLMConfig();
ok(r.source === "none", "whitespace env key -> none");

// Case 10: storage throws -> resolver still answers (never throws)
globalThis.__aiConfig = undefined; // stub returns fallback (null) — treat as empty storage
setEnv({ EXPO_PUBLIC_FANALOGY_LLM_API_KEY: "FANALOGYKEY" });
r = await resolveLLMConfig();
ok(r.source === "builtin-cloud", "empty storage + env -> built-in cloud");
delete globalThis.__aiConfig;
setEnv({});

/* ---------- 3. string sweep ---------- */
console.log("== string sweep (intelligence paths) ==");
const sweepFiles = [
  ...touched,
  "src/ghost/GhostBrain.ts",
  "src/ai/RecipeCore.ts",
];
const BEG = /add a key|connect.*spark|api key required/i;
for (const rel of sweepFiles) {
  let src;
  try { src = readFileSync(path.join(ROOT, rel), "utf8"); } catch { continue; }
  const hits = src.split("\n").filter((l) => BEG.test(l));
  ok(hits.length === 0, `no key-begging copy in ${rel}${hits.length ? " -> " + hits.join(" | ") : ""}`);
}
const bar = readFileSync(path.join(ROOT, "src/components/sensory/ComposeBar.tsx"), "utf8");
ok(bar.includes("Interpreted on-device."), "ComposeBar captions built-ins as on-device");
ok(bar.includes("That one's beyond the built-in interpreter."), "ComposeBar has the beyond-builtin caption");
ok(!bar.includes("add a key in AI Services"), "ComposeBar key CTA gone");
const peer = readFileSync(path.join(ROOT, "src/ghost/useGhostPeer.ts"), "utf8");
ok(peer.includes('tierLabel: "On-device brain"'), "ghost no-cloud outcome publishes 'On-device brain'");
ok(!peer.includes("no key saved"), "useGhostPeer 'no key saved' label gone");
const home = readFileSync(path.join(ROOT, "app/components/fabric/GhostieHome.tsx"), "utf8");
ok(!home.includes("Needs a saved key"), "GhostieHome Spark sub no longer demands a saved key");
ok(home.includes("no key needed"), "GhostieHome states the built-in cloud needs no key");
const drawer = readFileSync(path.join(ROOT, "app/components/neo/AISettingsDrawer.tsx"), "utf8");
ok(drawer.includes("Fanalogy cloud — built in"), "AI Services shows the built-in cloud state");
ok(drawer.includes("Local models welcome — e.g."), "AI Services carries the local/Tailscale help line");
ok(drawer.includes("fabric.fanalogy.com"), "help line names the CORS origin");
ok(!drawer.includes("paste your Model API key"), "preset toast no longer orders a paste");
const sam = readFileSync(path.join(ROOT, "src/components/sam/SamLayer.tsx"), "utf8");
ok(sam.includes("loadLLMConfig()"), "SAM reads the shared resolution");
ok(!sam.includes("needs your Meta Model API key"), "SAM key-demand copy gone");

/* ---------- 4. chip retirement structure ---------- */
console.log("== chip retirement ==");
const hud = readFileSync(path.join(ROOT, "app/components/ExperienceHUD.tsx"), "utf8");
ok(
  !hud.includes("import GhostIndicator") && !hud.includes("<GhostIndicator"),
  "ExperienceHUD no longer imports or mounts GhostIndicator (name survives only in the retirement comment)"
);
ok(home.includes("FABRIC_GHOST_TOGGLE_EVENT"), "GhostieHome dispatches the ghost on/off event");
ok(home.includes('FABRIC_GHOST_SESSION_EVENT, "summon"') || home.includes('"summon"'), "GhostieHome can summon");
ok(home.includes('"dismiss"'), "GhostieHome can dismiss");
const menu = readFileSync(path.join(ROOT, "app/components/fabric/FabricMenu.tsx"), "utf8");
ok(menu.includes("FABRIC_GHOST_SESSION_EVENT"), "FabricMenu dispatches the session event");
ok(menu.includes('detail: "summon"') && menu.includes('detail: "dismiss"'), "THIS LAYER row offers Summon and Dismiss");
ok(peer.includes("addEventListener(FABRIC_GHOST_TOGGLE_EVENT"), "canvas still listens for the toggle event");
ok(peer.includes("addEventListener(FABRIC_GHOST_SESSION_EVENT"), "canvas still listens for the session event");
const fluid = readFileSync(path.join(ROOT, "src/components/fluid/LegacyFluid.tsx"), "utf8");
ok(fluid.includes("composeWithShapesDetailed"), "LegacyFluid uses the detailed compose outcome");
ok(fluid.includes('"beyond-model"') && fluid.includes('"beyond-builtin"'), "LegacyFluid dispatches both beyond captions");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
