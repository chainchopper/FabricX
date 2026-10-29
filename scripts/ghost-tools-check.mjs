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
 * Slice 31 ("Ghostie Tools II — the ghost plays") adds section K:
 * - the NOTE tools: call-and-response fixtures in the dataset's
 *   exact schema (temperament answers: echo / octave / fifth /
 *   drop; sleepy listens; petting and startle keep their own
 *   answers; the piano layer + the fabric's notes rule gate the
 *   overlay), the battery still unmoved (zero play-note on
 *   legacy scenarios);
 * - the gates at every layer: the validator refuses play-note
 *   under a notes-off fabric with the refusal surfaced (Spark
 *   path, mocked), the registry names the same refusal, the
 *   peer refuses asked performances under a notes-off fabric
 *   with ZERO sink emissions, the tools do not exist off the
 *   Piano layer, and the wire seam the bus notes traverse
 *   (fabricGate for kind "notes") honors the Slice 5 modes —
 *   a mirror/view guest's ghost note stays local;
 * - budget accounting: a note costs 1 emit slot, an arpeggio 3,
 *   the 8s note cooldown spaces performances;
 * - ask routing: ghostNoteAsk claims its narrow shapes ("play
 *   middle C", "play Eb3", "play that again", arpeggios) and
 *   nothing else ("play a song" stays the composer's);
 * - the SamLayer cleanup (the retired brain publish deleted)
 *   and the hook surface, pinned structurally — including the
 *   three wrappers (noteHandSign / answerTouchAt /
 *   answerDrawAround) LegacyFluid always called but the hook
 *   never exposed before this slice.
 *
 * Build + run:
 *   esbuild src/ghost/GhostBrain.ts --bundle --format=esm --outfile=/tmp/GhostBrain23.mjs
 *   esbuild src/ghost/ghostTools.ts --bundle --format=esm --outfile=/tmp/GhostTools23.mjs
 *   esbuild src/ghost/GhostPeer.ts --bundle --format=esm --outfile=/tmp/GhostPeer23.mjs
 *   esbuild src/ai/RecipeCore.ts --bundle --format=esm --outfile=/tmp/RecipeCore23.mjs
 *   esbuild src/session/fabricStore.ts --bundle --format=esm --outfile=/tmp/FabricStore31.mjs
 *   node scripts/ghost-tools-check.mjs /tmp/GhostBrain23.mjs /tmp/GhostTools23.mjs \
 *     /tmp/GhostPeer23.mjs /tmp/RecipeCore23.mjs <path-to-dataset-v1.jsonl> \
 *     /tmp/FabricStore31.mjs
 */
import { readFileSync } from "node:fs";

const brain = await import(process.argv[2] ?? "/tmp/GhostBrain23.mjs");
const tools = await import(process.argv[3] ?? "/tmp/GhostTools23.mjs");
const peerMod = await import(process.argv[4] ?? "/tmp/GhostPeer23.mjs");
const recipeCore = await import(process.argv[5] ?? "/tmp/RecipeCore23.mjs");
const datasetPath = process.argv[6];
const fabricStore = await import(process.argv[7] ?? "/tmp/FabricStore31.mjs");

const {
  decideOnDevice,
  validateGhostDecision,
  ghostDrawGateRefusal,
  ghostNoteGateRefusal,
  noteDecisionFor,
  consultSparkBrain,
  buildSparkMessages,
  fabricAllowsDraw,
  fabricAllowsNotes,
  sanitizeFabricContext,
  applyPersonalityBias,
  applyStaminaBias,
  parseGhostPersonality,
  isGhostNoteName,
  ghostNoteNumber,
  ghostNoteName,
  ghostAnswerNote,
  GHOST_INTENTS,
  GHOST_DRAW_SHAPES,
  GHOST_DRAW_REFUSAL_TEXT,
  GHOST_NOTE_REFUSAL_TEXT,
  GHOST_PIANO_LAYER_ID,
} = brain;
const { GHOST_TOOL_REGISTRY, ghostToolForIntent, ghostToolRefusal } = tools;
const { GhostPeer, ghostVerbAsk, ghostNoteAsk, isGhostHeartbeatRequest } = peerMod;
const { validateRecipe, RECIPE_SHAPES } = recipeCore;
const { fabricGate } = fabricStore;

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
  let notes = 0;
  for (const line of lines) {
    const { scenario: s, decision } = JSON.parse(line);
    const { decision: mine } = decideOnDevice(s);
    if (mine.intent === decision.intent) agree += 1;
    if (mine.intent === "draw") draws += 1;
    if (mine.intent === "play-note") notes += 1;
  }
  check("battery still 59/60", agree === 59, `${agree}/60`);
  check("no draw on any legacy scenario", draws === 0);
  check("no play-note on any legacy scenario (Slice 31)", notes === 0);
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
  ["verb-perform", "heartbeat-answer", "note-perform"].every((id) => {
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

/* ---------------- K. Slice 31: the NOTE tools ---------------- */
console.log("== Slice 31: note vocabulary ==");
check("bus vocabulary: C4 / C#3 are notes", isGhostNoteName("C4") && isGhostNoteName("C#3"));
check("bus vocabulary: H4 / Cb4 / c4 are not", !isGhostNoteName("H4") && !isGhostNoteName("Cb4") && !isGhostNoteName("c4"));
check(
  "note number math round-trips",
  ghostNoteNumber("C4") === 60 && ghostNoteName(60) === "C4" && ghostNoteName(ghostNoteNumber("A#5")) === "A#5"
);
check(
  "temperament answers: echo / octave / fifth / drop",
  ghostAnswerNote("C4", "playful") === "C4" &&
    ghostAnswerNote("C4", "curious") === "C5" &&
    ghostAnswerNote("C4", "affectionate") === "G4" &&
    ghostAnswerNote("C4", "sassy") === "C3"
);
check(
  "answers clamp to the piano (C1..C7)",
  ghostAnswerNote("C7", "curious") === "C7" && ghostAnswerNote("C1", "sassy") === "C1"
);
check(
  "the brain's piano layer id is the registry's",
  GHOST_PIANO_LAYER_ID === "ar-piano" &&
    src("src/contexts/ExperienceContext.tsx").includes('id: "ar-piano"')
);

console.log("== Slice 31: call-and-response fixtures (dataset schema) ==");
const pianoFabric = (over = {}) => fabric({ layer_id: "ar-piano", ...over });
const guestNoNotes = () =>
  fabric({
    layer_id: "ar-piano",
    role: "guest",
    in_session: true,
    rules: { draw: true, verbs: true, notes: false },
  });
const heardScenario = (over = {}) =>
  scenario({
    seconds_since_human_touch: 1.5,
    recent_events: ["human played C4"],
    fabric: pianoFabric(),
    ...over,
  });
const noteFixture = (intent, note_name) => ({
  mood_shift: null,
  intent,
  pattern_id: null,
  draw_shape: null,
  note_name,
  intensity: 0.6,
  linger_s: 3,
});
const NOTE_FIXTURES = [
  { label: "playful hears C4 at the piano -> echoes C4", s: heardScenario(), want: ["play-note", "C4"] },
  { label: "curious hears C4 -> answers C5", s: heardScenario({ temperament: "curious" }), want: ["play-note", "C5"] },
  { label: "affectionate hears C4 -> answers G4 (a fifth)", s: heardScenario({ temperament: "affectionate" }), want: ["play-note", "G4"] },
  { label: "sassy hears C4 -> drops it to C3", s: heardScenario({ temperament: "sassy" }), want: ["play-note", "C3"] },
  { label: "no fabric (provenance) -> still answers", s: heardScenario({ fabric: undefined }), want: ["play-note", "C4"] },
];
for (const f of NOTE_FIXTURES) {
  const { decision, ruleId } = decideOnDevice(f.s);
  check(
    f.label,
    decision.intent === f.want[0] && decision.note_name === f.want[1],
    `${decision.intent}/${decision.note_name} (${ruleId})`
  );
  check(
    `${f.label} — fixture decision validates in the dataset schema`,
    validateGhostDecision(noteFixture(f.want[0], f.want[1]), f.s)?.note_name === f.want[1]
  );
}
check(
  "sleepy hears a note -> listens (naps, never plays)",
  decideOnDevice(heardScenario({ temperament: "sleepy", seconds_since_human_touch: 140 })).decision.intent === "nap" &&
    noteDecisionFor(heardScenario({ temperament: "sleepy" })) === null
);
check(
  "petting keeps its own answer (no note)",
  noteDecisionFor(heardScenario({ pets_in_last_5s: 2 })) === null &&
    decideOnDevice(heardScenario({ pets_in_last_5s: 2 })).decision.intent !== "play-note"
);
check(
  "a loud splat keeps startle (no note)",
  noteDecisionFor(heardScenario({ nearby_splat_intensity: 0.9 })) === null &&
    decideOnDevice(heardScenario({ nearby_splat_intensity: 0.9 })).decision.intent === "startle"
);
check(
  "notes live at the piano: the fluid layer never answers",
  noteDecisionFor(heardScenario({ fabric: fabric() })) === null &&
    decideOnDevice(heardScenario({ fabric: fabric() })).decision.intent !== "play-note"
);
check(
  "a notes-off fabric silences the answer",
  noteDecisionFor(heardScenario({ fabric: guestNoNotes() })) === null &&
    decideOnDevice(heardScenario({ fabric: guestNoNotes() })).decision.intent !== "play-note"
);

console.log("== Slice 31: note gates — validator / Spark / registry ==");
const noteRaw = {
  mood_shift: null,
  intent: "play-note",
  pattern_id: null,
  draw_shape: null,
  note_name: "E4",
  intensity: 0.6,
  linger_s: 3,
};
check("bare play-note validates", validateGhostDecision(noteRaw)?.note_name === "E4");
check(
  "play-note without a note is not a decision",
  validateGhostDecision({ ...noteRaw, note_name: null }) === null
);
check(
  "play-note with a non-note is not a decision",
  validateGhostDecision({ ...noteRaw, note_name: "H4" }) === null
);
check(
  "note_name on a play decision coerced to null",
  validateGhostDecision({ ...noteRaw, intent: "play", pattern_id: "chase_loop" })?.note_name === null
);
check(
  "play-note under a notes-off scenario refused by the validator",
  validateGhostDecision(noteRaw, scenario({ fabric: guestNoNotes() })) === null
);
check(
  "gate helpers agree (brain + namer)",
  fabricAllowsNotes(scenario({ fabric: guestNoNotes() })) === false &&
    fabricAllowsNotes(scenario()) === true &&
    ghostNoteGateRefusal(noteRaw, scenario({ fabric: guestNoNotes() })) === GHOST_NOTE_REFUSAL_TEXT &&
    ghostNoteGateRefusal(noteRaw, scenario({ fabric: pianoFabric() })) === null
);
const noteReply = JSON.stringify(noteRaw);
const sparkNoteAllowed = await consultSparkBrain(
  scenario({ fabric: pianoFabric() }),
  async () => noteReply,
  500
);
check(
  "Spark play-note under an allowing fabric applies",
  sparkNoteAllowed?.intent === "play-note" && sparkNoteAllowed?.note_name === "E4"
);
let noteRefusalHeard = null;
const sparkNoteRefused = await consultSparkBrain(
  scenario({ fabric: guestNoNotes() }),
  async () => noteReply,
  500,
  undefined,
  undefined,
  (text) => {
    noteRefusalHeard = text;
  }
);
check("Spark play-note under a refusing fabric is rejected", sparkNoteRefused === null);
check(
  "the note refusal is surfaced verbatim",
  noteRefusalHeard === GHOST_NOTE_REFUSAL_TEXT,
  noteRefusalHeard ?? "(none)"
);
const noteFabricNote = buildSparkMessages(scenario({ fabric: guestNoNotes() }))
  .map((m) => m.content)
  .join("\n");
check(
  "Spark consult carries the notes law",
  noteFabricNote.includes("notes NOT allowed"),
  noteFabricNote.includes("notes allowed") ? "(says allowed?!)" : ""
);
check(
  "registry gate: play-note refused / allowed by the notes rule",
  ghostToolForIntent("play-note")?.id === "play-note" &&
    ghostToolRefusal("play-note", scenario({ fabric: guestNoNotes() })) === GHOST_NOTE_REFUSAL_TEXT &&
    ghostToolRefusal("play-note", scenario({ fabric: pianoFabric() })) === null
);

console.log("== Slice 31: stamina steers notes like any performance ==");
const noteDecisionFixture = noteFixture("play-note", "C4");
const drainedNote = applyStaminaBias(noteDecisionFixture, 10);
check(
  "drained stamina rests instead of playing (note_name nulled)",
  drainedNote.decision.intent === "nap" && drainedNote.decision.note_name === null
);
const lowNote = applyStaminaBias(noteDecisionFixture, 30);
check(
  "low stamina plays softer (named)",
  lowNote.decision.intent === "play-note" &&
    lowNote.decision.note_name === "C4" &&
    lowNote.decision.intensity < noteDecisionFixture.intensity &&
    lowNote.steeredBy.some((s) => s.includes("plays softer"))
);

console.log("== Slice 31: GhostPeer note performance ==");
const mkNotePeer = (fabricCtx) => {
  const seen = { notes: [], perfs: [] };
  const peer = new GhostPeer({
    peerId: "ghost:tools-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: () => {},
    broadcast: () => {},
    ghostName: "Boop",
    getFabricContext: () => fabricCtx,
    onNote: (note, velocity, durationMs) => seen.notes.push({ note, velocity, durationMs }),
    onPerformance: (l) => seen.perfs.push(l),
  });
  return { peer, seen };
};
const playNoteDecision = {
  mood_shift: null,
  intent: "play-note",
  pattern_id: null,
  draw_shape: null,
  note_name: "C4",
  intensity: 0.65,
  linger_s: 3,
};

const n1 = mkNotePeer(pianoFabric());
n1.peer.applyBrainDecision(playNoteDecision, "table");
await sleep(60);
check(
  "a play-note decision hands ONE note to the sink (bus-shaped)",
  n1.seen.notes.length === 1 &&
    n1.seen.notes[0].note === "C4" &&
    n1.seen.notes[0].durationMs > 0 &&
    n1.seen.notes[0].velocity > 0 &&
    n1.seen.notes[0].velocity <= 1,
  JSON.stringify(n1.seen.notes)
);
check(
  "the answer costs exactly 1 emit slot",
  n1.peer.getVitalsSnapshot().emits10m === 1,
  `${n1.peer.getVitalsSnapshot().emits10m} emits`
);
n1.peer.applyBrainDecision(playNoteDecision, "table");
await sleep(60);
check("the 8s note cooldown spaces answers", n1.seen.notes.length === 1);
n1.peer.destroy();

const n2 = mkNotePeer(guestNoNotes());
n2.peer.applyBrainDecision(playNoteDecision, "table");
await sleep(60);
check(
  "peer-side gate: a direct play-note decision cannot play on a notes-off fabric",
  n2.seen.notes.length === 0
);
check(
  "asked note on a notes-off fabric -> refused, ZERO sink emissions",
  n2.peer.answerNote("E4") === "refused" && n2.seen.notes.length === 0
);
n2.peer.destroy();

const n3 = mkNotePeer(fabric());
check(
  "asked note off the Piano layer -> unavailable (the tool does not exist there)",
  n3.peer.answerNote("E4") === "unavailable" && n3.seen.notes.length === 0
);
n3.peer.destroy();

const n4 = mkNotePeer(pianoFabric());
check("asked note performs", n4.peer.answerNote("E4") === "performed");
await sleep(60);
check(
  "the asked note reaches the sink",
  n4.seen.notes.length === 1 && n4.seen.notes[0].note === "E4"
);
check(
  "the performance is reported",
  n4.seen.perfs.some((l) => l.includes("played E4 on request"))
);
n4.peer.destroy();

const n5 = mkNotePeer(pianoFabric());
check(
  "'play that again' with nothing remembered -> unavailable",
  n5.peer.answerNoteAgain() === "unavailable"
);
n5.peer.noteHumanNote("D4");
check(
  "a human's note is journaled in the dataset's event vocabulary",
  n5.peer.buildScenario().recent_events.includes("human played D4"),
  n5.peer.buildScenario().recent_events.join(" | ")
);
check("'play that again' replays the human's note", n5.peer.answerNoteAgain() === "performed");
await sleep(60);
check(
  "the replay reaches the sink",
  n5.seen.notes.length === 1 && n5.seen.notes[0].note === "D4"
);
n5.peer.destroy();

const n6 = mkNotePeer(pianoFabric());
check("asked arpeggio performs as ONE call", n6.peer.answerArpeggio(false) === "performed");
await sleep(750);
check(
  "the arpeggio is four chord tones ascending from middle C",
  JSON.stringify(n6.seen.notes.map((x) => x.note)) === JSON.stringify(["C4", "E4", "G4", "C5"]),
  JSON.stringify(n6.seen.notes.map((x) => x.note))
);
check(
  "the arpeggio costs exactly 3 emit slots",
  n6.peer.getVitalsSnapshot().emits10m === 3,
  `${n6.peer.getVitalsSnapshot().emits10m} emits`
);
check(
  "a second arpeggio inside the cooldown -> unavailable",
  n6.peer.answerArpeggio(false) === "unavailable"
);
n6.peer.destroy();

const n7 = mkNotePeer(pianoFabric());
n7.peer.noteHumanNote("C4");
const heardBack = decideOnDevice({ ...n7.peer.buildScenario(), temperament: "playful" });
check(
  "end to end: heard C4 -> deliberation answers play-note",
  heardBack.decision.intent === "play-note" && heardBack.decision.note_name === "C4",
  `${heardBack.decision.intent} (${heardBack.ruleId})`
);
n7.peer.applyBrainDecision(heardBack.decision, heardBack.ruleId);
await sleep(60);
check(
  "end to end: the answer reaches the sink",
  n7.seen.notes.length === 1 && n7.seen.notes[0].note === "C4"
);
n7.peer.destroy();

console.log("== Slice 31: the wire seam the bus notes traverse ==");
const RULES_ON = { draw: true, verbs: true, notes: true };
const RULES_NOTES_OFF = { draw: true, verbs: true, notes: false };
check(
  "mode gate binds first: a mirror/view guest's notes never broadcast (local only)",
  fabricGate({ modeCanSend: false, role: "guest", rules: RULES_ON, kind: "notes" }) === false &&
    fabricGate({ modeCanSend: false, role: "host", rules: RULES_ON, kind: "notes" }) === false
);
check(
  "guest + fabric notes OFF -> the note stays off the wire",
  fabricGate({ modeCanSend: true, role: "guest", rules: RULES_NOTES_OFF, kind: "notes" }) === false
);
check(
  "guest + fabric notes ON + a sending mode -> the note rides",
  fabricGate({ modeCanSend: true, role: "guest", rules: RULES_ON, kind: "notes" }) === true
);
check(
  "the host is never bound by guest rules",
  fabricGate({ modeCanSend: true, role: "host", rules: RULES_NOTES_OFF, kind: "notes" }) === true
);

console.log("== Slice 31: note-ask routing ==");
const nroute = (p) => ghostNoteAsk(p, "Boop");
const nkind = (p) => nroute(p)?.kind ?? null;
check("'play a note' -> ghost's choice", nroute("play a note")?.kind === "note" && nroute("play a note")?.note === null);
check("'play middle C' -> C4", nroute("play middle C")?.note === "C4");
check("'Boop, play a C' -> C4", nroute("Boop, play a C")?.note === "C4");
check("'play C#4' -> C#4", nroute("play C#4")?.note === "C#4");
check("'play Eb3' -> D#3 (flats land on sharp names)", nroute("play Eb3")?.note === "D#3");
check("'play that again' -> again", nkind("play that again") === "again");
check("'play it again' -> again", nkind("play it again") === "again");
check(
  "arpeggios route, direction honored",
  nroute("play an arpeggio")?.kind === "arpeggio" &&
    nroute("play an arpeggio")?.descending === false &&
    nroute("play a descending arpeggio")?.descending === true
);
check("'play a song' stays the composer's", nroute("play a song") === null);
check("'play the heartbeat' stays the heartbeat route", nroute("play the heartbeat") === null);
check("'play some jazz' -> null", nroute("play some jazz") === null);
check("'play a fifth' (no note named) -> null", nroute("play a fifth") === null);
check("'display a note' (no play word) -> null", nroute("display a note") === null);
check("'make a heart' -> null", nroute("make a heart") === null);

console.log("== Slice 31: structural wiring ==");
const legacySrc = src("src/components/fluid/LegacyFluid.tsx");
check(
  "LegacyFluid routes note asks + the bus sink + the call-and-response forwarder",
  legacySrc.includes("ghostNoteAsk(") &&
    legacySrc.includes("noteBus.emitNoteOn") &&
    legacySrc.includes("noteHumanNote(") &&
    legacySrc.includes("onNote: onGhostNote")
);
const hookSrc = src("src/ghost/useGhostPeer.ts");
check(
  "the hook exposes the note wrappers",
  hookSrc.includes("answerNote") &&
    hookSrc.includes("answerNoteAgain") &&
    hookSrc.includes("answerArpeggio") &&
    hookSrc.includes("noteHumanNote")
);
check(
  "drive-by: the hook finally exposes Slice 28/30's wrappers (LegacyFluid calls all three)",
  hookSrc.includes("noteHandSign") &&
    hookSrc.includes("answerTouchAt") &&
    hookSrc.includes("answerDrawAround")
);
const samSrc = src("src/components/sam/SamLayer.tsx");
check(
  "SamLayer cleanup: the retired brain publish is deleted, the keeper remains",
  !samSrc.includes("getBrainSnapshot") &&
    !samSrc.includes('publishSegmentationSource("device", snap.state === "ready")') &&
    samSrc.includes('publishSegmentationSource("device", isDeviceGroundingReady())')
);
check(
  "the availability seam's header tells the grounding truth now",
  src("src/sam/segmentationAvailability.ts").includes("GroundingDINO") &&
    !src("src/sam/segmentationAvailability.ts").includes("publishes it from the brain snapshot")
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
