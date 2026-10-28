/**
 * ghostie-home-check — node unit check for Slice 20 ("Ghostie Home").
 *
 * Proves, headlessly:
 * - the fDNA module IS the Slice 9 card's life, unchanged: grids
 *   from src/identity/fdna.ts match a reference implementation of
 *   the original LifePacketCard algorithm step-for-step, per seed;
 * - the secure tag: stable per seed, well-formed, distinct across
 *   seeds, and never the seed itself in any plain encoding;
 * - the personality parser: exact axis steps per keyword, whole
 *   words only, honest emptiness for words it cannot act on;
 * - the personality bias: shy/bold flip approach only with company,
 *   energy/warmth scale inside the validator's ranges, mood never
 *   moves, an empty personality changes nothing, and a fuzz sweep
 *   of biased decisions always still validates;
 * - the on-device table is untouched: its intent agreement against
 *   the 60-pair ghost-factory dataset is re-measured and printed;
 * - the Spark consult carries the personality text as context;
 * - shared settings: legacy/missing/garbled records sanitize to
 *   the permissive defaults without throwing, and the layer-gate
 *   resolver's truth table holds;
 * - GhostPeer gates, live: remote pets refused when the primary
 *   turned them off (local pets still land; defaults still land),
 *   socialize off means no greeting approach and no sniff probes
 *   (perception still counts the other ghost), and flipping
 *   socialize off mid-approach stops the greeting cold.
 *
 * Run: esbuild src/identity/fdna.ts --bundle --format=esm --outfile=/tmp/fdna.mjs
 *      esbuild src/ghost/GhostBrain.ts --bundle --format=esm --outfile=/tmp/GhostBrain.mjs
 *      esbuild src/ghost/ghostShared.ts --bundle --format=esm --outfile=/tmp/ghostShared.mjs
 *      esbuild src/ghost/GhostPeer.ts --bundle --format=esm --outfile=/tmp/GhostPeer.mjs
 *      node scripts/ghostie-home-check.mjs /tmp/GhostBrain.mjs /tmp/GhostPeer.mjs \
 *        /tmp/fdna.mjs /tmp/ghostShared.mjs <path-to-dataset-v1.jsonl>
 */
import { readFileSync } from "node:fs";

const brain = await import(process.argv[2] ?? "/tmp/GhostBrain.mjs");
const peerMod = await import(process.argv[3] ?? "/tmp/GhostPeer.mjs");
const fdna = await import(process.argv[4] ?? "/tmp/fdna.mjs");
const shared = await import(process.argv[5] ?? "/tmp/ghostShared.mjs");
const datasetPath = process.argv[6];

const {
  decideOnDevice,
  validateGhostDecision,
  buildSparkMessages,
  consultSparkBrain,
  sanitizePersonalityText,
  parseGhostPersonality,
  applyPersonalityBias,
} = brain;
const { GhostPeer, ghostPeerIdFor } = peerMod;
const {
  FDNA_COLS,
  FDNA_ROWS,
  seedFdnaGrid,
  stepFdnaGrid,
  countLiveCells,
  deriveFdnaTag,
} = fdna;
const {
  DEFAULT_GHOST_SHARED_SETTINGS,
  sanitizeGhostSharedSettings,
  resolveGhostLayerEnabled,
} = shared;

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- fDNA: the card's life, unchanged ---------------- */
console.log("== fDNA grid equivalence (Slice 9 card algorithm) ==");
{
  // Reference: the ORIGINAL LifePacketCard.tsx logic, verbatim.
  const COLS = 18, ROWS = 12, FILL = 0.27;
  const refMulberry32 = (seed) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const refSeed = (seed) => {
    const rng = refMulberry32(seed);
    const g = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < g.length; i++) g[i] = rng() < FILL ? 1 : 0;
    return g;
  };
  const refStep = (grid) => {
    const next = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            n += grid[((y + dy + ROWS) % ROWS) * COLS + ((x + dx + COLS) % COLS)];
          }
        }
        const alive = grid[y * COLS + x] === 1;
        next[y * COLS + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
      }
    }
    return next;
  };
  check("dimensions match the card", FDNA_COLS === 18 && FDNA_ROWS === 12);
  let allSame = true;
  for (const seed of [0, 1, 42, 0xdeadbeef, 4294967295, 123456789]) {
    let a = seedFdnaGrid(seed);
    let b = refSeed(seed);
    for (let step = 0; step < 60; step++) {
      if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) allSame = false;
      a = stepFdnaGrid(a);
      b = refStep(b);
    }
    if (countLiveCells(a) < 0) allSame = false;
  }
  check("grids identical to the card's over 6 seeds × 60 steps", allSame);
}

/* ---------------- the secure tag ---------------- */
console.log("== fDNA secure tag ==");
{
  const TAG_RE = /^FBR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
  check("tag format", TAG_RE.test(deriveFdnaTag(123456789)), deriveFdnaTag(123456789));
  let stable = true;
  const t0 = deriveFdnaTag(987654321);
  for (let i = 0; i < 100; i++) if (deriveFdnaTag(987654321) !== t0) stable = false;
  check("same seed → same tag (100 calls)", stable);
  const seen = new Set();
  for (let s = 0; s < 5000; s++) seen.add(deriveFdnaTag(s));
  check("5000 seeds → (near-)unique tags", seen.size >= 4999, `${seen.size} unique`);
  let leaks = 0;
  for (const s of [0, 1, 42, 123456789, 4294967295]) {
    const tag = deriveFdnaTag(s);
    if (tag.includes(String(s)) || tag.includes(s.toString(16))) leaks += 1;
  }
  check("tag never embeds the seed (decimal or hex)", leaks === 0);
  check("adjacent seeds differ", deriveFdnaTag(1000) !== deriveFdnaTag(1001));
}

/* ---------------- personality parsing ---------------- */
console.log("== personality parser ==");
{
  const ph = parseGhostPersonality("Shy at first, bold with friends, loves rain sounds…");
  check("placeholder text: shy + bold cancel on approach", ph.approach === 0, JSON.stringify(ph));
  check("placeholder labels name exactly the words that counted",
    ph.labels.length === 2 && ph.labels.includes("shy") && ph.labels.includes("bold"));
  check("'loves rain sounds' honestly reads as nothing",
    parseGhostPersonality("loves rain sounds").labels.length === 0);
  check("shy → approach −1", parseGhostPersonality("shy").approach === -1);
  check("SHY (case) → approach −1", parseGhostPersonality("SHY").approach === -1);
  check("shyness is not shy (whole words)", parseGhostPersonality("shyness").approach === 0);
  check("calm + gentle → energy −2", parseGhostPersonality("calm, gentle").energy === -2);
  check("cuddly + loyal → warmth 2", parseGhostPersonality("cuddly and loyal").warmth === 2);
  check("axes clamp at ±2", parseGhostPersonality("bold brave outgoing social").approach === 2);
  check("empty/garbage input → empty traits, no throw",
    (() => { try {
      const a = parseGhostPersonality(undefined);
      const b = parseGhostPersonality(42);
      return a.labels.length === 0 && b.approach === 0;
    } catch { return false; } })());
  check("sanitizer caps at 280 chars", sanitizePersonalityText("x".repeat(500)).length === 280);
  check("sanitizer rejects non-strings", sanitizePersonalityText({}) === "");
}

/* ---------------- personality bias ---------------- */
console.log("== personality bias (on-device tier) ==");
{
  const company = {
    temperament: "curious", seconds_since_human_touch: 30, recent_events: [],
    pets_in_last_5s: 0, nearby_splat_intensity: 0.1, verbs_seen: [],
    other_ghosts: [{ ghost_id: "ghost:x", last_action: "drift", distance_band: "near" }],
    room_energy_trend: "steady",
    ghost_identity: { name: "Testy", hue: 200, seed_traits: [] },
  };
  const alone = { ...company, other_ghosts: [] };
  const sniff = { mood_shift: null, intent: "sniff", pattern_id: null, intensity: 0.5, linger_s: 4 };
  const shy = parseGhostPersonality("shy and timid");
  const bold = parseGhostPersonality("bold and adventurous");

  const shyOut = applyPersonalityBias(sniff, company, shy);
  check("shy + company + sniff → drift, steered and labeled",
    shyOut.decision.intent === "drift" && shyOut.steeredBy.length > 0);
  const shyAlone = applyPersonalityBias(sniff, alone, shy);
  check("shy + NO company + sniff → untouched (bias needs company)",
    shyAlone.decision.intent === "sniff" && shyAlone.steeredBy.length === 0);
  const drift = { mood_shift: null, intent: "drift", pattern_id: null, intensity: 0.4, linger_s: 5 };
  const boldOut = applyPersonalityBias(drift, company, bold);
  check("bold + company + drift → sniff", boldOut.decision.intent === "sniff");
  const none = applyPersonalityBias(sniff, company, parseGhostPersonality(""));
  check("empty personality → decision identical",
    JSON.stringify(none.decision) === JSON.stringify(sniff) && none.steeredBy.length === 0);

  const playful = parseGhostPersonality("playful and bouncy");
  const play = { mood_shift: null, intent: "play", pattern_id: "zoomie_loop", intensity: 0.5, linger_s: 6 };
  const playOut = applyPersonalityBias(play, alone, playful);
  check("playful energy scales play up (0.5→0.6, linger 6→6.9)",
    Math.abs(playOut.decision.intensity - 0.6) < 1e-9 &&
    Math.abs(playOut.decision.linger_s - 6.9) < 1e-9,
    JSON.stringify(playOut.decision));
  const calm = parseGhostPersonality("calm");
  const nap = { mood_shift: null, intent: "nap", pattern_id: null, intensity: 0.15, linger_s: 20 };
  check("calm stretches a nap (20→25)",
    Math.abs(applyPersonalityBias(nap, alone, calm).decision.linger_s - 25) < 1e-9);
  const warm = parseGhostPersonality("cuddly");
  const heart = { mood_shift: "affectionate", intent: "heart", pattern_id: null, intensity: 0.8, linger_s: 8 };
  const warmOut = applyPersonalityBias(heart, alone, warm);
  check("warmth scales heart; mood_shift passes through untouched",
    warmOut.decision.intensity > 0.8 && warmOut.decision.mood_shift === "affectionate");

  // Fuzz: biased decisions must always still validate, keep their
  // mood, and stay inside the intent vocabulary.
  const intents = ["mirror", "sniff", "startle", "drift", "play", "nap", "idle", "heart"];
  const texts = ["shy", "bold", "playful wild", "calm slow", "cuddly loving", "shy bold playful calm cuddly", ""];
  let fuzzOk = true;
  let rngState = 7;
  const rnd = () => { rngState = (Math.imul(rngState, 1103515245) + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
  for (let i = 0; i < 500; i++) {
    const d = {
      mood_shift: null,
      intent: intents[Math.floor(rnd() * intents.length)],
      pattern_id: null, intensity: 0.05 + rnd() * 0.85, linger_s: 0.5 + rnd() * 29,
    };
    if (d.intent === "play") d.pattern_id = "solo_zigzag";
    const sc = rnd() < 0.5 ? company : alone;
    const tr = parseGhostPersonality(texts[Math.floor(rnd() * texts.length)]);
    const out = applyPersonalityBias(d, sc, tr).decision;
    const v = validateGhostDecision(out);
    if (!v || v.mood_shift !== null || !intents.includes(v.intent)) fuzzOk = false;
    if (v && v.intent !== "play" && v.pattern_id !== null) fuzzOk = false;
  }
  check("fuzz: 500 biased decisions all validate, mood/vocab intact", fuzzOk);
}

/* ---------------- table untouched: dataset agreement ---------------- */
console.log("== on-device table agreement (re-measured) ==");
if (!datasetPath) {
  console.log("SKIP  no dataset path given (argv[6])");
} else {
  const lines = readFileSync(datasetPath, "utf8").trim().split("\n");
  let agree = 0;
  for (const line of lines) {
    const pair = JSON.parse(line);
    if (decideOnDevice(pair.scenario).decision.intent === pair.decision.intent) agree += 1;
  }
  check(`table intent agreement ${agree}/${lines.length}`, agree >= 58, `${agree}/${lines.length}`);
}

/* ---------------- Spark consult carries personality ---------------- */
console.log("== Spark tier personality context ==");
{
  const scenario = {
    temperament: "curious", seconds_since_human_touch: 12, recent_events: ["pet"],
    pets_in_last_5s: 1, nearby_splat_intensity: 0.3, verbs_seen: [],
    other_ghosts: [], room_energy_trend: "rising",
    ghost_identity: { name: "Testy", hue: 200, seed_traits: [] },
  };
  const withP = buildSparkMessages(scenario, "Shy at first, bold with friends");
  check("personality rides as a system note",
    withP.some((m) => m.role === "system" && m.content.includes("Shy at first, bold with friends")));
  const withoutP = buildSparkMessages(scenario);
  check("no personality → no personality note",
    !withoutP.some((m) => m.content.includes("describes its personality")));
  let captured = null;
  const decision = await consultSparkBrain(
    scenario,
    async (messages) => {
      captured = messages;
      return JSON.stringify({ mood_shift: null, intent: "drift", pattern_id: null, intensity: 0.4, linger_s: 5 });
    },
    6_000,
    "Shy at first"
  );
  check("consult passes personality through and validates the reply",
    decision?.intent === "drift" &&
    captured?.some((m) => m.content.includes("Shy at first")));
}

/* ---------------- shared settings: sanitize + resolver ---------------- */
console.log("== shared settings ==");
{
  const D = DEFAULT_GHOST_SHARED_SETTINGS;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check("defaults are all-on (the ghost as it always behaved)",
    D.socialize === true && D.acceptRemotePets === true && D.followHostFabric === true);
  let noThrow = true;
  let legacyOk = true;
  try {
    for (const bad of [undefined, null, 42, "junk", [], {}, { socialize: "yes" }]) {
      if (!eq(sanitizeGhostSharedSettings(bad), D)) legacyOk = false;
    }
  } catch { noThrow = false; }
  check("missing/legacy/garbled records → defaults, no throw", noThrow && legacyOk);
  check("a real false is honored per-key",
    eq(sanitizeGhostSharedSettings({ socialize: false }),
       { socialize: false, acceptRemotePets: true, followHostFabric: true }));
  check("full custom record round-trips",
    eq(sanitizeGhostSharedSettings({ socialize: false, acceptRemotePets: false, followHostFabric: false }),
       { socialize: false, acceptRemotePets: false, followHostFabric: false }));

  const table = [
    // stored, follow, arrived → expected
    [false, true, true, false], [false, false, false, false],
    [true, true, true, true], [true, true, false, true],
    [true, false, true, false], [true, false, false, true],
  ];
  check("layer-gate resolver truth table",
    table.every(([s, f, a, want]) =>
      resolveGhostLayerEnabled({ storedEnabled: s, followHostFabric: f, arrivedViaHost: a }) === want));
}

/* ---------------- GhostPeer gates, live ---------------- */
console.log("== GhostPeer shared-settings gates ==");
{
  const mkPeer = (sharedSettings) => {
    const emissions = [];
    const sfx = [];
    const peer = new GhostPeer({
      peerId: ghostPeerIdFor("me"),
      identity: { seed: 1234, hue: 200 },
      injectLocal: (i) => emissions.push(i),
      broadcast: () => {},
      onSfx: (k) => sfx.push(k),
      ghostName: "Testy",
    });
    if (sharedSettings) peer.setSharedSettings(sharedSettings);
    return { peer, emissions, sfx };
  };
  const stroke = (userId, x, y) => ({
    userId, position: { x, y }, force: { x: 0, y: 0 },
    pressure: 0.5, timestamp: Date.now(),
  });
  const ALL_ON = { socialize: true, acceptRemotePets: true, followHostFabric: true };

  // Pets: refused remotely when off; local always lands; default lands.
  {
    const { peer } = mkPeer({ ...ALL_ON, acceptRemotePets: false });
    peer.noteInteraction(stroke("human-b", 0.5, 0.42), "remote");
    peer.noteInteraction(stroke("human-b", 0.5, 0.42), "remote");
    peer.noteInteraction(stroke("human-b", 0.5, 0.42), "remote");
    check("remote pets refused when 'Accept pets from others' is off",
      peer.buildScenario().pets_in_last_5s === 0,
      `pets=${peer.buildScenario().pets_in_last_5s}`);
    peer.noteInteraction(stroke("human-a", 0.5, 0.42), "local");
    peer.noteInteraction(stroke("human-a", 0.5, 0.42), "local");
    check("the primary's own pets still land",
      peer.buildScenario().pets_in_last_5s >= 1,
      `pets=${peer.buildScenario().pets_in_last_5s}`);
    peer.destroy();
  }
  {
    const { peer } = mkPeer(null); // never told: defaults
    peer.noteInteraction(stroke("human-b", 0.5, 0.42), "remote");
    peer.noteInteraction(stroke("human-b", 0.5, 0.42), "remote");
    check("remote pets land under defaults",
      peer.buildScenario().pets_in_last_5s >= 1,
      `pets=${peer.buildScenario().pets_in_last_5s}`);
    peer.destroy();
  }

  // Socialize: greeting approach + sniff probes only when on.
  const TARGET = { x: 0.58, y: 0.48 };
  const nearTarget = (i) =>
    Math.hypot(i.position.x - TARGET.x, i.position.y - TARGET.y) < 0.04;
  const runSocial = async (settings, flipOffAfterSighting) => {
    const { peer, emissions, sfx } = mkPeer(settings);
    peer.setHumansPresent(true);
    peer.summon();
    peer.noteGhostSighting(stroke(ghostPeerIdFor("other"), TARGET.x, TARGET.y));
    const perceived = peer.buildScenario().other_ghosts.length;
    if (flipOffAfterSighting) {
      peer.setSharedSettings({ ...ALL_ON, socialize: false });
    }
    await sleep(1500);
    const result = {
      perceived,
      sniffed: sfx.includes("sniff"),
      probed: emissions.some(nearTarget),
    };
    peer.destroy();
    return result;
  };
  const on = await runSocial(ALL_ON, false);
  check("socialize ON: greeting sniffs + probes at the other ghost",
    on.sniffed && on.probed, JSON.stringify(on));
  const off = await runSocial({ ...ALL_ON, socialize: false }, false);
  check("socialize OFF: no greeting, no probes — but perception still counts the ghost",
    !off.sniffed && !off.probed && off.perceived === 1, JSON.stringify(off));
  const flipped = await runSocial(ALL_ON, true);
  check("socialize flipped OFF mid-approach: the greeting stops cold",
    !flipped.sniffed && !flipped.probed, JSON.stringify(flipped));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
