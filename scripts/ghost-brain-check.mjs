/**
 * ghost-brain-check — node unit check for the Ghost Brain build.
 *
 * Proves, headlessly:
 * - the on-device decision table's intent agreement against all 60
 *   curated dataset pairs (fabric-ghost-factory/dataset-v1.jsonl):
 *   the honest number is printed, whatever it is;
 * - the decision validator accepts the dataset's own decisions,
 *   rejects unknown intents/patterns/temperaments, coerces a pattern
 *   on a non-play intent to null, and clamps intensity/linger;
 * - the Spark path (mocked chat): a valid reply applies, a fenced
 *   reply applies, prose / bad-intent replies are ignored, a throwing
 *   chat is ignored, and a slow reply past the timeout is ignored;
 * - GhostPeer invariants under brain decisions: a deliberated heart
 *   in SESSION mode never becomes a room-wide verb (petting-only
 *   rule), a deliberated heart SOLO uses the verb path, and a burst
 *   of play decisions can never exceed the 16/10s emit budget.
 *
 * Run: esbuild src/ghost/GhostBrain.ts --bundle --format=esm \
 *        --outfile=/tmp/GhostBrain.mjs
 *      esbuild src/ghost/GhostPeer.ts --bundle --format=esm \
 *        --outfile=/tmp/GhostPeer.mjs
 *      node scripts/ghost-brain-check.mjs /tmp/GhostBrain.mjs \
 *        <path-to-dataset-v1.jsonl> /tmp/GhostPeer.mjs
 */
import { readFileSync } from "node:fs";

const brain = await import(process.argv[2] ?? "/tmp/GhostBrain.mjs");
const {
  decideOnDevice,
  validateGhostDecision,
  consultSparkBrain,
  GHOST_DECISION_TABLE,
} = brain;

const datasetPath = process.argv[3];
const peerPath = process.argv[4];

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- dataset agreement ---------------- */
console.log("== on-device table vs dataset (60 pairs) ==");
if (!datasetPath) {
  console.log("SKIP  no dataset path given (argv[3])");
} else {
  const lines = readFileSync(datasetPath, "utf8").trim().split("\n");
  let agree = 0;
  let patternAgree = 0;
  let patternTotal = 0;
  const misses = [];
  for (const line of lines) {
    const { scenario, decision } = JSON.parse(line);
    const { decision: mine, ruleId } = decideOnDevice(scenario);
    if (mine.intent === decision.intent) {
      agree += 1;
    } else {
      misses.push(
        `${scenario.temperament} pets=${scenario.pets_in_last_5s} splat=${scenario.nearby_splat_intensity} ghosts=${scenario.other_ghosts.length} -> table:${mine.intent} (${ruleId}) vs dataset:${decision.intent}`
      );
    }
    if (decision.pattern_id) {
      patternTotal += 1;
      if (mine.pattern_id === decision.pattern_id) patternAgree += 1;
    }
  }
  const pct = ((agree / lines.length) * 100).toFixed(1);
  console.log(`  table rules: ${GHOST_DECISION_TABLE.length}`);
  console.log(`  INTENT AGREEMENT: ${agree}/${lines.length} = ${pct}%`);
  console.log(
    `  pattern_id agreement (where dataset names one): ${patternAgree}/${patternTotal}`
  );
  for (const m of misses) console.log(`  miss: ${m}`);
  check("agreement computed over all pairs", lines.length === 60, `${lines.length} pairs`);
}

/* ---------------- validator ---------------- */
console.log("== validator ==");
const good = {
  mood_shift: "playful",
  intent: "play",
  pattern_id: "chase_loop",
  intensity: 0.7,
  linger_s: 8,
};
check("valid decision passes", validateGhostDecision(good)?.intent === "play");
check(
  "pattern on non-play coerced to null",
  validateGhostDecision({ ...good, intent: "drift" })?.pattern_id === null
);
check(
  "unknown intent rejected",
  validateGhostDecision({ ...good, intent: "dance" }) === null
);
check(
  "unknown pattern rejected",
  validateGhostDecision({ ...good, pattern_id: "spiral_of_doom" }) === null
);
check(
  "unknown mood_shift rejected",
  validateGhostDecision({ ...good, mood_shift: "angry" }) === null
);
check(
  "intensity clamped",
  validateGhostDecision({ ...good, intensity: 5 })?.intensity === 0.9
);
check(
  "linger clamped",
  validateGhostDecision({ ...good, linger_s: 999 })?.linger_s === 30
);
check("non-object rejected", validateGhostDecision("heart") === null);
check(
  "dataset-shaped minimal decision passes",
  validateGhostDecision({ mood_shift: null, intent: "nap", pattern_id: null, intensity: 0.15, linger_s: 24 })?.intent === "nap"
);

/* ---------------- Spark path (mocked chat) ---------------- */
console.log("== spark path (mocked chat) ==");
const scenario = {
  temperament: "curious",
  seconds_since_human_touch: 24,
  recent_events: ["quiet hum", "ghost drifted closer"],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.22,
  verbs_seen: [],
  other_ghosts: [{ name: "Pip", mood: "curious", last_action: "drift" }],
  room_energy_trend: "steady",
  ghost_identity: { name: "Mochi", hue: 210, seed_traits: ["watchful", "bright eyed"] },
};
const validReply = JSON.stringify({
  mood_shift: null,
  intent: "sniff",
  pattern_id: null,
  intensity: 0.55,
  linger_s: 6,
});
const applied = await consultSparkBrain(scenario, async () => validReply, 500);
check("valid reply applies", applied?.intent === "sniff");
const fenced = await consultSparkBrain(
  scenario,
  async () => "```json\n" + validReply + "\n```",
  500
);
check("fenced reply applies", fenced?.intent === "sniff");
const prose = await consultSparkBrain(
  scenario,
  async () => "The ghost should probably sniff around a bit!",
  500
);
check("prose reply ignored", prose === null);
const badIntent = await consultSparkBrain(
  scenario,
  async () => JSON.stringify({ intent: "dance", intensity: 0.5, linger_s: 3 }),
  500
);
check("bad-intent reply ignored", badIntent === null);
const throwing = await consultSparkBrain(
  scenario,
  async () => {
    throw new Error("network down");
  },
  500
);
check("throwing chat ignored", throwing === null);
const slow = await consultSparkBrain(
  scenario,
  async () => {
    await sleep(300);
    return validReply;
  },
  50
);
check("timeout reply ignored", slow === null);
await sleep(350); // let the late reply land; nothing may come of it

/* ---------------- GhostPeer invariants ---------------- */
console.log("== GhostPeer invariants under brain decisions ==");
if (!peerPath) {
  console.log("SKIP  no GhostPeer bundle given (argv[4])");
} else {
  const { GhostPeer } = await import(peerPath);
  const heart = {
    mood_shift: null,
    intent: "heart",
    pattern_id: null,
    intensity: 0.8,
    linger_s: 6,
  };

  // Solo: a deliberated heart uses the real verb path.
  const soloSeen = [];
  const solo = new GhostPeer({
    peerId: "ghost:check-solo",
    identity: { hue: 210, seed: 42 },
    injectLocal: (i) => soloSeen.push(i),
    broadcast: (i) => soloSeen.push(i),
  });
  solo.applyBrainDecision(heart, "table");
  await sleep(450);
  check(
    "solo deliberated heart emits the heart verb",
    soloSeen.some((i) => i.verb === "heart"),
    `${soloSeen.length} emits`
  );
  solo.destroy();

  // Session: a deliberated heart must NOT broadcast a verb — the
  // room-wide verbs stay petting-only; it degrades to a soft burst.
  const sessionSeen = [];
  const sess = new GhostPeer({
    peerId: "ghost:check-session",
    identity: { hue: 120, seed: 7 },
    injectLocal: (i) => sessionSeen.push(i),
    broadcast: (i) => sessionSeen.push(i),
  });
  sess.setHumansPresent(true);
  sess.summon();
  sess.applyBrainDecision(heart, "spark");
  await sleep(450);
  check(
    "session deliberated heart emits soft splats",
    sessionSeen.length > 0,
    `${sessionSeen.length} emits`
  );
  check(
    "session deliberated heart sends NO verb",
    sessionSeen.every((i) => !i.verb)
  );
  sess.destroy();

  // Budget: a burst of play decisions cannot exceed 16 emits / 10s.
  const burstSeen = [];
  const burst = new GhostPeer({
    peerId: "ghost:check-burst",
    identity: { hue: 300, seed: 99 },
    injectLocal: (i) => burstSeen.push(i),
    broadcast: (i) => burstSeen.push(i),
  });
  const play = {
    mood_shift: null,
    intent: "play",
    pattern_id: "solo_zigzag",
    intensity: 0.8,
    linger_s: 8,
  };
  for (let k = 0; k < 30; k++) burst.applyBrainDecision(play, "table");
  await sleep(1200);
  check(
    "30 play decisions stay within the 16/10s emit budget",
    burstSeen.length > 0 && burstSeen.length <= 16,
    `${burstSeen.length} emits`
  );
  burst.destroy();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
