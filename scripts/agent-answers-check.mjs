/**
 * agent-answers-check — headless proof for Slice 17 "The Agent Answers".
 *
 * Proves:
 * - the built-in generative interpreter answers a battery of prompts
 *   with valid, parameterized performance specs (heartbeat yields a
 *   lub-dub pulse at a sane, mood-derived BPM — never the old macro);
 * - the pulse validator clamps numeric ranges and rejects bad shapes;
 * - the RecipePlayer actually schedules pulse strikes;
 * - ghost routing: addressed heartbeat requests belong to the ghost,
 *   unaddressed ones don't; the ghost's tempo rises after petting and
 *   its answer emits through the budgeted machinery;
 * - the model path (mocked OpenAI-compatible endpoint on localhost):
 *   a valid invented spec plays, an invalid first reply is repaired,
 *   and persistent garbage degrades to null instead of playing.
 *
 * Build + run:
 *   esbuild src/ai/RecipeCore.ts --bundle --format=esm --outfile=/tmp/RecipeCore17.mjs
 *   esbuild src/ai/RecipePlayer.ts --bundle --format=esm --outfile=/tmp/RecipePlayer17.mjs
 *   esbuild src/ai/RecipeComposer.ts --bundle --format=esm \
 *     --alias:@react-native-async-storage/async-storage=/tmp/async-storage-stub.mjs \
 *     --outfile=/tmp/RecipeComposer17.mjs
 *   esbuild src/ghost/GhostPeer.ts --bundle --format=esm --outfile=/tmp/GhostPeer17.mjs
 *   node scripts/agent-answers-check.mjs /tmp/RecipeCore17.mjs \
 *     /tmp/RecipePlayer17.mjs /tmp/RecipeComposer17.mjs /tmp/GhostPeer17.mjs
 *
 * The AsyncStorage stub reads the AI config from
 * globalThis.__fabricAIConfig (set below, before any compose call).
 */
import { createServer } from "node:http";

const core = await import(process.argv[2] ?? "/tmp/RecipeCore17.mjs");
const playerMod = await import(process.argv[3] ?? "/tmp/RecipePlayer17.mjs");
const composer = await import(process.argv[4] ?? "/tmp/RecipeComposer17.mjs");
const peerMod = await import(process.argv[5] ?? "/tmp/GhostPeer17.mjs");

const {
  validateRecipe,
  matchBuiltinPerformance,
  detectPerformanceIntent,
} = core;
const { RecipePlayer } = playerMod;
const { composeWithShapes } = composer;
const { GhostPeer, isGhostHeartbeatRequest } = peerMod;

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = (r) =>
  r
    ? `${r.name} | steps=${r.steps.length} | pulse=${
        r.pulse
          ? `${r.pulse.bpm}bpm grp=${JSON.stringify(r.pulse.grouping)} cycles=${r.pulse.cycles} curve=${r.pulse.intensityCurve}`
          : "none"
      } | ${r.durationMs}ms`
    : "null";

/* ---------------- built-in interpreter battery ---------------- */
console.log("== built-in performances ==");
const battery = [
  ["lemme see your heartbeat", "heartbeat", (r) => r.pulse?.bpm === 76 && JSON.stringify(r.pulse?.grouping) === "[2,1]" && r.pulse?.intensityCurve === "lub-dub"],
  ["show me a calm heartbeat", "heartbeat", (r) => r.pulse?.bpm === 55],
  ["an excited, racing heartbeat", "heartbeat", (r) => r.pulse?.bpm === 110],
  ["make it rain", "rain", (r) => r.steps.length >= 5 && (r.pulse?.intensity ?? 1) <= 0.5],
  ["gentle rain on a tin roof", "rain", (r) => r.steps.length >= 5],
  ["calm breathing", "breathing", (r) => r.pulse?.bpm === 30 && r.pulse?.intensityCurve === "sine"],
  ["wild sparkles", "sparkle", (r) => r.pulse?.bpm === 142 && (r.pulse?.intensity ?? 0) >= 0.9],
  ["show me a galaxy", "galaxy", (r) => r.steps[0]?.shape === "spiral" && r.pulse?.intensityCurve === "swell"],
  ["ocean waves at dusk", "waves", (r) => r.steps.length === 5],
  ["a slow tide coming in", "tide", (r) => r.pulse?.intensityCurve === "sine"],
  ["horses galloping", "gallop", (r) => (r.pulse?.bpm ?? 0) >= 120],
];
for (const [prompt, kind, extra] of battery) {
  const r = matchBuiltinPerformance(prompt);
  check(
    `${JSON.stringify(prompt)} → ${kind}`,
    !!r && detectPerformanceIntent(prompt) === kind && extra(r),
    summary(r)
  );
}
check(
  "gibberish yields no built-in performance",
  matchBuiltinPerformance("flibberty gibbet snizzle") === null &&
    detectPerformanceIntent("flibberty gibbet snizzle") === null
);

/* ---------------- pulse validator fuzz ---------------- */
console.log("\n== pulse validator ==");
const step = {
  shape: "ring", cx: 0.5, cy: 0.5, scale: 0.3, durationMs: 1200, style: "draw",
};
const withPulse = (pulse) =>
  validateRecipe({ version: 2, name: "Fuzz", seed: 5, steps: [step], pulse }, "llm");
check(
  "bpm 999 clamps to 180",
  withPulse({ bpm: 999, grouping: [1], cycles: 2, intensity: 0.8, intensityCurve: "steady" })?.pulse?.bpm === 180
);
check(
  "bpm 3 clamps to 30",
  withPulse({ bpm: 3, grouping: [1], cycles: 2, intensity: 0.8, intensityCurve: "steady" })?.pulse?.bpm === 30
);
check(
  "cycles 999 clamps into the duration cap",
  (() => {
    const r = withPulse({ bpm: 30, grouping: [1], cycles: 999, intensity: 0.8, intensityCurve: "steady" });
    return !!r && r.pulse.cycles <= 16 && r.durationMs <= 24_000;
  })()
);
check(
  "grouping counts clamp to 4 per cluster",
  JSON.stringify(
    withPulse({ bpm: 90, grouping: [99], cycles: 2, intensity: 0.8, intensityCurve: "steady" })?.pulse?.grouping
  ) === "[4]"
);
check(
  "non-numeric bpm rejected",
  withPulse({ bpm: "fast", grouping: [1], cycles: 2, intensity: 0.8, intensityCurve: "steady" }) === null
);
check(
  "unknown intensity curve rejected",
  withPulse({ bpm: 90, grouping: [1], cycles: 2, intensity: 0.8, intensityCurve: "explode" }) === null
);
check(
  "over-full grouping rejected (>12 strikes)",
  withPulse({ bpm: 90, grouping: [4, 4, 4, 4], cycles: 1, intensity: 0.8, intensityCurve: "steady" }) === null
);
check(
  "v1 recipe (no pulse) still validates as v1",
  validateRecipe({ version: 1, name: "Old", seed: 1, steps: [step] }, "llm")?.version === 1
);

/* ---------------- player schedules pulse strikes ---------------- */
console.log("\n== recipe player pulse execution ==");
{
  const recipe = validateRecipe(
    {
      version: 2, name: "PulseProbe", seed: 9,
      steps: [{ ...step, durationMs: 400 }],
      pulse: { bpm: 180, grouping: [2, 1], cycles: 1, intensity: 0.9, intensityCurve: "lub-dub" },
    },
    "builtin"
  );
  const splats = [];
  const player = new RecipePlayer();
  let finished = false;
  player.setStateListener((name) => { if (name === null) finished = true; });
  player.play(recipe, (s) => splats.push(s), { defaultHue: 200 });
  await sleep(1600);
  // 10 step splats (minimum per step) + 3 pulse strikes.
  check("pulse strikes were dispatched", splats.length >= 13, `${splats.length} splats`);
  check("playback state cleared after the pulse ended", finished);
  player.stop();
}

/* ---------------- ghost routing + live tempo ---------------- */
console.log("\n== ghost answers ==");
check(
  "'lemme see your heart beat' routes to the ghost",
  isGhostHeartbeatRequest("lemme see your heart beat", "Boop") === true
);
check(
  "name-addressed heartbeat routes to the ghost",
  isGhostHeartbeatRequest("Boop, show me your heartbeat", "Boop") === true
);
check(
  "'your heartbeat' routes to the ghost",
  isGhostHeartbeatRequest("show me your heartbeat", "Boop") === true
);
check(
  "unaddressed heartbeat stays with the interpreter",
  isGhostHeartbeatRequest("make a heartbeat pattern", "Boop") === false
);
{
  const mk = (seen) =>
    new GhostPeer({
      peerId: "ghost:answers-check",
      identity: { hue: 200, seed: 42 },
      injectLocal: (i) => seen.push(i),
      broadcast: (i) => seen.push(i),
      ghostName: "Boop",
    });
  const calmSeen = [];
  const calm = mk(calmSeen);
  const bpmCalm = calm.heartbeatBpm();
  const answered = calm.answerHeartbeat();
  await sleep(350);
  check(
    "ghost answers with a sane bpm",
    answered !== null && answered >= 42 && answered <= 132,
    `${answered}bpm`
  );
  check(
    "the answer emits splats through the machinery",
    calmSeen.length >= 1,
    `${calmSeen.length} emits in 350ms`
  );
  calm.destroy();

  const petSeen = [];
  const petted = mk(petSeen);
  const before = petted.heartbeatBpm();
  const now = Date.now();
  for (let k = 0; k < 3; k++) {
    petted.noteInteraction(
      {
        userId: "human-1",
        timestamp: now + k,
        position: { x: 0.5, y: 0.42 },
        force: { x: 0, y: 0 },
        pressure: 0.5,
        color: { r: 0.9, g: 0.9, b: 0.9 },
      },
      "local"
    );
  }
  const after = petted.heartbeatBpm();
  check(
    "petting raises the ghost's tempo",
    after > before,
    `${before}bpm → ${after}bpm`
  );
  check("baseline tempo matches the unpetted peer", before === bpmCalm, `${before} vs ${bpmCalm}`);
  petted.destroy();
}

/* ---------------- mocked model path ---------------- */
console.log("\n== model path (mocked endpoint) ==");
const calls = [];
const validGalaxy = JSON.stringify({
  kind: "recipe",
  recipe: {
    version: 2, name: "Mock Galaxy", seed: 123,
    steps: [{ shape: "spiral", cx: 0.5, cy: 0.5, scale: 0.36, hue: 265, durationMs: 4000, style: "draw" }],
    pulse: { bpm: 44, grouping: [1], cycles: 4, intensity: 0.7, intensityCurve: "swell" },
  },
});
const validHeartbeat = JSON.stringify({
  kind: "recipe",
  recipe: {
    version: 2, name: "Mock Heartbeat", seed: 77,
    steps: [{ shape: "heart", cx: 0.5, cy: 0.48, scale: 0.3, hue: 345, durationMs: 2200, style: "pulse" }],
    pulse: { bpm: 88, grouping: [2, 1], cycles: 5, intensity: 0.9, intensityCurve: "lub-dub" },
  },
});
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    calls.push(body);
    let text = "not json at all";
    if (body.includes("mock valid")) text = validGalaxy;
    else if (body.includes("mock repair")) {
      text = body.includes("Your previous reply was not a valid performance")
        ? validHeartbeat
        : "garbage first reply";
    } else if (body.includes("mock pattern")) {
      text = JSON.stringify({
        kind: "pattern",
        pattern: {
          name: "Mock Pattern",
          steps: [{ atMs: 0, kind: "splat", x: 0.5, y: 0.5, radius: 0.4, hue: 200, intensity: 0.8 }],
        },
      });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      model: "mock",
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
globalThis.__fabricAIConfig = {
  llm: {
    provider: "custom",
    apiKey: "test-key",
    endpoint: `http://127.0.0.1:${port}/v1`,
    model: "mock-model",
    enabled: true,
  },
};
try {
  const galaxy = await composeWithShapes("mock valid galaxy, please");
  check(
    "valid invented spec plays",
    galaxy?.kind === "recipe" && galaxy.recipe.source === "llm" && galaxy.recipe.pulse?.bpm === 44,
    galaxy?.kind === "recipe" ? summary(galaxy.recipe) : JSON.stringify(galaxy)
  );
  const repaired = await composeWithShapes("mock repair heartbeat");
  check(
    "invalid first reply is repaired and plays",
    repaired?.kind === "recipe" && repaired.recipe.pulse?.bpm === 88,
    repaired?.kind === "recipe" ? summary(repaired.recipe) : JSON.stringify(repaired)
  );
  check(
    "the repair retry actually happened",
    calls.filter((c) => c.includes("Your previous reply was not a valid performance")).length >= 1,
    `${calls.length} total calls`
  );
  const pat = await composeWithShapes("mock pattern please");
  check(
    "model may answer with a pattern instead",
    pat?.kind === "pattern" && pat.pattern.source === "llm"
  );
  const garbage = await composeWithShapes("mock invalid zqxj wobble");
  check(
    "persistent garbage degrades to null — nothing plays",
    garbage === null
  );
} finally {
  server.close();
}

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
