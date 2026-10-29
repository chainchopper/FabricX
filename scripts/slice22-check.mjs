/**
 * slice22-check — node unit check for Slice 22 ("ID Cards generalized").
 *
 * Proves, headlessly:
 * - the vitals derivations (ghostVitals.ts): a petted/active
 *   ghostie reads higher Health and Vigor than a long-quiet one;
 *   a heavy-activity ghostie reads lower Stamina, and recovers
 *   after rest presence; every value clamps to 0–100; every bar
 *   carries a one-line WHY; the fDNA vitality is deterministic;
 * - the stamina soft feedback (GhostBrain.applyStaminaBias):
 *   across a scenario battery, a drained reading measurably
 *   increases rest-intent selection vs a healthy reading, every
 *   biased decision still validates, the bias names itself in
 *   steeredBy, and a healthy reading changes nothing;
 * - the permissions store's pure core: missing/garbled state
 *   sanitizes to all-off/private without throwing; only real
 *   booleans are honored;
 * - the announce round-trip for ghostCard: permissions + vitals
 *   ride and clamp; the Personality text is IN the payload when
 *   public and provably ABSENT (string search) when private;
 *   a legacy announce (no ghostCard) builds card data with no
 *   ghostCard and NO fabricated vitals; the ghost's hue rides;
 * - structural wiring (source-level): the transport announces
 *   ghostCard via vitalsWire, the peer hook computes vitals and
 *   applies the stamina bias, the menu renders all three new
 *   overlays, the Home carries the permission controls, and the
 *   trading honesty line ships in the card copy.
 *
 * Run: esbuild src/ghost/ghostVitals.ts --bundle --format=esm --outfile=/tmp/vitals.mjs
 *      esbuild src/ghost/GhostBrain.ts --bundle --format=esm --outfile=/tmp/brain.mjs
 *      esbuild src/ghost/ghostPermissions.ts --bundle --format=esm --outfile=/tmp/perms.mjs
 *      esbuild src/identity/profile.ts --bundle --format=esm --outfile=/tmp/profile.mjs
 *      node scripts/slice22-check.mjs /tmp/vitals.mjs /tmp/brain.mjs /tmp/perms.mjs /tmp/profile.mjs
 * (run from the repo root so the structural reads resolve)
 */
import { readFileSync } from "node:fs";

const vitalsMod = await import(process.argv[2] ?? "/tmp/vitals.mjs");
const brainMod = await import(process.argv[3] ?? "/tmp/brain.mjs");
const permsMod = await import(process.argv[4] ?? "/tmp/perms.mjs");
const profileMod = await import(process.argv[5] ?? "/tmp/profile.mjs");

const { computeGhostVitals, fdnaVitality, vitalsWire } = vitalsMod;
const {
  applyStaminaBias,
  decideOnDevice,
  validateGhostDecision,
  GHOST_BRAIN_FEW_SHOT,
  GHOST_BRAIN_TEMPERAMENTS,
  STAMINA_TIRED_BELOW,
} = brainMod;
const { sanitizeGhostPermissions, DEFAULT_GHOST_PERMISSIONS } = permsMod;
const { buildAnnounceExtras, buildProfileCardData, sanitizePeerExtras } =
  profileMod;

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL: ${name}`);
  }
}
function section(name) {
  console.log(`\n== ${name} ==`);
}

/* ------------------------------------------------------------------ */
/* Vitals                                                              */
/* ------------------------------------------------------------------ */
section("vitals derivations");

const base = {
  ghostSeed: 123456789,
  bpm: 70,
  petsReceived30m: 0,
  verbsReceived30m: 0,
  secondsSinceHumanTouch: 60,
  emits10m: 0,
  deliberations30m: 0,
  restSeconds: 0,
};
const inRange = (v) =>
  [v.health, v.stamina, v.vigor].every(
    (n) => Number.isFinite(n) && n >= 0 && n <= 100
  );

const quiet = computeGhostVitals({
  ...base,
  bpm: 55,
  secondsSinceHumanTouch: 3600,
});
const petted = computeGhostVitals({
  ...base,
  bpm: 104,
  petsReceived30m: 12,
  verbsReceived30m: 8,
  secondsSinceHumanTouch: 30,
});
check("petted/active ghostie: Health above the long-quiet one", petted.health > quiet.health);
check("petted/active ghostie: Vigor above the long-quiet one", petted.vigor > quiet.vigor);
check("quiet + petted readings in 0..100", inRange(quiet) && inRange(petted));

const worked = computeGhostVitals({
  ...base,
  emits10m: 90,
  deliberations30m: 20,
  restSeconds: 0,
});
const rested = computeGhostVitals({
  ...base,
  emits10m: 90,
  deliberations30m: 20,
  restSeconds: 1800,
});
const idleGhost = computeGhostVitals(base);
check("heavy activity: Stamina below an idle ghostie", worked.stamina < idleGhost.stamina);
check("rest presence recovers Stamina", rested.stamina > worked.stamina);
check("worked + rested readings in 0..100", inRange(worked) && inRange(rested));

const extreme = computeGhostVitals({
  ghostSeed: -42,
  bpm: 400,
  petsReceived30m: 100000,
  verbsReceived30m: 100000,
  secondsSinceHumanTouch: 10_000_000,
  emits10m: 100000,
  deliberations30m: 100000,
  restSeconds: 10_000_000,
});
const zeroed = computeGhostVitals({
  ghostSeed: 7,
  bpm: 0,
  petsReceived30m: 0,
  verbsReceived30m: 0,
  secondsSinceHumanTouch: 0,
  emits10m: 0,
  deliberations30m: 0,
  restSeconds: 0,
});
check("extreme inputs clamp to 0..100", inRange(extreme));
check("zero inputs clamp to 0..100", inRange(zeroed));

for (const [label, v] of [
  ["quiet", quiet],
  ["petted", petted],
  ["worked", worked],
  ["rested", rested],
  ["extreme", extreme],
]) {
  check(
    `${label}: WHY strings present for all three bars`,
    [v.why.health, v.why.stamina, v.why.vigor].every(
      (s) => typeof s === "string" && s.length > 4
    )
  );
}
check(
  "fdnaVitality is deterministic",
  fdnaVitality(123456789) === fdnaVitality(123456789)
);
check(
  "fdnaVitality within 0..1",
  fdnaVitality(1) >= 0 && fdnaVitality(1) <= 1 && fdnaVitality(-9) >= 0 && fdnaVitality(-9) <= 1
);
const wire = vitalsWire({ health: 87.6, stamina: -3, vigor: 140.2 });
check(
  "vitalsWire rounds + clamps",
  wire.h === 88 && wire.s === 0 && wire.v === 100
);

/* ------------------------------------------------------------------ */
/* Stamina bias                                                        */
/* ------------------------------------------------------------------ */
section("stamina bias");

const REST = new Set(["nap", "idle"]);
function scenarioBattery() {
  const fromShots = GHOST_BRAIN_FEW_SHOT.map((s) => s.scenario);
  const grid = [];
  for (const temperament of GHOST_BRAIN_TEMPERAMENTS) {
    for (const touch of [5, 90, 900]) {
      for (const company of [0, 2]) {
        grid.push({
          temperament,
          seconds_since_human_touch: touch,
          recent_events: company ? ["ghost_arrived"] : ["splat"],
          pets_in_last_5s: temperament === "affectionate" ? 2 : 0,
          nearby_splat_intensity: 0.6,
          verbs_seen: ["heart"],
          other_ghosts: Array.from({ length: company }, (_, i) => ({
            name: `G${i}`,
            mood: "playful",
            last_action: "drift",
          })),
          room_energy_trend: "rising",
          ghost_identity: { name: "Test", hue: 200, seed_traits: [] },
        });
      }
    }
  }
  return [...fromShots, ...grid];
}

let neutralRest = 0;
let drainedRest = 0;
let total = 0;
let allValid = true;
let biasNamed = true;
let healthyUntouched = true;
for (const scenario of scenarioBattery()) {
  const { decision } = decideOnDevice(scenario);
  const healthy = applyStaminaBias(decision, 90);
  const drained = applyStaminaBias(decision, 10);
  const low = applyStaminaBias(decision, 30);
  total += 1;
  if (REST.has(healthy.decision.intent)) neutralRest += 1;
  if (REST.has(drained.decision.intent)) drainedRest += 1;
  for (const out of [healthy, drained, low]) {
    if (!validateGhostDecision(out.decision)) allValid = false;
    for (const note of out.steeredBy) {
      if (!note.includes("stamina")) biasNamed = false;
    }
  }
  if (JSON.stringify(healthy.decision) !== JSON.stringify(decision)) {
    healthyUntouched = false;
  }
  if (healthy.steeredBy.length !== 0) healthyUntouched = false;
}
check(`battery ran (${total} scenarios)`, total >= 30);
check(
  `drained stamina increases rest-intent selection (${drainedRest} > ${neutralRest})`,
  drainedRest > neutralRest
);
check("every biased decision still validates", allValid);
check("every stamina steer names stamina in the brain line", biasNamed);
check("a healthy reading (≥40) leaves decisions untouched", healthyUntouched);
check("STAMINA_TIRED_BELOW is 40", STAMINA_TIRED_BELOW === 40);
const startle = { mood_shift: null, intent: "startle", pattern_id: null, intensity: 0.8, linger_s: 2 };
check(
  "reflex intents pass through even when drained",
  applyStaminaBias(startle, 5).decision.intent === "startle"
);

/* ------------------------------------------------------------------ */
/* Permissions sanitize                                                */
/* ------------------------------------------------------------------ */
section("permissions defaults");

check(
  "defaults are all off/private",
  DEFAULT_GHOST_PERMISSIONS.shareable === false &&
    DEFAULT_GHOST_PERMISSIONS.tradeable === false &&
    DEFAULT_GHOST_PERMISSIONS.personalityPublic === false
);
for (const junk of [null, undefined, 42, "yes", [], { shareable: "true" }, { tradeable: 1 }]) {
  const s = sanitizeGhostPermissions(junk);
  check(
    `garbled state ${JSON.stringify(junk)} → all off, no throw`,
    s.shareable === false && s.tradeable === false && s.personalityPublic === false
  );
}
const partial = sanitizeGhostPermissions({ shareable: true });
check(
  "a real boolean is honored, the rest stay off",
  partial.shareable === true && partial.tradeable === false && partial.personalityPublic === false
);

/* ------------------------------------------------------------------ */
/* Announce round-trip                                                 */
/* ------------------------------------------------------------------ */
section("announce round-trip");

const SECRET_WORDS = "gentle gremlin energy";
function announceWith(personalityPublic) {
  return buildAnnounceExtras({
    ghostSeed: 987654321,
    identitySeed: 123123123,
    ghostName: "Boop",
    temperament: "playful",
    ghostHue: 271,
    badges: [],
    trail: null,
    ghostCard: {
      permissions: {
        shareable: true,
        tradeable: false,
        personalityPublic,
      },
      personality: SECRET_WORDS,
      vitals: { h: 140, s: 55.4, v: 73 },
    },
  });
}

const priv = announceWith(false);
check(
  "private: personality string is NOT in the payload",
  !JSON.stringify(priv).includes(SECRET_WORDS)
);
check(
  "private: posture still publishes (personalityPublic false)",
  priv.ghostCard?.personalityPublic === false && priv.ghostCard?.shareable === true
);
const privCard = buildProfileCardData({
  peerId: "p1",
  isSelf: false,
  name: "T",
  hue: 10,
  extras: sanitizePeerExtras(JSON.parse(JSON.stringify(priv))),
  fabricLine: "On Fluid",
  roleLine: "Guest",
});
check(
  "private: card data carries no personality text",
  privCard.ghostCard?.personality === null &&
    privCard.ghostCard?.personalityPublic === false
);
check(
  "vitals ride clamped (140 → 100) and rounded",
  privCard.ghostCard?.vitals?.h === 100 && privCard.ghostCard?.vitals?.s === 55
);
check(
  "ghost hue rides the announce into card data",
  privCard.ghost?.hue === 271
);

const pub = announceWith(true);
check(
  "public: personality string IS in the payload",
  JSON.stringify(pub).includes(SECRET_WORDS)
);
const pubCard = buildProfileCardData({
  peerId: "p1",
  isSelf: false,
  name: "T",
  hue: 10,
  extras: sanitizePeerExtras(JSON.parse(JSON.stringify(pub))),
  fabricLine: "On Fluid",
  roleLine: "Guest",
});
check(
  "public: card data shows the words",
  pubCard.ghostCard?.personality === SECRET_WORDS
);

const legacy = buildAnnounceExtras({
  ghostSeed: 987654321,
  identitySeed: 123123123,
  ghostName: "Boop",
  temperament: "playful",
  badges: [],
  trail: null,
});
check("legacy announce has no ghostCard", legacy.ghostCard === undefined);
const legacyCard = buildProfileCardData({
  peerId: "p2",
  isSelf: false,
  name: "T",
  hue: 10,
  extras: sanitizePeerExtras(JSON.parse(JSON.stringify(legacy))),
  fabricLine: "On Fluid",
  roleLine: "Guest",
});
check(
  "legacy peer: card data has no ghostCard and NO fabricated vitals",
  legacyCard.ghostCard === null
);
check(
  "the seed never appears in any payload",
  !JSON.stringify(priv).includes("987654321") &&
    !JSON.stringify(pub).includes("987654321")
);
const hostile = sanitizePeerExtras({
  ghostCard: {
    shareable: "yes",
    personalityPublic: true,
    personality: "x".repeat(5000),
    vitals: { h: "high", s: 50, v: 50 },
  },
});
check(
  "hostile ghostCard sanitizes field-by-field",
  hostile.ghostCard?.shareable === undefined &&
    hostile.ghostCard?.vitals === undefined &&
    (hostile.ghostCard?.personality?.length ?? 0) <= 281
);

/* ------------------------------------------------------------------ */
/* Structural wiring                                                   */
/* ------------------------------------------------------------------ */
section("structural wiring");

const read = (p) => readFileSync(p, "utf8");
const transport = read("src/hooks/useFluidMultiUser.ts");
check("transport announces ghostCard", transport.includes("ghostCard"));
check("transport wires vitals via vitalsWire", transport.includes("vitalsWire"));
const peerHook = read("src/ghost/useGhostPeer.ts");
check("peer hook computes vitals", peerHook.includes("computeGhostVitals"));
check("peer hook applies the stamina bias", peerHook.includes("applyStaminaBias"));
const peer = read("src/ghost/GhostPeer.ts");
check("peer keeps vitals journals", peer.includes("getVitalsSnapshot"));
const menu = read("app/components/fabric/FabricMenu.tsx");
check("menu renders the ghostie overlay", menu.includes("GhostieCardOverlay"));
check("menu renders the fabric overlay", menu.includes("FabricCardOverlay"));
check("menu renders the layer overlay", menu.includes("LayerCardOverlay"));
const home = read("app/components/fabric/GhostieHome.tsx");
check("Home carries the permission controls", home.includes("useGhostPermissions"));
check("Home carries the personality-public switch", home.includes("Personality on the ID card"));
check("Home header opens the card", home.includes("onOpenGhostieCard"));
const cards = read("app/components/fabric/IdCards.tsx");
check("cards carry the trading honesty line", cards.includes("Trading opens with the marketplace"));
check("cards render the portrait", cards.includes("GhostiePortrait"));
const pref = read("src/ghost/ghostPermissionsPref.ts");
check("permissions store key is fabric_ghost_permissions_v1", pref.includes("fabric_ghost_permissions_v1"));

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log(`failures: ${failures.join("; ")}`);
  process.exit(1);
}
