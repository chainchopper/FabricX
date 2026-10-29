/**
 * ghost-tools-check — headless proof for Slice 23 "Ghostie Tools I".
 *
 * Proves:
 * - the dataset battery is UNMOVED: the on-device table still
 *   agrees 59/60 with dataset-v1.jsonl and never answers "draw"
 *   on a legacy (fabric-less) scenario;
 * - the fabric gate, in both tiers: the table selects draw only
 *   where the fabric allows the ghost's side to draw (solo /
 *   host / guest-with-draw-on draw; guest-with-draw-off does
 *   not), and a mocked Spark draw reply under a refusing fabric
 *   is rejected by the validator WITH the refusal surfaced;
 * - the draw rules' character: petting, loud splats, rising
 *   rooms, sleepy and pre-window quiet never draw; curious and
 *   affectionate draw their documented shapes;
 * - draw emission: a draw decision becomes ONE validated recipe
 *   in the ghost's hue through the draw sink, the cooldown
 *   spaces performances, the peer-side gate refuses even a
 *   direct applyBrainDecision under a refusing fabric, and the
 *   budget charge means draws + splats stay within 16/10s;
 * - say-it routing: addressed verb asks belong to the ghost,
 *   heartbeat asks keep their Slice 17 route, unaddressed asks
 *   stay with the generic interpreter;
 * - the registry is complete (every intent resolves to a tool,
 *   the shape list never drifts from RecipeCore) and the bias
 *   chain order holds (personality -> stamina -> tool gate).
 *
 * Build + run:
 *   esbuild src/ghost/GhostBrain.ts --bundle --format=esm --outfile=/tmp/GhostBrain23.mjs
 *   esbuild src/ghost/ghostTools.ts --bundle --format=esm --outfile=/tmp/GhostTools23.mjs
 *   esbuild src/ghost/GhostPeer.ts --bundle --format=esm --outfile=/tmp/GhostPeer23.mjs
 *   esbuild src/ai/RecipeCore.ts --bundle --format=esm --outfile=/tmp/RecipeCore23.mjs
 *   node scripts/ghost-tools-check.mjs /tmp/GhostBrain23.mjs /tmp/GhostTools23.mjs \
 *     /tmp/GhostPeer23.mjs /tmp/RecipeCore23.mjs <path-to-dataset-v1.jsonl>
 */
import { readFileSync } from "node:fs";

const brain = await import(process.argv[2] ?? "/tmp/GhostBrain23.mjs");
const tools = await import(process.argv[3] ?? "/tmp/GhostTools23.mjs");
const peerMod = await import(process.argv[4] ?? "/tmp/GhostPeer23.mjs");
const recipeCore = await import(process.argv[5] ?? "/tmp/RecipeCore23.mjs");
const datasetPath = process.argv[6];

const {
  decideOnDevice,
  validateGhostDecision,
  ghostDrawGateRefusal,
  consultSparkBrain,
  buildSparkMessages,
  fabricAllowsDraw,
  sanitizeFabricContext,
  applyPersonalityBias,
  applyStaminaBias,
  parseGhostPersonality,
  GHOST_INTENTS,
  GHOST_DRAW_SHAPES,
  GHOST_DRAW_REFUSAL_TEXT,
} = brain;
const { GHOST_TOOL_REGISTRY, ghostToolForIntent, ghostToolRefusal } = tools;
const { GhostPeer, ghostVerbAsk, isGhostHeartbeatRequest } = peerMod;
const { validateRecipe, RECIPE_SHAPES } = recipeCore;

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- scenario factory ---------------- */
const GHOST = { name: "Pip", mood: "curious", last_action: "drift" };
const scenario = (over = {}) => ({
  temperament: "playful",
  seconds_since_human_touch: 40,
  recent_events: ["quiet room"],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.1,
  verbs_seen: [],
  other_ghosts: [],
  room_energy_trend: "steady",
  ghost_identity: { name: "Boop", hue: 210, seed_traits: ["bouncy", "giggly"] },
  ...over,
});
/** Fabric context as the snapshot carries it: rules PRE-APPLIED for the chair. */
const fabric = (over = {}) => ({
  layer_id: "default-fluid",
  canvas: "fluid",
  role: "open",
  in_session: false,
  rules: { draw: true, verbs: true, notes: true },
  ...over,
});
const guestNoDraw = () =>
  fabric({
    role: "guest",
    in_session: true,
    rules: { draw: false, verbs: true, notes: true },
  });

/* ---------------- A. dataset battery unmoved ---------------- */
console.log("== dataset battery (legacy scenarios) ==");
if (!datasetPath) {
  console.log("SKIP  no dataset path given (argv[6])");
} else {
  const lines = readFileSync(datasetPath, "utf8").trim().split("\n");
  let agree = 0;
  let draws = 0;
  for (const line of lines) {
    const { scenario: s, decision } = JSON.parse(line);
    const { decision: mine } = decideOnDevice(s);
    if (mine.intent === decision.intent) agree += 1;
    if (mine.intent === "draw") draws += 1;
  }
  check("battery still 59/60", agree === 59, `${agree}/60`);
  check("no draw on any legacy scenario", draws === 0);
}

/* ---------------- B. fabric context + gate helpers ---------------- */
console.log("== fabric context sanitizer / gate ==");
check(
  "valid context survives sanitizing",
  sanitizeFabricContext(fabric({ role: "guest", in_session: true }))?.role === "guest"
);
check("null context rejected", sanitizeFabricContext(null) === null);
check(
  "non-string layer id rejected",
  sanitizeFabricContext({ layer_id: 7, rules: {} }) === null
);
check(
  "garbled rules default permissive",
  sanitizeFabricContext({ layer_id: "x", rules: { draw: "yes" } })?.rules.draw === true
);
check("no fabric context = draw allowed (legacy)", fabricAllowsDraw(scenario()) === true);
check(
  "guest draw-off refuses",
  fabricAllowsDraw(scenario({ fabric: guestNoDraw() })) === false
);

/* ---------------- C. table-tier gating matrix ---------------- */
console.log("== draw gating — on-device table ==");
const dSolo = decideOnDevice(scenario({ fabric: fabric() }));
check(
  "solo, playful, quiet 40s -> draws a spiral",
  dSolo.decision.intent === "draw" && dSolo.decision.draw_shape === "spiral",
  dSolo.ruleId
);
const dGuestOff = decideOnDevice(scenario({ fabric: guestNoDraw() }));
check(
  "guest, host draw OFF -> table does NOT draw",
  dGuestOff.decision.intent !== "draw",
  `${dGuestOff.decision.intent} (${dGuestOff.ruleId})`
);
const dGuestOn = decideOnDevice(
  scenario({ fabric: fabric({ role: "guest", in_session: true }) })
);
check("guest, host draw ON -> draws", dGuestOn.decision.intent === "draw");
const dHost = decideOnDevice(
  scenario({ fabric: fabric({ role: "host", in_session: true }) })
);
check(
  "host (own guest rules never bind the host) -> draws",
  dHost.decision.intent === "draw"
);
check(
  "petting pre-empts drawing",
  decideOnDevice(scenario({ fabric: fabric(), pets_in_last_5s: 2 })).decision.intent !== "draw"
);
check(
  "loud splat pre-empts drawing (startle)",
  decideOnDevice(scenario({ fabric: fabric(), nearby_splat_intensity: 0.9 })).decision.intent === "startle"
);
check(
  "rising room pre-empts drawing",
  decideOnDevice(scenario({ fabric: fabric(), room_energy_trend: "rising" })).decision.intent !== "draw"
);
check(
  "sleepy never draws (naps instead)",
  decideOnDevice(
    scenario({ fabric: fabric(), temperament: "sleepy", seconds_since_human_touch: 140 })
  ).decision.intent === "nap"
);
check(
  "pre-window quiet (20s) does not draw yet",
  decideOnDevice(scenario({ fabric: fabric(), seconds_since_human_touch: 20 })).decision.intent !== "draw"
);
const dCuriousSolo = decideOnDevice(
  scenario({ fabric: fabric(), temperament: "curious", seconds_since_human_touch: 50 })
);
check(
  "curious alone in the window -> ring",
  dCuriousSolo.decision.intent === "draw" && dCuriousSolo.decision.draw_shape === "ring"
);
const dCuriousCo = decideOnDevice(
  scenario({
    fabric: fabric(),
    temperament: "curious",
    seconds_since_human_touch: 50,
    other_ghosts: [GHOST],
  })
);
check(
  "curious with company -> arc",
  dCuriousCo.decision.intent === "draw" && dCuriousCo.decision.draw_shape === "arc"
);
const dAffection = decideOnDevice(
  scenario({
    fabric: fabric(),
    temperament: "affectionate",
    seconds_since_human_touch: 30,
    other_ghosts: [GHOST],
  })
);
check(
  "affectionate with company -> heart",
  dAffection.decision.intent === "draw" && dAffection.decision.draw_shape === "heart"
);

/* ---------------- D. Spark-tier gating (mocked chat) ---------------- */
console.log("== draw gating — Spark tier (mocked chat) ==");
const drawReply = JSON.stringify({
  mood_shift: null,
  intent: "draw",
  pattern_id: null,
  draw_shape: "spiral",
  intensity: 0.6,
  linger_s: 6,
});
const sparkAllowed = await consultSparkBrain(
  scenario({ fabric: fabric() }),
  async () => drawReply,
  500
);
check(
  "Spark draw under an allowing fabric applies",
  sparkAllowed?.intent === "draw" && sparkAllowed?.draw_shape === "spiral"
);
let refusalHeard = null;
const sparkRefused = await consultSparkBrain(
  scenario({ fabric: guestNoDraw() }),
  async () => drawReply,
  500,
  undefined,
  undefined,
  (text) => {
    refusalHeard = text;
  }
);
check("Spark draw under a refusing fabric is rejected", sparkRefused === null);
check(
  "the refusal is surfaced verbatim",
  refusalHeard === GHOST_DRAW_REFUSAL_TEXT,
  refusalHeard ?? "(none)"
);
let refusalHeard2 = null;
const sparkShapeless = await consultSparkBrain(
  scenario({ fabric: guestNoDraw() }),
  async () => JSON.stringify({ intent: "draw", intensity: 0.5, linger_s: 4 }),
  500,
  undefined,
  undefined,
  (text) => {
    refusalHeard2 = text;
  }
);
check(
  "shapeless draw is invalid, NOT a gate refusal",
  sparkShapeless === null && refusalHeard2 === null
);
const fabricNote = buildSparkMessages(scenario({ fabric: guestNoDraw() }))
  .map((m) => m.content)
  .join("\n");
check(
  "Spark consult carries the fabric note (with the law in it)",
  fabricNote.includes("default-fluid") && fabricNote.includes("drawing NOT allowed")
);

/* ---------------- E. validator, direct ---------------- */
console.log("== validator ==");
const drawRaw = {
  mood_shift: null,
  intent: "draw",
  pattern_id: null,
  draw_shape: "heart",
  intensity: 0.6,
  linger_s: 6,
};
check("bare draw validates", validateGhostDecision(drawRaw)?.draw_shape === "heart");
check(
  "draw under refusing scenario refused by the validator",
  validateGhostDecision(drawRaw, scenario({ fabric: guestNoDraw() })) === null
);
check(
  "draw_shape on a play decision coerced to null",
  validateGhostDecision({ ...drawRaw, intent: "play", pattern_id: "chase_loop" })?.draw_shape === null
);
check(
  "unknown shape rejected",
  validateGhostDecision({ ...drawRaw, draw_shape: "star" }) === null
);
check(
  "gate refusal namer agrees",
  ghostDrawGateRefusal(drawRaw, scenario({ fabric: guestNoDraw() })) === GHOST_DRAW_REFUSAL_TEXT &&
    ghostDrawGateRefusal(drawRaw, scenario({ fabric: fabric() })) === null
);

/* ---------------- F. registry completeness + gate ---------------- */
console.log("== tool registry ==");
check(
  "every deliberation intent resolves to a tool",
  GHOST_INTENTS.every((i) => ghostToolForIntent(i) !== null),
  GHOST_INTENTS.join(",")
);
const covered = GHOST_TOOL_REGISTRY.flatMap((t) => t.intents);
check(
  "registry covers each intent exactly once",
  covered.length === GHOST_INTENTS.length &&
    GHOST_INTENTS.every((i) => covered.filter((c) => c === i).length === 1)
);
check(
  "draw shapes never drift from the Recipe vocabulary",
  JSON.stringify([...GHOST_DRAW_SHAPES]) === JSON.stringify([...RECIPE_SHAPES])
);
check(
  "ask tools are registered with no deliberation intents",
  ["verb-perform", "heartbeat-answer"].every((id) => {
    const t = GHOST_TOOL_REGISTRY.find((x) => x.id === id);
    return t && t.intents.length === 0;
  })
);
check(
  "registry gate: draw refused / allowed / splat-play ungated",
  ghostToolRefusal("draw", scenario({ fabric: guestNoDraw() })) === GHOST_DRAW_REFUSAL_TEXT &&
    ghostToolRefusal("draw", scenario({ fabric: fabric() })) === null &&
    ghostToolRefusal("play", scenario({ fabric: guestNoDraw() })) === null
);

/* ---------------- G. bias chain order ---------------- */
console.log("== chain: personality -> stamina -> tool gate ==");
const chainScenario = scenario({ fabric: fabric() });
const rawDraw = decideOnDevice(chainScenario).decision;
const afterPersonality = applyPersonalityBias(
  rawDraw,
  chainScenario,
  parseGhostPersonality("bold and playful")
).decision;
check("personality leaves a draw a draw", afterPersonality.intent === "draw");
const afterStaminaFull = applyStaminaBias(afterPersonality, 90).decision;
check("healthy stamina leaves a draw a draw", afterStaminaFull.intent === "draw");
const lowStamina = applyStaminaBias(afterPersonality, 30);
check(
  "low stamina draws smaller (named)",
  lowStamina.decision.intent === "draw" &&
    lowStamina.decision.intensity < afterPersonality.intensity &&
    lowStamina.steeredBy.some((s) => s.includes("draws smaller"))
);
const drained = applyStaminaBias(afterPersonality, 10).decision;
check(
  "drained stamina rests instead of drawing",
  drained.intent === "nap" && drained.draw_shape === null
);
check(
  "the tool gate is the final word on a surviving draw",
  ghostToolRefusal(afterStaminaFull.intent, scenario({ fabric: guestNoDraw() })) ===
    GHOST_DRAW_REFUSAL_TEXT
);

/* ---------------- H. GhostPeer: draw + say-it performance ---------------- */
console.log("== GhostPeer draw performance ==");
const drawDecision = {
  mood_shift: null,
  intent: "draw",
  pattern_id: null,
  draw_shape: "spiral",
  intensity: 0.6,
  linger_s: 6,
};
const mkPeer = (fabricCtx) => {
  const seen = { injects: [], recipes: [], perfs: [] };
  const peer = new GhostPeer({
    peerId: "ghost:tools-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: (i) => seen.injects.push(i),
    broadcast: (i) => seen.injects.push(i),
    ghostName: "Boop",
    getFabricContext: () => fabricCtx,
    onDrawRecipe: (r) => seen.recipes.push(r),
    onPerformance: (l) => seen.perfs.push(l),
  });
  return { peer, seen };
};

const a = mkPeer(fabric());
a.peer.applyBrainDecision(drawDecision, "table");
check("a draw decision hands ONE recipe to the sink", a.seen.recipes.length === 1);
const theRecipe = a.seen.recipes[0];
check(
  "the recipe validates against RecipeCore",
  !!theRecipe && validateRecipe(theRecipe, "builtin") !== null
);
check(
  "the shape is drawn in the ghost's hue, at the ghost",
  theRecipe?.steps[0]?.shape === "spiral" && theRecipe?.steps[0]?.hue === 210
);
check(
  "the performance is reported",
  a.seen.perfs.some((l) => l.includes("drew a spiral"))
);
a.peer.applyBrainDecision(drawDecision, "table");
check("the cooldown spaces drawings", a.seen.recipes.length === 1);
a.peer.destroy();

const b = mkPeer(guestNoDraw());
b.peer.applyBrainDecision(drawDecision, "table");
check(
  "peer-side gate: even a direct decision cannot draw on a refusing fabric",
  b.seen.recipes.length === 0
);
b.peer.destroy();

const c = mkPeer(fabric());
c.peer.applyBrainDecision(drawDecision, "table");
const play = {
  mood_shift: null,
  intent: "play",
  pattern_id: "solo_zigzag",
  draw_shape: null,
  intensity: 0.8,
  linger_s: 8,
};
for (let k = 0; k < 30; k++) c.peer.applyBrainDecision(play, "table");
await sleep(1400);
check(
  "draw (6 charged) + play splats stay within the 16/10s budget",
  c.seen.injects.length > 0 && c.seen.injects.length <= 10,
  `${c.seen.injects.length} splat emits after the charged draw`
);
c.peer.destroy();

console.log("== GhostPeer say-it performance ==");
const d = mkPeer(fabric());
check("answerVerb returns the verb", d.peer.answerVerb("tickle") === "tickle");
await sleep(450);
check(
  "the ghost itself emits the tickle verb",
  d.seen.injects.some((i) => i.verb === "tickle")
);
check(
  "the answer is reported as a performance",
  d.seen.perfs.some((l) => l.includes("tickle"))
);
d.peer.destroy();

/* ---------------- I. say-it routing table ---------------- */
console.log("== say-it routing ==");
const route = (p) => ghostVerbAsk(p, "Boop");
check("'tickle Boop' -> tickle", route("tickle Boop") === "tickle");
check("'Boop, tickle me' -> tickle", route("Boop, tickle me") === "tickle");
check("'ghostie, cheer for us' -> cheer", route("ghostie, cheer for us") === "cheer");
check("'ghost, give me a heart' -> heart", route("ghost, give me a heart") === "heart");
check("'cheer up, ghost' -> cheer", route("cheer up, ghost") === "cheer");
check(
  "first verb mentioned wins",
  route("heart or tickle, Boop?") === "heart"
);
check(
  "'show me your heartbeat' stays the heartbeat route",
  route("show me your heartbeat") === null &&
    isGhostHeartbeatRequest("show me your heartbeat", "Boop") === true
);
check(
  "'lemme see your heart beat' stays the heartbeat route",
  route("lemme see your heart beat") === null &&
    isGhostHeartbeatRequest("lemme see your heart beat", "Boop") === true
);
check("'make a heart' (unaddressed) stays generic", route("make a heart") === null);
check("'tickle' (unaddressed) stays generic", route("tickle") === null);
check("'Boop, do something' (no verb) -> null", route("Boop, do something") === null);
check("gibberish -> null", route("zqx jibber jabber") === null);

/* ---------------- J. structural wiring ---------------- */
console.log("== structural wiring ==");
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
check(
  "LegacyFluid routes say-it + fabric context + draw sink",
  src("src/components/fluid/LegacyFluid.tsx").includes("ghostVerbAsk(") &&
    src("src/components/fluid/LegacyFluid.tsx").includes("getGhostFabricContext") &&
    src("src/components/fluid/LegacyFluid.tsx").includes("ghostDrawSinkRef")
);
check(
  "router applies the registry gate",
  src("src/ghost/useGhostPeer.ts").includes("ghostToolRefusal")
);
check(
  "transport ships ghost recipes under the ghost's id",
  src("src/hooks/useFluidMultiUser.ts").includes("sendRecipeAs")
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
