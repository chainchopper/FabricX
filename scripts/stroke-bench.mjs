#!/usr/bin/env node
/**
 * stroke-bench.mjs — Hotfix 1.9 before/after measurement for the
 * collaborative-stroke path (run: node scripts/stroke-bench.mjs).
 *
 * Simulates one fast stroke: 120 points over 2s at 60 points/sec
 * (the LegacyFluidEngine's per-frame emission rate for one held
 * pointer), and reports wire messages + JSON payload bytes for:
 *
 *   BEFORE — one classic {type:"fluid-interaction"} envelope per
 *            point, exactly the pre-1.9 sendInteraction shape (no
 *            seq field — it did not exist), sent immediately.
 *   AFTER  — the real StrokeBatcher (src/services/strokeBatch.ts,
 *            bundled on the fly with esbuild) driving the 1.9 wire
 *            shapes: a lone point rides the classic envelope; 2+
 *            ride {type:"fluid-batch"} with sender identity once
 *            on the envelope.
 *
 * Also SIMULATES (labeled as such — React is not running here) the
 * receiver-side state-update count: before = one setState + one
 * prune timer per arrival; after = arrivals buffered and flushed
 * into state on a 16ms cadence (REMOTE_FLUSH_MS in
 * useFluidMultiUser), counting distinct flush windows touched.
 *
 * Deterministic: a seeded PRNG walk + a fake clock/timer driver.
 */

import { buildSync } from "esbuild";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), "stroke-bench-"));
const bundlePath = join(outDir, "strokeBatch.mjs");
buildSync({
  entryPoints: [join(here, "..", "src", "services", "strokeBatch.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "silent",
});
writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "module" }));
const { StrokeBatcher } = await import(pathToFileURL(bundlePath).href);

// ---- synthetic stroke -------------------------------------------------
let seed = 187;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const POINTS = 120;
const DURATION_MS = 2000;
const points = [];
let x = 0.2, y = 0.5;
for (let i = 0; i < POINTS; i++) {
  x = Math.min(0.95, Math.max(0.05, x + (rnd() - 0.35) * 0.03));
  y = Math.min(0.95, Math.max(0.05, y + (rnd() - 0.5) * 0.02));
  points.push({
    position: { x: +x.toFixed(6), y: +y.toFixed(6) },
    force: { x: +((rnd() - 0.5) * 240).toFixed(2), y: +((rnd() - 0.5) * 240).toFixed(2) },
    pressure: +(0.25 + rnd() * 0.75).toFixed(3),
    color: { r: 0.2, g: 0.8, b: 1 },
    timestamp: 1761667200000 + Math.round((i * DURATION_MS) / POINTS),
    seq: i + 1,
    atMs: (i * DURATION_MS) / POINTS, // simulated arrival time
  });
}
const USER = "user-kx42pz";
const HUE = 187;

// ---- BEFORE: classic envelope per point -------------------------------
const beforeMsgs = points.map((p) =>
  JSON.stringify({
    type: "fluid-interaction",
    data: {
      position: p.position,
      force: p.force,
      pressure: p.pressure,
      color: p.color,
      userId: USER,
      timestamp: p.timestamp,
      hue: HUE,
    },
  })
);
const beforeBytes = beforeMsgs.reduce((n, s) => n + s.length, 0);

// ---- AFTER: real batcher over a fake clock ----------------------------
let simNow = 0;
const timers = [];
const fakeSetTimer = (fn, ms) => {
  const t = { at: simNow + ms, fn, dead: false };
  timers.push(t);
  return t;
};
const fakeClearTimer = (t) => { if (t) t.dead = true; };
const fireDue = () => {
  // Fire each due timer AT its due time (advance the clock to it),
  // then settle at the target time — otherwise a time jump would
  // attribute a flush to the jump target and inflate hold times.
  const target = simNow;
  for (;;) {
    const due = timers
      .filter((t) => !t.dead && t.at <= target)
      .sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    due.dead = true;
    simNow = due.at;
    due.fn();
  }
  simNow = target;
};

const afterEnvelopes = []; // { atMs, json, nPoints }
let maxHoldMs = 0;
const producedAt = new Map(points.map((p) => [p.seq, p.atMs]));
const batcher = new StrokeBatcher(
  (batch) => {
    for (const p of batch) {
      maxHoldMs = Math.max(maxHoldMs, simNow - producedAt.get(p.seq));
    }
    let envelope;
    if (batch.length === 1) {
      const p = batch[0];
      envelope = {
        type: "fluid-interaction",
        data: {
          userId: USER,
          position: p.position,
          force: p.force,
          pressure: p.pressure,
          color: p.color,
          timestamp: p.timestamp,
          seq: p.seq,
          hue: HUE,
        },
      };
    } else {
      envelope = {
        type: "fluid-batch",
        from: USER,
        hue: HUE,
        points: batch.map((p) => ({
          position: p.position,
          force: p.force,
          pressure: p.pressure,
          color: p.color,
          timestamp: p.timestamp,
          seq: p.seq,
        })),
      };
    }
    afterEnvelopes.push({
      atMs: simNow,
      json: JSON.stringify(envelope),
      nPoints: batch.length,
    });
  },
  { now: () => simNow, setTimer: fakeSetTimer, clearTimer: fakeClearTimer }
);
for (const p of points) {
  simNow = p.atMs;
  fireDue();
  // Exactly the production StrokePoint shape (no harness fields).
  batcher.push({
    position: p.position,
    force: p.force,
    pressure: p.pressure,
    color: p.color,
    timestamp: p.timestamp,
    seq: p.seq,
  });
  fireDue();
}
simNow = DURATION_MS + 100;
fireDue();
batcher.flush();

const afterBytes = afterEnvelopes.reduce((n, e) => n + e.json.length, 0);
const afterMsgs = afterEnvelopes.length;
const avgBatch = POINTS / afterMsgs;

// ---- receiver state-update simulation (SIMULATED, not measured) -------
// Before: every arrival = 1 setState + 1 prune timer.
// After: arrivals land when their envelope is emitted; the buffer
// flushes on a 16ms cadence — count 16ms buckets containing at
// least one arrival, +1 trailing flush if the last bucket is open.
const FLUSH_MS = 16;
const arrivalTimes = [];
for (const e of afterEnvelopes) {
  for (let k = 0; k < e.nPoints; k++) arrivalTimes.push(e.atMs);
}
const buckets = new Set(arrivalTimes.map((t) => Math.floor(t / FLUSH_MS)));
const afterFlushes = buckets.size;

console.log("=== Fabric stroke path bench (Hotfix 1.9) ===");
console.log(`stream: ${POINTS} points over ${DURATION_MS}ms (60/sec, one pointer)`);
console.log("");
console.log(`BEFORE  messages: ${beforeMsgs.length}`);
console.log(`BEFORE  payload : ${beforeBytes} bytes (${(beforeBytes / beforeMsgs.length).toFixed(1)} B/msg)`);
console.log(`AFTER   messages: ${afterMsgs} (${avgBatch.toFixed(2)} points/msg avg)`);
console.log(`AFTER   payload : ${afterBytes} bytes`);
console.log(`AFTER   max hold: ${maxHoldMs.toFixed(1)}ms (cap: 50ms)`);
console.log("");
console.log(`receiver setState — BEFORE: ${POINTS} (one per point) + ${POINTS} prune timers`);
console.log(`receiver setState — AFTER (simulated 16ms flush): ${afterFlushes} flushes, 0 per-point timers`);
console.log("");
console.log(`message reduction: ${(100 * (1 - afterMsgs / beforeMsgs.length)).toFixed(1)}%`);
