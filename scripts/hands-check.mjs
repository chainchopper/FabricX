/**
 * hands-check — headless proof for Slice 28 ("Hands": camera
 * gesture input for the canvas).
 *
 * Proves:
 * - MAPPING (behavioral, real handGeometry bundle): landmark space
 *   → canvas space is mirrored + y-flipped — a centered fingertip
 *   maps to the canvas center; a left-of-frame fingertip lands on
 *   the canvas's right.
 * - PINCH (behavioral): the pinch verdict is a ratio over the
 *   hand's own scale — pressed thumb-to-index reads pinched at any
 *   hand size; an open pointing hand does not.
 * - SIGNS (behavioral): the classifier over synthetic landmark
 *   fixtures — hold / peace / fist / thumbs-up each classify, and
 *   the negative cases hold (peace is not a fist, a thumb-folded
 *   fist is not a thumbs-up, a pointing hand is no sign at all).
 * - ENGINE (behavioral, real handsEngine bundle driven by a fake
 *   landmarker + dispatch recorder): point-draw emits strokes
 *   through FABRIC_HAND_INPUT_EVENT tagged source "hand"; a pinch
 *   tap emits a pinched stroke with no motion; signs fire only
 *   after the ~600ms hold, fire once per hold, and re-arm after
 *   release — peace dispatches the CHEER verb event, thumbs-up the
 *   HEART verb event, the fist a "clear" hand input, the held palm
 *   the sign event alone; a fast open palm emits a "push" along
 *   its motion while a slow drift emits nothing; start/stop drive
 *   the injected landmarker's lifecycle.
 * - SEAMS (structural): LegacyFluid answers the hand events
 *   through the sendInteraction funnel with source "hand" stamps
 *   and forwards signs to GhostPeer.noteHandSign (which journals
 *   them into deliberation's recent_events); the renderer's slot
 *   mounts both Hands components; the SAM camera store exposes
 *   its element for on-device detection; the menu carries the
 *   toggle (THIS LAYER block + host edit fields + card labels);
 *   the ID cards carry the privacy line; package.json does NOT
 *   carry the MediaPipe dependency (Metro cannot bundle it —
 *   Hotfix 2.10) and the engine loads the pinned library build
 *   from the CDN through a runtime-constructed import instead.
 *
 * Build + run:
 *   node scripts/hands-check.mjs
 * (the script bundles the hands modules itself with esbuild)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

/* ================= bundle the real modules ================= */
const entry = join(tmpdir(), "hands-check-entry.ts");
writeFileSync(
  entry,
  [
    `export * from ${JSON.stringify(new URL("../src/hands/handGeometry.ts", import.meta.url).pathname)};`,
    `export { createHandsEngine } from ${JSON.stringify(new URL("../src/hands/handsEngine.ts", import.meta.url).pathname)};`,
    `export { getHandsSnapshot } from ${JSON.stringify(new URL("../src/hands/handsStore.ts", import.meta.url).pathname)};`,
    `export { FABRIC_HAND_INPUT_EVENT, FABRIC_HAND_SIGN_EVENT } from ${JSON.stringify(new URL("../src/hands/handsStore.ts", import.meta.url).pathname)};`,
  ].join("\n")
);
const bundlePath = join(tmpdir(), "hands-bundle.mjs");
execFileSync(
  "npx",
  [
    "-y", "esbuild", entry,
    "--bundle", "--format=esm", "--platform=node",
    // NO --external for @mediapipe/tasks-vision: since Hotfix 2.10
    // the engine never names that specifier to a bundler, so this
    // bundle succeeding with no external proves the point — any
    // literal import creeping back fails resolution right here.
    `--outfile=${bundlePath}`,
  ],
  { stdio: "inherit" }
);
const H = await import(bundlePath);
const {
  landmarkToCanvas,
  pinchRatio,
  isPinched,
  classifySign,
  isPointPose,
  createHandsEngine,
  getHandsSnapshot,
  FABRIC_HAND_INPUT_EVENT,
  FABRIC_HAND_SIGN_EVENT,
} = H;
const FABRIC_VERB_EVENT = "fabric:verb";

/* ================= synthetic hand fixtures =================
 * A parametric hand in landmark space (x right, y DOWN). Knuckles
 * across the top of the palm, wrist below. A finger is "extended"
 * by placing its tip farther from the wrist than its PIP along the
 * finger's outward direction; "folded" curls the tip back toward
 * the wrist. The thumb has three states: folded across the palm,
 * extended out to the side, and UP (extended + tip raised, for
 * thumbs-up). */
function makeHand({ index = "folded", middle = "folded", ring = "folded", pinky = "folded", thumb = "folded" } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const wrist = { x: 0.5, y: 0.8 };
  lm[0] = wrist;
  const knuckles = {
    index: { x: 0.42, y: 0.55 },
    middle: { x: 0.5, y: 0.52 },
    ring: { x: 0.58, y: 0.55 },
    pinky: { x: 0.66, y: 0.58 },
  };
  const dirs = {
    index: { x: -0.15, y: -1 },
    middle: { x: 0, y: -1 },
    ring: { x: 0.15, y: -1 },
    pinky: { x: 0.3, y: -1 },
  };
  const slots = {
    index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
    middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
    ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
    pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
  };
  const states = { index, middle, ring, pinky };
  for (const f of ["index", "middle", "ring", "pinky"]) {
    const k = knuckles[f];
    const d = dirs[f];
    const s = slots[f];
    lm[s.mcp] = { ...k };
    lm[s.pip] = { x: k.x + d.x * 0.09, y: k.y + d.y * 0.09 };
    if (states[f] === "extended") {
      lm[s.dip] = { x: k.x + d.x * 0.15, y: k.y + d.y * 0.15 };
      lm[s.tip] = { x: k.x + d.x * 0.21, y: k.y + d.y * 0.21 };
    } else {
      // Folded: the tip curls back past the PIP toward the wrist.
      lm[s.dip] = { x: k.x + d.x * 0.05, y: k.y + d.y * 0.05 };
      lm[s.tip] = { x: k.x - d.x * 0.03, y: k.y - d.y * 0.03 };
    }
  }
  // Thumb joints: CMC(1) IP(2) MCP(3) TIP(4).
  lm[1] = { x: 0.4, y: 0.7 };
  lm[3] = { x: 0.35, y: 0.65 };
  lm[2] = { x: 0.33, y: 0.62 };
  if (thumb === "extended") lm[4] = { x: 0.24, y: 0.56 };
  else if (thumb === "up") lm[4] = { x: 0.3, y: 0.48 };
  else lm[4] = { x: 0.45, y: 0.63 }; // folded across the palm
  return lm;
}

const OPEN_PALM = makeHand({ index: "extended", middle: "extended", ring: "extended", pinky: "extended", thumb: "extended" });
const FIST = makeHand({ thumb: "folded" });
const PEACE = makeHand({ index: "extended", middle: "extended", thumb: "folded" });
const THUMBS_UP = makeHand({ thumb: "up" });
const POINT = makeHand({ index: "extended", thumb: "folded" });
const PINCH = (() => {
  const lm = makeHand({ index: "extended", thumb: "folded" });
  lm[4] = { x: lm[8].x + 0.012, y: lm[8].y + 0.008 }; // thumb tip on the index tip
  return lm;
})();

/* ================= mapping ================= */
console.log("== mapping: landmark space -> canvas space ==");
{
  const c = landmarkToCanvas({ x: 0.5, y: 0.5 });
  check("centered fingertip maps to canvas center", c.x === 0.5 && c.y === 0.5, `(${c.x}, ${c.y})`);
  const l = landmarkToCanvas({ x: 0.25, y: 0.3 });
  check("left-of-frame maps to canvas right (mirror)", Math.abs(l.x - 0.75) < 1e-9, `x=${l.x}`);
  check("top-of-frame maps to canvas top (y-flip)", Math.abs(l.y - 0.7) < 1e-9, `y=${l.y}`);
}

/* ================= pinch ================= */
console.log("== pinch: a ratio over the hand's own scale ==");
check("pressed thumb-to-index is pinched", isPinched(PINCH), `ratio=${pinchRatio(PINCH).toFixed(3)}`);
check("open pointing hand is not pinched", !isPinched(POINT), `ratio=${pinchRatio(POINT).toFixed(3)}`);
check("pointing pose reads on the point fixture", isPointPose(POINT));
check("peace is not a pointing pose (it must not paint)", !isPointPose(PEACE));

/* ================= signs ================= */
console.log("== signs: classifier over fixtures ==");
check("open palm -> hold", classifySign(OPEN_PALM) === "hold");
check("peace -> peace", classifySign(PEACE) === "peace");
check("fist -> fist", classifySign(FIST) === "fist");
check("thumbs-up -> thumbsup", classifySign(THUMBS_UP) === "thumbsup");
check("negative: peace is not fist/hold", classifySign(PEACE) !== "fist" && classifySign(PEACE) !== "hold");
check("negative: thumb-folded fist is not thumbs-up", classifySign(FIST) !== "thumbsup");
check("negative: pointing hand is no sign", classifySign(POINT) === null);
check(
  "negative: three fingers up is no sign",
  classifySign(makeHand({ index: "extended", middle: "extended", ring: "extended" })) === null
);
check("negative: empty landmarks classify null", classifySign([]) === null);

/* ================= engine: gestures in, fabric events out ================= */
console.log("== engine: the decision path, driven headlessly ==");
function makeEngineRig() {
  const events = [];
  let closed = false;
  const engine = createHandsEngine({
    createLandmarker: async () => ({
      detectForVideo: () => ({ landmarks: [] }),
      close: () => {
        closed = true;
      },
    }),
    dispatch: (type, detail) => events.push({ type, detail }),
    now: () => 0,
    raf: () => 1,
    cancelRaf: () => {},
  });
  return { engine, events, wasClosed: () => closed };
}
const ofType = (evts, type) => evts.filter((e) => e.type === type);
const handInputs = (evts) => ofType(evts, FABRIC_HAND_INPUT_EVENT).map((e) => e.detail);

{
  // Point-draw: first frame plants the tip, the next move strokes.
  const { engine, events } = makeEngineRig();
  engine.processFrame(POINT, 0);
  check("first pointing frame emits no stroke (no delta yet)", handInputs(events).length === 0);
  const moved = POINT.map((p) => ({ ...p }));
  moved[8] = { x: moved[8].x - 0.04, y: moved[8].y }; // fingertip moves in landmark space
  engine.processFrame(moved, 33);
  const moved2 = POINT.map((p) => ({ ...p }));
  moved2[8] = { x: moved2[8].x - 0.08, y: moved2[8].y };
  engine.processFrame(moved2, 66);
  const strokes = handInputs(events).filter((d) => d.kind === "stroke");
  check("moving fingertip emits strokes", strokes.length >= 1, `n=${strokes.length}`);
  check("stroke is tagged source hand", strokes[0]?.source === "hand");
  check(
    "stroke delta is canvas-space (mirrored: landmark -x -> canvas +x, converging past the smoother)",
    strokes.length >= 2 && strokes[strokes.length - 1].dx > 0.02,
    `dx=${strokes[strokes.length - 1]?.dx}`
  );
  check("unpinched stroke says so", strokes[0]?.pinched === false);

  // A pinch tap with no motion still lands one press.
  const rig2 = makeEngineRig();
  rig2.engine.processFrame(POINT, 0);
  rig2.engine.processFrame(PINCH, 33);
  const press = handInputs(rig2.events).filter((d) => d.kind === "stroke");
  check("pinch edge emits a press stroke without motion", press.length === 1 && press[0].pinched === true);
}

{
  // Signs: hold time, single fire, re-arm.
  const { engine, events } = makeEngineRig();
  for (let t = 0; t < 600; t += 100) engine.processFrame(PEACE, t);
  check(
    "peace held <600ms fires nothing",
    ofType(events, FABRIC_VERB_EVENT).length === 0 && ofType(events, FABRIC_HAND_SIGN_EVENT).length === 0
  );
  engine.processFrame(PEACE, 600);
  const verbs = ofType(events, FABRIC_VERB_EVENT).map((e) => e.detail);
  const signs = ofType(events, FABRIC_HAND_SIGN_EVENT).map((e) => e.detail);
  check("peace held 600ms fires the sign event", signs.length === 1 && signs[0].sign === "peace");
  check("peace rides the verb funnel as cheer", verbs.length === 1 && verbs[0] === "cheer");
  for (let t = 700; t <= 1500; t += 100) engine.processFrame(PEACE, t);
  check(
    "a continuing hold does not refire",
    ofType(events, FABRIC_VERB_EVENT).length === 1 && ofType(events, FABRIC_HAND_SIGN_EVENT).length === 1
  );
  engine.processFrame(null, 1600);
  engine.processFrame(null, 1800);
  for (let t = 1900; t <= 2500; t += 100) engine.processFrame(PEACE, t);
  check(
    "release and re-hold fires again",
    ofType(events, FABRIC_HAND_SIGN_EVENT).length === 2,
    `signs=${ofType(events, FABRIC_HAND_SIGN_EVENT).length}`
  );
  const snap = getHandsSnapshot();
  check("the store remembers the last sign", snap.lastSign?.sign === "peace");
}

{
  const { engine, events } = makeEngineRig();
  for (let t = 0; t <= 600; t += 100) engine.processFrame(THUMBS_UP, t);
  const verbs = ofType(events, FABRIC_VERB_EVENT).map((e) => e.detail);
  check("thumbs-up held fires heart through the verb funnel", verbs.length === 1 && verbs[0] === "heart");
}
{
  const { engine, events } = makeEngineRig();
  for (let t = 0; t <= 600; t += 100) engine.processFrame(FIST, t);
  const clears = handInputs(events).filter((d) => d.kind === "clear");
  const signs = ofType(events, FABRIC_HAND_SIGN_EVENT).map((e) => e.detail);
  check("fist held fires a clear hand input", clears.length === 1 && clears[0].source === "hand");
  check("fist also fires its sign event (the ghost hears it)", signs.length === 1 && signs[0].sign === "fist");
}
{
  const { engine, events } = makeEngineRig();
  for (let t = 0; t <= 600; t += 100) engine.processFrame(OPEN_PALM, t);
  const signs = ofType(events, FABRIC_HAND_SIGN_EVENT).map((e) => e.detail);
  check(
    "held palm fires ONLY the sign event (the ghost answers hold)",
    signs.length === 1 && signs[0].sign === "hold" &&
      ofType(events, FABRIC_VERB_EVENT).length === 0 && handInputs(events).length === 0
  );
}

{
  // Palm push: an open palm moving fast shoves; a slow one doesn't.
  const { engine, events } = makeEngineRig();
  const shifted = (lm, dx) => lm.map((p) => ({ x: p.x + dx, y: p.y }));
  let palm = OPEN_PALM;
  engine.processFrame(palm, 0);
  for (let t = 100; t <= 400; t += 100) {
    palm = shifted(palm, -0.13); // ~1.3 canvas units/s after the mirror
    engine.processFrame(palm, t);
  }
  const pushes = handInputs(events).filter((d) => d.kind === "push");
  check("fast open palm emits a push", pushes.length >= 1, `pushes=${pushes.length}`);
  check("push travels along the palm's motion (canvas +x)", pushes[0] && pushes[0].dx > 0.5, `dx=${pushes[0]?.dx}`);

  const rig2 = makeEngineRig();
  let slow = OPEN_PALM;
  rig2.engine.processFrame(slow, 0);
  for (let t = 100; t <= 500; t += 100) {
    slow = shifted(slow, -0.02); // ~0.2 units/s — a drift, not a shove
    rig2.engine.processFrame(slow, t);
  }
  check(
    "slow open palm emits no push",
    handInputs(rig2.events).filter((d) => d.kind === "push").length === 0
  );
}

{
  // Lifecycle: start/stop drive the injected landmarker.
  const { engine, wasClosed } = makeEngineRig();
  const video = { readyState: 2, currentTime: 0 };
  await engine.start(video);
  check("engine runs after start", engine.running === true);
  engine.stop();
  check("stop closes the landmarker", wasClosed() === true);
  check("engine no longer runs after stop", engine.running === false);
  const snap = getHandsSnapshot();
  check("stop clears the hand from the store", snap.handPresent === false && snap.tip === null);
}

/* ================= structural: the seams ================= */
console.log("== seams: structural ==");
const fluid = read("src/components/fluid/LegacyFluid.tsx");
const renderer = read("src/components/experiences/ExperienceRenderer.tsx");
const menu = read("app/components/fabric/FabricMenu.tsx");
const cards = read("app/components/fabric/IdCards.tsx");
const samStore = read("src/sam/samCameraStore.ts");
const ghost = read("src/ghost/GhostPeer.ts");
const layer = read("src/components/hands/HandsLayer.tsx");
const fluidTypes = read("src/types/fluid.ts");
const pkg = read("package.json");
const engine = read("src/hands/handsEngine.ts");

check("renderer imports HandsLayer + HandsCameraBackground",
  renderer.includes("HandsLayer") && renderer.includes("HandsCameraBackground"));
check("renderer mounts the hands slot", renderer.includes("<HandsCameraBackground />") && renderer.includes("<HandsLayer />"));
check("LegacyFluid listens for hand input", fluid.includes("FABRIC_HAND_INPUT_EVENT"));
check("LegacyFluid listens for hand signs", fluid.includes("FABRIC_HAND_SIGN_EVENT"));
check("hand interactions are stamped source hand (>=3)", (fluid.match(/source: "hand"/g) ?? []).length >= 3);
check("hand strokes ride the batched funnel like engine strokes",
  fluid.includes('sendRef.current(interaction, undefined, { batch: true })'));
check("signs forward to the ghost", fluid.includes("noteHandSign(d.sign)"));
check("backdrop follows the hands camera", fluid.includes("getHandsSnapshot().cameraLive") && fluid.includes("subscribeHands"));
check("GhostPeer.noteHandSign exists and journals deliberation labels",
  ghost.includes("noteHandSign(sign: string)") && ghost.includes('"peace sign received"') && ghost.includes("markDeliberationDirty"));
check("FluidInteraction carries the source tag", fluidTypes.includes("source?: string"));
check("SAM camera store exposes its element for on-device detection", samStore.includes("export function getSamVideoElement"));
check("HandsLayer detects on SAM's stream (no second camera)", layer.includes("getSamVideoElement()"));
check("HandsLayer's own camera is cover-fit + under the fluid",
  layer.includes('el.style.objectFit = "cover"') && layer.includes("zIndex: -1"));
check("overlay sits above the fluid and takes no pointer events",
  layer.includes("zIndex: 31") && layer.includes('pointerEvents="none"'));
check("toggle turns the camera off (tracks stopped on teardown)",
  layer.includes("getTracks().forEach((t) => t.stop())") && layer.includes("registerHandsVideo(null)"));
check("menu: Hands block in THIS LAYER", menu.includes('labelPrefix="Hands"'));
check("menu: hands state mirrors the store", menu.includes("subscribeHands(setHandsUi)"));
check("menu: host edit fields carry handsEnabled (both layers)",
  (menu.match(/key: "handsEnabled"/g) ?? []).length >= 2);
check("menu: layer card labels carry Hands", menu.includes('handsEnabled: "Hands (gesture input)"'));
check("ID cards carry the hands privacy line (both layers)",
  (cards.match(/Hands: your camera is read on this device only/g) ?? []).length >= 2);
check("ID card lists Hands among See's tools", cards.includes('"Hands — gesture input"'));
check("package.json does NOT carry the MediaPipe dependency (Metro cannot bundle it)", !pkg.includes('"@mediapipe/tasks-vision"'));
check("engine loads tasks-vision from the pinned CDN build", engine.includes("TASKS_VISION_CDN_URL") && engine.includes("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@") && engine.includes("/vision_bundle.mjs"));
check("engine imports tasks-vision at runtime only (no bundler-visible specifier)",
  engine.includes("return import(u)") && !engine.includes('import("@mediapipe/tasks-vision")') && !engine.includes('from "@mediapipe/tasks-vision"'));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
