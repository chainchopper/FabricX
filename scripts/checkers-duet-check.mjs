// checkers-duet-check — pins Slice K: "The loser gets heard."
//
// The defect (audibles audit §4): `react()` in checkersGame.ts
// fired two cues in the same synchronous tick (capture: play +
// startle; win: play + startle; a crowning capture added heart;
// a last-piece capture added thinking), and the voice's 1.5 s
// limiter with its 400 ms priority-interrupt window
// (useGhostSfx.ts) dropped every second cue in the same tick.
// The victim's startle never sounded on a capture or a win, the
// crowning heart never sounded on a crowning capture, and the
// last-piece worried note never sounded, ever.
//
// The fix: the referee composes the whole reaction as ONE
// sequence and hands it to the voice (`playSequence`), which
// admits it once on the same limiter law and staggers its
// voices 500 ms apart — past the 400 ms interrupt window and
// past the longest single cue (a cheer spans at most ~400 ms),
// so each voice sounds in its own window. The limiter is NOT
// gutted: any cue OUTSIDE the sequence still answers to the
// limiter at its own call time, so a third cue in the same tick
// still loses (pinned in D1 + the browser drive).
//
// §D0 source pins: the pair path exists and the old same-tick
//   calls are gone (react composes one sequence; the layer
//   wires it; the stagger beats the interrupt window).
// §D1 the limiter law, pure: sfxLimiter.ts is bundled and its
//   truth table run — same-tick cues never sound, the interrupt
//   opens only past 400 ms for a strictly higher priority, the
//   1.5 s gap admits everything.
// §D2 composition, against the REAL referee: a driven game and
//   a deterministic replay of scripts/checkers-duet-line.json
//   (35 half-moves, found by search over the real engine:
//   capture, crowning capture, last-piece capture, win) assert
//   the exact sequences in order, with the right hues — plus
//   the cancel discipline (End runs every pending cancel).
// §D3 the old shape is gone: no sequence ever holds two plays,
//   two startles, a heart anywhere but last, or a thinking
//   anywhere but last; the win is always exactly play+startle.
// §D4 by ear: the browser drives (`--drive`) replay the same
//   line through the REAL voice and listen with an AnalyserNode
//   tap + the oscillator-start log (proof-k): drive-proof-k.mjs
//   (the game: P0-P5) and drive-voice-k.mjs (the voice alone:
//   P6/P6b). Without --drive this section reports SKIP, never
//   a silent pass.
//
// What this check does NOT prove (said plainly): that a human
// EAR hears a musical duet. Headless Chrome has no speakers;
// the drive listens through rendered samples and the schedule
// log. Whether the 500 ms stagger feels like a duet or a queue
// on a real device is Terrell's call, not the check's.
//
// Run: node scripts/checkers-duet-check.mjs [--drive]
//   (from the repo root; --drive also runs proof-k's two
//   drivers — the game drive and the voice drive — which need
//   their bundles: metro-bundle-k.mjs and
//   metro-bundle-k-voice.mjs, rebuilt if /tmp was reaped)
//
// Powered by Nirvana

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0;
let fail = 0;
let skipped = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}
function skip(label, why) {
  skipped += 1;
  console.log(`SKIP  ${label} — ${why}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withDrive = process.argv.includes("--drive");

const read = (p) => readFileSync(p, "utf8");
const gameSrc = read("src/components/forge/checkersGame.ts");
const voiceSrc = read("src/ghost/useGhostSfx.ts");
const layerSrc = read("src/components/forge/ForgeLayer.tsx");
const limiterSrc = existsSync("src/ghost/sfxLimiter.ts")
  ? read("src/ghost/sfxLimiter.ts")
  : "";

/* ---- D0. source pins --------------------------------------------------- */

check(
  "D0 the limiter law lives in a pure module (sfxLimiter.ts)",
  limiterSrc.includes("export function limiterAdmits") &&
    limiterSrc.includes("MIN_CUE_GAP_MS = 1_500") &&
    limiterSrc.includes("PRIORITY_INTERRUPT_MS = 400") &&
    limiterSrc.includes("export const SFX_PRIORITY"),
  "the law is testable in Node without React or an AudioContext"
);
check(
  "D0 the voice applies the pure law (play + playSequence)",
  (voiceSrc.match(/limiterAdmits\(/g) || []).length >= 2 &&
    voiceSrc.includes('from "./sfxLimiter"'),
  "one law, two applications — no second copy of the rule"
);
check(
  "D0 playSequence exists, admits once, returns a cancel",
  voiceSrc.includes("const playSequence = useCallback") &&
    voiceSrc.includes("soundCue(cues[0].kind, cues[0].hue, cues[0].opts)") &&
    voiceSrc.includes("return cancel;"),
  "first voice now, later voices on timers, caller holds the cancel"
);
check(
  "D0 the stagger beats the interrupt window (500 > 400)",
  voiceSrc.includes("GHOST_SFX_SEQUENCE_STAGGER_MS = 500") &&
    voiceSrc.includes("staggerMs: number = GHOST_SFX_SEQUENCE_STAGGER_MS"),
  "500 ms past the 400 ms window, past the longest single cue (~400 ms cheer)"
);
check(
  "D0 sequence timers die with the voice (unmount + Audio off)",
  (voiceSrc.match(/cancelSequences\(\);/g) || []).length >= 2,
  "a sequence never outlives the voice that admitted it"
);
check(
  "D0 react() composes ONE sequence — one playSequence call site",
  (gameSrc.match(/this\.deps\.playSequence\(cues\)/g) || []).length === 1,
  "the whole reaction crosses in one call"
);
check(
  "D0 the old same-tick dep is gone (no playSfx: declaration anywhere in game or layer)",
  !gameSrc.includes("playSfx:") && !layerSrc.includes("playSfx:"),
  "react() cannot fire two synchronous cues any more"
);
check(
  "D0 the layer wires playSequence with the old articulation (intensity 0.6)",
  layerSrc.includes("playSequence: (cues) =>") &&
    layerSrc.includes("sfxRef.current.playSequence(") &&
    layerSrc.includes("articulation: { intensity: 0.6 }"),
  "the sound's character is unchanged — only the timing is"
);
check(
  "D0 End/dispose runs the pending reaction cancels",
  gameSrc.includes("for (const cancel of this.sfxCancels) cancel();"),
  "a pending voice never sounds over a restored scene"
);

/* ---- D1. the limiter law, pure ----------------------------------------- */

const esbuild = "./node_modules/.bin/esbuild";
let lim = null;
try {
  execFileSync(esbuild, [
    "src/ghost/sfxLimiter.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--outfile=/tmp/sfxLimiter-K.mjs",
    "--log-level=error",
  ]);
  lim = await import("/tmp/sfxLimiter-K.mjs");
} catch (e) {
  check(
    "D1 the limiter law is provable (sfxLimiter bundles + imports)",
    false,
    String((e && e.message) || e).slice(0, 200)
  );
}
if (lim) {
const P = lim.SFX_PRIORITY;
check("D1 priorities: play 2, startle 3, heart 3, thinking 1",
  P.play === 2 && P.startle === 3 && P.heart === 3 && P.thinking === 1);
const A = lim.limiterAdmits;
const lawCases = [
  ["same tick, higher priority — never sounds", A(0, 3, 2), false],
  ["same tick, lower priority — never sounds", A(0, 1, 3), false],
  ["399 ms, higher priority — interrupt window not open", A(399, 3, 2), false],
  ["400 ms, higher priority — still closed (strictly past 400)", A(400, 3, 2), false],
  ["401 ms, higher priority — interrupts", A(401, 3, 2), true],
  ["401 ms, equal priority — no interrupt", A(401, 3, 3), false],
  ["401 ms, lower priority — no interrupt", A(401, 1, 3), false],
  ["1499 ms, higher priority — interrupts", A(1499, 3, 2), true],
  ["1500 ms, any priority — the gap admits", A(1500, 1, 3), true],
  ["2000 ms, lower priority — the gap admits", A(2000, 1, 3), true],
];
for (const [label, got, want] of lawCases) {
  check(`D1 limiter: ${label}`, got === want, `got=${got} want=${want}`);
}
}

/* ---- D2. composition, against the REAL referee -------------------------- */

// The whole section runs inside one try: on the OLD tree (no
// playSequence dep) the referee throws when react() calls the
// missing dep — the check must report that as D2 failures, not
// die with a stack trace (the defect-catching run).
//
// The sequence helpers + the collection live OUTSIDE the try:
// D3 reads the collection whether or not D2 completed (an
// empty collection fails its own checks, it must never throw).
const kinds = (seq) => seq.map((c) => c.kind).join("+");
const seqShapeOk = (seq) => {
  const k = kinds(seq);
  return (
    k === "play+startle" ||
    k === "play+startle+heart" ||
    k === "play+startle+thinking" ||
    k === "play+startle+heart+thinking" ||
    k === "heart"
  );
};
// Every sequence composed by either driven game, for the D3
// invariant (the old shape is gone) below.
const allSeqs = [];
try {
const entryPath = "/tmp/checkers-duet-entry.ts";
writeFileSync(
  entryPath,
  [
    `export * from ${JSON.stringify(process.cwd() + "/src/ghost/GhostBrain.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/ghost/GhostPeer.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePerformer.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeSceneStore.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgeScene.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/checkersEngine.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/checkersScene.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/checkersGame.ts")};`,
    `export * from ${JSON.stringify(process.cwd() + "/src/components/forge/forgePicking.ts")};`,
  ].join("\n")
);
execFileSync(esbuild, [
  entryPath, "--bundle", "--format=esm", "--platform=node",
  "--outfile=/tmp/checkers-duet-FP.mjs", "--log-level=error",
]);
const fp = await import("/tmp/checkers-duet-FP.mjs");
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const { createAgentScene } = require("67js/addons/agent-scene");
const E = fp;
const S = fp;

function makeRenderer() {
  return {
    calls: { updateParts: [], replaceParts: [], render: [] },
    updateParts(parts) { this.calls.updateParts.push(parts); },
    replaceParts(parts) { this.calls.replaceParts.push(parts); },
    render(view) { this.calls.render.push(view); },
  };
}
function makeGame(extraDeps = {}) {
  const log = { snapshots: [], events: [], seqs: [], cancels: [], senses: [] };
  const game = new fp.CheckersGame({
    getHandle: () => fp.getForgeSceneHandle(),
    onSnapshot: (s) => log.snapshots.push(s),
    onEvent: (e) => log.events.push(e),
    // The stub logs the composed sequences and tracks the
    // cancels the game stores, so the check can prove End
    // runs them (D2 cancel discipline).
    playSequence: (cues) => {
      const entry = {
        cues: cues.map((c) => ({ kind: c.kind, hue: c.hue })),
        cancelled: false,
      };
      log.seqs.push(entry.cues);
      log.cancels.push(entry);
      return () => { entry.cancelled = true; };
    },
    feedGameSense: (ctx) => log.senses.push(ctx),
    markerHexesFor: () => ({ near: "#3b82f6", far: "#f59e0b" }),
    sfxHuesFor: () => ({ coral: 210, teal: 186 }),
    ...extraDeps,
  });
  return { game, log };
}
function seatScene() {
  fp.__resetForgeSceneForTests();
  const scene = fp.buildForgeStarterScene(createAgentScene);
  const renderer = makeRenderer();
  fp.registerForgeScene({ scene, renderer, refreshCamera: () => {} });
  return { scene, renderer };
}
function recipeNodes(scene) {
  return scene.exportRecipe().nodes ?? [];
}
function censusOk(scene, state) {
  return fp.checkersCensus(recipeNodes(scene), state).ok;
}


/* D2a: a driven pass-and-play game — capture + crowning, sequences shaped. */
{
  const { scene } = seatScene();
  const { game, log } = makeGame();
  game.start("pass-and-play");
  let censusAlways = true;
  let captureSeen = false;
  let kingingSeen = false;
  let halfMoves = 0;
  while (halfMoves < 400 && !game.getState().winner) {
    const st = game.getState();
    const moves = E.checkersLegalMoves(st);
    if (moves.length === 0) break;
    const advOf = (m) => {
      const piece = st.cells[m.from[0] * 8 + m.from[1]];
      if (piece?.king) return 0;
      const last = m.landings[m.landings.length - 1];
      return st.turn === "coral" ? m.from[0] - last[0] : last[0] - m.from[0];
    };
    const scored = [...moves].sort(
      (a, b) => advOf(b) - advOf(a) || b.captures.length - a.captures.length
    );
    const mv = scored[0];
    if (mv.captures.length > 0) captureSeen = true;
    game.tapNode(S.checkersPieceId(mv.pieceId));
    game.tapNode(
      S.checkersSquareId(
        mv.landings[mv.landings.length - 1][0],
        mv.landings[mv.landings.length - 1][1]
      )
    );
    halfMoves++;
    if (!censusOk(scene, game.getState())) censusAlways = false;
    if (game.snapshot().halted) break;
    if (log.events.some((e) => e.type === "kinging")) kingingSeen = true;
    if (captureSeen && kingingSeen) break;
    await sleep(5);
  }
  check(
    "D2a the driven game produced a capture and a crowning",
    captureSeen && kingingSeen,
    `halfMoves=${halfMoves}`
  );
  check(
    "D2a scene == engine after EVERY move of the driven game",
    censusAlways && !game.snapshot().halted
  );
  check(
    "D2a a capture composes [play, startle] in order, mover then victim",
    log.seqs.some(
      (s) =>
        s.length >= 2 &&
        s[0].kind === "play" && s[0].hue === 210 &&
        s[1].kind === "startle" && s[1].hue === 186
    ) ||
      log.seqs.some(
        (s) =>
          s.length >= 2 &&
          s[0].kind === "play" && s[0].hue === 186 &&
          s[1].kind === "startle" && s[1].hue === 210
      ),
    JSON.stringify(log.seqs.slice(0, 4))
  );
  check(
    "D2a a crowning composes the heart in its sequence, after the pair and before only the worried note",
    log.seqs.some((s) => {
      const h = s.findIndex((c) => c.kind === "heart");
      return (
        h >= 2 &&
        s[0].kind === "play" &&
        s[1].kind === "startle" &&
        s.slice(h + 1).every((c) => c.kind === "thinking")
      );
    }),
    JSON.stringify(log.seqs.map(kinds))
  );
  check(
    "D2a every composed sequence matches the reaction grammar",
    log.seqs.length > 0 && log.seqs.every(seqShapeOk),
    JSON.stringify(log.seqs.map(kinds))
  );
  allSeqs.push(...log.seqs);
  game.end();
  check(
    "D2a End runs every pending reaction cancel",
    log.cancels.length > 0 && log.cancels.every((c) => c.cancelled),
    `${log.cancels.filter((c) => c.cancelled).length}/${log.cancels.length} cancels run`
  );
}

/* D2b: deterministic replay of the scripted win line — the four
 * reactions, each with its exact sequence, in order. The line
 * (scripts/checkers-duet-line.json) was found by search over the
 * real engine; the expectations below come from the search's own
 * annotation (capture / crowning capture / last-piece capture /
 * win), not from re-implementing react(). */
{
  const line = JSON.parse(read("scripts/checkers-duet-line.json"));
  const { scene } = seatScene();
  const { game, log } = makeGame();
  game.start("pass-and-play");
  let censusAlways = true;
  let replayOk = true;
  // The per-ply oracle: the expectation is computed from the
  // AUDIT's spec (§4) — capture → play + startle, crowning →
  // heart, a side dropping to its last piece → thinking, win →
  // play + startle — applied to the move the engine itself
  // enumerates and the counts before/after it. It does not
  // re-read react(): the spec is the independent authority.
  // The four named plies (3, 29, 31, 35) are pinned
  // individually below as well, for readability.
  const HUES = { coral: 210, teal: 186 };
  const other = (s) => (s === "coral" ? "teal" : "coral");
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const named = {
    3: "plain capture",
    29: "crowning capture",
    31: "last-piece capture",
    35: "win",
  };
  for (let i = 0; i < line.length; i++) {
    const d = line[i];
    const ply = i + 1;
    const st = game.getState();
    const mover = st.turn;
    const beforeCounts = {
      coral: E.checkersPiecesOf(st, "coral").length,
      teal: E.checkersPiecesOf(st, "teal").length,
    };
    const moves = E.checkersLegalMoves(st);
    const mv = moves.find((x) => {
      const piece = st.cells[x.from[0] * 8 + x.from[1]];
      return (
        piece && piece.id === d.pieceId &&
        x.landings[x.landings.length - 1][0] === d.to[0] &&
        x.landings[x.landings.length - 1][1] === d.to[1]
      );
    });
    if (!mv) {
      replayOk = false;
      console.log(`  replay mismatch at ply ${ply}: ${JSON.stringify(d)}`);
      break;
    }
    const seqsBefore = log.seqs.length;
    game.tapNode(S.checkersPieceId(d.pieceId));
    game.tapNode(S.checkersSquareId(d.to[0], d.to[1]));
    if (!censusOk(scene, game.getState())) censusAlways = false;
    if (game.snapshot().halted) { replayOk = false; break; }
    const after = game.getState();
    const afterCounts = {
      coral: E.checkersPiecesOf(after, "coral").length,
      teal: E.checkersPiecesOf(after, "teal").length,
    };
    const oracle = [];
    if (after.winner) {
      oracle.push(
        { kind: "play", hue: HUES[after.winner] },
        { kind: "startle", hue: HUES[other(after.winner)] }
      );
    } else {
      if (mv.captures.length > 0) {
        oracle.push(
          { kind: "play", hue: HUES[mover] },
          { kind: "startle", hue: HUES[other(mover)] }
        );
      }
      if (mv.kinging) oracle.push({ kind: "heart", hue: HUES[mover] });
      for (const side of ["coral", "teal"]) {
        if (beforeCounts[side] > 1 && afterCounts[side] === 1) {
          oracle.push({ kind: "thinking", hue: HUES[side] });
        }
      }
    }
    const got = log.seqs.slice(seqsBefore);
    const want = oracle.length === 0 ? [] : [oracle];
    if (!deepEq(got, want)) {
      replayOk = false;
      console.log(
        `  ply ${ply}${named[ply] ? ` (${named[ply]})` : ""}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
      );
    }
    await sleep(5);
  }
  check(
    "D2b the scripted line replays to a coral win (35 half-moves)",
    replayOk && game.getState().winner === "coral",
    `winner=${game.getState().winner} replayOk=${replayOk}`
  );
  check(
    "D2b scene == engine after EVERY move of the replay",
    censusAlways && !game.snapshot().halted
  );
  check(
    "D2b the win fires exactly one [play, startle] sequence",
    log.events.some((e) => e.type === "win" && e.winner === "coral") &&
      log.seqs.filter((s) => kinds(s) === "play+startle").length >= 1,
    `win events=${log.events.filter((e) => e.type === "win").length}`
  );
  check(
    "D2b the last-piece capture composes [play, startle, thinking] — the worried note finally has a voice",
    log.seqs.some((s) => kinds(s) === "play+startle+thinking"),
    JSON.stringify(log.seqs.map(kinds))
  );
  check(
    "D2b the crowning capture composes [play, startle, heart]",
    log.seqs.some((s) => kinds(s) === "play+startle+heart"),
    JSON.stringify(log.seqs.map(kinds))
  );
  allSeqs.push(...log.seqs);
  game.end();
}
} catch (e) {
  check(
    "D2 composition runs against the referee",
    false,
    String((e && e.message) || e).slice(0, 200)
  );
}

/* ---- D3. the old shape is gone ------------------------------------------ */

{
  const noDupVoices = allSeqs.every((s) => {
    const ks = s.map((c) => c.kind);
    return (
      ks.filter((k) => k === "play").length <= 1 &&
      ks.filter((k) => k === "startle").length <= 1 &&
      ks.filter((k) => k === "heart").length <= 1 &&
      ks.filter((k) => k === "thinking").length <= 1
    );
  });
  const heartLast = allSeqs.every((s) => {
    const i = s.findIndex((c) => c.kind === "heart");
    // The heart is last, or only the worried note follows it
    // (a crowning capture that also drops a side to its last
    // piece sounds play + startle + heart + thinking).
    return i === -1 || s.slice(i + 1).every((c) => c.kind === "thinking");
  });
  const thinkingLast = allSeqs.every((s) => {
    const i = s.findIndex((c) => c.kind === "thinking");
    return i === -1 || i === s.length - 1;
  });
  const heartAndThinkingOrdered = allSeqs.every((s) => {
    const h = s.findIndex((c) => c.kind === "heart");
    const t = s.findIndex((c) => c.kind === "thinking");
    return h === -1 || t === -1 || h < t;
  });
  check(
    "D3 no sequence ever repeats a voice (one play, one startle, one heart, one thinking at most)",
    allSeqs.length > 0 && noDupVoices,
    JSON.stringify(allSeqs.map(kinds))
  );
  check(
    "D3 heart is always last or followed only by the worried note; thinking is always last",
    allSeqs.length > 0 && heartLast && thinkingLast,
    JSON.stringify(allSeqs.map(kinds))
  );
  check(
    "D3 when a reaction carries both heart and thinking, the crown sounds before the worry",
    allSeqs.length > 0 && heartAndThinkingOrdered,
    JSON.stringify(allSeqs.map(kinds))
  );
  check(
    "D3 the win is always exactly [play, startle] — no third voice on a win",
    allSeqs.filter((s) => kinds(s) === "play+startle").length >= 1 &&
      allSeqs.every((s) => seqShapeOk(s)),
    JSON.stringify(allSeqs.map(kinds))
  );
}

/* ---- D4. by ear (browser drive) ----------------------------------------- */

if (withDrive) {
  // Two drives: the game drive (P0-P5: the duet through the real
  // game) and the voice drive (P6/P6b: the limiter law and the
  // three-member sequence on a clean voice-only page — no peer,
  // no GL loop, where the 500 ms stagger is exact). Both must
  // exit 0.
  const drives = ["../proof-k/drive-proof-k.mjs", "../proof-k/drive-voice-k.mjs"];
  let driveOk = true;
  for (const drive of drives) {
    try {
      execFileSync("node", [drive, process.cwd()], { stdio: "inherit" });
    } catch {
      driveOk = false;
      console.log(`D4 drive failed: ${drive}`);
    }
  }
  check("D4 browser drives: the duet sounds (see proof-k output)", driveOk, driveOk ? "game drive (P0-P5) + voice drive (P6/P6b)" : "a drive exited non-zero");
} else {
  skip("D4 browser drives: the duet sounds", "run with --drive (proof-k)");
}

console.log(`\ncheckers-duet: ${pass} passed, ${fail} failed, ${skipped} skipped`);
if (fail > 0) process.exit(1);
