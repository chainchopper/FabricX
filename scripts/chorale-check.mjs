// chorale-check.mjs — Slice 70 headless proof.
//
// The MicroDuck chorale's own testing shape is the standard
// (SLICE-70-PLAN §6): a chorale that is only text-pinned is
// not verified. This harness bundles the REAL modules and
// drives them:
//
// §A beat lock (ports of sounds/src/chorale/beat.rs's suite):
//    one Conductor + three Followers through independent
//    scripted jitter slots — a BLE-shaped run (100–150 ms,
//    the ducks' own window) and a relay-realistic run
//    (50–300 ms + bursty batched delivery) over two simulated
//    minutes. Assert: lock achieved, pairwise phrase-position
//    agreement < ½ beat after lock (the slice's stated web
//    budget — the ±20 ms note budget is a native-shell claim
//    and is made nowhere here), spread under threshold. Plus
//    the unit ports: wrap, outlier rejection, silence
//    free-run + rejoin without a jump, no lock before 4
//    beats, the conductor counts beats not polls.
//
// §B state machine (ports of robotd/src/chorale.rs's named
//    tests, driving real Chorale instances over a scripted
//    bus with per-link delay): the lower id conducts and the
//    other follows; a duck that was not asked is silent and
//    invisible; the roster grows and never reorders; parts
//    are unique at every tick and equal seat_all over the
//    conductor's roster — including the register-crossing
//    reseat, pinned as the shipped Rust semantics; a leaver's
//    seat is retained and unsung; a joiner adopts the
//    conductor's framing (the piece the beacon names); a
//    conductor restart re-locks followers (new epoch +
//    backwards beat, driven at the class level); the fifth
//    duck waits unseated; publish-on-change (frame count
//    ≈ beat count, never tick count).
//
// §C end-to-end on the real rail: two full GhostPeer
//    instances wired back-to-back through a jittered fake
//    transport, music standing on both. Assert: both author
//    phrases; the parts' bands are disjoint (bass below
//    soprano); phrase starts align within ±½ beat; the
//    follower's phrases are authored in the CONDUCTOR's
//    scale (framing adoption); phraseToEvents renders each
//    part's stream equal to its authored phrase (68's §C
//    proof, per part). Solo control: one peer alone authors
//    exactly as Slice 68 did (ensemble null in its scenario).
//
// Run: node scripts/chorale-check.mjs   (from the repo root)

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}

async function bundle(rel, out) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`],
    { cwd: root, stdio: "pipe" }
  );
  return import(pathToFileURL(out).href);
}

/** Deterministic xorshift32 — the Rust suite's Slot RNG shape. */
function xorshift(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const chorale = await bundle("src/ghost/chorale.ts", "/tmp/ch-chorale.mjs");
const {
  Chorale,
  ChoraleConductor,
  ChoraleFollower,
  seatAll,
  choraleIdForSeed,
  choraleRegisterByteForSeed,
  choraleRegisterHz,
} = chorale;

/* ================================================================== */
/* §A. Beat lock — the quartet                                        */
/* ================================================================== */

function runQuartet({ jitterLo, jitterHi, bursty, slotMean, seconds }) {
  const beatSec = 0.6;
  const conductor = new ChoraleConductor(beatSec, 0, slotMean);
  const followers = [0, 1, 2].map(() => new ChoraleFollower(beatSec));
  const rngs = [xorshift(101), xorshift(20207), xorshift(303011)];
  const pending = [];
  let maxPair = 0;
  let maxVsConductor = 0;
  let allLocked = false;
  for (let t = 0; t <= seconds; t += 0.005) {
    const due = conductor.due(t);
    if (due !== null) {
      followers.forEach((f, i) => {
        const delay = jitterLo + rngs[i]() * (jitterHi - jitterLo);
        let at = t + delay;
        if (bursty) {
          const phase = ((due % 24) + 24) % 24;
          if (phase === 21 || phase === 22) {
            // Held and flushed with the third beat: arrivals
            // land one to two beats late — the outlier guard's
            // exact prey.
            at = t + (23 - phase) * beatSec + 0.01 + delay * 0.1;
          }
        }
        pending.push({ at, fi: i, byte: due & 0xff });
      });
    }
    for (let k = pending.length - 1; k >= 0; k--) {
      if (pending[k].at <= t) {
        followers[pending[k].fi].hear(pending[k].byte, pending[k].at);
        pending.splice(k, 1);
      }
    }
    if (t >= 20 && followers.every((f) => f.locked())) {
      allLocked = true;
      const pos = followers.map((f) => f.positionBeats(t));
      const cPos = conductor.positionBeats(t);
      for (let a = 0; a < 3; a++) {
        maxVsConductor = Math.max(maxVsConductor, Math.abs(pos[a] - cPos));
        for (let b = a + 1; b < 3; b++) {
          maxPair = Math.max(maxPair, Math.abs(pos[a] - pos[b]));
        }
      }
    }
  }
  return {
    maxPair,
    maxVsConductor,
    spreads: followers.map((f) => f.spreadS()),
    allLocked,
  };
}

{
  const r = runQuartet({
    jitterLo: 0.1,
    jitterHi: 0.15,
    bursty: false,
    slotMean: 0.125,
    seconds: 120,
  });
  check(
    "§A quartet (BLE-shaped slots 100–150 ms): all followers lock",
    r.allLocked
  );
  check(
    "§A quartet (BLE-shaped): pairwise agreement < ½ beat after lock",
    r.maxPair < 0.5,
    `max ${r.maxPair.toFixed(4)} beats`
  );
  check(
    "§A quartet (BLE-shaped): agreement vs the conductor < ½ beat",
    r.maxVsConductor < 0.5,
    `max ${r.maxVsConductor.toFixed(4)} beats`
  );
  check(
    "§A quartet (BLE-shaped): fit spread σ < 40 ms per follower",
    r.spreads.every((s) => s < 0.04),
    r.spreads.map((s) => `${(s * 1000).toFixed(1)}ms`).join(" ")
  );
}
{
  const r = runQuartet({
    jitterLo: 0.05,
    jitterHi: 0.3,
    bursty: true,
    slotMean: 0.175,
    seconds: 120,
  });
  check(
    "§A quartet (relay 50–300 ms + bursty batches): all followers lock and hold through the bursts",
    r.allLocked
  );
  check(
    "§A quartet (relay + bursty): pairwise agreement < ½ beat after lock",
    r.maxPair < 0.5,
    `max ${r.maxPair.toFixed(4)} beats`
  );
  check(
    "§A quartet (relay + bursty): fit spread σ < 120 ms per follower",
    r.spreads.every((s) => s < 0.12),
    r.spreads.map((s) => `${(s * 1000).toFixed(1)}ms`).join(" ")
  );
}

/* §A units — wrap, outlier, silence, lock floor, beat counting */
{
  const beatSec = 0.6;
  // Wrap: counts 250..265 cross the byte boundary at 256.
  const f = new ChoraleFollower(beatSec);
  for (let count = 250; count <= 265; count++) {
    f.hear(count & 0xff, count * beatSec + 0.125);
  }
  const posAtEnd = f.positionBeats(265 * beatSec + 0.125);
  check(
    "§A unit: the wrapped byte unwraps — position is continuous across 255→0",
    Math.abs(posAtEnd - 265) < 0.05,
    `position ${posAtEnd.toFixed(3)} at count 265`
  );
  check(
    "§A unit: no lock before 4 beats; lock at 4",
    (() => {
      const g = new ChoraleFollower(beatSec);
      for (let k = 0; k < 3; k++) g.hear(k, k * beatSec + 0.1);
      const before = g.locked();
      g.hear(3, 3 * beatSec + 0.1);
      return before === false && g.locked() === true;
    })()
  );
  // Outlier: a locked follower shrugs off a half-second-late beat.
  const o = new ChoraleFollower(beatSec);
  for (let k = 0; k < 8; k++) o.hear(k, k * beatSec + 0.125);
  o.hear(8, 8 * beatSec + 0.125 + 0.5); // the poisoned read
  const errAfterOutlier = Math.abs(o.positionBeats(8 * beatSec + 0.2) - (8 + 0.2 / beatSec - 0.125 / beatSec));
  o.hear(9, 9 * beatSec + 0.125);
  check(
    "§A unit: an observation 0.5 s off the fit is dropped, not averaged",
    errAfterOutlier < 0.1,
    `position error ${errAfterOutlier.toFixed(4)} beats`
  );
  // Silence: free-run holds the phase; the return re-locks
  // without a jump.
  const s = new ChoraleFollower(beatSec);
  for (let k = 0; k < 8; k++) s.hear(k, k * beatSec + 0.125);
  const t0 = 8 * beatSec;
  const drift = s.positionBeats(t0 + 20) - s.positionBeats(t0);
  for (let k = 42; k < 50; k++) s.hear(k & 0xff, k * beatSec + 0.125);
  const errAfterReturn = Math.abs(
    s.positionBeats(49 * beatSec + 0.125) - 49
  );
  check(
    "§A unit: silence free-runs at the framing tempo and the return lands without a jump",
    Math.abs(drift - 20 / beatSec) < 0.05 && errAfterReturn < 0.05,
    `free-run drift ${drift.toFixed(3)} beats/20 s, return error ${errAfterReturn.toFixed(4)}`
  );
  // The conductor counts beats, not polls.
  const c = new ChoraleConductor(beatSec, 0, 0.125);
  let nonNull = 0;
  for (let k = 0; k < 100; k++) {
    if (c.due(k * 0.0119) !== null) nonNull += 1; // 100 polls inside ~2 beats
  }
  check(
    "§A unit: the conductor counts beats, not polls (100 polls over 2 beats → 2 emissions)",
    nonNull === 2,
    `${nonNull} emissions`
  );
}

/* ================================================================== */
/* §B. The state machine over a scripted bus                          */
/* ================================================================== */

/** Pick seeds with the properties a test needs, using the
 *  module's own derivations (deterministic across runs). */
function findSeed(pred, from = 1) {
  for (let s = from; s < 20000; s++) {
    if (pred(choraleIdForSeed(s), choraleRegisterByteForSeed(s), s)) return s;
  }
  throw new Error("no seed found");
}

/**
 * A scripted bus: N Chorale instances ticked at 10 ms steps;
 * advertise frames are delivered to every other instance
 * after a fixed link delay. Returns the run's observations.
 */
function runBus({ members, seconds, t0 = 0, linkDelay = 0.04, onStep = null }) {
  const dt = 0.01;
  const queue = []; // {at, toIdx, frame}
  const emitted = members.map(() => 0);
  const lastFrames = members.map(() => null);
  const rosters = members.map(() => null);
  for (let t = t0; t <= t0 + seconds; t += dt) {
    // Deliver due frames first (arrival order is the signal).
    for (let k = queue.length - 1; k >= 0; k--) {
      if (queue[k].at <= t) {
        const { toIdx, frame, at } = queue[k];
        members[toIdx].chorale.heard(frame, at);
        queue.splice(k, 1);
      }
    }
    members.forEach((m, i) => {
      const r = m.chorale.tick(t);
      m.lastTick = r;
      if (r.advertise) {
        emitted[i] += 1;
        lastFrames[i] = r.advertise;
        if (r.advertise.roster?.length) rosters[i] = r.advertise.roster;
        members.forEach((_, j) => {
          if (j !== i) {
            queue.push({ at: t + linkDelay, toIdx: j, frame: r.advertise });
          }
        });
      }
    });
    if (onStep) onStep(t, members, { emitted, lastFrames, rosters });
  }
  return { emitted, lastFrames, rosters };
}

function makeDuck(seed, framing) {
  const c = new Chorale({ seed });
  if (framing) c.setFraming(framing);
  return { chorale: c, seed, lastTick: null };
}

/* B1–B2: the lower id conducts; the un-asked duck is silent. */
{
  const seedA = findSeed(() => true, 1);
  const seedB = findSeed((id) => id > choraleIdForSeed(seedA), seedA + 1);
  const a = makeDuck(seedA, { scale: "dorian", tempoBpm: 90, tonicMidi: 65 });
  const b = makeDuck(seedB, { scale: "mixolydian", tempoBpm: 140, tonicMidi: 70 });
  const e = makeDuck(findSeed(() => true, 900), null); // never asked
  a.chorale.setActive(true, 0);
  b.chorale.setActive(true, 0);
  let eEmitted = 0;
  runBus({
    members: [a, b],
    seconds: 10,
    onStep: (t) => {
      const r = e.chorale.tick(t);
      e.lastTick = r;
      if (r.advertise) eEmitted += 1;
      // E hears everything and stays off.
      e.chorale.heard({ piece: 3, beat: 1, register: 100, id: 4242, roster: [] }, t);
    },
  });
  check(
    "§B the lower id conducts and the other follows (no election)",
    a.lastTick.state === "conducting" && b.lastTick.state === "following",
    `A=${a.lastTick.state} B=${b.lastTick.state}`
  );
  check(
    "§B a duck that was not asked is silent and invisible (0 frames, still off)",
    eEmitted === 0 && e.lastTick.state === "off" && e.lastTick.singing === null
  );
  check(
    "§B both seated ducks sing once locked (parts derived, voices = 2)",
    a.lastTick.singing !== null &&
      b.lastTick.singing !== null &&
      a.lastTick.singing.voices === 2 &&
      b.lastTick.singing.voices === 2,
    `A part=${a.lastTick.singing?.part} B part=${b.lastTick.singing?.part}`
  );
  check(
    "§B a joiner sings the piece the beacon names: the follower adopts the conductor's framing",
    b.lastTick.singing !== null &&
      b.lastTick.singing.framing.scale === "dorian" &&
      b.lastTick.singing.framing.tempoBpm === 90 &&
      b.lastTick.singing.framing.tonicMidi === 65 &&
      Math.abs(b.lastTick.singing.beatSec - 60 / 90) < 1e-9,
    `B framing=${JSON.stringify(b.lastTick.singing?.framing)}`
  );
}

/* B3–B5: roster growth, part uniqueness, the leaver. */
{
  const seeds = [];
  let cursor = 1;
  for (let k = 0; k < 4; k++) {
    const s = findSeed((id) => !seeds.some((x) => choraleIdForSeed(x) === id), cursor);
    seeds.push(s);
    cursor = s + 1;
  }
  const framing = { scale: "ionian", tempoBpm: 100, tonicMidi: 72 };
  const ducks = seeds.map((s) => makeDuck(s, framing));
  const conductorIdx = seeds.indexOf(
    seeds.reduce((lo, s) => (choraleIdForSeed(s) < choraleIdForSeed(lo) ? s : lo), seeds[0])
  );
  ducks.forEach((d, i) => {
    if (i < 2) d.chorale.setActive(true, 0);
  });
  let prefixOk = true;
  let uniqueOk = true;
  let seatAllOk = true;
  let seenRoster = [];
  let rosterChangedAt = -Infinity;
  runBus({
    members: ducks,
    seconds: 26,
    onStep: (t, members, { lastFrames }) => {
      if (t > 6 && t < 6.02) ducks[2].chorale.setActive(true, t);
      if (t > 13 && t < 13.02) ducks[3].chorale.setActive(true, t);
      const cFrame = lastFrames[conductorIdx];
      if (cFrame && cFrame.roster.length >= 2) {
        const r = cFrame.roster;
        if (seenRoster.length && r.length >= seenRoster.length) {
          // Growth only, never a reorder: the old roster is a
          // prefix of the new one.
          if (!seenRoster.every((e2, k) => r[k].id === e2.id && r[k].register === e2.register)) {
            prefixOk = false;
          }
        }
        if (r.length > seenRoster.length) {
          seenRoster = r;
          rosterChangedAt = t;
        }
        // Parts: unique across the singing ensemble at EVERY
        // tick (the safety property), and equal to seat_all
        // over the conductor's roster once that roster has
        // had a beat to propagate — a follower sings from the
        // roster it last heard, and the wire takes a frame's
        // time to carry a growth to it.
        const oracle = seatAll(r.map((e2) => choraleRegisterHz(e2.register)));
        const sung = [];
        members.forEach((m, i) => {
          const s = m.lastTick?.singing;
          if (s) {
            sung.push(s.part);
            if (t - rosterChangedAt > 1) {
              const idx = r.findIndex((e2) => e2.id === choraleIdForSeed(m.seed));
              if (idx < 0 || oracle[idx] !== s.part) seatAllOk = false;
            }
          }
        });
        if (new Set(sung).size !== sung.length) uniqueOk = false;
      }
    },
  });
  check(
    "§B the roster grows and never reorders (each roster is a prefix of the next)",
    prefixOk && seenRoster.length === 4,
    `final roster size ${seenRoster.length}`
  );
  check(
    "§B parts are unique across the ensemble at every tick",
    uniqueOk
  );
  check(
    "§B every sung part equals seat_all over the conductor's roster",
    seatAllOk
  );
  // The leaver: duck 2 leaves; its seat is retained, unsung,
  // and nobody reseats.
  const partsBefore = ducks.map((d) => d.lastTick.singing?.part ?? null);
  const voicesBefore = ducks[conductorIdx].lastTick.singing?.voices;
  ducks[2].chorale.setActive(false, 26);
  // Stop the bus from hearing duck 2: it is off, so it emits
  // nothing; the others simply stop hearing it. (Time on the
  // bus never runs backward — the second leg starts at 26.)
  runBus({ members: ducks, seconds: 6, t0: 26 });
  const partsAfter = ducks.map((d) => d.lastTick.singing?.part ?? null);
  const voicesAfter = ducks[conductorIdx].lastTick.singing?.voices;
  check(
    "§B a duck that leaves stops being counted — voices drop, its seat is retained, nobody reseats",
    voicesBefore === 4 &&
      voicesAfter === 3 &&
      partsAfter.every((p, i) => i === 2 || p === partsBefore[i]),
    `voices ${voicesBefore}→${voicesAfter}, parts ${JSON.stringify(partsBefore)}→${JSON.stringify(partsAfter)}`
  );
}

/* B6: the register-crossing wrinkle, pinned as shipped. */
{
  // Three ducks with strictly rising registers; then a fourth
  // arrives BELOW the current bass.
  const s1 = findSeed(() => true, 3000);
  const r1 = choraleRegisterByteForSeed(s1);
  const s2 = findSeed((id, reg) => reg > r1 && id !== choraleIdForSeed(s1), s1 + 1);
  const r2 = choraleRegisterByteForSeed(s2);
  const s3 = findSeed(
    (id, reg) => reg > r2 && id !== choraleIdForSeed(s1) && id !== choraleIdForSeed(s2),
    s2 + 1
  );
  const sLow = findSeed(
    (id, reg) =>
      reg < r1 &&
      ![s1, s2, s3].some((x) => choraleIdForSeed(x) === id),
    1
  );
  const framing = { scale: "ionian", tempoBpm: 100, tonicMidi: 72 };
  const trio = [s1, s2, s3].map((s) => makeDuck(s, framing));
  const low = makeDuck(sLow, framing);
  trio.forEach((d) => d.chorale.setActive(true, 0));
  runBus({ members: trio, seconds: 10 });
  const bassBefore = trio.map((d) => d.lastTick.singing?.part);
  low.chorale.setActive(true, 10);
  runBus({ members: [...trio, low], seconds: 10, t0: 10 });
  const partsAfter = [...trio, low].map((d) => d.lastTick.singing?.part);
  const exBassIdx = bassBefore.indexOf("bass");
  check(
    "§B register-crossing: the low joiner takes the bass and the former bass shifts — seat_all as shipped, not the brief's simplification",
    low.lastTick.singing?.part === "bass" &&
      exBassIdx >= 0 &&
      partsAfter[exBassIdx] === "tenor" &&
      partsAfter.filter((p) => p === "bass").length === 1 &&
      new Set(partsAfter).size === 4,
    `before=${JSON.stringify(bassBefore)} after=${JSON.stringify(partsAfter)}`
  );
}

/* B7: the fifth duck waits; publish-on-change. */
{
  const seeds = [];
  let cursor = 5000;
  for (let k = 0; k < 5; k++) {
    const s = findSeed((id) => !seeds.some((x) => choraleIdForSeed(x) === id), cursor);
    seeds.push(s);
    cursor = s + 1;
  }
  const framing = { scale: "ionian", tempoBpm: 100, tonicMidi: 72 };
  const ducks = seeds.map((s) => makeDuck(s, framing));
  ducks.forEach((d) => d.chorale.setActive(true, 0));
  const { emitted, lastFrames } = runBus({ members: ducks, seconds: 20 });
  const conductorIdx = seeds.indexOf(
    seeds.reduce((lo, s) => (choraleIdForSeed(s) < choraleIdForSeed(lo) ? s : lo), seeds[0])
  );
  // The unseated duck is the one the conductor's roster never
  // took — identified from the roster itself, not by position
  // (any of the five could be the conductor).
  const finalRoster = lastFrames[conductorIdx]?.roster ?? [];
  const fifth =
    ducks.find(
      (d) => !finalRoster.some((e2) => e2.id === choraleIdForSeed(d.seed))
    ) ?? null;
  const beatsIn20s = Math.floor(20 / 0.6);
  check(
    "§B the fifth duck waits unseated: never sings, no part is doubled",
    fifth !== null &&
      finalRoster.length === 4 &&
      fifth.lastTick.singing === null &&
      ducks.filter((d) => d.lastTick.singing !== null).length === 4,
    `unseated state=${fifth?.lastTick.state}, roster=${finalRoster.length}`
  );
  check(
    "§B publish-on-change: the conductor's frame count ≈ its beat count, not the tick count",
    emitted[conductorIdx] >= beatsIn20s - 2 &&
      emitted[conductorIdx] <= beatsIn20s + 6 &&
      emitted.reduce((a, b) => a + b, 0) < 200,
    `conductor emitted ${emitted[conductorIdx]} frames in 2000 ticks (beats ${beatsIn20s})`
  );
}

/* B8: restart re-locks (class level, hand-fed frames). */
{
  const followerSeed = findSeed(() => true, 777);
  const f = new Chorale({ seed: followerSeed });
  f.setFraming({ scale: "ionian", tempoBpm: 100, tonicMidi: 72 });
  f.setActive(true, 0);
  const conductorId = 4242;
  const conductorRegister = 90;
  const roster = [
    { register: conductorRegister, id: conductorId },
    { register: choraleRegisterByteForSeed(followerSeed), id: choraleIdForSeed(followerSeed) },
  ];
  const feed = (piece, beat, at) =>
    f.heard(
      { piece, beat, register: conductorRegister, id: conductorId, roster, scale: "ionian", tempo_bpm: 100, tonic_midi: 72 },
      at
    );
  // Join (first tick sees the singing peer) + 6 beats of epoch 7.
  feed(7, 0, 0.1);
  f.tick(0.11);
  for (let k = 1; k <= 6; k++) feed(7, k, 0.1 + k * 0.6);
  const lockedFirst = f.tick(4).singing !== null;
  // New epoch: piece changes — the follower must re-lock.
  feed(8, 0, 4.3);
  const relockGap = f.tick(4.35).singing === null;
  for (let k = 1; k <= 5; k++) feed(8, k, 4.3 + k * 0.6);
  const lockedSecond = f.tick(7.6).singing !== null;
  // Backwards beat inside the same epoch (5 → 0 is a jump of
  // 5, inside the shipped 4..128 restart window): restart,
  // re-lock.
  feed(8, 0, 7.7);
  const relockGap2 = f.tick(7.75).singing === null;
  for (let k = 1; k <= 5; k++) feed(8, k, 7.7 + k * 0.6);
  const lockedThird = f.tick(11).singing !== null;
  check(
    "§B a conductor restart re-locks its followers (new epoch, then a backwards beat)",
    lockedFirst && relockGap && lockedSecond && relockGap2 && lockedThird,
    `first=${lockedFirst} gap=${relockGap} second=${lockedSecond} gap2=${relockGap2} third=${lockedThird}`
  );
}

/* ================================================================== */
/* §C. End-to-end: two full GhostPeers on the real rail               */
/* ================================================================== */

const brain = await bundle("src/ghost/GhostBrain.ts", "/tmp/ch-brain.mjs");
const peerMod = await bundle("src/ghost/GhostPeer.ts", "/tmp/ch-peer.mjs");
const eventsMod = await bundle(
  "src/components/audio/phraseEvents.ts",
  "/tmp/ch-events.mjs"
);
const { GhostPeer } = peerMod;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await sleep(150);
  }
  console.log(`  (waitFor timed out: ${label})`);
  return false;
}

/** Seeds for the duet: A conducts (lower id) AND takes the
 *  bass (lower register) — the disjoint-band case. */
function duetSeeds() {
  for (let a = 1; a < 4000; a++) {
    const idA = choraleIdForSeed(a);
    const regA = choraleRegisterByteForSeed(a);
    for (let b = a + 1; b < 4000; b++) {
      if (choraleIdForSeed(b) > idA && choraleRegisterByteForSeed(b) > regA) {
        return { a, b };
      }
    }
  }
  throw new Error("no duet seeds");
}

{
  const { a: seedA, b: seedB } = duetSeeds();
  const jitter = xorshift(99);
  const phrasesA = [];
  const phrasesB = [];
  const scenariosB = [];
  const wire = { ab: null, ba: null };
  // GhostPeer needs its deliberation routed back into itself;
  // build each peer with a closure that captures the peer
  // handle once construction returns.
  const mkRoutedPeer = (seed, hue, phrases, scenarioSink) => {
    const holder = {};
    const peer = new GhostPeer({
      peerId: `ghost:chorale-check-${seed}`,
      identity: { hue, seed },
      injectLocal: () => {},
      onDeliberate: (scenario) => {
        if (scenarioSink) scenarioSink.push(scenario);
        const { decision } = brain.decideOnDevice(scenario);
        holder.peer.applyBrainDecision(decision, "device");
      },
      onMusicPhrase: (phrase) => phrases.push({ at: Date.now(), phrase }),
      onChoraleFrame: (frame) => {
        const deliver = seed === seedA ? wire.ab : wire.ba;
        if (deliver) deliver(frame);
      },
    });
    holder.peer = peer;
    return peer;
  };
  const peerA = mkRoutedPeer(seedA, 200, phrasesA, null);
  const peerB = mkRoutedPeer(seedB, 120, phrasesB, scenariosB);
  wire.ab = (frame) =>
    setTimeout(
      () => peerB.heardChorale(frame, performance.now() / 1000),
      100 + jitter() * 100
    );
  wire.ba = (frame) =>
    setTimeout(
      () => peerA.heardChorale(frame, performance.now() / 1000),
      100 + jitter() * 100
    );

  peerA.setHumansPresent(true);
  peerB.setHumansPresent(true);
  // A stands in ionian; B stands in dorian — if B's phrases
  // come out ionian, the conductor's framing was adopted.
  peerA.setMusicStanding({ scale: "ionian", patternHint: "up", tempoBpm: 160 });
  peerB.setMusicStanding({ scale: "dorian", patternHint: "up", tempoBpm: 160 });
  peerA.setChoraleWilling(true);
  peerB.setChoraleWilling(true);

  const got = await waitFor(
    () => phrasesA.length >= 2 && phrasesB.length >= 2,
    45_000,
    "duet phrases"
  );
  check(
    "§C two GhostPeers in one session both author phrases (the ensemble is live)",
    got,
    `A=${phrasesA.length} B=${phrasesB.length}`
  );

  if (got) {
    // Phrase starts align on the shared grid: some pair of
    // starts (one from each peer) lands within ±½ beat.
    const beatMs = 60_000 / 160;
    let bestPair = Infinity;
    for (const pa of phrasesA) {
      for (const pb of phrasesB) {
        bestPair = Math.min(bestPair, Math.abs(pa.at - pb.at));
      }
    }
    check(
      "§C phrase starts align within ±½ beat across the two ghosties",
      bestPair <= beatMs / 2,
      `closest pair ${bestPair.toFixed(0)} ms apart (budget ${(beatMs / 2).toFixed(0)} ms)`
    );
    const midi = (n) => brain.ghostNoteNumber(n.note);
    const maxA = Math.max(...phrasesA[0].phrase.notes.map(midi));
    const minB = Math.min(...phrasesB[0].phrase.notes.map(midi));
    check(
      "§C the parts' bands are disjoint: every bass note sits below every soprano note",
      maxA < minB,
      `bass max ${maxA}, soprano min ${minB}`
    );
    const ionian = new Set([0, 2, 4, 5, 7, 9, 11]);
    const bInIonian = phrasesB.every((p) =>
      p.phrase.notes.every((n) => ionian.has(((midi(n) % 12) + 12) % 12))
    );
    check(
      "§C the follower authors in the CONDUCTOR's scale (B stood in dorian; the room sings ionian)",
      bInIonian
    );
    const ensB = scenariosB
      .map((s) => s.music?.ensemble)
      .filter(Boolean)
      .pop();
    check(
      "§C the follower's scenario carries its seat (soprano, following, 2 voices)",
      !!ensB &&
        ensB.part === "soprano" &&
        ensB.conducting === false &&
        ensB.voices === 2,
      JSON.stringify(ensB)
    );
    // Render equality, per part (68's §C proof).
    const renderOk = [...phrasesA, ...phrasesB].every(({ phrase }) => {
      const events = eventsMod.phraseToEvents(phrase);
      const stepSec = 30 / phrase.bpm;
      return (
        events.length === phrase.notes.length &&
        events.every(
          (ev, i) =>
            ev.note === phrase.notes[i].note &&
            Math.abs(ev.offsetSec - phrase.notes[i].step * stepSec) < 1e-9 &&
            Math.abs(ev.velocity - phrase.notes[i].velocity) < 1e-9
        )
      );
    });
    check(
      "§C phraseToEvents renders each part's stream equal to its authored phrase",
      renderOk
    );
  }
  peerA.destroy();
  peerB.destroy();
}

/* §C solo control — Slice 68 exactly, no ensemble. */
{
  const phrases = [];
  const scenarios = [];
  const holder = {};
  const solo = new GhostPeer({
    peerId: "ghost:chorale-check-solo",
    identity: { hue: 260, seed: 1234 },
    injectLocal: () => {},
    onDeliberate: (scenario) => {
      scenarios.push(scenario);
      const { decision } = brain.decideOnDevice(scenario);
      holder.peer.applyBrainDecision(decision, "device");
    },
    onMusicPhrase: (phrase) => phrases.push(phrase),
  });
  holder.peer = solo;
  solo.setHumansPresent(true);
  solo.setMusicStanding({ scale: "ionian", patternHint: "up", tempoBpm: 120 });
  solo.setChoraleWilling(true);
  const got = await waitFor(() => phrases.length >= 1, 20_000, "solo phrase");
  check(
    "§C solo control: a lone ghostie authors as Slice 68 did (phrase authored, ensemble null)",
    got &&
      scenarios.some(
        (s) => s.music && (s.music.ensemble === null || s.music.ensemble === undefined)
      ),
    `phrases=${phrases.length}`
  );
  solo.destroy();
}

console.log(`\nchorale-check: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
