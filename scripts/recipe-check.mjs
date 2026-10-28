/**
 * recipe-check — node unit check for Slice 15's RecipeCore.
 *
 * Proves, headlessly:
 * - the three demo built-ins (heart / spiral / ring-burst) validate
 *   and are reachable through the offline intent matcher;
 * - malformed recipes are rejected whole (unknown shape, scale out
 *   of range, too many steps, total duration over the cap);
 * - path sampling stays inside the per-step splat bound and inside
 *   the canvas for every shape in the library;
 * - the SAME recipe + seed samples identically twice (the seed is
 *   the cross-device rendering contract);
 * - intent detection routes drawing prompts and leaves pattern
 *   prompts ("heartbeat", "gentle rain") alone.
 *
 * Run: esbuild src/ai/RecipeCore.ts --bundle --format=esm \
 *        --outfile=/tmp/RecipeCore.mjs
 *      node scripts/recipe-check.mjs /tmp/RecipeCore.mjs
 */
const core = await import(process.argv[2] ?? "/tmp/RecipeCore.mjs");
const {
  validateRecipe,
  matchBuiltinRecipe,
  builtinRecipeForShape,
  detectShapeIntent,
  sampleStepPath,
  pointsForStep,
  MAX_POINTS_PER_STEP,
  RECIPE_SHAPES,
} = core;

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

console.log("== built-ins validate + match ==");
for (const [prompt, expectName] of [
  ["draw a heart", "Heart"],
  ["make a spiral", "Spiral"],
  ["a ring that bursts", "Ring Burst"],
]) {
  const r = matchBuiltinRecipe(prompt);
  check(
    `matchBuiltinRecipe(${JSON.stringify(prompt)})`,
    !!r && r.name === expectName && r.source === "builtin",
    r ? `${r.name}, ${r.steps.length} step(s), ${r.durationMs}ms` : "null"
  );
}
for (const shape of RECIPE_SHAPES) {
  const r = builtinRecipeForShape(shape);
  check(`builtinRecipeForShape(${shape})`, !!r, r ? r.name : "null");
}

console.log("\n== malformed recipes are rejected whole ==");
const goodStep = {
  shape: "ring",
  cx: 0.5,
  cy: 0.5,
  scale: 0.3,
  durationMs: 1500,
  style: "draw",
};
const malformed = [
  ["unknown shape 'star'", { version: 1, seed: 1, steps: [{ ...goodStep, shape: "star" }] }],
  ["scale 2.0 (cap 0.5)", { version: 1, seed: 1, steps: [{ ...goodStep, scale: 2 }] }],
  [
    "25 steps (cap 24)",
    { version: 1, seed: 1, steps: Array.from({ length: 25 }, () => ({ ...goodStep })) },
  ],
  [
    "total 30s (cap 24s)",
    {
      version: 1,
      seed: 1,
      steps: Array.from({ length: 6 }, () => ({ ...goodStep, durationMs: 5000 })),
    },
  ],
  ["zero steps", { version: 1, seed: 1, steps: [] }],
  ["version 99", { version: 99, seed: 1, steps: [{ ...goodStep }] }],
  ["cx off-canvas (1.4)", { version: 1, seed: 1, steps: [{ ...goodStep, cx: 1.4 }] }],
  ["style 'explode'", { version: 1, seed: 1, steps: [{ ...goodStep, style: "explode" }] }],
];
for (const [label, raw] of malformed) {
  check(`rejects ${label}`, validateRecipe(raw, "llm") === null);
}
check(
  "accepts the well-formed control",
  validateRecipe({ version: 1, name: "Ok", seed: 7, steps: [goodStep] }, "llm") !== null
);

console.log("\n== sampling: bounded, on-canvas, deterministic ==");
for (const shape of RECIPE_SHAPES) {
  const step = { shape, cx: 0.5, cy: 0.5, scale: 0.34, durationMs: 2600, style: "draw" };
  const pts = sampleStepPath(step, 4242, 0);
  const inCanvas = pts.every(
    (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
  );
  check(
    `${shape}: ${pts.length} pts (bound ${pointsForStep(step)} ≤ ${MAX_POINTS_PER_STEP})`,
    pts.length <= MAX_POINTS_PER_STEP && inCanvas
  );
  const again = sampleStepPath(step, 4242, 0);
  check(
    `${shape}: same seed → same points`,
    JSON.stringify(pts) === JSON.stringify(again)
  );
  const otherSeed = sampleStepPath(step, 99, 0);
  if (shape === "line" || shape === "arc") {
    check(
      `${shape}: different seed → different geometry`,
      JSON.stringify(pts) !== JSON.stringify(otherSeed)
    );
  }
}

console.log("\n== intent routing ==");
for (const [prompt, expect] of [
  ["draw a heart", "heart"],
  ["a ring that bursts", "ring"],
  ["make a spiral", "spiral"],
  ["sketch a rainbow", "arc"],
  ["heartbeat", null],
  ["gentle rain on a tin roof", null],
  ["heart", null],
  ["ocean waves at dusk", null],
]) {
  const got = detectShapeIntent(prompt);
  check(
    `detectShapeIntent(${JSON.stringify(prompt)}) → ${expect}`,
    got === expect,
    `got ${got}`
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
