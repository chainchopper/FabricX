// checkers-check — pins Slice D, checkers on the Forge.
//
// What Slice D is: a playable game of checkers seated on the
// Forge canvas. The rules live in a pure engine
// (checkersEngine — American rules: forced captures, complete
// multi-jump chains, crowning ends the move, no-moves loses).
// The board is scene content with game-owned ids (checkersScene
// — 64 squares, 24 pieces, crown discs, selection highlights,
// and a ghostie marker at each board end). Every move executes
// as agent-scene ops through the performer path (performForgeOps
// — Slice B's revision contract + topology sync), and after
// every move the referee (checkersGame) asserts the scene and
// the engine agree (checkersCensus) — a divergence halts the
// game with the reason showing. Human moves arrive as taps
// picked by the ENGINE's own scene-query (forgePicking — BVH
// raycast over the real parts, unprojected through the rendered
// camera); the ghostie plays the far side through its REAL
// decision path: the referee feeds the position as a sense
// (noteForgeGame — legal moves enumerated by the engine), the
// peer deliberates, the distilled tier's checkers overlay
// (checkersDecisionFor) picks from the enumerated moves, and
// the peer performs the forge-move through its own sink — the
// referee completes its consequences and refuses illegal ones.
//
// Proven here, headlessly, against the REAL modules throughout:
//   G0 source pins: the layer hosts the referee + chrome, the
//      sink forwards performed decisions, the sense path is
//      wired layer -> hook -> peer -> brain.
//   G1 the rules engine: start census, 7 opening moves a side,
//      forced captures, backward captures for men, multi-jump
//      as ONE complete move, crowning (quiet + by jump, and a
//      crowning jump ends the chain), the no-moves loss.
//   G2 scene seating: start a game on the REAL starter scene —
//      90 parts, unique ids, census clean; End restores the
//      free scene exactly (checkpoint), sense cleared.
//   G3 picking: project a piece/square to screen points through
//      the authored camera, raycast with the REAL scene-query —
//      the pick names the piece/square; after a move the pick
//      follows the piece; the addon loading late never breaks
//      the performer's part updates.
//   G4 a driven pass-and-play game: capture + crowning land,
//      scene == engine asserted after EVERY move, reaction
//      sounds fire (capture: play + startle; crowning: heart),
//      the mover's marker is mid-hop when read back.
//   G5 the ghost's turn travels the decision path: a REAL peer
//      deliberates with the game sense aboard, the distilled
//      tier answers from the enumerated moves, the peer
//      performs through the real performer, the referee
//      completes the move — journal/performance evidence, not
//      a direct performer call.
//   G6 discipline: wrong-turn taps change nothing, an illegal
//      destination deselects without moving, a ghost move that
//      isn't enumerated is restored + reported (and a second
//      consecutive one stops the game).
//
// Run: node scripts/checkers-check.mjs
// (bundles the real modules with the tree's esbuild; the ghost
// section waits out real deliberation floors, ~15s total.)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) {
    pass++;
    console.log("PASS  " + label);
  } else {
    fail++;
    console.log("FAIL  " + label + (detail ? " — " + detail : ""));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, stepMs = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(stepMs);
  }
  return fn();
}
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const read = (p) => readFileSync(p, "utf8");
const brainSrc = read("src/ghost/GhostBrain.ts");
const peerSrc = read("src/ghost/GhostPeer.ts");
const hookSrc = read("src/ghost/useGhostPeer.ts");
const layerSrc = read("src/components/forge/ForgeLayer.tsx");
const controllerSrc = read("src/components/forge/checkersGame.ts");
const pickingSrc = read("src/components/forge/forgePicking.ts");

/* ---- bundles ------------------------------------------------------- */

const esbuild = "./node_modules/.bin/esbuild";
function bundle(entry, out) {
  execFileSync(esbuild, [
    entry,
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${out}`,
    "--log-level=error",
  ]);
}
const entryPath = "/tmp/checkers-entry.ts";
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
bundle(entryPath, "/tmp/checkers-FP.mjs");
bundle("src/ghost/ghostTools.ts", "/tmp/checkers-GT.mjs");
const fp = await import("/tmp/checkers-FP.mjs");
const tools = await import("/tmp/checkers-GT.mjs");
const require = createRequire(import.meta.url);
const { createAgentScene } = require("67js/addons/agent-scene");
const sceneQueryModule = require("67js/addons/scene-query");

const E = fp; // engine + scene + game live in the one graph
const S = fp;

/* ---- shared fixtures ------------------------------------------------- */

function makeRenderer() {
  return {
    calls: { updateParts: [], replaceParts: [], render: [] },
    updateParts(parts) {
      this.calls.updateParts.push(parts);
    },
    replaceParts(parts) {
      this.calls.replaceParts.push(parts);
    },
    render(view) {
      this.calls.render.push(view);
    },
  };
}

function makeGame(extraDeps = {}) {
  const log = { snapshots: [], events: [], sfx: [], senses: [] };
  const game = new fp.CheckersGame({
    getHandle: () => fp.getForgeSceneHandle(),
    onSnapshot: (s) => log.snapshots.push(s),
    onEvent: (e) => log.events.push(e),
    playSfx: (kind, hue) => log.sfx.push({ kind, hue }),
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

/* ---- G0. source pins -------------------------------------------------- */

check(
  "G0 ForgeLayer hosts the referee and its chrome (start controls, banner, End)",
  layerSrc.includes("new CheckersGame({") &&
    layerSrc.includes("Checkers — play your ghostie") &&
    layerSrc.includes("Checkers — two players, one screen") &&
    layerSrc.includes("End game") &&
    layerSrc.includes("gameSnap.banner"),
  "the game belongs to the Forge fabric's own layer"
);
check(
  "G0 the layer's forge sink forwards every performed decision to the referee",
  layerSrc.includes("const outcome = performForgeDecision(decision);") &&
    layerSrc.includes("gameRef.current?.noteGhostDecision(decision, outcome)"),
  "the ghost's move reaches the referee through the sink, as performed"
);
check(
  "G0 taps are picked on the canvas and handed to the referee as node ids",
  layerSrc.includes("onPointerDown={handleCanvasTap}") &&
    layerSrc.includes("rayFromCamera(") &&
    layerSrc.includes("picker.pick(") &&
    layerSrc.includes("game.tapNode(id)") &&
    layerSrc.includes('import("67js/addons/scene-query")'),
  "engine query, lazily loaded; the layer never invents a hit"
);
check(
  "G0 the game sense path is wired layer -> hook -> peer -> brain scenario",
  layerSrc.includes("ghostRef.current.noteForgeGame(ctx)") &&
    hookSrc.includes("noteForgeGame") &&
    peerSrc.includes("noteForgeGame(raw: unknown)") &&
    peerSrc.includes("forge_game: forgeGame") &&
    brainSrc.includes("forge_game?: GhostForgeGameContext"),
  "the genx/forge-scene sense path, one more sense"
);
check(
  "G0 the distilled tier consults the checkers overlay (decideOnDevice)",
  brainSrc.includes("checkersDecisionFor(scenario)") &&
    brainSrc.includes('ruleId: "checkers-move"'),
  "the floor plays from the enumerated moves, in the overlay tradition"
);
check(
  "G0 the referee constructs no peer and calls no performer shortcut for the ghost",
  !controllerSrc.includes("new GhostPeer") &&
    !controllerSrc.includes("applyBrainDecision") &&
    !controllerSrc.includes("decideOnDevice"),
  "the ghost's move is the peer's own performance or it is not the ghost's"
);
check(
  "G0 the game sense is kept alive on the layer's sense heartbeat (a slow device cannot stale the ghost's turn)",
  controllerSrc.includes("feedNow()") &&
    layerSrc.includes("gameRef.current?.feedNow()"),
  "the controller re-feeds on demand; the layer's 3s heartbeat calls it while a game runs"
);
check(
  "G0 picking is the engine's query, injected — no static 67js value import in the picking module",
  pickingSrc.includes("createSceneQuery") &&
    !/^import \{[^}]*\} from "67js/im.test(
      pickingSrc.replace(/import type[^\n]*/g, "")
    ),
  "module evaluation stays engine-free; the addon loads at game start"
);

/* ---- G1. the rules engine ---------------------------------------------- */

{
  const st = E.createCheckersGame();
  const coral = E.checkersPiecesOf(st, "coral");
  const teal = E.checkersPiecesOf(st, "teal");
  check(
    "G1 the start position: 12 v 12, coral to move, men on the dark squares of rows 5-7 / 0-2",
    coral.length === 12 &&
      teal.length === 12 &&
      st.turn === "coral" &&
      st.winner === null &&
      coral.every((p) => !p.king) &&
      teal.every((p) => !p.king),
    `coral=${coral.length} teal=${teal.length}`
  );
  const opening = E.checkersLegalMoves(st);
  check(
    "G1 seven opening moves for the side to move",
    opening.length === 7 && opening.every((m) => m.captures.length === 0),
    `${opening.length} moves`
  );
  const after = E.applyCheckersMove(st, opening[0]);
  check(
    "G1 after any opening move, the other side also has seven",
    E.checkersLegalMoves(after).length === 7 && after.turn === "teal",
    `${E.checkersLegalMoves(after).length} moves`
  );
}
{
  // Forced capture: coral-1 can jump teal-1; coral-2 has quiet
  // moves only — the law leaves coral-1's jump as the ONLY move.
  const st = E.checkersStateFromPieces(
    [
      { id: "coral-1", side: "coral", row: 4, col: 3 },
      { id: "coral-2", side: "coral", row: 6, col: 7 },
      { id: "teal-1", side: "teal", row: 3, col: 4 },
      { id: "teal-2", side: "teal", row: 0, col: 1 },
    ],
    "coral"
  );
  const moves = E.checkersLegalMoves(st);
  check(
    "G1 forced capture: a jump anywhere leaves jumps as the only legal moves",
    moves.length === 1 &&
      moves[0].pieceId === "coral-1" &&
      deepEq(moves[0].captures, ["teal-1"]) &&
      deepEq(moves[0].landings, [[2, 5]]),
    JSON.stringify(moves)
  );
}
{
  // Backward capture for a man (the American rule): the teal
  // piece BEHIND coral-1 is jumpable, and the jump is forced.
  const st = E.checkersStateFromPieces(
    [
      { id: "coral-1", side: "coral", row: 3, col: 4 },
      { id: "teal-1", side: "teal", row: 4, col: 3 },
      { id: "teal-2", side: "teal", row: 0, col: 7 },
    ],
    "coral"
  );
  const moves = E.checkersLegalMoves(st);
  check(
    "G1 a man captures backward (American rule) — and the capture is forced",
    moves.length === 1 &&
      deepEq(moves[0].captures, ["teal-1"]) &&
      deepEq(moves[0].landings, [[5, 2]]),
    JSON.stringify(moves)
  );
}
{
  // Multi-jump: a chain of two is ONE move; the partial chain
  // is not offered.
  const st = E.checkersStateFromPieces(
    [
      { id: "coral-1", side: "coral", row: 6, col: 1 },
      { id: "teal-1", side: "teal", row: 5, col: 2 },
      { id: "teal-2", side: "teal", row: 3, col: 4 },
      { id: "teal-3", side: "teal", row: 0, col: 7 },
    ],
    "coral"
  );
  const moves = E.checkersLegalMoves(st);
  check(
    "G1 a multi-jump is ONE move (complete chain, both captures, no partial offered)",
    moves.length === 1 &&
      deepEq(moves[0].landings, [
        [4, 3],
        [2, 5],
      ]) &&
      deepEq(moves[0].captures, ["teal-1", "teal-2"]),
    JSON.stringify(moves)
  );
  const after = E.applyCheckersMove(st, moves[0]);
  check(
    "G1 the chain lands both captures and the turn passes",
    E.checkersPiecesOf(after, "teal").length === 1 &&
      after.turn === "teal" &&
      after.moveNumber === 1,
    `teal left=${E.checkersPiecesOf(after, "teal").length}`
  );
}
{
  // Crowning: quietly, by jump — and a crowning jump ENDS the
  // move even with another jump showing.
  const st = E.checkersStateFromPieces(
    [
      { id: "coral-1", side: "coral", row: 1, col: 2 },
      { id: "teal-1", side: "teal", row: 6, col: 5 },
    ],
    "coral"
  );
  const quiet = E.checkersLegalMoves(st).find(
    (m) => m.landings[0][0] === 0 && m.captures.length === 0
  );
  const crowned = quiet && E.applyCheckersMove(st, quiet);
  check(
    "G1 a man reaching the far rank on a quiet move is crowned",
    !!quiet &&
      quiet.kinging === true &&
      crowned.cells[0 * 8 + quiet.landings[0][1]]?.king === true,
    JSON.stringify(quiet)
  );
  const st2 = E.checkersStateFromPieces(
    [
      { id: "coral-1", side: "coral", row: 2, col: 1 },
      { id: "teal-1", side: "teal", row: 1, col: 2 },
      { id: "teal-2", side: "teal", row: 1, col: 4 },
    ],
    "coral"
  );
  const jumps = E.checkersLegalMoves(st2);
  check(
    "G1 a crowning jump ends the move (no king-continuation in the same turn)",
    jumps.length === 1 &&
      jumps[0].kinging === true &&
      jumps[0].landings.length === 1 &&
      deepEq(jumps[0].landings, [[0, 3]]),
    JSON.stringify(jumps)
  );
}
{
  // The no-moves loss: teal's only man is walled in.
  const st = E.checkersStateFromPieces(
    [
      { id: "teal-1", side: "teal", row: 0, col: 1 },
      { id: "coral-1", side: "coral", row: 1, col: 0 },
      { id: "coral-2", side: "coral", row: 1, col: 2 },
      { id: "coral-3", side: "coral", row: 2, col: 3 },
      { id: "coral-4", side: "coral", row: 5, col: 4 },
    ],
    "teal"
  );
  check(
    "G1 a side with no legal move has none to take",
    E.checkersLegalMoves(st).length === 0,
    `${E.checkersLegalMoves(st).length} moves`
  );
  const stC = { ...st, turn: "coral" };
  // Coral plays its DISTANT man (a wall piece moving would
  // unwall the teal man — the wall must stand for the verdict).
  const distant = E.checkersLegalMoves(stC).find(
    (m) => m.pieceId === "coral-4"
  );
  const decided = distant && E.applyCheckersMove(stC, distant);
  check(
    "G1 ...and loses when the turn reaches it",
    !!decided && decided.winner === "coral",
    `winner=${decided?.winner}`
  );
}

/* ---- G2. seating + restore ---------------------------------------------- */

{
  const { scene } = seatScene();
  const starterIds = recipeNodes(scene).map((n) => n.id).sort();
  const { game, log } = makeGame();
  const started = game.start("pass-and-play");
  const nodes = recipeNodes(scene);
  const ids = nodes.map((n) => n.id);
  check(
    "G2 a game seats on the real scene: 90 parts (64 squares + 24 pieces + 2 markers), ids unique, starter cleared",
    started === true &&
      scene.parts.length === 90 &&
      new Set(ids).size === ids.length &&
      !ids.some((id) => starterIds.includes(id)),
    `parts=${scene.parts.length} nodes=${ids.length}`
  );
  check(
    "G2 the census is clean on the seated board",
    censusOk(scene, game.getState()),
    JSON.stringify(
      fp.checkersCensus(nodes, game.getState()).problems.slice(0, 3)
    )
  );
  game.end();
  const afterIds = recipeNodes(scene).map((n) => n.id).sort();
  check(
    "G2 End restores the free scene exactly (the checkpoint, ghost summons and all would ride it)",
    deepEq(afterIds, starterIds) && scene.parts.length === 5,
    `after=${JSON.stringify(afterIds)}`
  );
  check(
    "G2 ending the game clears the game sense (a null feed)",
    log.senses.length > 0 && log.senses[log.senses.length - 1] === null,
    `senses=${log.senses.length}`
  );
}

/* ---- G3. picking ---------------------------------------------------------- */

{
  const { scene } = seatScene();
  const { game } = makeGame();
  game.start("pass-and-play");
  const picker = fp.createForgePicker(sceneQueryModule);
  const cam = scene.camera;
  const aspect = 800 / 600;
  const pickAtWorld = (point) => {
    const ndc = fp.projectToNdc(point, cam.eye, cam.target, cam.fov, aspect);
    if (!ndc) return "NO-PROJECT";
    const ray = fp.rayFromCamera(cam.eye, cam.target, cam.fov, aspect, ndc[0], ndc[1]);
    return picker.pick(scene.parts, ray.origin, ray.direction, scene.revision);
  };
  // coral-1 stands on (5,0): world [-3.5, top 0.3, 1.5].
  const pieceHit = pickAtWorld([-3.5, 0.3, 1.5]);
  check(
    "G3 a tap projected at a piece picks the piece (the engine's own raycast over the real parts)",
    pieceHit === "checkers-pc-coral-1",
    `hit=${pieceHit}`
  );
  // An empty dark square (4,1): world [-2.5, top 0.1, 0.5].
  const squareHit = pickAtWorld([-2.5, 0.1, 0.5]);
  check(
    "G3 a tap on an empty square picks the square",
    squareHit === "checkers-sq-4-1",
    `hit=${squareHit}`
  );
  const miss = (() => {
    const ray = fp.rayFromCamera(cam.eye, cam.target, cam.fov, aspect, 0, 0.98);
    return picker.pick(scene.parts, ray.origin, ray.direction, scene.revision);
  })();
  check(
    "G3 a tap over the void picks nothing",
    miss === null,
    `hit=${miss}`
  );
  // Move coral-1 (5,0)->(4,1) through the referee, then pick
  // it at its NEW square: the picker must not answer stale.
  game.tapNode("checkers-pc-coral-1");
  game.tapNode("checkers-sq-4-1");
  const movedHit = pickAtWorld([-2.5, 0.3, 0.5]);
  check(
    "G3 after a move, the pick follows the piece to its new square",
    movedHit === "checkers-pc-coral-1" && game.getState().moveNumber === 1,
    `hit=${movedHit}`
  );
  // The addon is loaded and has been all through this section:
  // the performer's part updates must still land (Slice A's
  // hazard is an ordering law, and picking respects it).
  const outcome = fp.performForgeOps(
    [{ type: "set-node", id: "checkers-pc-coral-1", translation: [-2.5, 0.2, 0.5] }],
    fp.getForgeSceneHandle(),
    "picking aftermath"
  );
  check(
    "G3 scene ops still perform after picking (no part-identity damage from the late addon load)",
    outcome.kind === "performed",
    JSON.stringify(outcome)
  );
  game.end();
}

/* ---- G4. a driven game: capture, crowning, reactions ---------------------- */

{
  const { scene } = seatScene();
  const { game, log } = makeGame();
  game.start("pass-and-play");
  let censusAlways = true;
  let captureSeen = false;
  let kingingSeen = false;
  let markerHopSeen = false;
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
    const wasCapture = mv.captures.length > 0;
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
    if (wasCapture) {
      captureSeen = true;
      // The mover's marker is mid-hop RIGHT NOW (its restore
      // rides a timer): read the near/far marker's height.
      const moverEnd = st.turn === "coral" ? "near" : "far";
      const marker = recipeNodes(scene).find(
        (n) => n.id === S.checkersMarkerId(moverEnd)
      );
      if (
        marker &&
        Math.abs((marker.translation?.[1] ?? 0) - (S.CHECKERS_MARKER_Y + 0.3)) <
          0.01
      ) {
        markerHopSeen = true;
      }
    }
    if (log.events.some((e) => e.type === "kinging")) kingingSeen = true;
    if (captureSeen && kingingSeen) break;
    await sleep(5);
  }
  check(
    "G4 the driven game produced a capture and a crowning",
    captureSeen && kingingSeen,
    `halfMoves=${halfMoves} capture=${captureSeen} kinging=${kingingSeen}`
  );
  check(
    "G4 scene == engine after EVERY move of the driven game (the census discipline)",
    censusAlways && !game.snapshot().halted,
    `halted=${game.snapshot().halted}`
  );
  check(
    "G4 reactions sounded through the voice path: a capture earns play + startle",
    log.sfx.some((s) => s.kind === "play") &&
      log.sfx.some((s) => s.kind === "startle"),
    JSON.stringify(log.sfx.slice(0, 6))
  );
  check(
    "G4 a crowning earns the heart cue",
    log.sfx.some((s) => s.kind === "heart"),
    JSON.stringify(log.sfx.map((s) => s.kind))
  );
  check(
    "G4 the mover's marker hops on a capture (game ops, read back from the scene)",
    markerHopSeen,
    "the marker was at rest height + 0.3 in the capture's own moment"
  );
  game.end();
}

/* ---- G5. the ghost's turn travels the decision path ------------------------ */

{
  const { scene } = seatScene();
  const outcomes = [];
  const performances = [];
  const deliberations = [];
  const peer = new fp.GhostPeer({
    peerId: "ghost:checkers-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: () => {},
    broadcast: () => {},
    getFabricContext: () =>
      fp.sanitizeFabricContext({
        layer_id: "forge",
        canvas: "forge67",
        role: "open",
        in_session: false,
        rules: { draw: true, verbs: true, notes: true },
      }),
    onForgeDecision: (d) => {
      // The layer's sink, verbatim shape: perform through the
      // real performer, then hand the referee the outcome.
      const o = fp.performForgeDecision(d);
      outcomes.push(o);
      gameRef.current?.noteGhostDecision(d, o);
    },
    onPerformance: (label) => performances.push(label),
    onDeliberate: (scenario) => {
      deliberations.push(scenario);
      // The router's last mile, honestly: the distilled tier
      // (the app's own decideOnDevice) answers the scenario it
      // was handed; the refusal gate, then the peer's apply.
      if (!scenario.forge_game?.ghost_to_move) return;
      const { decision } = fp.decideOnDevice(scenario);
      if (!tools.ghostToolRefusal(decision.intent, scenario)) {
        peer.applyBrainDecision(decision, "table");
      }
    },
  });
  const gameRef = { current: null };
  const { game, log } = makeGame({
    feedGameSense: (ctx) => {
      log.senses.push(ctx);
      peer.noteForgeGame(ctx);
    },
  });
  gameRef.current = game;
  game.start("vs-ghost");
  peer.noteUserActivity();
  // The human (coral) opens: (5,0) -> (4,1).
  game.tapNode("checkers-pc-coral-1");
  game.tapNode("checkers-sq-4-1");
  peer.noteUserActivity();
  check(
    "G5 after the human's opening move, the turn — and the fed sense — belong to the ghost",
    game.getState().turn === "teal" &&
      log.senses.some(
        (s) => s && s.ghost_to_move === true && s.legal_moves.length > 0
      ),
    `senses=${log.senses.length}`
  );
  const ghostLanded = await waitFor(
    () => game.getState().moveNumber === 2,
    25000
  );
  const ghostScenario = deliberations.find((s) => s.forge_game?.ghost_to_move);
  check(
    "G5 the ghost's move traveled the decision path (deliberation -> distilled tier -> peer performance -> referee completion)",
    ghostLanded &&
      !!ghostScenario &&
      outcomes.some((o) => o.kind === "performed") &&
      performances.some((l) => l.includes("checkers-pc-teal")),
    `moveNumber=${game.getState().moveNumber} outcomes=${JSON.stringify(outcomes)} performances=${JSON.stringify(performances)}`
  );
  check(
    "G5 the deliberation that moved carried the game sense (ghost to move, enumerated legal moves)",
    !!ghostScenario &&
      ghostScenario.forge_game.legal_moves.length > 0 &&
      ghostScenario.forge_game.ghost_side === "teal",
    ghostScenario
      ? `moves=${ghostScenario.forge_game.legal_moves.length}`
      : "no ghost-turn scenario captured"
  );
  check(
    "G5 after the ghost's move the board is honest (census clean, turn back to the human)",
    ghostLanded && censusOk(scene, game.getState()) && game.getState().turn === "coral",
    `turn=${game.getState().turn}`
  );
  // The evaluator alone, on a constructed sense: a capture is
  // on the table, and the floor takes it.
  {
    const ctx = fp.sanitizeForgeGameContext({
      ghost_side: "teal",
      to_move: "teal",
      ghost_to_move: true,
      move_number: 6,
      pieces: [
        { node: "checkers-pc-teal-1", side: "teal", king: false },
        { node: "checkers-pc-coral-1", side: "coral", king: false },
      ],
      legal_moves: [
        {
          node: "checkers-pc-teal-1",
          position: [0.5, 0.2, -0.5],
          captures: 0,
          captures_king: false,
          kinging: false,
          exposes: false,
          advance: 1,
        },
        {
          node: "checkers-pc-teal-1",
          position: [1.5, 0.2, 0.5],
          captures: 1,
          captures_king: false,
          kinging: false,
          exposes: false,
          advance: 1,
        },
      ],
      last_event: null,
      referee_note: null,
    });
    const scenario = {
      temperament: "curious",
      seconds_since_human_touch: 3,
      recent_events: [],
      pets_in_last_5s: 0,
      nearby_splat_intensity: 0,
      verbs_seen: [],
      other_ghosts: [],
      room_energy_trend: "steady",
      ghost_identity: { name: "Ghost", hue: 210, seed_traits: [] },
      forge_game: ctx,
    };
    const picked = fp.checkersDecisionFor(scenario);
    check(
      "G5 the heuristic evaluator takes the capture the rules offered (and passes the validator)",
      picked?.ruleId === "checkers-move" &&
        picked.decision.intent === "forge-move" &&
        deepEq(picked.decision.forge_spec.position, [1.5, 0.2, 0.5]),
      JSON.stringify(picked?.decision?.forge_spec)
    );
    const notTurn = fp.checkersDecisionFor({
      ...scenario,
      forge_game: { ...ctx, ghost_to_move: false, to_move: "coral" },
    });
    check(
      "G5 the evaluator stays silent when it is not the ghost's turn",
      notTurn === null,
      "watching is not moving"
    );
  }
  game.end();
  peer.destroy();
}

/* ---- G6. discipline ---------------------------------------------------------- */

{
  const { scene } = seatScene();
  const { game, log } = makeGame();
  game.start("vs-ghost");
  // Wrong turn: it is coral's move; tapping a TEAL piece
  // selects nothing and changes nothing.
  game.tapNode("checkers-pc-teal-1");
  check(
    "G6 a wrong-side tap in pass discipline selects nothing and changes nothing",
    game.snapshot().selectedPieceId === null &&
      game.getState().moveNumber === 0,
    `selected=${game.snapshot().selectedPieceId}`
  );
  // Illegal destination: select coral-1, tap a square it
  // cannot reach — deselect, no move.
  game.tapNode("checkers-pc-coral-1");
  const wasSelected = game.snapshot().selectedPieceId === "coral-1";
  game.tapNode("checkers-sq-3-2");
  check(
    "G6 an illegal destination deselects without moving",
    wasSelected &&
      game.snapshot().selectedPieceId === null &&
      game.getState().moveNumber === 0 &&
      censusOk(scene, game.getState()),
    `moves=${game.getState().moveNumber}`
  );
  // Human opens legally; now the ghost's turn is inert to taps.
  game.tapNode("checkers-pc-coral-1");
  game.tapNode("checkers-sq-4-1");
  game.tapNode("checkers-pc-teal-1");
  check(
    "G6 taps are inert during the ghost's turn (vs-ghost turn discipline)",
    game.getState().moveNumber === 1 &&
      game.snapshot().selectedPieceId === null,
    `moves=${game.getState().moveNumber}`
  );
  // A ghost move that is NOT among the enumerated legal moves:
  // performed on the scene by the performer (as a rogue brain
  // would), then handed to the referee.
  const tealPiece = (() => {
    const st = game.getState();
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (st.cells[r * 8 + c]?.side === "teal") return st.cells[r * 8 + c].id;
    return null;
  })();
  const rogue = {
    mood_shift: null,
    intent: "forge-move",
    pattern_id: null,
    draw_shape: null,
    note_name: null,
    sound_spec: null,
    music_phrase: null,
    forge_spec: {
      node: S.checkersPieceId(tealPiece),
      position: [0, 0.2, 0], // no legal move lands here
    },
    intensity: 0.5,
    linger_s: 3,
  };
  const o1 = fp.performForgeDecision(rogue);
  game.noteGhostDecision(rogue, o1);
  const restored = censusOk(scene, game.getState());
  check(
    "G6 an unlisted ghost move is restored by the referee and reported (first offense: game stands)",
    o1.kind === "performed" &&
      restored &&
      !game.snapshot().halted &&
      log.events.some((e) => e.type === "ghost-illegal-move") &&
      log.senses.some((s) => s && typeof s.referee_note === "string"),
    `halted=${game.snapshot().halted} census=${restored}`
  );
  const o2 = fp.performForgeDecision(rogue);
  game.noteGhostDecision(rogue, o2);
  check(
    "G6 a second consecutive illegal ghost move stops the game, with the reason showing",
    o2.kind === "performed" &&
      typeof game.snapshot().halted === "string" &&
      game.snapshot().banner.includes("stopped"),
    `halted=${game.snapshot().halted}`
  );
  game.end();
}

console.log(`\ncheckers-check: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
