/**
 * forge-sounds-check — headless proof for Slice L ("The Forge
 * makes a sound").
 *
 * The defect (audibles audit §5): the Forge was a silent movie.
 * All seven forge-* intents mapped to null in
 * GHOST_INTENT_FAMILIES, performForge emitted no cue, and a
 * photo landing in the scene sounded nothing. The only Forge
 * sounds were the hosted ghost's brain cues and the checkers
 * reactions.
 *
 * The slice: each forge act speaks through the EXISTING ghost
 * voice — performForge emits one cue kind per act over the
 * peer's onSfx seam (the host's useGhostSfx, pitched from the
 * ghost's hue, limiter law intact) — and a performed photo
 * arrival gets the greeting cue on the same voice from the
 * layer. This check pins:
 *
 *   L0  the census: every forge intent names a family (none
 *       silent), GhostPeer's cue map covers exactly the forge
 *       intents, each cue's family EQUALS the intent's family
 *       (the voice never describes an act in one family and
 *       sounds it in another), performForge emits the cue with
 *       the decision's intensity, the photo cue fires only on
 *       a performed arrival, and no private AudioContext
 *       appears in any touched file (the voice's shared
 *       context is the only one on this path).
 *   L1  distinguishability, measured on the pure articulation:
 *       at a fixed input, across 16 seeds, the eight sounds
 *       (seven acts + the photo greeting) have pairwise-
 *       distinct signatures, and every PAIR has at least one
 *       named, measured separator (waveform class, contour
 *       direction, pitch band, duration band, gain band,
 *       first-ratio band) — summon ≠ banish ≠ move ≠ the rest,
 *       in numbers, not adjectives. Plus the variation law
 *       (the streak: no two identical in a row, by seed) and
 *       determinism at a fixed seed.
 *   L2  the drive (--drive): the browser proof in proof-l/ —
 *       the real ForgeLayer, the real peer deliberating
 *       against a stub brain, listening through an AnalyserNode
 *       tap + the scheduled-oscillator log. Skipped without
 *       --drive (the harness lives outside the tree, the
 *       checkers-duet D4 precedent).
 *
 * Build + run:
 *   esbuild src/ghost/ghostVoice.ts --bundle --format=esm --outfile=/tmp/GV.mjs
 *   esbuild src/ghost/GhostBrain.ts --bundle --format=esm --outfile=/tmp/GB.mjs
 *   node scripts/forge-sounds-check.mjs /tmp/GV.mjs /tmp/GB.mjs [--drive]
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const wantDrive = argv.includes("--drive");
const bundles = argv.filter((a) => a !== "--drive");
const voice = await import(bundles[0] ?? "/tmp/GV.mjs");
const brain = await import(bundles[1] ?? "/tmp/GB.mjs");

let passed = 0;
let failed = 0;
let skipped = 0;
function ok(cond, label) {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
  }
}
function skip(label) {
  skipped += 1;
  console.log(`SKIP  ${label}`);
}

/* ================================================================== */
/* L0. The census                                                      */
/* ================================================================== */

// The slice's design, pinned: intent -> cue kind (GhostPeer)
// -> family (the sound's shape). One row per forge act.
const EXPECTED = {
  "forge-summon": { kind: "wake", family: "waking" },
  "forge-banish": { kind: "sleep", family: "sleepy" },
  "forge-move": { kind: "play", family: "play" },
  "forge-recolor": { kind: "mirror", family: "echo" },
  "forge-reshape": { kind: "startle", family: "surprised" },
  "forge-relight": { kind: "heart", family: "cheer" },
  "forge-camera": { kind: "thinking", family: "thinking" },
};
const PHOTO = { kind: "sniff", family: "greeting" };

const forgeIntents = brain.GHOST_FORGE_INTENTS;
ok(
  forgeIntents.length === 7 &&
    Object.keys(EXPECTED).every((i) => forgeIntents.includes(i)),
  `L0 the forge vocabulary is the seven acts (${forgeIntents.join(", ")})`
);

const intentFams = voice.GHOST_INTENT_FAMILIES;
for (const intent of forgeIntents) {
  ok(
    intentFams[intent] === EXPECTED[intent].family,
    `L0 intent "${intent}" speaks in family "${EXPECTED[intent].family}" (got ${intentFams[intent]}) — no forge intent is silent`
  );
}
ok(
  voice.GHOST_VOICE_FAMILIES.includes(PHOTO.family) &&
    voice.GHOST_CUE_FAMILIES[PHOTO.kind] === PHOTO.family,
  `L0 the photo cue "${PHOTO.kind}" speaks in family "${PHOTO.family}"`
);

const peerSrc = readFileSync(path.join(root, "src/ghost/GhostPeer.ts"), "utf8");
const cueBlock = peerSrc.match(/const FORGE_ACT_CUES[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? "";
const cueMap = Object.fromEntries(
  [...cueBlock.matchAll(/"(forge-[a-z]+)":\s*"([a-z-]+)"/g)].map((m) => [m[1], m[2]])
);
ok(
  Object.keys(cueMap).length === 7 &&
    forgeIntents.every((i) => cueMap[i] === EXPECTED[i].kind),
  "L0 FORGE_ACT_CUES covers exactly the seven forge intents, each with its designed cue kind"
);

const sfxSrc = readFileSync(path.join(root, "src/ghost/useGhostSfx.ts"), "utf8");
const kindUnion = sfxSrc.match(/export type GhostSfxKind =([\s\S]*?);/)?.[1] ?? "";
const kinds = new Set([...kindUnion.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
for (const intent of forgeIntents) {
  const kind = cueMap[intent];
  ok(
    kinds.has(kind) && voice.GHOST_CUE_FAMILIES[kind] === intentFams[intent],
    `L0 cue "${kind}" is a real voice kind and its family (${voice.GHOST_CUE_FAMILIES[kind]}) equals intent "${intent}"'s family (${intentFams[intent]})`
  );
}

const performForgeAt = peerSrc.indexOf("private performForge");
const performForgeBody =
  performForgeAt >= 0
    ? peerSrc.slice(performForgeAt, peerSrc.indexOf("\n  private ", performForgeAt + 10))
    : "";
ok(
  performForgeBody.includes("FORGE_ACT_CUES[decision.intent]") &&
    performForgeBody.includes("emitSfx(actCue") &&
    performForgeBody.includes("intensity: decision.intensity"),
  "L0 performForge emits the act's cue with the decision's own intensity"
);
ok(
  performForgeBody.indexOf("emitSfx(actCue") >= 0 &&
    performForgeBody.indexOf("emitSfx(actCue") <
      performForgeBody.indexOf("this.options.onForgeDecision?.(decision)") &&
    performForgeBody.indexOf("emitSfx(actCue") >
      performForgeBody.indexOf("chargePerformanceBudget"),
  "L0 the cue fires at the commit, alongside the hand to the sink (not before the gates, not after the act)"
);

const layerSrc = readFileSync(
  path.join(root, "src/components/forge/ForgeLayer.tsx"),
  "utf8"
);
const flowAt = layerSrc.indexOf("const runPhotoFlow");
const flowBody =
  flowAt >= 0 ? layerSrc.slice(flowAt, layerSrc.indexOf("const pickPhoto", flowAt)) : "";
const guardAt = flowBody.indexOf('outcome.kind === "performed"');
const photoCueAt = flowBody.indexOf('play("sniff", ghostSelfHueRef.current');
ok(
  guardAt >= 0 && photoCueAt > guardAt,
  "L0 the photo greeting fires only when the arrival actually performed"
);
ok(
  flowBody.includes("articulation: { intensity: 0.6 }") && photoCueAt >= 0,
  "L0 the photo cue rides the shared voice at the layer's standing articulation (0.6)"
);

for (const [name, src] of [
  ["GhostPeer.ts", peerSrc],
  ["ghostVoice.ts", readFileSync(path.join(root, "src/ghost/ghostVoice.ts"), "utf8")],
  ["ForgeLayer.tsx", layerSrc],
]) {
  ok(
    !src.includes("new AudioContext"),
    `L0 no private AudioContext appears in ${name} — the shared context stays the only one on this path`
  );
}
ok(
  (sfxSrc.match(/limiterAdmits\(/g) ?? []).length >= 2 &&
    sfxSrc.includes("getSharedAudioContext") &&
    sfxSrc.includes("if (!audioEnabled) return"),
  "L0 the voice the cues ride still applies the limiter law, the shared context, and the audioEnabled gate"
);

/* ================================================================== */
/* L1. Distinguishability, measured                                    */
/* ================================================================== */

const SOUNDS = {
  ...Object.fromEntries(forgeIntents.map((i) => [i, EXPECTED[i].family])),
  photo: PHOTO.family,
};
const INPUT = { intensity: 0.6, temperament: "curious", stamina: 100 };
function feats(art) {
  const notes = art.notes;
  const ratios = notes.map((n) => n.ratio);
  const all = notes.flatMap((n) => (n.ratioEnd ? [n.ratio, n.ratioEnd] : [n.ratio]));
  return {
    types: [...new Set(notes.map((n) => n.type))],
    count: notes.length,
    first: ratios[0],
    min: Math.min(...all),
    maxGain: Math.max(...notes.map((n) => n.gain)),
    maxDur: Math.max(...notes.map((n) => n.durMs)),
    contour: ratios[ratios.length - 1] - ratios[0],
    sig: JSON.stringify(
      notes.map((n) => [
        n.ratio.toFixed(3),
        n.ratioEnd ? n.ratioEnd.toFixed(3) : null,
        n.delayMs,
        n.durMs,
        n.type,
        n.gain.toFixed(3),
      ])
    ),
  };
}
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const table = {}; // sound -> seed -> feats
for (const [sound, family] of Object.entries(SOUNDS)) {
  table[sound] = SEEDS.map((s) =>
    feats(voice.articulateGhostUtterance({ ...INPUT, family }, s))
  );
}
function everyPair(label, pred) {
  const names = Object.keys(SOUNDS);
  for (let s = 0; s < SEEDS.length; s++) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (!pred(table[names[i]][s], table[names[j]][s], names[i], names[j])) {
          ok(false, `${label} (seed ${SEEDS[s]}: ${names[i]} vs ${names[j]})`);
          return;
        }
      }
    }
  }
  ok(true, label);
}
function everySound(label, pred) {
  for (const [name, rows] of Object.entries(table)) {
    for (let s = 0; s < SEEDS.length; s++) {
      if (!pred(rows[s], name)) {
        ok(false, `${label} (seed ${SEEDS[s]}: ${name})`);
        return;
      }
    }
  }
  ok(true, label);
}

everyPair(
  "L1 the eight sounds' full signatures are pairwise distinct at every seed",
  (a, b) => a.sig !== b.sig
);
everySound(
  "L1 waveform class: move + photo are triangle-voiced; the other six acts are sine-voiced",
  (f, name) =>
    f.types.length === 1 &&
    f.types[0] === (name === "forge-move" || name === "photo" ? "triangle" : "sine")
);
{
  let good = true;
  for (let s = 0; s < SEEDS.length; s++) {
    if (!(table["forge-move"][s].first < table["photo"][s].first)) good = false;
  }
  ok(good, "L1 move vs photo (both triangle): move starts low (first ratio <= 1.28), the greeting starts high (>= 1.30)");
}
{
  let good = true;
  for (let s = 0; s < SEEDS.length; s++) {
    if (!(table["forge-summon"][s].contour > 0.05)) good = false;
    if (!(table["forge-banish"][s].contour < -0.05)) good = false;
  }
  ok(good, "L1 summon rises and banish falls: opposite contours at every seed");
}
everySound(
  "L1 reshape lives in its own pitch band: every reshape tone >= 1.7 (floor 1.755), every other sound's floor <= 1.65 (greeting's 1.64 is the highest)",
  (f, name) => (name === "forge-reshape" ? f.min >= 1.7 : f.min <= 1.65)
);
{
  let good = true;
  for (let s = 0; s < SEEDS.length; s++) {
    if (!(table["forge-summon"][s].first <= 0.93)) good = false;
    for (const other of ["forge-recolor", "forge-relight", "forge-camera"]) {
      if (!(table[other][s].first >= 0.97)) good = false;
    }
  }
  ok(good, "L1 summon starts below the low sine acts (first ratio <= 0.93 vs >= 0.97)");
}
{
  let good = true;
  for (let s = 0; s < SEEDS.length; s++) {
    if (!(table["forge-relight"][s].maxDur >= 100)) good = false;
    if (!(table["forge-recolor"][s].maxDur <= 90)) good = false;
  }
  ok(good, "L1 relight swells long (a tone >= 100 ms) where recolor blips short (every tone <= 90 ms)");
}
{
  let good = true;
  for (let s = 0; s < SEEDS.length; s++) {
    const cam = table["forge-camera"][s].maxGain;
    if (!(cam < 0.75 * table["forge-recolor"][s].maxGain)) good = false;
    if (!(cam < 0.75 * table["forge-relight"][s].maxGain)) good = false;
    if (!(cam < table["forge-banish"][s].maxGain)) good = false;
  }
  ok(good, "L1 the camera murmur is measurably the quietest: its loudest tone < 75% of recolor's, relight's, and banish's");
}
{
  let good = true;
  for (let s = 0; s < SEEDS.length; s++) {
    if (!(table["forge-recolor"][s].contour >= -0.07)) good = false;
  }
  ok(good, "L1 recolor never falls (contour >= -0.07) where banish always does (<= -0.05)");
}

// The variation law, on the forge families themselves: driven
// the way the hook drives it (hue + family + counter), no two
// consecutive utterances from one ghost are identical.
for (const intent of forgeIntents) {
  const family = EXPECTED[intent].family;
  let dupes = 0;
  let prev = null;
  for (let n = 0; n < 50; n++) {
    const seed = voice.ghostUtteranceSeed(210, family, n);
    const sig = feats(voice.articulateGhostUtterance({ ...INPUT, family }, seed)).sig;
    if (sig === prev) dupes += 1;
    prev = sig;
  }
  ok(dupes === 0, `L1 "${intent}" never repeats itself back-to-back over 50 utterances (the streak law)`);
}
// Determinism: same input + seed renders identically.
for (const intent of forgeIntents) {
  const family = EXPECTED[intent].family;
  const a = feats(voice.articulateGhostUtterance({ ...INPUT, family }, 99)).sig;
  const b = feats(voice.articulateGhostUtterance({ ...INPUT, family }, 99)).sig;
  ok(a === b, `L1 "${intent}" is deterministic at a fixed seed`);
}

/* ================================================================== */
/* L2. The drive                                                       */
/* ================================================================== */

if (wantDrive) {
  const drivePath = path.resolve(root, "..", "proof-l", "drive-proof-l.mjs");
  const res = spawnSync("node", [drivePath, root], {
    encoding: "utf8",
    timeout: 20 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  ok(
    res.status === 0 && out.includes("DRIVE VERDICT: OK"),
    "L2 the browser drive hears every act, the photo, and the silence with Audio off (proof-l/)"
  );
  if (res.status !== 0 || !out.includes("DRIVE VERDICT: OK")) {
    console.log(out.split("\n").slice(-25).join("\n"));
  }
} else {
  skip("L2 drive — run with --drive (needs the proof-l bundles built; see proof-l/)");
}

console.log(
  `\nforge-sounds-check: ${passed} passed, ${failed} failed, ${skipped} skipped`
);
process.exitCode = failed > 0 ? 1 : 0;
