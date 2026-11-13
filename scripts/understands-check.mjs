/**
 * understands-check — headless proof for Slice 33 ("Understands",
 * Layer A of the final-two-layers spec).
 *
 * Run: node scripts/understands-check.mjs [GhostBrain.mjs] [GhostPeer.mjs]
 *   (bundles default to /tmp/GB33.mjs and /tmp/GP33.mjs — build them with
 *    esbuild from src/ghost/GhostBrain.ts and src/ghost/GhostPeer.ts)
 *
 * Proves, against the spec's acceptance tests:
 *   1. CONTRASTIVE PAIR 1 (context): "it's cold in here" in a quiet,
 *      low-energy solo digest answers A; the same words mid-lively
 *      session answer B; A != B, and neither is keyed to the word —
 *      a DIFFERENT ambience word in digest A earns A itself (the
 *      digest decides, not the adjective).
 *   2. CONTRASTIVE PAIR 2 (state): the same sentence to a
 *      freshly-petted affectionate ghost vs an ignored sleepy one
 *      earns a different acknowledgment-scale AND a different
 *      substantive response.
 *   3. REPEAT: the same scenario at repeats 0 vs 1 decides
 *      differently, and the peer counts the repetition, journals
 *      "said it again", and carries repeats: 1 into deliberation.
 *   4. HEARTBEAT REGRESSION: "lemme see your heartbeat" still
 *      routes to the heartbeat (and the utterance claim refuses
 *      it, plus verb/note asks and imperative compose prompts);
 *      the composer's own phrases ("gentle rain") stay unclaimed.
 *   5. UNCERTAINTY: nonsense words and a low-confidence hearing
 *      produce NO fabricated act — the outcome is "uncertain",
 *      and at the peer the low-confidence hearing performs
 *      puzzlement with zero deliberation pended.
 *   6. CONSENT: with the fabric's draw rule off, the utterance
 *      whose best answer is a drawing is answered another way;
 *      with it on, the same digest draws. The validator refuses
 *      a raw draw under the refusing fabric outright.
 *   7. ACK + PROMPTNESS: the sense acknowledges immediately
 *      (emits before any deliberation) and the utterance opens a
 *      deliberation well inside the ambient 10s floor.
 *   8. PROPORTIONALITY + BATTERY SAFETY: every overlay decision
 *      is <= 0.7 intensity; scenarios without an utterance never
 *      touch the overlay; the Spark prompt gains the utterance
 *      note only when an utterance is present (ambient messages
 *      unchanged), and a model may answer UNCERTAIN.
 *
 * Bundle the modules under test first (house pattern):
 *   node -e 'const e=require("esbuild");for(const [a,b] of
 *     [["src/ghost/GhostBrain.ts","/tmp/GB33.mjs"],
 *      ["src/ghost/GhostPeer.ts","/tmp/GP33.mjs"]])
 *     e.buildSync({entryPoints:[a],bundle:true,format:"esm",
 *       platform:"neutral",outfile:b,logLevel:"silent"})'
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GB = await import(process.argv[2] ?? "/tmp/GB33.mjs");
const GP = await import(process.argv[3] ?? "/tmp/GP33.mjs");

const {
  decideOnDevice,
  decideUtteranceOutcome,
  planUtteranceTiers,
  utteranceDecisionFor,
  parseUtteranceReading,
  sanitizeUtteranceContext,
  validateGhostDecision,
  buildSparkMessages,
  consultSparkBrain,
  UTTERANCE_CONFIDENCE_FLOOR,
  UTTERANCE_MAX_INTENSITY,
} = GB;
const {
  GhostPeer,
  ghostUtteranceClaim,
  isGhostHeartbeatRequest,
  ghostVerbAsk,
  ghostNoteAsk,
} = GP;

let pass = 0;
let fail = 0;
const check = (label, ok, extra = "") => {
  if (ok) {
    pass++;
    console.log(`  PASS ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseScenario = {
  recent_events: [],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.1,
  verbs_seen: [],
  other_ghosts: [],
  ghost_identity: { name: "Boop", hue: 210, seed_traits: ["bouncy", "giggly"] },
};
const scenario = (over) => ({ ...baseScenario, ...over });
const utt = (text, over = {}) => ({
  text,
  asr_confidence: null,
  speaker: "primary",
  repeats: 0,
  ...over,
});
const sig = (d) =>
  d ? `${d.intent}|${d.pattern_id ?? ""}|${d.draw_shape ?? ""}` : "none";
const fabric = (draw) => ({
  layer_id: "fluid",
  canvas: "fluid",
  role: "guest",
  in_session: true,
  rules: { draw, verbs: true, notes: true },
});

/* ---------------- A. the reading ---------------- */
console.log("== parseUtteranceReading ==");
check(
  "\"it's cold in here\" reads as ambience",
  parseUtteranceReading("it's cold in here", "Boop").kind === "ambience"
);
check(
  "\"i'm cold\" reads as feeling (the speaker, not the adjective)",
  parseUtteranceReading("i'm cold", "Boop").kind === "feeling"
);
check(
  "\"i'm so tired\" reads as feeling",
  parseUtteranceReading("i'm so tired", "Boop").kind === "feeling"
);
check(
  "\"who's there?\" reads as presence",
  parseUtteranceReading("who's there?", "Boop").kind === "presence"
);
check(
  "a greeting outranks a room remark",
  parseUtteranceReading("hello, it's cold in here", "Boop").kind === "presence"
);
check(
  "\"that was beautiful\" reads as appreciation",
  parseUtteranceReading("that was beautiful", "Boop").kind === "appreciation"
);
check(
  "\"good night, see you tomorrow\" reads as farewell",
  parseUtteranceReading("good night, see you tomorrow", "Boop").kind ===
    "farewell"
);
check(
  "nonsense reads as unknown — honestly",
  parseUtteranceReading("it is flibberty snarp in here", "Boop").kind ===
    "unknown"
);
check(
  "addressed by name is seen",
  parseUtteranceReading("Boop, it's cold in here", "Boop").addressed === true
);
check(
  "the dataset v2 utterance shape sanitizes",
  sanitizeUtteranceContext({ text: "it's cold in here", asr_confidence: 0.94 })
    ?.asr_confidence === 0.94
);
check(
  "a garbled utterance payload sanitizes to null",
  sanitizeUtteranceContext({ text: "   " }) === null &&
    sanitizeUtteranceContext({ nope: true }) === null
);

/* ---------------- B. contrastive pair 1 (context) ---------------- */
console.log("== contrastive pair 1: context ==");
const p1Quiet = scenario({
  temperament: "sleepy",
  seconds_since_human_touch: 180,
  room_energy_trend: "falling",
  utterance: utt("it's cold in here"),
});
const p1Lively = scenario({
  temperament: "playful",
  seconds_since_human_touch: 6,
  room_energy_trend: "rising",
  other_ghosts: [
    { name: "another ghost", mood: "unknown", last_action: "drift" },
  ],
  utterance: utt("it's cold in here"),
});
const aOut = decideUtteranceOutcome(p1Quiet);
const bOut = decideUtteranceOutcome(p1Lively);
check(
  "quiet solo digest decides (nap: settles in)",
  aOut.kind === "decision" && aOut.decision.intent === "nap",
  JSON.stringify(aOut)
);
check(
  "lively digest decides (play: warms the room by moving)",
  bOut.kind === "decision" && bOut.decision.intent === "play",
  JSON.stringify(bOut)
);
check(
  "same words, different context -> different response",
  aOut.kind === "decision" &&
    bOut.kind === "decision" &&
    sig(aOut.decision) !== sig(bOut.decision)
);
const otherWord = decideUtteranceOutcome(
  scenario({ ...p1Quiet, utterance: utt("it's so quiet in here") })
);
check(
  "a DIFFERENT ambience word in digest A earns A (digest decides, not the word)",
  otherWord.kind === "decision" &&
    aOut.kind === "decision" &&
    sig(otherWord.decision) === sig(aOut.decision) &&
    otherWord.ruleId === aOut.ruleId
);
check(
  "no decision field encodes 'cold' (no blue-poof macro exists to fire)",
  aOut.kind === "decision" &&
    !("hue" in aOut.decision) &&
    aOut.decision.draw_shape !== "burst"
);

/* ---------------- C. contrastive pair 2 (state) ---------------- */
console.log("== contrastive pair 2: state ==");
const p2Petted = decideUtteranceOutcome(
  scenario({
    temperament: "affectionate",
    seconds_since_human_touch: 3,
    pets_in_last_5s: 4,
    room_energy_trend: "steady",
    utterance: utt("it's cold in here"),
  })
);
const p2Ignored = decideUtteranceOutcome(
  scenario({
    temperament: "sleepy",
    seconds_since_human_touch: 240,
    pets_in_last_5s: 0,
    room_energy_trend: "falling",
    utterance: utt("it's cold in here"),
  })
);
check(
  "freshly-petted ghost mirrors the warmth back",
  p2Petted.kind === "decision" && p2Petted.decision.intent === "mirror",
  JSON.stringify(p2Petted)
);
check(
  "ignored low ghost settles instead",
  p2Ignored.kind === "decision" && p2Ignored.decision.intent === "nap",
  JSON.stringify(p2Ignored)
);
check(
  "different acknowledgment scale AND different substance",
  p2Petted.kind === "decision" &&
    p2Ignored.kind === "decision" &&
    p2Petted.decision.intensity !== p2Ignored.decision.intensity &&
    p2Petted.decision.linger_s !== p2Ignored.decision.linger_s &&
    sig(p2Petted.decision) !== sig(p2Ignored.decision)
);

/* ---------------- D. repeat ---------------- */
console.log("== repeat ==");
const repDigest = {
  temperament: "playful",
  seconds_since_human_touch: 45,
  room_energy_trend: "steady",
};
const rep0 = decideUtteranceOutcome(
  scenario({ ...repDigest, utterance: utt("it's cold in here") })
);
const rep1 = decideUtteranceOutcome(
  scenario({ ...repDigest, utterance: utt("it's cold in here", { repeats: 1 }) })
);
const rep2 = decideUtteranceOutcome(
  scenario({ ...repDigest, utterance: utt("it's cold in here", { repeats: 2 }) })
);
check(
  "first hearing draws (its best answer in a lull)",
  rep0.kind === "decision" && rep0.decision.intent === "draw",
  JSON.stringify(rep0)
);
check(
  "second hearing decides DIFFERENTLY",
  rep1.kind === "decision" &&
    rep0.kind === "decision" &&
    sig(rep1.decision) !== sig(rep0.decision) &&
    rep1.ruleId !== rep0.ruleId,
  JSON.stringify(rep1)
);
check(
  "third hearing still never repeats the first answer",
  rep2.kind === "decision" &&
    rep0.kind === "decision" &&
    sig(rep2.decision) !== sig(rep0.decision)
);

/* ---------------- E. consent ---------------- */
console.log("== consent ==");
const consentOff = decideUtteranceOutcome(
  scenario({ ...repDigest, fabric: fabric(false), utterance: utt("it's cold in here") })
);
const consentOn = decideUtteranceOutcome(
  scenario({ ...repDigest, fabric: fabric(true), utterance: utt("it's cold in here") })
);
check(
  "draw refused by the fabric: answered another way",
  consentOff.kind === "decision" && consentOff.decision.intent !== "draw",
  JSON.stringify(consentOff)
);
check(
  "the same digest WITH drawing allowed does draw (the gate is what changed)",
  consentOn.kind === "decision" && consentOn.decision.intent === "draw",
  JSON.stringify(consentOn)
);
check(
  "the validator itself refuses a raw draw under the refusing fabric",
  validateGhostDecision(
    {
      mood_shift: null,
      intent: "draw",
      pattern_id: null,
      draw_shape: "spiral",
      note_name: null,
      intensity: 0.5,
      linger_s: 6,
    },
    scenario({ ...repDigest, fabric: fabric(false) })
  ) === null
);

/* ---------------- F. uncertainty ---------------- */
console.log("== uncertainty ==");
const nonsense = decideUtteranceOutcome(
  scenario({
    temperament: "curious",
    seconds_since_human_touch: 20,
    room_energy_trend: "steady",
    utterance: utt("it is flibberty snarp in here"),
  })
);
check(
  "nonsense -> uncertain (no-reading), no fabricated act",
  nonsense.kind === "uncertain" && nonsense.reason === "no-reading"
);
const garbled = decideUtteranceOutcome(
  scenario({
    temperament: "curious",
    seconds_since_human_touch: 20,
    room_energy_trend: "steady",
    utterance: utt("it's cold in here", { asr_confidence: 0.31 }),
  })
);
check(
  "low-confidence hearing -> uncertain (low-confidence)",
  garbled.kind === "uncertain" && garbled.reason === "low-confidence"
);
check(
  "confidence at/above the floor still comprehends",
  decideUtteranceOutcome(
    scenario({
      temperament: "curious",
      seconds_since_human_touch: 20,
      room_energy_trend: "steady",
      utterance: utt("it's cold in here", {
        asr_confidence: UTTERANCE_CONFIDENCE_FLOOR,
      }),
    })
  ).kind === "decision"
);

/* ---------------- G. proportionality + battery safety ---------------- */
console.log("== proportionality / battery safety ==");
let maxIntensity = 0;
let overlayTouchedLegacy = false;
for (const temperament of ["curious", "playful", "sleepy", "sassy", "affectionate"]) {
  for (const trend of ["rising", "falling", "steady"]) {
    for (const quiet of [2, 30, 90, 200]) {
      for (const text of [
        "it's cold in here",
        "i'm so tired",
        "who's there?",
        "that was beautiful",
        "good night",
      ]) {
        const s = scenario({
          temperament,
          room_energy_trend: trend,
          seconds_since_human_touch: quiet,
          pets_in_last_5s: quiet < 10 ? 3 : 0,
          utterance: utt(text),
        });
        const over = utteranceDecisionFor(s);
        if (over) {
          maxIntensity = Math.max(maxIntensity, over.decision.intensity);
        }
        const legacy = { ...s };
        delete legacy.utterance;
        if (utteranceDecisionFor(legacy) !== null) {
          overlayTouchedLegacy = true;
        }
      }
    }
  }
}
check(
  `every utterance response is ambient-scale (max ${maxIntensity} <= ${UTTERANCE_MAX_INTENSITY})`,
  maxIntensity > 0 && maxIntensity <= UTTERANCE_MAX_INTENSITY
);
check(
  "the overlay never fires without an utterance (legacy battery unmoved)",
  !overlayTouchedLegacy
);

/* ---------------- H. the model tiers hear it too ---------------- */
console.log("== Spark prompt + consults ==");
const withUtt = buildSparkMessages(p1Quiet);
const withoutUtt = buildSparkMessages(scenario({ ...p1Quiet, utterance: undefined }));
const noteMsg = withUtt.find(
  (m) => m.role === "system" && m.content.includes("utterance, not a command")
);
check("the utterance note rides the Spark messages", !!noteMsg);
check(
  "the note carries the words, the law, and the UNCERTAIN hatch",
  !!noteMsg &&
    noteMsg.content.includes("it's cold in here") &&
    noteMsg.content.includes("situational, not lexical") &&
    noteMsg.content.includes("UNCERTAIN")
);
check(
  "ambient messages carry no utterance note (byte-unchanged path)",
  !withoutUtt.some((m) => m.content.includes("utterance, not a command"))
);
check(
  "the scenario JSON itself carries the utterance sense",
  withUtt[withUtt.length - 1].content.includes('"utterance"')
);
const uncertainReply = await consultSparkBrain(p1Quiet, async () => "UNCERTAIN");
check(
  "a model answering UNCERTAIN yields no decision (floor decides honestly)",
  uncertainReply === null
);
const modelDraw = await consultSparkBrain(
  scenario({ ...repDigest, fabric: fabric(false), utterance: utt("it's cold in here") }),
  async () =>
    JSON.stringify({
      mood_shift: null,
      intent: "draw",
      pattern_id: null,
      draw_shape: "spiral",
      note_name: null,
      intensity: 0.5,
      linger_s: 6,
    })
);
check(
  "a model draw under a refusing fabric validates to nothing",
  modelDraw === null
);
const modelOk = await consultSparkBrain(
  p1Lively,
  async () =>
    JSON.stringify({
      mood_shift: null,
      intent: "play",
      pattern_id: "chase_loop",
      draw_shape: null,
      note_name: null,
      intensity: 0.6,
      linger_s: 4,
    })
);
check(
  "a valid model decision passes the same validator",
  modelOk !== null && modelOk.intent === "play"
);

/* ---------------- I. the claim router + heartbeat regression ---------------- */
console.log("== ghostUtteranceClaim / heartbeat regression ==");
const claim = (p) => ghostUtteranceClaim(p, "Boop");
check("claim: \"it's cold in here\"", claim("it's cold in here") === true);
check("claim: \"i'm so tired\"", claim("i'm so tired") === true);
check("claim: \"who's there?\"", claim("who's there?") === true);
check(
  "claim: unreadable STATEMENT is still the ghost's (uncertainty, not a fake pattern)",
  claim("it is flibberty snarp in here") === true
);
check(
  "heartbeat regression: the ask still routes to the heartbeat",
  isGhostHeartbeatRequest("lemme see your heartbeat", "Boop") === true
);
check(
  "heartbeat regression: the utterance claim refuses it",
  claim("lemme see your heartbeat") === false &&
    claim("show me your heartbeat") === false
);
check(
  "verb asks stay the verb route's",
  claim("tickle Boop") === false && ghostVerbAsk("tickle Boop", "Boop") === "tickle"
);
check(
  "note asks stay the note route's",
  claim("play middle C") === false && ghostNoteAsk("play middle C") !== null
);
check(
  "imperative compose prompts stay the composer's",
  claim("draw a heart") === false && claim("make it rain") === false
);
check(
  "request questions stay asks",
  claim("can you make it colder in here") === false &&
    claim("could you warm this up") === false
);
check(
  "the composer's feeling phrases stay compositions (no subject, no claim)",
  claim("gentle rain on a lake") === false
);
check(
  "one word is never an utterance",
  claim("flibberty") === false && claim("cold") === false
);

/* ---------------- J. GhostPeer: the sense end to end ---------------- */
console.log("== GhostPeer noteUtterance ==");
const mkPeer = () => {
  const seen = { injects: [], perfs: [], deliberations: [] };
  const peer = new GhostPeer({
    peerId: "ghost:understands-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: (i) => seen.injects.push(i),
    broadcast: (i) => seen.injects.push(i),
    ghostName: "Boop",
    onPerformance: (l) => seen.perfs.push(l),
    onDeliberate: (s) => seen.deliberations.push(s),
  });
  return { peer, seen };
};

const p1 = mkPeer();
check(
  "empty words find no hearing",
  p1.peer.noteUtterance("   ") === "unavailable"
);
check(
  "the sense returns 'heard'",
  p1.peer.noteUtterance("it's cold in here") === "heard"
);
check(
  "the hearing is reported as a performance",
  p1.seen.perfs.some((l) => l.includes("heard an utterance"))
);
await sleep(150);
check(
  "ACKNOWLEDGE FIRST: the ack beat emits before any deliberation lands",
  p1.seen.injects.length >= 1 && p1.seen.deliberations.length === 0,
  `${p1.seen.injects.length} injects, ${p1.seen.deliberations.length} deliberations`
);
await sleep(1050);
const d0 = p1.seen.deliberations.find((s) => s.utterance);
check(
  "the utterance opens a deliberation well inside the 10s ambient floor",
  !!d0 && d0.utterance.text === "it's cold in here"
);
check(
  "the first deliberation carries repeats: 0 and an unscored confidence",
  !!d0 && d0.utterance.repeats === 0 && d0.utterance.asr_confidence === null
);
check(
  "said again -> still 'heard'",
  p1.peer.noteUtterance("it's cold in here") === "heard"
);
const pending = p1.peer.buildScenario(Date.now());
check(
  "the repeat is counted into the pending context (repeats: 1)",
  pending.utterance?.repeats === 1,
  JSON.stringify(pending.utterance)
);
check(
  "the repeat is reported as one ('heard an utterance — again')",
  p1.seen.perfs.some((l) => l.includes("again"))
);
await sleep(1800);
const d1 = p1.seen.deliberations.filter((s) => s.utterance);
check(
  "the second hearing deliberates carrying repeats: 1",
  d1.length >= 2 && d1[d1.length - 1].utterance.repeats === 1,
  `${d1.length} utterance deliberations`
);
p1.peer.destroy();

const p2 = mkPeer();
check(
  "a garbled hearing returns 'uncertain'",
  p2.peer.noteUtterance("it's cold in here", { confidence: 0.2 }) ===
    "uncertain"
);
check(
  "uncertainty is performed, not faked (puzzlement on the brain line)",
  p2.seen.perfs.some((l) => l.includes("puzzled"))
);
check(
  "no deliberation is pended for words that weren't heard",
  p2.peer.buildScenario(Date.now()).utterance === undefined
);
await sleep(500);
check(
  "the puzzlement ripple actually emits",
  p2.seen.injects.length >= 1,
  `${p2.seen.injects.length} injects`
);
p2.peer.destroy();

const p3 = mkPeer();
p3.peer.setEnabled(false);
check(
  "no ghost, no hearing ('unavailable' — the caller falls back)",
  p3.peer.noteUtterance("it's cold in here") === "unavailable"
);
p3.peer.destroy();

/* ---------------- K. structural pins ---------------- */
console.log("== structural pins ==");
const legacySrc = readFileSync(
  path.join(ROOT, "src/components/fluid/LegacyFluid.tsx"),
  "utf8"
);
const seeActAt = legacySrc.indexOf("await performSeeAct(seeAct)");
const uttRouteAt = legacySrc.indexOf("ghostUtteranceClaim(");
const genericAt = legacySrc.indexOf("composeWithShapesDetailed(prompt)");
check(
  "LegacyFluid routes utterances AFTER see-acts, BEFORE the generic interpreter",
  seeActAt > 0 && uttRouteAt > seeActAt && genericAt > uttRouteAt
);
check(
  "LegacyFluid hands the hearing (with confidence) to the sense",
  legacySrc.includes("noteUtterance(prompt, {") &&
    legacySrc.includes("heardConfidence")
);
const hookSrc = readFileSync(
  path.join(ROOT, "src/ghost/useGhostPeer.ts"),
  "utf8"
);
check(
  "useGhostPeer routes utterances via decideUtteranceOutcome and exposes noteUtterance",
  hookSrc.includes("decideUtteranceOutcome(scenario)") &&
    hookSrc.includes("noteUtterance,")
);
const brainSrc = readFileSync(path.join(ROOT, "src/ghost/GhostBrain.ts"), "utf8");
check(
  "decideOnDevice tries the utterance overlay first",
  brainSrc.indexOf("utteranceDecisionFor(scenario)") > 0 &&
    brainSrc.indexOf("utteranceDecisionFor(scenario)") <
      brainSrc.indexOf("noteDecisionFor(scenario)", brainSrc.indexOf("decideOnDevice"))
);
const barSrc = readFileSync(
  path.join(ROOT, "src/components/sensory/ComposeBar.tsx"),
  "utf8"
);
check(
  "ComposeBar dispatches the scored voice detail",
  barSrc.includes('via: "voice"') && barSrc.includes("confidence")
);
const captureSrc = readFileSync(
  path.join(ROOT, "src/services/voiceCapture.ts"),
  "utf8"
);
check(
  "voiceCapture surfaces the recognizer's final confidence",
  captureSrc.includes("finalConfidence")
);

/* ---------------- L. the model-first plan (Nov 12 fix) ----------------
 * The original routing keyed the model attempt off the ambient
 * tier preference alone: default "on-device" + model not yet
 * downloaded = the table floor answered every utterance, silently.
 * planUtteranceTiers is the law that replaces it. */
console.log("== planUtteranceTiers (model-first) ==");
const plan = (tierPref, cloudConfigPresent, deviceReady) =>
  planUtteranceTiers({ tierPref, cloudConfigPresent, deviceReady });
check(
  "THE REGRESSION: default pref + cloud configured + no device model → cloud attempted",
  JSON.stringify(plan("on-device", true, false).attempts) === '["cloud"]' &&
    plan("on-device", true, false).raiseBrainAsk === false
);
check(
  "default pref + device model ready → device first, cloud as backup",
  JSON.stringify(plan("on-device", true, true).attempts) === '["device","cloud"]'
);
check(
  "default pref + device ready, no cloud → device only",
  JSON.stringify(plan("on-device", false, true).attempts) === '["device"]'
);
check(
  "cloud pref + cloud configured → cloud first",
  JSON.stringify(plan("spark-cloud", true, true).attempts) === '["cloud","device"]'
);
check(
  "cloud pref + NO cloud configured + device ready → device attempted (no silent floor)",
  JSON.stringify(plan("spark-cloud", false, true).attempts) === '["device"]' &&
    plan("spark-cloud", false, true).raiseBrainAsk === false
);
check(
  "nothing real available (default pref) → no attempts, brain ask raised",
  plan("on-device", false, false).attempts.length === 0 &&
    plan("on-device", false, false).raiseBrainAsk === true
);
check(
  "nothing real available (cloud pref) → no attempts, brain ask raised",
  plan("spark-cloud", false, false).attempts.length === 0 &&
    plan("spark-cloud", false, false).raiseBrainAsk === true
);
check(
  "useGhostPeer follows the plan (not the raw tier preference)",
  hookSrc.includes("planUtteranceTiers({") &&
    hookSrc.includes("for (const attempt of plan.attempts)") &&
    hookSrc.includes("if (plan.raiseBrainAsk) noteBrainWanted();")
);
check(
  "the floor's brain line admits the table answered",
  hookSrc.includes("no model connected — the table answered") &&
    hookSrc.includes("the model passed — the table answered")
);

console.log(`\nunderstands-check: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
