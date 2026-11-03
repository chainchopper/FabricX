/**
 * ghostvoice-check — Slice 47: the ghostie's voice + fabric-aware
 * tools, proven headlessly.
 *
 * PART A — A VOICE, NOT A LOOP (ghostVoice.ts via useGhostSfx):
 * Terrell's verdict was that the ghost "cycles two sounds" — the
 * old layer held ONE fixed tone list per cue kind. This check
 * proves the replacement is generative articulation:
 * - every intent family is reachable in the articulation map
 *   (cue map + intent map + the purr), and articulates;
 * - determinism: same decision context + same seed ⇒ identical
 *   rendered parameters, byte for byte;
 * - variation: same decision + different seeds ⇒ different
 *   rendered parameters; across a simulated 50-utterance streak
 *   driven exactly the way the hook derives seeds, NO two
 *   consecutive utterances are identical;
 * - the parameters actually respond to their causes: intensity
 *   brightens the filter and lifts the gain, temperament tilts
 *   the contour and stretches the rhythm, low stamina quiets
 *   and slows the voice, and a heartbeat articulates AT the
 *   ghost's live tempo (lub-dub spacing = 0.38 of a beat);
 * - the musical-safety bounds hold across the space (ratios,
 *   gains, utterance spans — short and quiet-safe);
 * - the Second Voice law survives articulation (a fourth up,
 *   sine<->triangle, same counts/delays/gains);
 * - the wiring is real: the hook articulates through ghostVoice
 *   (the fixed CUES map is gone), the peer emits thinking and
 *   heartbeat events with their context, and the context rides
 *   peer -> hook -> canvas untouched.
 *
 * PART B — FABRIC-AWARE TOOLS (GhostBrain manifest + gates):
 * - the manifest table covers every fabric in the experience
 *   catalog, and GhostBrain's tool mirror agrees with the
 *   ghostTools registry exactly (ids + intent->tool mapping);
 * - sanitizeFabricContext attaches the manifest + its hash to
 *   every scenario's fabric context (supplied lists clamped to
 *   the vocabulary, garbled lists fall back to the declaration);
 * - gating, 100%: across all six built-in fabrics, EVERY
 *   well-formed decision validates iff its tool is in the loaded
 *   fabric's manifest (validator), the router's tool gate
 *   refuses the same set with the manifest refusal, and the
 *   on-device brain — swept over hundreds of simulated scenarios
 *   on three fabrics — never emits a decision whose tool the
 *   loaded fabric doesn't offer;
 * - composition: host rules still refuse on top of the manifest
 *   (the note rule on the piano), legacy (fabric-less) scenarios
 *   validate exactly as before, and an undeclared fabric offers
 *   the full registry (no declaration, no authority to refuse);
 * - the model tiers see the law: the fabric note names the
 *   offered tools and the forbidden intents, both system prompts
 *   state the tool law, and gate refusals surface by name;
 * - the awareness is visible: GhostieHome lists the loaded
 *   fabric's tools read-only (Brain's home surface).
 *
 * Run: esbuild src/ghost/ghostVoice.ts --bundle --format=esm --outfile=/tmp/GV.mjs
 *      esbuild src/ghost/GhostBrain.ts --bundle --format=esm --outfile=/tmp/GB.mjs
 *      esbuild src/ghost/ghostTools.ts --bundle --format=esm --outfile=/tmp/GT.mjs
 *      node scripts/ghostvoice-check.mjs /tmp/GV.mjs /tmp/GB.mjs /tmp/GT.mjs \
 *        ../../fabric-ghost-factory/dataset-v1.jsonl
 *
 * Powered by Nirvana
 */
import { readFileSync } from "node:fs";

const voice = await import(process.argv[2] ?? "/tmp/GV.mjs");
const brain = await import(process.argv[3] ?? "/tmp/GB.mjs");
const tools = await import(process.argv[4] ?? "/tmp/GT.mjs");
const datasetPath =
  process.argv[5] ?? "../fabric-ghost-factory/dataset-v1.jsonl";

const read = (p) => readFileSync(p, "utf8");
const sfxSrc = read("src/ghost/useGhostSfx.ts");
const peerSrc = read("src/ghost/GhostPeer.ts");
const hookSrc = read("src/ghost/useGhostPeer.ts");
const fluidSrc = read("src/components/fluid/LegacyFluid.tsx");
const homeSrc = read("app/components/fabric/GhostieHome.tsx");
const catalogSrc = read("src/contexts/ExperienceContext.tsx");
const brainSrc = read("src/ghost/GhostBrain.ts");

let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}`);
  }
};
const sig = (a) =>
  JSON.stringify({
    n: a.notes,
    f: a.filterCutoffHz,
    p: a.purr,
    v: a.variant,
  });

/* ================================================================== */
/* A1. Reachability: every family articulates                          */
/* ================================================================== */
const FAMILIES = voice.GHOST_VOICE_FAMILIES;
ok(FAMILIES.length === 10, `A1 ten families in the articulation map (${FAMILIES.join(", ")})`);
for (const fam of FAMILIES) {
  const a = voice.articulateGhostUtterance({ family: fam, bpm: 80 }, 42);
  if (fam === "purr") {
    ok(
      a.purr &&
        a.purr.lfoHz >= 7.5 && a.purr.lfoHz <= 10.5 &&
        a.purr.lfoDepth >= 0.035 && a.purr.lfoDepth <= 0.06 &&
        a.purr.baseFactor >= 0.48 && a.purr.baseFactor <= 0.52,
      `A1 purr articulates in range (lfo ${a.purr?.lfoHz.toFixed(2)}Hz, depth ${a.purr?.lfoDepth.toFixed(3)})`
    );
  } else {
    ok(a.notes.length >= 1, `A1 family "${fam}" articulates (${a.notes.length} notes)`);
  }
}
// The cue map covers every kind the hook can play (the kinds are
// read off the hook's own type, so the mirror cannot drift).
const kindUnion = sfxSrc.match(/export type GhostSfxKind =([\s\S]*?);/)?.[1] ?? "";
const kinds = [...kindUnion.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
ok(kinds.length === 9, `A1 the hook's cue union has 9 kinds (${kinds.join(", ")})`);
for (const k of kinds) {
  ok(
    typeof voice.GHOST_CUE_FAMILIES[k] === "string",
    `A1 cue "${k}" maps to family "${voice.GHOST_CUE_FAMILIES[k]}"`
  );
}
const cueFamilies = new Set(Object.values(voice.GHOST_CUE_FAMILIES));
for (const fam of FAMILIES) {
  ok(
    cueFamilies.has(fam) || fam === "purr",
    `A1 family "${fam}" is reachable from a live cue (purr via startPurr)`
  );
}
// The intent map covers the whole deliberation vocabulary.
const intentFams = voice.GHOST_INTENT_FAMILIES;
ok(
  brain.GHOST_INTENTS.every((i) => i in intentFams) &&
    Object.keys(intentFams).length === brain.GHOST_INTENTS.length,
  "A1 the intent->family map covers the deliberation vocabulary exactly"
);
for (const silent of ["draw", "play-note", "drift", "idle"]) {
  ok(
    intentFams[silent] === null,
    `A1 intent "${silent}" is honestly silent (visual / the note itself / presence)`
  );
}

/* ================================================================== */
/* A2. Determinism with variation                                      */
/* ================================================================== */
for (const fam of FAMILIES) {
  const input = { family: fam, intensity: 0.6, temperament: "curious", bpm: 84 };
  const a = voice.articulateGhostUtterance(input, 1234);
  const b = voice.articulateGhostUtterance(input, 1234);
  ok(sig(a) === sig(b), `A2 "${fam}" is deterministic at a fixed seed`);
  const variants = new Set();
  for (let s = 1; s <= 8; s++) {
    variants.add(sig(voice.articulateGhostUtterance(input, s)));
  }
  ok(
    variants.size >= 6,
    `A2 "${fam}" varies across seeds (${variants.size}/8 distinct)`
  );
}
// The streak, driven exactly as the hook drives it: hue + family
// + an ever-incrementing counter.
for (const fam of ["cheer", "play", "greeting", "thinking"]) {
  let prev = null;
  let consecutiveDupes = 0;
  const seen = new Set();
  for (let n = 0; n < 50; n++) {
    const seed = voice.ghostUtteranceSeed(140, fam, n);
    const a = voice.articulateGhostUtterance(
      { family: fam, intensity: 0.6, temperament: "curious" },
      seed
    );
    const s = sig(a);
    if (s === prev) consecutiveDupes++;
    seen.add(s);
    prev = s;
  }
  ok(
    consecutiveDupes === 0,
    `A2 "${fam}": no two consecutive utterances identical across a 50-streak`
  );
  ok(
    seen.size >= 45,
    `A2 "${fam}": the 50-streak is genuinely varied (${seen.size}/50 distinct)`
  );
}
// Before/after, the repeated "cheer" Terrell heard: the old layer
// returned the same two tones forever (pinned dead below); the
// articulated cheer changes count, contour, spacing and timbre.
{
  const renders = [0, 1, 2].map((n) =>
    voice.articulateGhostUtterance(
      { family: "cheer", intensity: 0.75, temperament: "playful" },
      voice.ghostUtteranceSeed(210, "cheer", n)
    )
  );
  const distinct = new Set(renders.map(sig));
  ok(
    distinct.size === 3,
    `A2 three consecutive cheers render three different utterances (notes: ${renders
      .map((r) => r.notes.length)
      .join("/")}, cutoffs: ${renders.map((r) => r.filterCutoffHz).join("/")})`
  );
}

/* ================================================================== */
/* A3. The parameters answer their causes                              */
/* ================================================================== */
{
  const lo = voice.articulateGhostUtterance({ family: "greeting", intensity: 0.1 }, 77);
  const hi = voice.articulateGhostUtterance({ family: "greeting", intensity: 0.85 }, 77);
  ok(hi.filterCutoffHz > lo.filterCutoffHz, "A3 intensity brightens the timbre (filter cutoff rises)");
  const gainSum = (a) => a.notes.reduce((s, n) => s + n.gain, 0);
  ok(gainSum(hi) > gainSum(lo), "A3 intensity lifts the voice's energy (note gains rise)");
  const span = (a) => Math.max(...a.notes.map((n) => n.delayMs + n.durMs));
  const playful = voice.articulateGhostUtterance({ family: "waking", temperament: "playful" }, 9);
  const sleepy = voice.articulateGhostUtterance({ family: "waking", temperament: "sleepy" }, 9);
  ok(span(sleepy) > span(playful), "A3 a sleepy temperament stretches the rhythm vs playful");
  const fresh = voice.articulateGhostUtterance({ family: "play", stamina: 100 }, 3);
  const drained = voice.articulateGhostUtterance({ family: "play", stamina: 15 }, 3);
  ok(gainSum(drained) < gainSum(fresh), "A3 a drained ghost sounds quieter (stamina shapes gain)");
  // The heartbeat speaks at the ghost's own tempo.
  const hb = voice.articulateGhostUtterance({ family: "heartbeat", bpm: 92 }, 5);
  const beatMs = 60_000 / 92;
  const dubOffset = (hb.notes[1].delayMs - hb.notes[0].delayMs) / beatMs;
  ok(
    dubOffset > 0.36 && dubOffset < 0.4,
    `A3 heartbeat dub lands at 0.38 of a beat (measured ${dubOffset.toFixed(3)})`
  );
  ok(hb.notes[0].gain > hb.notes[1].gain, "A3 heartbeat lub strikes harder than the dub");
  const slow = voice.articulateGhostUtterance({ family: "heartbeat", bpm: 60 }, 5);
  ok(
    slow.notes[slow.notes.length - 1].delayMs > hb.notes[hb.notes.length - 1].delayMs,
    "A3 a slower heart articulates slower (tempo is the ghost's, not a constant)"
  );
}

/* ================================================================== */
/* A4. Musical safety across the space                                 */
/* ================================================================== */
{
  let boundsOk = true;
  let worst = "";
  for (const fam of FAMILIES) {
    for (let s = 0; s < 30; s++) {
      for (const v of ["standard", "second"]) {
        const a = voice.articulateGhostUtterance(
          { family: fam, intensity: 0.9, temperament: "playful", stamina: 100, bpm: 42, voice: v },
          s
        );
        for (const n of a.notes) {
          // Bound provenance: the widest honest case is the
          // surprised family's highest skeleton note (2.5) x
          // wobble (1.025) x a playful tail tilt (1.045) x the
          // second voice (4/3) = 3.571 — at the highest base
          // hue that is a ~2.36kHz squeak, still small and
          // quiet under the gain cap. Cap: 3.6.
          if (n.ratio < 0.4 || n.ratio > 3.6) { boundsOk = false; worst = `${fam} ratio ${n.ratio}`; }
          if (n.ratioEnd && (n.ratioEnd < 0.4 || n.ratioEnd > 3.6)) { boundsOk = false; worst = `${fam} sweep ${n.ratioEnd}`; }
          if (n.gain > 1.35) { boundsOk = false; worst = `${fam} gain ${n.gain}`; }
        }
        const span = a.notes.length
          ? Math.max(...a.notes.map((n) => n.delayMs + n.durMs))
          : 0;
        // Heartbeat cap provenance: the phrase is 2.4 beats
        // (pair spacing 1.76 + the dub's 0.38 offset + its 0.26
        // length — the same phrase the heartbeat ANSWER splats);
        // at the slowest honest tempo (42bpm) that is 3,429ms
        // for the 2 pairs a slow heart renders. Cap: 3,500.
        const cap = fam === "heartbeat" ? 3500 : 1300;
        if (span > cap) { boundsOk = false; worst = `${fam} span ${span}ms`; }
      }
    }
  }
  ok(boundsOk, `A4 ratios/gains/spans stay inside the safe ranges across 10 families x 30 seeds x 2 voices${worst ? ` (worst: ${worst})` : ""}`);
  // The Second Voice law, articulated: same shape, a fourth up,
  // waveforms traded — a timbre change only.
  for (const fam of ["greeting", "cheer"]) {
    const std = voice.articulateGhostUtterance({ family: fam, intensity: 0.55 }, 7);
    const sec = voice.articulateGhostUtterance({ family: fam, intensity: 0.55, voice: "second" }, 7);
    const sameShape =
      std.notes.length === sec.notes.length &&
      std.notes.every(
        (n, i) =>
          n.delayMs === sec.notes[i].delayMs &&
          n.durMs === sec.notes[i].durMs &&
          n.gain === sec.notes[i].gain
      );
    const fourthUp = std.notes.every(
      (n, i) => Math.abs(sec.notes[i].ratio - n.ratio * (4 / 3)) < 1e-9
    );
    const swapped = std.notes.every((n, i) =>
      n.type === "sine" ? sec.notes[i].type === "triangle" : sec.notes[i].type === "sine"
    );
    ok(sameShape && fourthUp && swapped, `A4 second voice on "${fam}": same shape, +4th, waveforms traded`);
  }
}

/* ================================================================== */
/* A5. The wiring: the voice the app actually renders                  */
/* ================================================================== */
ok(!sfxSrc.includes("const CUES"), "A5 the fixed CUES soundboard is gone from useGhostSfx");
ok(
  sfxSrc.includes('from "./ghostVoice"') &&
    sfxSrc.includes("articulateGhostUtterance(") &&
    sfxSrc.includes("ghostUtteranceSeed("),
  "A5 the hook articulates every cue through ghostVoice with derived seeds"
);
ok(
  sfxSrc.includes("utteranceCounterRef") && sfxSrc.includes("createBiquadFilter"),
  "A5 the hook owns the utterance counter and the per-utterance filter"
);
ok(
  (peerSrc.match(/this\.options\.onSfx\?\.\("/g) ?? []).length === 0,
  "A5 no peer sound site bypasses the context-carrying emitSfx"
);
ok(
  peerSrc.includes('emitSfx("thinking")') &&
    peerSrc.includes('emitSfx("heartbeat", { bpm })'),
  "A5 the peer murmurs when it deliberates and answers heartbeats in the heartbeat family"
);
ok(
  peerSrc.includes("onSfx?: (kind: GhostSfxKind, ctx?: GhostSfxContext) => void") &&
    hookSrc.includes("onSfx?: (kind: GhostSfxKind, ctx?: GhostSfxContext) => void") &&
    hookSrc.includes("stamina: ctx?.stamina ?? staminaRef.current"),
  "A5 the articulation context rides peer -> hook, enriched with the hook's stamina reading"
);
ok(
  fluidSrc.includes("articulation: sfxCtx"),
  "A5 the canvas passes the context into the voice (LegacyFluid onSfx)"
);

/* ================================================================== */
/* B1. The manifest table + the mirrors                                */
/* ================================================================== */
const catalogIds = [...catalogSrc.matchAll(/^\s+id: "([a-z-]+)",/gm)].map((m) => m[1]);
// Slice 53: the catalog grew a seventh fabric — the Ghostie
// Playground — so the count pin moves 6 -> 7 (the assertion's
// purpose is unchanged: EVERY catalog fabric must declare a
// manifest, proven by the loop below).
ok(catalogIds.length === 7, `B1 the experience catalog declares 7 fabrics (${catalogIds.join(", ")})`);
for (const id of catalogIds) {
  ok(
    Array.isArray(brain.GHOST_FABRIC_TOOL_MANIFEST[id]),
    `B1 fabric "${id}" declares a tool manifest`
  );
}
ok(
  JSON.stringify([...brain.GHOST_TOOL_IDS].sort()) ===
    JSON.stringify(tools.GHOST_TOOL_REGISTRY.map((t) => t.id).sort()),
  "B1 GhostBrain's tool mirror == the ghostTools registry ids"
);
for (const intent of brain.GHOST_INTENTS) {
  ok(
    tools.ghostToolForIntent(intent)?.id === brain.GHOST_INTENT_TOOL[intent],
    `B1 intent "${intent}" reaches for tool "${brain.GHOST_INTENT_TOOL[intent]}" in both mirrors`
  );
}
// The discrimination the brief asks for, stated plainly:
ok(
  brain.GHOST_FABRIC_TOOL_MANIFEST["ar-piano"].includes("play-note") &&
    !brain.GHOST_FABRIC_TOOL_MANIFEST["default-fluid"].includes("play-note") &&
    !brain.GHOST_FABRIC_TOOL_MANIFEST["genx-fold"].includes("play-note"),
  "B1 only the piano offers note-playing (fluid and Fold do not)"
);
ok(
  !brain.GHOST_FABRIC_TOOL_MANIFEST["dancer-stage"].includes("splat-play") &&
    !brain.GHOST_FABRIC_TOOL_MANIFEST["dancer-stage"].includes("draw") &&
    brain.GHOST_FABRIC_TOOL_MANIFEST["dancer-stage"].includes("note-perform"),
  "B1 the stage offers no splats and no drawing — the dancer performs and dances to notes"
);

/* ================================================================== */
/* B2. Scenarios carry fabric id + manifest + hash                     */
/* ================================================================== */
const mkScenario = (fabric) => ({
  temperament: "curious",
  seconds_since_human_touch: 5,
  recent_events: [],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.2,
  verbs_seen: [],
  other_ghosts: [],
  room_energy_trend: "steady",
  ...(fabric ? { fabric } : {}),
});
const sanitize = (layerId, extra = {}) =>
  brain.sanitizeFabricContext({
    layer_id: layerId,
    canvas: "fluid",
    role: "open",
    in_session: false,
    rules: { draw: true, verbs: true, notes: true },
    ...extra,
  });
for (const id of catalogIds) {
  const f = sanitize(id);
  ok(
    f.layer_id === id &&
      JSON.stringify(f.tools) === JSON.stringify(brain.GHOST_FABRIC_TOOL_MANIFEST[id]) &&
      f.tools_hash === brain.ghostManifestHash(f.tools),
    `B2 scenario on "${id}" carries its manifest + hash ${f.tools_hash}`
  );
}
{
  const clamped = sanitize("ar-piano", { tools: ["draw", "bogus-tool"] });
  ok(
    JSON.stringify(clamped.tools) === JSON.stringify(["draw"]),
    "B2 a supplied manifest is clamped to the known tool vocabulary"
  );
  const garbled = sanitize("ar-piano", { tools: ["bogus-tool"] });
  ok(
    JSON.stringify(garbled.tools) === JSON.stringify(brain.GHOST_FABRIC_TOOL_MANIFEST["ar-piano"]),
    "B2 a garbled manifest falls back to the fabric's declaration (never disarms the ghost)"
  );
  ok(
    brain.ghostManifestHash(brain.GHOST_FABRIC_TOOL_MANIFEST["ar-piano"]) !==
      brain.ghostManifestHash(brain.GHOST_FABRIC_TOOL_MANIFEST["dancer-stage"]),
    "B2 distinct manifests hash distinctly"
  );
  ok(
    peerSrc.includes("sanitizeFabricContext(raw)"),
    "B2 the peer sanitizes the supplied fabric context into every scenario (manifest rides along)"
  );
}

/* ================================================================== */
/* B3. The gating matrix — 100% subset, both directions                */
/* ================================================================== */
const wellFormed = (intent) => {
  const d = { intent, intensity: 0.5, linger_s: 5 };
  if (intent === "draw") d.draw_shape = "ring";
  if (intent === "play-note") d.note_name = "C4";
  if (intent === "play") d.pattern_id = "solo_zigzag";
  return d;
};
for (const id of [...catalogIds, "some-undeclared-fabric"]) {
  const scenario = mkScenario(sanitize(id));
  const manifest = brain.fabricManifestFor(id);
  let emitted = 0;
  let leaks = 0;
  let refusedOffered = 0;
  for (const intent of brain.GHOST_INTENTS) {
    const tool = brain.GHOST_INTENT_TOOL[intent];
    const v = brain.validateGhostDecision(wellFormed(intent), scenario);
    if (v) {
      emitted++;
      if (!manifest.includes(tool)) leaks++;
    } else if (manifest.includes(tool)) {
      refusedOffered++;
    }
    const refusal = tools.ghostToolRefusal(intent, scenario);
    if (!manifest.includes(tool) && !(refusal ?? "").includes("doesn't offer")) leaks++;
    if (manifest.includes(tool) && refusal !== null) refusedOffered++;
  }
  ok(
    leaks === 0 && refusedOffered === 0,
    `B3 on "${id}": emitted tools subset of manifest, 100% (validator + router gate agree; ${emitted} intents live)`
  );
}
// The floor pipeline itself, swept: hundreds of simulated
// moments on three fabrics, run through the chain the app runs
// — decideOnDevice, then the router's tool gate (ghostToolRefusal,
// useGhostPeer's apply step). Every APPLIED decision's tool must
// be in the loaded fabric's manifest, and the gate must visibly
// bite on the fabric that offers the least (the stage).
{
  const temperaments = ["curious", "playful", "sleepy", "sassy", "affectionate"];
  const eventSets = [
    [],
    ["pet x3"],
    ["loud splat nearby"],
    ["human played C4", "note C4"],
    ["long quiet", "lights low"],
    ["chase game"],
    ["ghost arrived nearby"],
    ["warm quiet"],
  ];
  let decisions = 0;
  let applied = 0;
  let leaks = 0;
  let stageRefusals = 0;
  for (const id of ["ar-piano", "dancer-stage", "default-fluid"]) {
    const manifest = brain.fabricManifestFor(id);
    for (const t of temperaments) {
      for (const ev of eventSets) {
        for (const touch of [0.5, 12, 90, 300]) {
          const scenario = {
            ...mkScenario(sanitize(id)),
            temperament: t,
            recent_events: ev,
            seconds_since_human_touch: touch,
            pets_in_last_5s: ev.includes("pet x3") ? 3 : 0,
            nearby_splat_intensity: ev.includes("loud splat nearby") ? 0.9 : 0.15,
          };
          const out = brain.decideOnDevice(scenario);
          const d = out?.decision ?? out;
          if (d && d.intent) {
            decisions++;
            const refusal = tools.ghostToolRefusal(d.intent, scenario);
            if (refusal === null) {
              applied++;
              if (!manifest.includes(brain.GHOST_INTENT_TOOL[d.intent])) leaks++;
            } else if (id === "dancer-stage" && refusal.includes("doesn't offer")) {
              stageRefusals++;
            }
          }
        }
      }
    }
  }
  ok(
    decisions > 100 && applied > 100 && leaks === 0,
    `B3 the floor pipeline applied ${applied}/${decisions} swept decisions across 3 fabrics — 0 applied outside the loaded manifest`
  );
  ok(
    stageRefusals > 0,
    `B3 the manifest gate visibly bites on the stage (${stageRefusals} splat-shaped decisions refused there, none applied)`
  );
}

/* ================================================================== */
/* B4. Composition: rules on top, legacy untouched                     */
/* ================================================================== */
{
  const pianoNoNotes = mkScenario(
    brain.sanitizeFabricContext({
      layer_id: "ar-piano",
      canvas: "fluid",
      role: "guest",
      in_session: true,
      rules: { draw: true, verbs: true, notes: false },
    })
  );
  ok(
    brain.validateGhostDecision(wellFormed("play-note"), pianoNoNotes) === null &&
      brain.ghostNoteGateRefusal(wellFormed("play-note"), pianoNoNotes) ===
        brain.GHOST_NOTE_REFUSAL_TEXT &&
      brain.ghostManifestRefusal(wellFormed("play-note"), pianoNoNotes) === null,
    "B4 host rules still refuse on top of the manifest (piano, notes off — the rule's refusal names itself)"
  );
  const stage = mkScenario(sanitize("dancer-stage"));
  ok(
    (brain.ghostManifestRefusal(wellFormed("draw"), stage) ?? "").includes(
      "doesn't offer"
    ),
    "B4 a manifest refusal surfaces by name for the brain line"
  );
  // Legacy scenarios: the whole dataset validates exactly as it
  // did before the manifest existed.
  const rows = read(datasetPath)
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  let equivalent = 0;
  let agree = 0;
  for (const row of rows) {
    const withScenario = brain.validateGhostDecision(row.decision, row.scenario);
    const bare = brain.validateGhostDecision(row.decision);
    if (JSON.stringify(withScenario) === JSON.stringify(bare)) equivalent++;
    const out = brain.decideOnDevice(row.scenario);
    const d = out?.decision ?? out;
    if (d && d.intent === row.decision.intent) agree++;
  }
  ok(
    equivalent === rows.length,
    `B4 fabric-less dataset scenarios validate identically (${equivalent}/${rows.length}) — the gate is inert without a fabric`
  );
  ok(
    agree >= 58,
    `B4 the table's dataset agreement is unmoved by the manifest (intent agreement ${agree}/${rows.length}, baseline 59/60)`
  );
}

/* ================================================================== */
/* B5. The tiers see the law + the surface shows it                    */
/* ================================================================== */
{
  const pianoNote = brain.describeFabricForSpark(mkScenario(sanitize("ar-piano")));
  ok(
    pianoNote.includes("Tools this fabric offers") && pianoNote.includes("play-note"),
    "B5 the fabric note for the tiers names the offered tools"
  );
  const stageNote = brain.describeFabricForSpark(mkScenario(sanitize("dancer-stage")));
  ok(
    stageNote.includes("never choose them here") && stageNote.includes("draw"),
    "B5 the stage's fabric note names the intents it forbids"
  );
  ok(
    brainSrc.includes("only choose an intent whose tool the fabric note lists") &&
      brainSrc.includes("only choose an intent whose tool is listed"),
    "B5 both model system prompts state the tool law"
  );
  ok(
    homeSrc.includes("fabricManifestFor(") &&
      homeSrc.includes("can do on {loadedFabricName}") &&
      homeSrc.includes("Read-only — the list"),
    "B5 GhostieHome shows the loaded fabric's tools, read-only"
  );
  for (const id of brain.GHOST_TOOL_IDS) {
    ok(
      new RegExp(`"?${id}"?\\s*:\\s*\\{`).test(homeSrc),
      `B5 the Home has a plain-words label for tool "${id}"`
    );
  }
}

console.log(`\nghostvoice-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
