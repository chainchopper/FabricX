/**
 * Cleanup 2, compose-path proof — run: node scripts/check-compose.mjs
 * Bundles the REAL RecipeComposer (+ PatternComposer + RecipeCore)
 * with a storage stub; fetch is stubbed to a cloud that answers
 * garbage, proving the path reporting LegacyFluid captions from:
 *   no cloud resolved  -> path "builtin"
 *   cloud resolved     -> path "model" (even when the cloud fails
 *   and built-ins degrade the answer, or nobody can shape it)
 */
import { createRequire } from "node:module";
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
  entryPoints: [path.join(ROOT, "src/ai/RecipeComposer.ts")],
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
const { composeWithShapesDetailed, composeWithShapes } = mod.exports;

// A cloud that answers unusable text (both attempts + repair).
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: "definitely not performance json" } }],
    usage: {},
    model: "stub",
  }),
  text: async () => "",
});

// 1. No cloud anywhere: a heartbeat ask is answered by the built-in
//    interpreter and reports the builtin path.
delete process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY;
globalThis.__aiConfig = null;
let out = await composeWithShapesDetailed("lemme see your heartbeat");
ok(out.path === "builtin", "no cloud -> path builtin");
ok(out.result !== null && out.result.kind === "recipe", "no cloud -> heartbeat still answered (built-in performance)");

// 2. No cloud + gibberish: null on the builtin path -> the bar will
//    caption "That one's beyond the built-in interpreter."
out = await composeWithShapesDetailed("zqxjkv blorp fnord");
ok(out.result === null && out.path === "builtin", "no cloud + gibberish -> null, path builtin");

// 3. Built-in cloud locked in, cloud answers garbage: the answer
//    still lands via built-in degradation, path reports "model".
process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY = "FANALOGYKEY";
out = await composeWithShapesDetailed("lemme see your heartbeat");
ok(out.path === "model", "built-in cloud -> path model");
ok(out.result !== null, "built-in cloud + garbage replies -> built-ins still answer");

// 4. Built-in cloud + gibberish + garbage replies: null on the
//    model path -> the bar will caption "beyond the cloud model".
out = await composeWithShapesDetailed("zqxjkv blorp fnord");
ok(out.result === null && out.path === "model", "built-in cloud + gibberish -> null, path model");

// 5. The legacy wrapper still returns bare results.
delete process.env.EXPO_PUBLIC_FANALOGY_LLM_API_KEY;
const bare = await composeWithShapes("gentle rain on a tin roof");
ok(bare !== null, "composeWithShapes wrapper unchanged in shape");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
