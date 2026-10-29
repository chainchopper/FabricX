/**
 * see-acts-check — headless proof for Slice 30 "See Acts".
 *
 * Run: node scripts/see-acts-check.mjs
 *
 * Bundles the REAL modules (seeActs, segmentation,
 * deviceGrounding, GhostPeer, RecipeCore) in one esbuild pass
 * with an in-memory storage stub — the Slice 27 harness shape —
 * and proves:
 *   1. the act-routing table: phrasing variants land on the
 *      right intent with the right phrase and ghost addressing,
 *      and the negatives stay generic ("draw a circle" with no
 *      target is NOT an act; heartbeat asks never degrade into
 *      highlights);
 *   2. the region->act math: cover-fit mapping matches
 *      SamLayer's pixel-space frameRect on a cropped-frame
 *      fixture, a touch lands at the region's canvas center
 *      with the funnel's radius clamp, and the ring fit wraps
 *      the padded box under RecipeCore's y-squash;
 *   3. tier selection at the seam: A configured wins; A absent
 *      + B ready -> B; A failing + B ready -> B; neither ->
 *      honest unavailable; camera down -> a product-language
 *      error, never a throw;
 *   4. Tier B end to end with a MOCKED transformers module:
 *      the consent ask raises once with the real size for the
 *      device path, a No is forever, a Yes downloads (progress
 *      reported) and the stub's box lands — normalized — as a
 *      region the act math can consume;
 *   5. ghost-performed acts ride Slice 23's machinery: the
 *      draw gate refuses with ZERO emits and zero recipes, an
 *      allowed touch emits once at the point in the ghost's
 *      color, an allowed ring ships ONE validated recipe at
 *      Slice 23's cost/cooldown, and the performDraw refactor
 *      left deliberated draws untouched;
 *   6. structural wiring: the route, the seam, the chrome and
 *      the ID-card line are in the sources they belong in.
 */
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Storage stub (Slice 27's pattern): the modules read/write the
// app storage util; here it is an in-memory map the test owns.
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

async function bundleAll() {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        export * as acts from "./src/sam/seeActs";
        export * as seam from "./src/sam/segmentation";
        export * as grounding from "./src/sam/deviceGrounding";
        export * as peerMod from "./src/ghost/GhostPeer";
        export * as recipeCore from "./src/ai/RecipeCore";
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

const { acts, seam, grounding, peerMod, recipeCore } = await bundleAll();
const { parseSeeAct, imageBoxToCanvas, boxCenter, touchRadiusFor, ringFitFor } = acts;
const { segmentPhrase, getSegmentationStatus } = seam;
const { GhostPeer } = peerMod;
const { validateRecipe } = recipeCore;

/* ================= 1. act routing ================= */
console.log("== act routing ==");
const route = (p) => parseSeeAct(p, "Boop");
const expectAct = (p, kind, phrase, toGhost) => {
  const a = route(p);
  ok(
    a !== null && a.kind === kind && a.phrase === phrase && a.toGhost === toGhost,
    `'${p}' -> ${kind} '${phrase}'${toGhost ? " (ghost)" : ""}`,
    JSON.stringify(a)
  );
};
expectAct("touch the apple", "touch", "the apple", false);
expectAct("tap the cup", "touch", "the cup", false);
expectAct("poke the bear", "touch", "the bear", false);
expectAct("point at the door", "touch", "the door", false);
expectAct("ghostie, touch the apple", "touch", "the apple", true);
expectAct("Boop, touch the apple", "touch", "the apple", true);
expectAct("touch the apple, Boop", "touch", "the apple", true);
expectAct("can you touch the apple?", "touch", "the apple", false);
expectAct("draw a circle around the chair", "draw", "the chair", false);
expectAct("draw a ring around the table", "draw", "the table", false);
expectAct("circle the chair", "draw", "the chair", false);
expectAct("outline the window", "draw", "the window", false);
expectAct("please draw a circle around the chair", "draw", "the chair", false);
expectAct("Boop, draw a circle around the chair", "draw", "the chair", true);
expectAct("highlight the keys", "highlight", "the keys", false);
expectAct("show me the apple", "highlight", "the apple", false);
expectAct("where is the remote", "highlight", "the remote", false);

console.log("== act routing: negatives stay generic ==");
const expectNull = (p, why) =>
  ok(route(p) === null, `'${p}' -> null (${why})`, JSON.stringify(route(p)));
expectNull("draw a circle", "no target: the generic compose path owns it");
expectNull("draw a heart", "a shape, not a see-act");
expectNull("make a spiral", "generic drawing");
expectNull("a touch of gold", "not an imperative");
expectNull("add a touch of gold", "not an imperative");
expectNull("show me your heartbeat", "the heartbeat route owns it");
expectNull("show me a heartbeat, Boop", "the heartbeat route owns it");
expectNull("tickle Boop", "the say-it verb route owns it");
expectNull("touch", "no target");
expectNull("", "empty");
expectNull("zqx jibber jabber", "gibberish");

/* ================= 2. region -> act math ================= */
console.log("== cover-fit mapping (vs SamLayer's frameRect) ==");
// Cropped-frame fixture: a 16:9 camera in a tall portrait phone.
const hostW = 390, hostH = 844;
const frameAspect = 1280 / 720;
{
  // SamLayer's pixel-space formula, verbatim.
  let w = hostW;
  let h = w / frameAspect;
  if (h < hostH) { h = hostH; w = h * frameAspect; }
  const left = (hostW - w) / 2, top = (hostH - h) / 2;
  const box = { x: 0.6, y: 0.3, w: 0.2, h: 0.25 };
  const expected = {
    x: (left + box.x * w) / hostW,
    y: (top + box.y * h) / hostH,
    w: (box.w * w) / hostW,
    h: (box.h * h) / hostH,
  };
  const got = imageBoxToCanvas(box, frameAspect, hostW / hostH);
  ok(
    near(got.x, expected.x, 1e-9) && near(got.y, expected.y, 1e-9) &&
    near(got.w, expected.w, 1e-9) && near(got.h, expected.h, 1e-9),
    "portrait viewport, wide frame: mapping matches the frameRect math",
    JSON.stringify({ got, expected })
  );
  const c = boxCenter(got);
  ok(
    near(c.x, expected.x + expected.w / 2, 1e-9) &&
    near(c.y, expected.y + expected.h / 2, 1e-9),
    "the touch lands at the region's canvas center"
  );
}
{
  // Wide viewport, tall frame (the other crop direction).
  const W2 = 1280, H2 = 800, A2 = 720 / 1280;
  let w = W2;
  let h = w / A2;
  if (h < H2) { h = H2; w = h * A2; }
  const left = (W2 - w) / 2, top = (H2 - h) / 2;
  const box = { x: 0.1, y: 0.55, w: 0.3, h: 0.2 };
  const expected = {
    x: (left + box.x * w) / W2,
    y: (top + box.y * h) / H2,
    w: (box.w * w) / W2,
    h: (box.h * h) / H2,
  };
  const got = imageBoxToCanvas(box, A2, W2 / H2);
  ok(
    near(got.x, expected.x, 1e-9) && near(got.y, expected.y, 1e-9) &&
    near(got.w, expected.w, 1e-9) && near(got.h, expected.h, 1e-9),
    "landscape viewport, tall frame: mapping matches too"
  );
  const same = imageBoxToCanvas(box, 1.5, 1.5);
  ok(
    near(same.x, box.x) && near(same.y, box.y) && near(same.w, box.w),
    "matching aspects pass through untouched"
  );
  const unknown = imageBoxToCanvas(box, 0, 0.46);
  ok(near(unknown.x, box.x) && near(unknown.w, box.w), "unknown aspect degrades to identity");
}

console.log("== touch radius + ring fit ==");
ok(near(touchRadiusFor({ x: 0, y: 0, w: 0.03, h: 0.02 }), 0.12), "tiny region floors at the funnel's 0.12");
ok(near(touchRadiusFor({ x: 0, y: 0, w: 0.4, h: 0.1 }), 0.4), "radius follows the larger side");
ok(near(touchRadiusFor({ x: 0, y: 0, w: 1.6, h: 0.2 }), 1), "cropped-oversize region caps at 1");
{
  const box = { x: 0.3, y: 0.3, w: 0.4, h: 0.2 };
  const fit = ringFitFor(box);
  ok(near(fit.cx, 0.5) && near(fit.cy, 0.4), "ring centers on the box");
  ok(
    fit.scale >= (box.w / 2) * 1.1 - 1e-9 &&
    fit.scale * 0.85 >= (box.h / 2) * 1.1 - 1e-9,
    "the fitted ring wraps the box padded ~10% (y un-squashed)",
    `scale=${fit.scale}`
  );
  const step = { shape: "ring", cx: fit.cx, cy: fit.cy, scale: fit.scale, hue: 200, durationMs: 2600, style: "draw" };
  ok(
    validateRecipe({ version: 2, name: "t", seed: 1, steps: [step] }, "builtin") !== null,
    "the fitted ring step passes the recipe validator"
  );
  ok(near(ringFitFor({ x: 0.49, y: 0.49, w: 0.02, h: 0.02 }).scale, 0.05), "tiny box floors at the validator's 0.05");
  ok(near(ringFitFor({ x: 0, y: 0, w: 1, h: 1 }).scale, 0.5), "huge box caps at the validator's 0.5");
}

/* ================= 3. tier selection ================= */
console.log("== segmentation seam: tier selection ==");
const fixture = JSON.parse(
  fs.readFileSync(new URL("./sam-fixture.json", import.meta.url), "utf8")
);
const FRAME = { dataUrl: "data:image/jpeg;base64,AAAA", width: 1000, height: 500 };
const captureOk = () => FRAME;
const stubFetchOk = async () => ({
  ok: true, status: 200, json: async () => fixture, text: async () => "",
});
const stubFetchBoom = async () => { throw new Error("network down"); };
const deviceBoxes = [
  { score: 0.9, label: "the apple", box: { xmin: 100, ymin: 50, xmax: 300, ymax: 250 } },
];
const detectStub = async () => deviceBoxes;
{
  const out = await segmentPhrase("the glowing phones", {
    cloud: { apiKey: "K", endpoint: "https://api.meta.ai/v1" },
    captureFrame: captureOk,
    fetchFn: stubFetchOk,
    deviceReady: () => true,
    deviceDetect: detectStub,
  });
  ok(out.status === "ok" && out.tier === "cloud-sam", "A configured wins over a ready B");
  ok(
    out.status === "ok" && out.regions.length > 0 &&
    out.regions[0].score === null && typeof out.regions[0].box.x === "number",
    "Tier A regions adapt (score null, box carried)"
  );
}
{
  const out = await segmentPhrase("the apple", {
    cloud: null,
    captureFrame: captureOk,
    deviceReady: () => true,
    deviceDetect: detectStub,
  });
  ok(out.status === "ok" && out.tier === "device-grounding", "A absent + B ready -> B");
  const r = out.status === "ok" ? out.regions[0] : null;
  ok(
    !!r && near(r.box.x, 0.1) && near(r.box.y, 0.1) && near(r.box.w, 0.2) &&
    near(r.box.h, 0.4) && r.score === 0.9 && r.hasMask === false,
    "Tier B pixel boxes normalize by the frame's own dims",
    JSON.stringify(r)
  );
}
{
  const out = await segmentPhrase("the apple", {
    cloud: { apiKey: "K", endpoint: "https://api.meta.ai/v1" },
    captureFrame: captureOk,
    fetchFn: stubFetchBoom,
    deviceReady: () => true,
    deviceDetect: detectStub,
  });
  ok(out.status === "ok" && out.tier === "device-grounding", "A failing + B ready -> B still serves the ask");
}
{
  const out = await segmentPhrase("the apple", {
    cloud: null,
    captureFrame: captureOk,
    deviceReady: () => false,
    deviceDetect: detectStub,
  });
  ok(out.status === "unavailable", "neither tier -> honest unavailable");
  const st = getSegmentationStatus({ cloud: null, deviceReady: () => false });
  ok(st.anyAvailable === false && st.cloudConfigured === false, "status read agrees (the chrome seam)");
}
{
  const out = await segmentPhrase("the apple", {
    cloud: { apiKey: "K", endpoint: "https://api.meta.ai/v1" },
    captureFrame: () => null,
    fetchFn: stubFetchOk,
    deviceReady: () => false,
  });
  ok(
    out.status === "error" && /Camera isn't ready/.test(out.message),
    "camera down -> product-language error outcome, no throw"
  );
}
{
  const out = await segmentPhrase("the nothing", {
    cloud: null,
    captureFrame: captureOk,
    deviceReady: () => true,
    deviceDetect: async () => [],
  });
  ok(
    out.status === "ok" && out.regions.length === 0,
    "B looked and found nothing -> ok with zero regions (the not-found path)"
  );
}

/* ================= 4. Tier B with mocked transformers ================= */
console.log("== Tier B: consent + mocked transformers ==");
const {
  GROUNDING_MODEL_ID,
  TRANSFORMERS_CDN_URL,
  ensureGroundingInit,
  getGroundingSnapshot,
  noteGroundingWanted,
  answerGroundingConsent,
  isDeviceGroundingReady,
  detectOnDevice,
  setGroundingImporterForTests,
  __resetDeviceGroundingForTests,
} = grounding;

const pipelineCalls = [];
let mockDetect = async () => [];
setGroundingImporterForTests(async (url) => {
  ok(url === TRANSFORMERS_CDN_URL, "the importer is asked for the pinned transformers build", url);
  return {
    env: {},
    pipeline: async (task, modelId, opts) => {
      pipelineCalls.push({ task, modelId, device: opts?.device, dtype: opts?.dtype });
      opts?.progress_callback?.({ status: "progress", file: "onnx/model.onnx", loaded: 50, total: 100 });
      return (image, phrase, o) => mockDetect(image, phrase, o);
    },
  };
});
const waitReady = async () => {
  for (let i = 0; i < 60 && getGroundingSnapshot().state !== "ready"; i++) {
    await sleep(25);
  }
  return getGroundingSnapshot().state === "ready";
};

{
  __resetDeviceGroundingForTests();
  globalThis.__store.clear();
  pipelineCalls.length = 0;
  setNavigator({ gpu: { requestAdapter: async () => ({}) } });
  await ensureGroundingInit();
  let snap = getGroundingSnapshot();
  ok(snap.state === "idle" && snap.device === "webgpu", "WebGPU device probed -> the GPU path");
  ok(snap.sizeNote === "about 152 MB", "the consent size is the real q4f16 size", snap.sizeNote);
  noteGroundingWanted();
  await sleep(10);
  snap = getGroundingSnapshot();
  ok(snap.askVisible === true, "the first want raises the ONE consent ask");
  mockDetect = async () => [
    { score: 0.88, label: "the apple", box: { xmin: 10, ymin: 20, xmax: 110, ymax: 70 } },
    { score: 0.2, label: "the apple", box: { xmin: 0, ymin: 0, xmax: 5, ymax: 5 } },
  ];
  await answerGroundingConsent(true);
  ok(await waitReady(), "a Yes downloads and the eyes become ready");
  ok(isDeviceGroundingReady(), "readiness is a synchronous snapshot fact");
  const call = pipelineCalls[0];
  ok(
    call && call.task === "zero-shot-object-detection" &&
    call.modelId === GROUNDING_MODEL_ID && call.device === "webgpu" && call.dtype === "q4f16",
    "GroundingDINO-tiny loads via the zero-shot pipeline, WebGPU + q4f16",
    JSON.stringify(call)
  );
  ok(getGroundingSnapshot().progress > 0, "download progress is published");
  const boxes = await detectOnDevice("data:image/jpeg;base64,AAAA", "the apple");
  ok(
    Array.isArray(boxes) && boxes.length === 1 && boxes[0].score === 0.88,
    "the detector's boxes pass through (sub-threshold dropped)",
    JSON.stringify(boxes)
  );
  // The full chain: the REAL seam, defaults and all, over the
  // REAL store — the stub's box becomes a normalized region.
  const out = await segmentPhrase("the apple", {
    cloud: null,
    captureFrame: () => ({ dataUrl: "data:image/jpeg;base64,AAAA", width: 200, height: 100 }),
  });
  const r = out.status === "ok" ? out.regions[0] : null;
  ok(
    out.status === "ok" && out.tier === "device-grounding" && !!r &&
    near(r.box.x, 0.05) && near(r.box.y, 0.2) && near(r.box.w, 0.5) && near(r.box.h, 0.5),
    "mocked-transformers B tier: the act's region lands normalized",
    JSON.stringify(out)
  );
}
{
  __resetDeviceGroundingForTests();
  globalThis.__store.clear();
  setNavigator({}); // no WebGPU -> the WASM path
  await ensureGroundingInit();
  const snap = getGroundingSnapshot();
  ok(snap.device === "wasm" && snap.sizeNote === "about 205 MB",
    "no WebGPU -> WASM path with its own real size (q8)", snap.sizeNote);
  noteGroundingWanted();
  await sleep(10);
  ok(getGroundingSnapshot().askVisible === true, "the ask raises on the WASM path too");
  await answerGroundingConsent(false);
  noteGroundingWanted();
  await sleep(10);
  const after = getGroundingSnapshot();
  ok(
    after.askVisible === false && after.consent === "declined" && !isDeviceGroundingReady(),
    "a No is forever: the ask never rises again"
  );
  ok(pipelineCalls.every((c) => c.device !== "wasm"), "declined means no download was ever started");
}

/* ================= 5. ghost-performed acts ================= */
console.log("== ghost-performed See acts (Slice 23 machinery) ==");
const fabricCtx = (draw) => ({
  layer_id: "sam-see",
  canvas: "camera",
  role: "solo",
  in_session: false,
  rules: { draw, verbs: true, notes: true },
});
const mkPeer = (ctx) => {
  const seen = { injects: [], recipes: [], perfs: [] };
  const peer = new GhostPeer({
    peerId: "ghost:see-acts-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: (i) => seen.injects.push(i),
    broadcast: (i) => seen.injects.push(i),
    ghostName: "Boop",
    getFabricContext: () => ctx,
    onDrawRecipe: (r) => seen.recipes.push(r),
    onPerformance: (l) => seen.perfs.push(l),
  });
  return { peer, seen };
};
{
  const { peer, seen } = mkPeer(fabricCtx(false));
  ok(peer.answerTouchAt(0.3, 0.4, 0.2, "the apple") === "refused",
    "refusing fabric: the asked touch is refused at the draw gate");
  ok(peer.answerDrawAround(0.5, 0.5, 0.22, "the chair") === "refused",
    "refusing fabric: the asked ring is refused at the draw gate");
  await sleep(200);
  ok(seen.injects.length === 0 && seen.recipes.length === 0,
    "refusal means ZERO emits and ZERO recipes");
  peer.destroy();
}
{
  const { peer, seen } = mkPeer(fabricCtx(true));
  ok(peer.answerTouchAt(0.3, 0.4, 0.2, "the apple") === "performed",
    "allowing fabric: the ghost performs the touch itself");
  await sleep(200);
  const splat = seen.injects.find(
    (i) => near(i.position.x, 0.3, 1e-9) && near(i.position.y, 0.4, 1e-9)
  );
  ok(!!splat, "the touch emits at the region center through emit()", JSON.stringify(seen.injects));
  ok(
    !!splat && splat.color && typeof splat.color.r === "number",
    "the touch carries the ghost's signature color"
  );
  ok(
    peer.answerDrawAround(0.5, 0.5, 0.22, "the chair") === "performed",
    "allowing fabric: the ghost performs the ring itself"
  );
  ok(seen.recipes.length === 1, "ONE recipe reaches the draw sink");
  const recipe = seen.recipes[0];
  ok(
    !!recipe && validateRecipe(recipe, "builtin") !== null &&
    recipe.steps[0].shape === "ring" && near(recipe.steps[0].cx, 0.5) &&
    near(recipe.steps[0].cy, 0.5) && near(recipe.steps[0].scale, 0.22) &&
    recipe.steps[0].hue === 210,
    "the ring is the fitted step, in the ghost's hue, and validates"
  );
  ok(
    peer.answerDrawAround(0.5, 0.5, 0.22, "the chair") === "unavailable",
    "Slice 23's cooldown binds asked rings too"
  );
  ok(seen.recipes.length === 1, "the cooldown means still ONE recipe");
  peer.destroy();
}
{
  // The performDraw refactor regression: deliberated draws are
  // byte-for-byte the Slice 23 behavior.
  const decision = {
    mood_shift: null, intent: "draw", pattern_id: null,
    draw_shape: "spiral", intensity: 0.6, linger_s: 6,
  };
  const a = mkPeer(fabricCtx(true));
  a.peer.applyBrainDecision(decision, "table");
  ok(
    a.seen.recipes.length === 1 && a.seen.recipes[0].steps[0].shape === "spiral",
    "deliberated draw still ships one spiral recipe"
  );
  a.peer.destroy();
  const b = mkPeer(fabricCtx(false));
  b.peer.applyBrainDecision(decision, "table");
  ok(b.seen.recipes.length === 0, "deliberated draw still dies at the same gate");
  b.peer.destroy();
}

/* ================= 6. structural wiring ================= */
console.log("== structural wiring ==");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
ok(
  src("src/components/fluid/LegacyFluid.tsx").includes("parseSeeAct(") &&
  src("src/components/fluid/LegacyFluid.tsx").includes("performSeeAct") &&
  src("src/components/fluid/LegacyFluid.tsx").includes("answerTouchAt(") &&
  src("src/components/fluid/LegacyFluid.tsx").includes("answerDrawAround("),
  "LegacyFluid routes act asks and performs them (user + ghost paths)"
);
ok(
  src("src/components/fluid/LegacyFluid.tsx").includes("FABRIC_SEE_HIGHLIGHT_EVENT") &&
  src("src/components/sam/SamLayer.tsx").includes("FABRIC_SEE_HIGHLIGHT_EVENT") &&
  src("src/components/sam/SamLayer.tsx").includes("segmentPhrase("),
  "SamLayer outlines act regions and segments through the same seam"
);
ok(
  src("app/_layout.tsx").includes("GroundingChrome") &&
  src("app/components/fabric/IdCards.tsx").includes("never sent, never stored"),
  "the eyes' chrome is mounted and the ID card carries the local-analysis line"
);
ok(
  src("src/sam/segmentation.ts").includes("getSegmentationStatus"),
  "the availability read exists for the See chrome seam"
);

console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : "FAILURES PRESENT"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
