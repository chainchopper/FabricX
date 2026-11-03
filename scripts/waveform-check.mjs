/**
 * waveform-check — Slice 52: the ghost's sound-craft arsenal
 * (waveform synthesis in the harness, the tools, and the schema),
 * proven headlessly.
 *
 * Terrell spoke "make some sounds" to the live ghost and got two
 * redundant sounds back: Slice 47's voice articulates a fixed
 * family shelf, and the ghost had no SYNTHESIS — no way to build
 * a sound it had never made. This slice adds the compose intent:
 * the brain authors a short sequence of waveform tones (sine,
 * square, triangle, sawtooth, noise — pitch contour, envelope,
 * onset, gain per note) and the voice renders exactly that.
 *
 * §A the decision schema: compose REQUIRES its sound_spec
 *     (draw/play-note discipline), the sanitizer clamps numbers
 *     and refuses categorical damage whole, a spec riding any
 *     other intent is dropped;
 * §B the manifest decides: the fluid and the ghostie's
 *     playground offer sound-craft; the piano, the stage, the
 *     Fold, See and camera-effects do not — the validator, the
 *     router's tool gate, and the refusal namer all agree, and
 *     an undeclared fabric still offers the full registry;
 * §C the rendering: waveform choice reaches the oscillator
 *     layer as the tone's own type (≥3 waveforms provably
 *     distinct in rendered parameters), the envelope the brain
 *     picked is the curve that renders, seed determinism +
 *     bounded micro-variation (the composition never changes:
 *     waveforms, envelopes, counts fixed; only grain jitters),
 *     safety bounds hold across the space, Second Voice holds;
 * §D the ask path: "make some sounds" reads as a sound-request,
 *     the floor answers with a composed multi-waveform decision
 *     on an offering fabric (and a DIFFERENT composition on a
 *     repeat), an alternate — never a composition — on a fabric
 *     that doesn't offer the tool, and standing utterance kinds
 *     are unmoved;
 * §E the wiring is real: the peer prices/paces/performs compose
 *     through its budget, the SFX hook renders composed cues
 *     (noise via a pitched bandpass over a shared buffer), the
 *     registry registers the tool, and GhostieHome names it.
 *
 * Run: esbuild src/ghost/ghostVoice.ts --bundle --format=esm --outfile=/tmp/GV.mjs
 *      esbuild src/ghost/GhostBrain.ts --bundle --format=esm --outfile=/tmp/GB.mjs
 *      esbuild src/ghost/ghostTools.ts --bundle --format=esm --outfile=/tmp/GT.mjs
 *      esbuild src/ghost/ghostSound.ts --bundle --format=esm --outfile=/tmp/GS.mjs
 *      node scripts/waveform-check.mjs /tmp/GV.mjs /tmp/GB.mjs /tmp/GT.mjs /tmp/GS.mjs
 *
 * Powered by Nirvana
 */
import { readFileSync } from "node:fs";

const voice = await import(process.argv[2] ?? "/tmp/GV.mjs");
const brain = await import(process.argv[3] ?? "/tmp/GB.mjs");
const tools = await import(process.argv[4] ?? "/tmp/GT.mjs");
const sound = await import(process.argv[5] ?? "/tmp/GS.mjs");

const read = (p) => readFileSync(p, "utf8");
const brainSrc = read("src/ghost/GhostBrain.ts");
const sfxSrc = read("src/ghost/useGhostSfx.ts");
const peerSrc = read("src/ghost/GhostPeer.ts");
const homeSrc = read("app/components/fabric/GhostieHome.tsx");

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

const mkScenario = (fabric, extra = {}) => ({
  temperament: "playful",
  seconds_since_human_touch: 5,
  recent_events: [],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.2,
  verbs_seen: [],
  other_ghosts: [],
  room_energy_trend: "steady",
  ghost_identity: { name: "Boop", hue: 210, seed_traits: ["bouncy", "giggly"] },
  ...(fabric ? { fabric } : {}),
  ...extra,
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

const SPEC = {
  notes: [
    { wave: "sine", ratio: 1.0, delay_ms: 0, dur_ms: 150, gain: 0.8, env: "soft" },
    { wave: "square", ratio: 1.25, delay_ms: 120, dur_ms: 120, gain: 0.7, env: "pluck" },
    { wave: "sawtooth", ratio: 1.5, ratio_end: 1.9, delay_ms: 240, dur_ms: 200, gain: 0.75, env: "swell" },
    { wave: "noise", ratio: 2.0, delay_ms: 430, dur_ms: 90, gain: 0.45, env: "pluck" },
  ],
};
const composeRaw = (spec = SPEC) => ({
  mood_shift: null,
  intent: "compose",
  pattern_id: null,
  draw_shape: null,
  note_name: null,
  sound_spec: spec,
  intensity: 0.6,
  linger_s: 4,
});

/* ================================================================== */
/* §A. The decision schema                                             */
/* ================================================================== */
{
  const fluid = mkScenario(sanitize("default-fluid"));
  const d = brain.validateGhostDecision(composeRaw(), fluid);
  ok(
    d && d.intent === "compose" && d.sound_spec && d.sound_spec.notes.length === 4,
    "A compose decision with a valid spec validates on the fluid"
  );
  ok(
    d && d.sound_spec.notes[2].ratio_end === 1.9 && d.sound_spec.notes[0].env === "soft",
    "A the spec survives validation intact (contour + envelope ride along)"
  );
  ok(
    brain.validateGhostDecision(composeRaw(null), fluid) === null &&
      brain.validateGhostDecision({ ...composeRaw(), sound_spec: undefined }, fluid) === null,
    "A a compose WITHOUT a spec is not a decision (draw/note discipline)"
  );
  const dropped = brain.validateGhostDecision(
    { ...composeRaw(), intent: "play", pattern_id: "solo_zigzag" },
    fluid
  );
  ok(
    dropped && dropped.intent === "play" && dropped.sound_spec === null,
    "A a sound_spec riding another intent is dropped, not fatal"
  );
  // The sanitizer: numbers clamp, categorical damage refuses whole.
  const clamped = brain.sanitizeGhostSoundSpec({
    notes: [{ wave: "sine", ratio: 99, delay_ms: -50, dur_ms: 9000, gain: 7 }],
  });
  ok(
    clamped &&
      clamped.notes[0].ratio === 3.5 &&
      clamped.notes[0].delay_ms === 0 &&
      clamped.notes[0].dur_ms === 1200 &&
      clamped.notes[0].gain === 1 &&
      clamped.notes[0].env === "soft",
    "A the sanitizer clamps out-of-range numbers and defaults the envelope"
  );
  ok(
    brain.sanitizeGhostSoundSpec({ notes: [] }) === null &&
      brain.sanitizeGhostSoundSpec({
        notes: Array.from({ length: 9 }, () => ({
          wave: "sine", ratio: 1, delay_ms: 0, dur_ms: 100, gain: 0.5,
        })),
      }) === null &&
      brain.sanitizeGhostSoundSpec({
        notes: [{ wave: "kazoo", ratio: 1, delay_ms: 0, dur_ms: 100, gain: 0.5 }],
      }) === null &&
      brain.sanitizeGhostSoundSpec({
        notes: [{ wave: "sine", ratio: "high", delay_ms: 0, dur_ms: 100, gain: 0.5 }],
      }) === null &&
      brain.sanitizeGhostSoundSpec({
        notes: [{ wave: "sine", ratio: 1, delay_ms: 0, dur_ms: 100, gain: 0.5, env: "wobbly" }],
      }) === null,
    "A categorical damage refuses the whole spec (empty, >8 notes, unknown wave, non-numeric, unknown env)"
  );
  const endClamped = brain.sanitizeGhostSoundSpec({
    notes: [{ wave: "sine", ratio: 1, delay_ms: 4700, dur_ms: 1200, gain: 0.5 }],
  });
  ok(
    endClamped && endClamped.notes[0].delay_ms + endClamped.notes[0].dur_ms <= 4800,
    "A the sequence end is clamped to the 4.8s composition bound"
  );
}

/* ================================================================== */
/* §B. The manifest decides                                            */
/* ================================================================== */
{
  ok(
    brain.GHOST_FABRIC_TOOL_MANIFEST["default-fluid"].includes("sound-craft") &&
      brain.GHOST_FABRIC_TOOL_MANIFEST["ghostie-playground"].includes("sound-craft"),
    "B the fluid and the ghostie's playground offer sound-craft"
  );
  for (const id of ["ar-piano", "dancer-stage", "genx-fold", "sam-see", "camera-effects"]) {
    ok(
      !brain.GHOST_FABRIC_TOOL_MANIFEST[id].includes("sound-craft"),
      `B "${id}" does not offer sound-craft`
    );
  }
  for (const id of ["ar-piano", "dancer-stage", "genx-fold", "sam-see", "camera-effects"]) {
    const s = mkScenario(sanitize(id));
    ok(
      brain.validateGhostDecision(composeRaw(), s) === null,
      `B the validator refuses compose on "${id}"`
    );
    ok(
      (tools.ghostToolRefusal("compose", s) ?? "").includes("sound-craft") &&
        (tools.ghostToolRefusal("compose", s) ?? "").includes(id),
      `B the router's tool gate names the refusal on "${id}"`
    );
    ok(
      (brain.ghostManifestRefusal(composeRaw(), s) ?? "").includes(
        `sound-craft on ${id}`
      ),
      `B the manifest refusal names itself on "${id}"`
    );
  }
  const stage = mkScenario(sanitize("dancer-stage"));
  ok(
    brain.ghostManifestRefusal(composeRaw({ notes: [] }), stage) === null,
    "B a MALFORMED compose is invalid on its own, not gate-refused (namer discipline)"
  );
  ok(
    brain.validateGhostDecision(composeRaw(), mkScenario(sanitize("ghostie-playground"))) !== null &&
      tools.ghostToolRefusal("compose", mkScenario(sanitize("ghostie-playground"))) === null,
    "B compose validates and routes clean on the playground"
  );
  ok(
    brain.validateGhostDecision(composeRaw(), mkScenario(null)) !== null,
    "B a legacy (fabric-less) scenario composes ungated, as before"
  );
  ok(
    brain.validateGhostDecision(composeRaw(), mkScenario(sanitize("some-new-fabric"))) !== null,
    "B an undeclared fabric offers the full registry incl. sound-craft (no declaration, no refusal)"
  );
  const supplied = sanitize("default-fluid", { tools: ["sound-craft", "bogus"] });
  ok(
    JSON.stringify(supplied.tools) === JSON.stringify(["sound-craft"]) &&
      brain.validateGhostDecision(composeRaw(), mkScenario(supplied)) !== null,
    "B a supplied manifest carrying sound-craft is clamped to the vocabulary and honored"
  );
  ok(
    tools.ghostToolForIntent("compose")?.id === "sound-craft" &&
      brain.GHOST_INTENT_TOOL.compose === "sound-craft",
    "B both mirrors map the compose intent to the sound-craft tool"
  );
}

/* ================================================================== */
/* §C. The rendering                                                   */
/* ================================================================== */
{
  const tones = sound.renderGhostSound(SPEC, 42);
  ok(
    tones.length === 4 &&
      tones.map((t) => t.type).join(",") === "sine,square,sawtooth,noise",
    "C waveform choice reaches the oscillator layer: each note renders AS its waveform"
  );
  const distinct = new Set(tones.map((t) => t.type));
  ok(distinct.size >= 3, `C ≥3 waveforms provably distinct in rendered parameters (${[...distinct].join(", ")})`);
  ok(
    tones[2].ratioEnd > tones[2].ratio,
    "C the pitch contour (ratio sweep) reaches the rendered tone"
  );
  ok(
    tones[0].env === "soft" && tones[1].env === "pluck" && tones[2].env === "swell",
    "C each note's envelope reaches the rendered tone"
  );
  const curves = ["soft", "pluck", "swell"].map((e) => sound.ghostEnvCurve(e));
  ok(
    curves[1].decay === "exponential" &&
      curves[0].attackFrac !== curves[2].attackFrac &&
      curves[1].attackFrac < curves[0].attackFrac,
    "C the three envelopes are three different gain curves (pluck decays exponentially, swell attacks slowest)"
  );
  // Determinism + bounded variation.
  const sig = (ts) => JSON.stringify(ts);
  ok(
    sig(sound.renderGhostSound(SPEC, 7)) === sig(sound.renderGhostSound(SPEC, 7)),
    "C same spec + same seed renders byte-identically"
  );
  let variationOk = true;
  let identityOk = true;
  for (let seed = 1; seed <= 40; seed++) {
    const a = sound.renderGhostSound(SPEC, seed);
    const b = sound.renderGhostSound(SPEC, seed + 1000);
    if (sig(a) === sig(b)) variationOk = false;
    if (
      a.map((t) => `${t.type}|${t.env}`).join(",") !==
      b.map((t) => `${t.type}|${t.env}`).join(",")
    ) {
      identityOk = false;
    }
  }
  ok(variationOk, "C a different seed renders a different grain (never a byte-identical replay)");
  ok(identityOk, "C across seeds the COMPOSITION never changes: waveforms, envelopes, counts fixed");
  // Safety bounds across the space.
  let boundsOk = true;
  for (let seed = 0; seed < 60; seed++) {
    for (const t of sound.renderGhostSound(SPEC, seed)) {
      if (t.ratio < 0.24 || t.ratio > 3.56) boundsOk = false;
      if (t.ratioEnd && (t.ratioEnd < 0.24 || t.ratioEnd > 3.56)) boundsOk = false;
      if (t.gain < 0.05 || t.gain > 1) boundsOk = false;
      if (t.delayMs + t.durMs > 4800) boundsOk = false;
      if (t.durMs < 30) boundsOk = false;
    }
  }
  ok(boundsOk, "C rendered tones stay inside the schema's safety bounds across 60 seeds");
  // Second Voice: a fourth up, sine<->triangle, the rest untouched.
  const second = sound.renderGhostSound(SPEC, 42, "second");
  ok(
    Math.abs(second[0].ratio / tones[0].ratio - 4 / 3) < 0.001 &&
      second[0].type === "triangle" &&
      second[1].type === "square" &&
      second[3].type === "noise",
    "C the Second Voice law holds for compositions (fourth up, sine->triangle, square/noise keep their wave)"
  );
}

/* ================================================================== */
/* §D. The ask path                                                    */
/* ================================================================== */
{
  ok(
    brain.parseUtteranceReading("make some sounds", "Boop").kind === "sound-request" &&
      brain.parseUtteranceReading("make a sound", "Boop").kind === "sound-request" &&
      brain.parseUtteranceReading("Boop, make some noise", "Boop").kind === "sound-request",
    "D 'make some sounds' class asks read as sound-requests"
  );
  ok(
    brain.parseUtteranceReading("it's cold in here", "Boop").kind === "ambience" &&
      brain.parseUtteranceReading("that sounds nice", "Boop").kind !== "sound-request" &&
      brain.parseUtteranceReading("hello, it's cold in here", "Boop").kind === "presence",
    "D standing utterance kinds are unmoved (the tight phrase map steals nothing)"
  );
  const ask = (layerId, repeats = 0, temperament = "playful") =>
    mkScenario(sanitize(layerId), {
      temperament,
      utterance: {
        text: "make some sounds",
        asr_confidence: 0.92,
        speaker: "primary",
        repeats,
      },
    });
  const first = brain.decideOnDevice(ask("default-fluid"));
  ok(
    first.decision.intent === "compose" && first.decision.sound_spec,
    `D the floor answers the ask with a composition on the fluid (rule ${first.ruleId})`
  );
  const waves = new Set(first.decision.sound_spec?.notes.map((n) => n.wave) ?? []);
  ok(
    waves.size >= 2,
    `D the floor's composition is multi-waveform (${[...waves].join(", ")}) — never one redundant sound`
  );
  const again = brain.decideOnDevice(ask("default-fluid", 1));
  ok(
    again.decision.intent === "compose" &&
      brain.ghostSoundSignature(again.decision.sound_spec) !==
        brain.ghostSoundSignature(first.decision.sound_spec),
    "D a repeat of the ask earns a DIFFERENT composition, by construction"
  );
  for (const t of ["curious", "sleepy", "sassy", "affectionate"]) {
    const d = brain.decideOnDevice(ask("ghostie-playground", 0, t));
    ok(
      d.decision.intent === "compose" && d.decision.sound_spec,
      `D the playground answers the ask with a composition for a ${t} ghost`
    );
  }
  for (const id of ["dancer-stage", "ar-piano"]) {
    const out = brain.decideUtteranceOutcome(ask(id));
    ok(
      out.kind === "decision" && out.decision.intent !== "compose",
      `D on "${id}" the same ask is answered another way — no composition the fabric can't hold`
    );
    ok(
      brain.validateGhostDecision(composeRaw(), ask(id)) === null,
      `D and a model tier's compose on "${id}" is refused outright`
    );
  }
}

/* ================================================================== */
/* §E. The wiring is real                                              */
/* ================================================================== */
{
  ok(
    peerSrc.includes('case "compose":') &&
      peerSrc.includes("performCompose") &&
      peerSrc.includes("chargePerformanceBudget(SOUND_BUDGET_COST)") &&
      peerSrc.includes("SOUND_MIN_INTERVAL_MS") &&
      peerSrc.includes('emitSfx("composed", { sound: spec })'),
    "E the peer performs compose through its budget + cooldown and hands the spec to the voice"
  );
  ok(
    sfxSrc.includes('"composed"') &&
      sfxSrc.includes("renderGhostSound(composedSpec, seed") &&
      sfxSrc.includes("noiseBufferFor(ctx)") &&
      sfxSrc.includes('bp.type = "bandpass"') &&
      sfxSrc.includes("ghostEnvCurve(spec.env)"),
    "E the hook renders composed cues: spec -> tones, noise via a pitched bandpass, envelopes scheduled"
  );
  ok(
    typeof voice.GHOST_CUE_FAMILIES.composed === "string" &&
      voice.GHOST_INTENT_FAMILIES.compose === null,
    "E the voice maps agree: composed has an honest fallback family; the compose intent itself is the composition"
  );
  ok(
    homeSrc.includes('"sound-craft": {') && homeSrc.includes("Composing sounds"),
    "E GhostieHome names sound-craft in plain words on the tools surface"
  );
  ok(
    brainSrc.includes('"compose"') && brainSrc.includes("sound_spec"),
    "E the brain's schema carries the compose intent + sound_spec field"
  );
}

console.log(`\nwaveform-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
