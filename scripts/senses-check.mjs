/**
 * senses-check — headless proof for Slice 34 ("Senses", Layer B,
 * FULL CORE B1+B2+B3 of the final-two-layers spec).
 *
 * Run: node scripts/senses-check.mjs
 *   (the script bundles the modules it drives with esbuild itself —
 *    the house .tools install — into /tmp, then imports them)
 *
 * Proves:
 *   B1 — the gesture vocabulary: Slice 28's facts become v2 tokens
 *        (signs, pinch, point, finger_draw, wave, palm_push,
 *        thumbs_down) exactly once per gesture; a non-vocabulary
 *        hand shape produces NO token; no asl_ token is EVER
 *        produced (B5 is a reserved slot, not a recognizer); the
 *        tokens land in the ghost's scenario digest (GhostPeer
 *        noteGesture -> buildScenario().gestures) and change the
 *        Spark digest text; garbage tokens are refused at the
 *        sanitizer; "none" is never journaled.
 *   B2 — touchless interaction: synthetic landmarks through the
 *        REAL hands engine emit stroke inputs (source "hand") on
 *        the same seam LegacyFluid funnels to sendInteraction as
 *        a finger (pinned structurally for the component itself),
 *        and a pinch produces the grab start/move/end sequence.
 *   B3 — the controller role: the store's role + calibration
 *        contract (capture delegation, sanitizer, persistence
 *        shape), the tilt event's geometry (identical to Slice
 *        12's local tilt splat), and the wiring pins: the sensor
 *        hook routes a controller's lean to onTilt instead of the
 *        local engine, LegacyFluid sends it as kind:"tilt" and
 *        does not render a controller's shake locally, the
 *        control surface mounts in controller mode, the menu
 *        carries the role + calibration controls.
 *   REGRESSIONS — fabrics-gallery, see-acts, sam and ghost-tools
 *        check scripts run as child processes and must pass.
 */
import { build } from "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (cond) pass++;
  else fail++;
};
const src = (p) => readFileSync(p, "utf8");

/* ---------------- bundles ---------------- */
writeFileSync(
  "/tmp/asyncstorage-stub34.mjs",
  `const mem = new Map();\nexport default { getItem: async (k) => (mem.has(k) ? mem.get(k) : null), setItem: async (k, v) => { mem.set(k, v); }, removeItem: async (k) => { mem.delete(k); } };\n`
);
const bundle = async (entry, out, alias = false) => {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    outfile: out,
    logLevel: "silent",
    ...(alias
      ? {
          alias: {
            "@react-native-async-storage/async-storage":
              "/tmp/asyncstorage-stub34.mjs",
          },
        }
      : {}),
  });
  return import(out);
};
const vocab = await bundle("src/hands/gestureVocabulary.ts", "/tmp/GV34.mjs");
const geom = await bundle("src/hands/handGeometry.ts", "/tmp/HG34.mjs");
const engineMod = await bundle("src/hands/handsEngine.ts", "/tmp/HE34.mjs");
const brain = await bundle("src/ghost/GhostBrain.ts", "/tmp/GB34.mjs");
const peerMod = await bundle("src/ghost/GhostPeer.ts", "/tmp/GP34.mjs");
const ctrl = await bundle("src/sensors/controllerStore.ts", "/tmp/CS34.mjs", true);

const {
  GESTURE_TOKENS,
  SIGN_TO_GESTURE_TOKEN,
  createGestureTracker,
  isGestureToken,
  isReservedAslToken,
  isThumbsDownPose,
} = vocab;
const { createHandsEngine, FABRIC_GESTURE_EVENT } = engineMod;
// Event names are string constants in handsStore; read them from src
// to pin the engine's dispatches against the store's contract.
const handsStoreSrc = src("src/hands/handsStore.ts");
const EV = {
  input: "fabric:hand-input",
  sign: "fabric:hand-sign",
  gesture: "fabric:gesture",
  verb: "fabric:verb",
};
check(
  "the store's event names are the ones this check listens for",
  handsStoreSrc.includes(`"${EV.input}"`) &&
    handsStoreSrc.includes(`"${EV.sign}"`) &&
    handsStoreSrc.includes(`"${EV.gesture}"`)
);

/* ---------------- landmark fixtures ----------------
 * Image space (x right, y DOWN), 21 landmarks. Extension is judged
 * by handGeometry's distance ratios; these coordinates satisfy
 * them (see the module's tests in Slice 28 for the same craft). */
function makeHand({ index = false, middle = false, ring = false, pinky = false, thumb = "folded", ox = 0, oy = 0 } = {}) {
  const P = (x, y) => ({ x: x + ox, y: y + oy });
  const lm = new Array(21);
  lm[0] = P(0.5, 0.8); // wrist
  // thumb: 1 CMC, 2 IP, 3 DIP-ish, 4 tip
  if (thumb === "up") {
    lm[1] = P(0.43, 0.67); lm[2] = P(0.4, 0.62); lm[3] = P(0.38, 0.5); lm[4] = P(0.36, 0.38);
  } else if (thumb === "down") {
    lm[1] = P(0.43, 0.62); lm[2] = P(0.4, 0.55); lm[3] = P(0.38, 0.68); lm[4] = P(0.37, 0.8);
  } else {
    lm[1] = P(0.44, 0.68); lm[2] = P(0.42, 0.64); lm[3] = P(0.52, 0.6); lm[4] = P(0.6, 0.6);
  }
  const finger = (mcpI, mcp, ext, folded) => {
    const [pip, dip, tip] = ext ? ext : folded;
    lm[mcpI] = P(...mcp); lm[mcpI + 1] = P(...pip); lm[mcpI + 2] = P(...dip); lm[mcpI + 3] = P(...tip);
  };
  finger(5, [0.42, 0.56], index && [[0.41, 0.46], [0.405, 0.39], [0.4, 0.32]], [[0.42, 0.5], [0.43, 0.56], [0.44, 0.62]]);
  finger(9, [0.5, 0.55], middle && [[0.5, 0.44], [0.5, 0.37], [0.5, 0.3]], [[0.5, 0.49], [0.51, 0.55], [0.52, 0.61]]);
  finger(13, [0.58, 0.56], ring && [[0.59, 0.46], [0.595, 0.39], [0.6, 0.32]], [[0.58, 0.5], [0.59, 0.56], [0.6, 0.62]]);
  finger(17, [0.65, 0.58], pinky && [[0.66, 0.49], [0.665, 0.43], [0.67, 0.37]], [[0.65, 0.52], [0.66, 0.57], [0.66, 0.62]]);
  return lm;
}
function pinchHand(opts = {}) {
  const lm = makeHand({ index: true, ...opts });
  // thumb tip pressed to the index tip (landmark 8 at (0.40,0.32)+offset)
  const ox = opts.ox ?? 0, oy = opts.oy ?? 0;
  lm[1] = { x: 0.43 + ox, y: 0.55 + oy };
  lm[2] = { x: 0.42 + ox, y: 0.47 + oy };
  lm[3] = { x: 0.415 + ox, y: 0.4 + oy };
  lm[4] = { x: 0.41 + ox, y: 0.33 + oy };
  return lm;
}

/* ---------------- A. vocabulary shape ---------------- */
check("the vocabulary is the v2 set (13 tokens)", GESTURE_TOKENS.length === 13);
check(
  "every Slice 28 sign has a token",
  ["hold", "peace", "fist", "thumbsup"].every((s) => isGestureToken(SIGN_TO_GESTURE_TOKEN[s]))
);
check(
  "sign mapping is the dataset's language",
  SIGN_TO_GESTURE_TOKEN.hold === "open_palm" &&
    SIGN_TO_GESTURE_TOKEN.fist === "closed_fist" &&
    SIGN_TO_GESTURE_TOKEN.peace === "peace" &&
    SIGN_TO_GESTURE_TOKEN.thumbsup === "thumbs_up"
);
check("asl_q is a reserved token shape", isReservedAslToken("asl_q"));
check("asl_ is not a vocabulary member", !isGestureToken("asl_q") && !isGestureToken("asl_1"));
check(
  "thumbs-down pose reads on its fixture only",
  isThumbsDownPose(makeHand({ thumb: "down" })) &&
    !isThumbsDownPose(makeHand({ thumb: "up" })) &&
    !isThumbsDownPose(makeHand({}))
);

/* ---------------- B. tracker (observation level) ---------------- */
const baseObs = {
  handPresent: true, firedSign: null, thumbsDownPose: false, pinched: false,
  pinchRatioValue: 1, pointPose: false, drawing: false, palmOpen: false,
  centroid: null, push: null, hand: "right",
};
{
  const t = createGestureTracker();
  let fired = [];
  for (let i = 0; i < 30; i++) fired = fired.concat(t.sample({ ...baseObs }, i * 33));
  check("a still, unreadable hand fires no token (no false reads)", fired.length === 0);
}
{
  const t = createGestureTracker();
  const r = t.sample({ ...baseObs, firedSign: "peace" }, 1000);
  check("a held peace fires the peace token once", r.length === 1 && r[0].token === "peace" && r[0].hand === "right");
}
{
  const t = createGestureTracker();
  // The pose is present from t=0 (the engine sees it every frame);
  // Slice 28's sign tracker fires "fist" at the 600ms hold — the
  // token layer must read THAT shape as thumbs_down, once.
  let tokens = [];
  for (let i = 0; i <= 18; i++) {
    tokens = tokens.concat(
      t.sample(
        {
          ...baseObs,
          thumbsDownPose: true,
          firedSign: i * 50 === 600 ? "fist" : null,
        },
        i * 50
      )
    );
  }
  check(
    "fist-classified thumbs-down reads as thumbs_down, not closed_fist",
    tokens.length === 1 && tokens[0].token === "thumbs_down",
    JSON.stringify(tokens.map((r) => r.token))
  );
  const t2 = createGestureTracker();
  const fist = t2.sample({ ...baseObs, firedSign: "fist" }, 600);
  check("a true fist reads closed_fist", fist.length === 1 && fist[0].token === "closed_fist");
}
{
  const t = createGestureTracker();
  let tokens = [];
  for (let i = 0; i < 10; i++) {
    tokens = tokens.concat(t.sample({ ...baseObs, pinched: true, pinchRatioValue: 0.1, pointPose: true }, i * 33));
  }
  check("a held pinch fires pinch exactly once (the edge)", tokens.length === 1 && tokens[0].token === "pinch" && tokens[0].confidence > 0.9);
}
{
  const t = createGestureTracker();
  let tokens = [];
  for (let i = 0; i < 20; i++) tokens = tokens.concat(t.sample({ ...baseObs, pointPose: true }, i * 50));
  check("a dwelling point fires point once", tokens.filter((r) => r.token === "point").length === 1);
  const t2 = createGestureTracker();
  let draws = [];
  for (let i = 0; i < 20; i++) draws = draws.concat(t2.sample({ ...baseObs, pointPose: true, drawing: true }, i * 50));
  check("a moving point is finger_draw, never point", draws.length === 1 && draws[0].token === "finger_draw");
}
{
  const t = createGestureTracker();
  const r = t.sample({ ...baseObs, push: { dx: 1.6, dy: 0.2 } }, 500);
  check("a palm push fires palm_push", r.length === 1 && r[0].token === "palm_push");
}

{
  const t = createGestureTracker();
  let tokens = [];
  const xs = [0.5, 0.54, 0.58, 0.54, 0.5, 0.46, 0.42, 0.46, 0.5, 0.54, 0.58];
  xs.forEach((x, i) => {
    tokens = tokens.concat(
      t.sample({ ...baseObs, palmOpen: true, centroid: { x, y: 0.5 } }, i * 50)
    );
  });
  check("an oscillating open palm fires wave once", tokens.filter((r) => r.token === "wave").length === 1);
}

/* ---------------- C. engine end-to-end (synthetic landmarks) ------- */
function driveEngine(frames) {
  const dispatched = [];
  const engine = createHandsEngine({
    createLandmarker: async () => ({ detectForVideo: () => ({ landmarks: [] }) }),
    dispatch: (type, detail) => dispatched.push({ type, detail }),
    now: () => 0,
    raf: () => 0,
    cancelRaf: () => {},
  });
  for (const [lm, t, hand] of frames) engine.processFrame(lm, t, hand ?? "unknown");
  engine.stop();
  return dispatched;
}
const framesEvery = (ms, n, fn) =>
  Array.from({ length: n }, (_, i) => [fn(i), i * ms]);

{
  // Held peace for 800ms: sign fires ~600ms -> verb + sign + token.
  const d = driveEngine(framesEvery(50, 17, () => makeHand({ index: true, middle: true })));
  const gestures = d.filter((e) => e.type === EV.gesture);
  check(
    "held peace: the ghost receives a peace TOKEN (B1)",
    gestures.length === 1 && gestures[0].detail.token === "peace" && gestures[0].detail.source === "hand",
    JSON.stringify(gestures.map((g) => g.detail.token))
  );
  check(
    "held peace: Slice 28's acts are unmoved (cheer verb + sign event)",
    d.some((e) => e.type === "fabric:verb" && e.detail === "cheer") &&
      d.some((e) => e.type === EV.sign && e.detail.sign === "peace")
  );
}
{
  // Non-vocabulary shape: index+middle+ring up, pinky down, still.
  const d = driveEngine(
    framesEvery(50, 24, () => makeHand({ index: true, middle: true, ring: true }))
  );
  check(
    "a non-vocabulary hand shape produces NO token and NO verb (no false reads)",
    d.filter((e) => e.type === EV.gesture).length === 0 &&
      d.filter((e) => e.type === "fabric:verb").length === 0
  );
}
{
  // Point-draw: index-only hand translating steadily for ~0.5s.
  const d = driveEngine(
    framesEvery(33, 16, (i) => makeHand({ index: true, ox: -0.02 * i }))
  );
  const strokes = d.filter((e) => e.type === EV.input && e.detail.kind === "stroke");
  const gestures = d.filter((e) => e.type === EV.gesture);
  check(
    "air-drawing emits stroke inputs on the hand seam (B2)",
    strokes.length >= 5 && strokes.every((s) => s.detail.source === "hand"),
    `${strokes.length} strokes`
  );
  check(
    "air-drawing reads as finger_draw in the digest language (B1)",
    gestures.length === 1 && gestures[0].detail.token === "finger_draw"
  );
}
{
  // Pinch-grab: close the pinch, travel, release.
  const seq = [];
  for (let i = 0; i < 3; i++) seq.push([makeHand({ index: true, ox: -0.02 * i }), i * 33]);
  for (let i = 0; i < 6; i++) seq.push([pinchHand({ ox: -0.06 - 0.02 * i }), 100 + i * 33]);
  for (let i = 0; i < 3; i++) seq.push([makeHand({ index: true, ox: -0.18 }), 300 + i * 33]);
  const d = driveEngine(seq);
  const grabs = d.filter((e) => e.type === EV.input && e.detail.kind === "grab");
  const phases = grabs.map((g) => g.detail.phase);
  check(
    "a pinch-grab lands, travels and releases (B2)",
    phases[0] === "start" && phases.includes("move") && phases[phases.length - 1] === "end",
    phases.join(",")
  );
  check(
    "the grab's travel carries fingertip deltas",
    grabs.filter((g) => g.detail.phase === "move").every((g) => Math.abs(g.detail.dx) > 0)
  );
  const gestures = d.filter((e) => e.type === EV.gesture);
  check(
    "the pinch also reads as a pinch token",
    gestures.some((g) => g.detail.token === "pinch")
  );
}
{
  // Palm push: open palm sweeping fast sideways.
  const d = driveEngine(
    framesEvery(33, 12, (i) =>
      makeHand({ index: true, middle: true, ring: true, pinky: true, ox: -0.06 * i })
    )
  );
  const gestures = d.filter((e) => e.type === EV.gesture);
  check(
    "a fast open-palm sweep reads palm_push (B1) and pushes (B2 seam)",
    gestures.some((g) => g.detail.token === "palm_push") &&
      d.some((e) => e.type === EV.input && e.detail.kind === "push")
  );
}
{
  // Wave through the engine: open palm oscillating at 50ms cadence.
  const xs = [0, 0.04, 0.08, 0.04, 0, -0.04, -0.08, -0.04, 0, 0.04, 0.08, 0.04];
  const d = driveEngine(
    xs.map((ox, i) => [
      makeHand({ index: true, middle: true, ring: true, pinky: true, ox }),
      i * 50,
    ])
  );
  const gestures = d.filter((e) => e.type === EV.gesture);
  check(
    "an open-palm wave reads as the wave token",
    gestures.some((g) => g.detail.token === "wave"),
    JSON.stringify(gestures.map((g) => g.detail.token))
  );
}
{
  // The B5 line, enforced: across every fixture above, nothing asl_.
  const all = [
    ...driveEngine(framesEvery(50, 17, () => makeHand({ index: true, middle: true }))),
    ...driveEngine(framesEvery(50, 17, () => makeHand({ thumb: "up" }))),
    ...driveEngine(framesEvery(50, 17, () => makeHand({ thumb: "down" }))),
    ...driveEngine(framesEvery(50, 17, () => makeHand({}))),
    ...driveEngine(
      framesEvery(50, 17, () =>
        makeHand({ index: true, middle: true, ring: true, pinky: true })
      )
    ),
  ];
  const tokens = all.filter((e) => e.type === EV.gesture).map((e) => e.detail.token);
  check(
    "no asl_ token is ever produced (B5 stays a reserved stub)",
    tokens.every((t) => !String(t).startsWith("asl_")),
    tokens.join(",")
  );
  check(
    "the static signs read in token language (thumbs_up, thumbs_down, closed_fist, open_palm)",
    tokens.includes("thumbs_up") &&
      tokens.includes("thumbs_down") &&
      tokens.includes("closed_fist") &&
      tokens.includes("open_palm"),
    tokens.join(",")
  );
}

/* ---------------- D. the ghost's digest (B1 lands) ----------------- */
function mkPeer() {
  return new peerMod.GhostPeer({
    peerId: "ghost:senses-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: () => {},
    broadcast: () => {},
    ghostName: "Boop",
    getFabricContext: () => null,
    onPerformance: () => {},
  });
}
{
  const quiet = mkPeer();
  const gestured = mkPeer();
  gestured.noteGesture({ token: "wave", hand: "right", confidence: 0.85, held_s: 0 });
  gestured.noteGesture({ token: "open_palm", hand: "right", confidence: 0.95, held_s: 0.6 });
  const sQuiet = quiet.buildScenario();
  const sGest = gestured.buildScenario();
  check(
    "a quiet room's scenario carries NO gestures key (absence is information)",
    !("gestures" in sQuiet)
  );
  check(
    "gesture readings land in the scenario digest, in the v2 shape",
    Array.isArray(sGest.gestures) &&
      sGest.gestures.length === 2 &&
      sGest.gestures[0].token === "wave" &&
      sGest.gestures[1].token === "open_palm" &&
      sGest.gestures[1].hand === "right" &&
      sGest.gestures[1].held_s === 0.6,
    JSON.stringify(sGest.gestures)
  );
  check(
    "the gesture is journaled in the dataset's event vocabulary",
    sGest.recent_events.some((e) => e === "gesture open_palm")
  );
  const digestQuiet = brain
    .buildSparkMessages(sQuiet)
    .map((m) => m.content)
    .join("\n");
  const digestGest = brain
    .buildSparkMessages(sGest)
    .map((m) => m.content)
    .join("\n");
  check(
    "the digest the brain reads DIFFERS with a gesture in it",
    digestGest !== digestQuiet && digestGest.includes('"gestures"') && digestGest.includes('"wave"')
  );
  const tableOut = brain.decideOnDevice(sGest);
  check(
    "the on-device table still decides with gestures present (no crash, valid shape)",
    !!tableOut && typeof tableOut.decision.intent === "string"
  );
  gestured.noteGesture({ token: "banana", hand: "right", confidence: 1, held_s: 0 });
  gestured.noteGesture({ token: "none", hand: "right", confidence: 1, held_s: 0 });
  const sAfter = gestured.buildScenario();
  check(
    "out-of-vocabulary tokens and 'none' never reach the digest",
    sAfter.gestures.length === 2 &&
      sAfter.recent_events.every((e) => !e.includes("banana") && !e.includes("none"))
  );
  quiet.destroy();
  gestured.destroy();
}
{
  const clean = brain.sanitizeGestureReadings([
    { token: "pinch", hand: "left", confidence: 1.7, held_s: 99 },
    { token: "asl_a", hand: "right", confidence: 0.5, held_s: 0.2 },
    { token: "wave", hand: "sideways", confidence: "high", held_s: -3 },
    { token: "nope", hand: "left", confidence: 0.5, held_s: 0 },
    { token: "point", hand: "right", confidence: 0.8, held_s: 0.4 },
    { token: "peace", hand: "right", confidence: 0.9, held_s: 0.6 },
  ]);
  check(
    "the sanitizer clamps to the v2 shape (cap 3, ranges, hand fallback)",
    clean.length === 3 &&
      clean[0].confidence === 1 &&
      clean[0].held_s === 30 &&
      clean[2].hand === "unknown" &&
      clean[2].confidence === 0.5,
    JSON.stringify(clean)
  );
  check(
    "the sanitizer CARRIES the reserved asl_ shape (a future recognizer's slot)",
    clean.some((g) => g.token === "asl_a")
  );
  check(
    "the sanitizer refuses non-arrays and junk",
    brain.sanitizeGestureReadings("wave").length === 0 &&
      brain.sanitizeGestureReadings([42, null, []]).length === 0
  );
}

/* ---------------- E. controller (B3) ------------------------------- */
{
  check(
    "the controller stance defaults to screen",
    ctrl.getControllerSnapshot().role === "screen" && !ctrl.isControllerRole()
  );
  ctrl.setControllerRole("controller");
  check(
    "joining as controller flips the device stance",
    ctrl.isControllerRole() && ctrl.getControllerSnapshot().role === "controller"
  );
  check(
    "calibration with no live sensor records NOTHING (no fiction)",
    ctrl.requestControllerCalibration() === false &&
      ctrl.getControllerSnapshot().calibration === null
  );
  ctrl.registerCalibrationCapture(() => ({ beta: 38.4, gamma: -6.2 }));
  check(
    "calibration captures the live grip as the neutral",
    ctrl.requestControllerCalibration() === true &&
      ctrl.getControllerSnapshot().calibration.beta0 === 38.4 &&
      ctrl.getControllerSnapshot().calibration.gamma0 === -6.2
  );
  ctrl.registerCalibrationCapture(null);
  const sane = ctrl.sanitizeControllerPersisted({
    role: "controller",
    calibration: { beta0: 40, gamma0: 2, capturedAt: 123 },
  });
  const junk = ctrl.sanitizeControllerPersisted({ role: "pilot", calibration: { beta0: "x" } });
  check(
    "persisted stance sanitizes (role allowlist, numeric angles)",
    sane.role === "controller" && sane.calibration.beta0 === 40 &&
      junk.role === "screen" && junk.calibration === null
  );
  const tilt = ctrl.tiltInteractionFor(0.5, -0.5, { r: 1, g: 0, b: 0 });
  check(
    "the tilt event carries Slice 12's own splat geometry",
    tilt.kind === "tilt" &&
      Math.abs(tilt.position.x - 0.42) < 1e-9 &&
      Math.abs(tilt.position.y - 0.58) < 1e-9 &&
      tilt.force.x === 21 &&
      tilt.force.y === -21,
    JSON.stringify(tilt)
  );
  ctrl.setControllerRole("screen");
  ctrl.clearControllerCalibration();
}

/* ---------------- F. wiring pins ----------------------------------- */
{
  const motion = src("src/sensors/useDeviceMotion.ts");
  const loopAt = motion.indexOf("callbacksRef.current.controller");
  const splatAt = motion.indexOf("engine.splatAt(", loopAt);
  check(
    "the sensor hook routes a controller's lean to onTilt BEFORE any local splat",
    loopAt > 0 && motion.includes("callbacksRef.current.onTilt?.(tilt.x, tilt.y)") && splatAt > loopAt
  );
  check(
    "the hook's tilt math measures from the calibrated neutral when one exists",
    motion.includes("getControllerSnapshot().calibration") &&
      motion.includes("cal ? cal.beta0 : NEUTRAL_BETA_DEG")
  );
  check(
    "the hook registers the calibration capture for the store",
    motion.includes("registerCalibrationCapture(")
  );

  const fluid = src("src/components/fluid/LegacyFluid.tsx");
  check(
    "LegacyFluid forwards gesture events to the ghost's noteGesture sense",
    fluid.includes("FABRIC_GESTURE_EVENT") &&
      fluid.includes("ghostRef.current.noteGesture({")
  );
  check(
    "hand strokes enter the SAME send funnel as fingers (sendRef, source hand)",
    fluid.includes('source: "hand"') &&
      fluid.includes("sendRef.current(interaction, undefined, { batch: true })")
  );
  check(
    "LegacyFluid answers grab inputs through the funnel (start/move/end geometry)",
    fluid.includes('d.kind === "grab"') &&
      fluid.includes('d.phase === "end"') &&
      fluid.includes("radiusScale: releasing ? 2.2 : 1.8")
  );
  check(
    "a controller's shake sends but does NOT bloom on its own surface",
    fluid.includes("if (!controllerRef.current) {") &&
      fluid.includes('kind: "shake"')
  );
  check(
    "LegacyFluid sends a controller's lean as tilt interactions",
    fluid.includes("tiltInteractionFor(tiltX, tiltY, color)") &&
      fluid.includes("onTilt: fireTilt")
  );
  check(
    "the control surface mounts exactly in controller mode",
    fluid.includes("{isController ? (") && fluid.includes("<ControllerSurface")
  );

  const fluidTypes = src("src/types/fluid.ts");
  check(
    "the wire kind vocabulary admits tilt alongside shake",
    fluidTypes.includes('kind?: "shake" | "tilt"')
  );

  const menu = src("app/components/fabric/FabricMenu.tsx");
  check(
    "the menu carries the controller role + calibration (device stance, not layer config)",
    menu.includes("setControllerRole(next ? \"controller\" : \"screen\")") &&
      menu.includes("requestControllerCalibration()") &&
      menu.includes("Calibrate my grip") &&
      menu.includes("controllerStore")
  );
  const surface = src("src/components/fluid/ControllerSurface.tsx");
  check(
    "the control surface names the role and the way back",
    surface.includes("You're driving the room") &&
      surface.includes("setControllerRole(\"screen\")") &&
      surface.includes("requestControllerCalibration()")
  );
  const hook = src("src/ghost/useGhostPeer.ts");
  check(
    "the ghost hook exposes noteGesture (the Slice 31 drive-by lesson)",
    hook.includes("const noteGesture = useCallback(") &&
      hook.includes("noteGesture,")
  );
  const pkg = src("package.json");
  check(
    "package.json carries no tasks-vision dependency (Hotfix 2.10's law stands)",
    !pkg.includes("@mediapipe/tasks-vision")
  );
}

/* ---------------- G. regressions ----------------------------------- */
function runRegression(label, args, env = {}) {
  try {
    const out = execFileSync("node", args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 240000,
    });
    const tail = out.trim().split("\n").slice(-1)[0];
    check(`regression: ${label}`, true, tail.slice(0, 90));
  } catch (e) {
    check(`regression: ${label}`, false, String(e.stdout ?? e).slice(-300));
  }
}
await bundle("src/sam/samSegment.ts", "/tmp/samSegment34.mjs");
runRegression("fabrics-gallery-check", ["scripts/fabrics-gallery-check.mjs"]);
runRegression("see-acts-check", ["scripts/see-acts-check.mjs"]);
runRegression("sam-check", ["scripts/sam-check.mjs", "/tmp/samSegment34.mjs"]);
await bundle("src/ghost/GhostBrain.ts", "/tmp/GhostBrain23.mjs");
await bundle("src/ghost/ghostTools.ts", "/tmp/GhostTools23.mjs");
await bundle("src/ghost/GhostPeer.ts", "/tmp/GhostPeer23.mjs");
await bundle("src/ai/RecipeCore.ts", "/tmp/RecipeCore23.mjs");
await bundle("src/session/fabricStore.ts", "/tmp/FabricStore31.mjs");
runRegression("ghost-tools-check", [
  "scripts/ghost-tools-check.mjs",
  "/tmp/GhostBrain23.mjs",
  "/tmp/GhostTools23.mjs",
  "/tmp/GhostPeer23.mjs",
  "/tmp/RecipeCore23.mjs",
  "/home/hatch/workspace/fabric-ghost-factory/dataset-v1.jsonl",
  "/tmp/FabricStore31.mjs",
]);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(fail === 0 ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(fail === 0 ? 0 : 1);
