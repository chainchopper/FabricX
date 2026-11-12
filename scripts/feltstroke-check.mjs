// feltstroke-check — pins the Felt Strokes slice.
//
// The thesis event, finally felt: when a remote human draws on
// the shared fluid, the receiving phone murmurs with their
// strokes — light strokes a short tick, hard presses a longer
// buzz — through the existing vibration gate. The audit found
// the receiver felt NOTHING for a remote draw; the sender's own
// hard press was the only stroke that ever buzzed, on the wrong
// phone. This slice wires the receiving end.
//
// §A drives the REAL pure module (src/sensory/feltStroke):
//   the pressure→duration buckets at their exact boundaries,
//   malformed pressure never pulsing, monotonic durations.
// §B drives the REAL per-peer throttle: the 140 ms window,
//   per-peer independence, dropped strokes not resetting the
//   clock, reset, custom intervals.
// §C drives the REAL gate (src/sensory/vibration, bundled
//   with the same AsyncStorage stub haptics-toast-check uses)
//   through the exact three-line composition the handler runs
//   (duration → throttle → vibrate): gate ON fires once per
//   window, gate OFF fires nothing and raises the Slice 61
//   notice exactly once, a platform with no vibrator raises
//   nothing at all.
// §D pins the wiring in LegacyFluid by source: the block sits
//   in the remoteInteractions effect, after splatAt, guarded
//   by !isGhost && !i.verb && kind !== "shake"; verbs, shake
//   and the recipe player are untouched at their standing
//   behavior; the sender's own tick is unchanged; the
//   navigator.vibrate census still holds — feltStroke never
//   touches navigator, and no new actuator shape exists.
// §E pins the exclusions structurally (the handler is React
//   code and cannot run in node): the guard is the only thing
//   between a verb/ghost/shake and a pulse, so the guard text
//   is pinned verbatim; and the felt path exists in exactly
//   one place — the remote effect — so a local self-splat can
//   never double-buzz.
//
// What this check does NOT prove (said plainly): that a human
// hand FEELS it. Headless Chrome cannot feel, and neither can
// this check. It proves the wiring and the pattern; Terrell's
// phone proves the feeling. The browser proof (proof-felt/)
// captures the vibrate call itself, stubbed, as the log.
//
// Run: node scripts/feltstroke-check.mjs   (from the repo root)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}
const read = (p) => readFileSync(path.join(root, p), "utf8");

/* ---- bundle the real modules ------------------------------------- */

// AsyncStorage shim (the gate's lazy preference read rides it).
writeFileSync(
  "/tmp/felt-stub-asyncstorage.mjs",
  "const m = new Map();\nglobalThis.__feltstore = m;\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);
writeFileSync(
  "/tmp/feltstroke-entry.ts",
  [
    `export * from ${JSON.stringify(path.join(root, "src/sensory/feltStroke.ts"))};`,
    `export * from ${JSON.stringify(path.join(root, "src/sensory/vibration.ts"))};`,
  ].join("\n")
);
execFileSync(
  path.join(root, "node_modules/.bin/esbuild"),
  [
    "/tmp/feltstroke-entry.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--outfile=/tmp/feltstroke-bundle.mjs",
    "--alias:@react-native-async-storage/async-storage=/tmp/felt-stub-asyncstorage.mjs",
    "--log-level=error",
  ],
  { cwd: root }
);
const felt = await import("/tmp/feltstroke-bundle.mjs");
const {
  strokePulseDuration,
  createStrokeThrottle,
  FELT_STROKE_MIN_INTERVAL_MS,
  vibrate,
  mirrorHapticsPreference,
  resetVibrationForTests,
  hapticNoticeState,
  subscribeHapticSuppression,
  vibrationEnabledNow,
} = felt;

const setNavigator = (v) =>
  Object.defineProperty(globalThis, "navigator", {
    value: v,
    configurable: true,
    writable: true,
  });
const tick = () => new Promise((r) => setTimeout(r, 25));

/* ---- §A the mapping ------------------------------------------------ */

check("A1 0 pressure → no pulse", strokePulseDuration(0) === 0);
check("A2 0.34 → no pulse", strokePulseDuration(0.34) === 0);
check("A3 boundary 0.35 → 18", strokePulseDuration(0.35) === 18);
check("A4 mid light 0.5 → 18", strokePulseDuration(0.5) === 18);
check("A5 0.69 → 18", strokePulseDuration(0.69) === 18);
check("A6 boundary 0.7 → 32", strokePulseDuration(0.7) === 32);
check("A7 mid firm 0.8 → 32", strokePulseDuration(0.8) === 32);
check("A8 0.89 → 32", strokePulseDuration(0.89) === 32);
check("A9 boundary 0.9 → 48", strokePulseDuration(0.9) === 48);
check("A10 full press 1 → 48", strokePulseDuration(1) === 48);
check(
  "A11 over-range pressure clamps to the top bucket",
  strokePulseDuration(1.5) === 48 && strokePulseDuration(99) === 48
);
check(
  "A12 negative pressure → no pulse",
  strokePulseDuration(-0.2) === 0 && strokePulseDuration(-5) === 0
);
check(
  "A13 malformed pressure never pulses",
  strokePulseDuration(NaN) === 0 &&
    strokePulseDuration(undefined) === 0 &&
    strokePulseDuration(null) === 0 &&
    strokePulseDuration("0.8") === 0 &&
    strokePulseDuration({}) === 0
);
check(
  "A14 durations monotonic non-decreasing in pressure",
  [0, 0.1, 0.34, 0.35, 0.5, 0.69, 0.7, 0.8, 0.89, 0.9, 1, 2]
    .map(strokePulseDuration)
    .every((v, i, a) => i === 0 || v >= a[i - 1])
);
check(
  "A15 default window is 140 ms",
  FELT_STROKE_MIN_INTERVAL_MS === 140
);

/* ---- §B the throttle ------------------------------------------------ */

{
  const t = createStrokeThrottle();
  check("B1 first stroke fires", t.shouldFire("peer-a", 1000) === true);
  check("B2 second stroke at +100 ms drops", t.shouldFire("peer-a", 1100) === false);
  check("B3 at +139 ms still drops", t.shouldFire("peer-a", 1139) === false);
  check("B4 at exactly +140 ms fires", t.shouldFire("peer-a", 1140) === true);
  check(
    "B5 a dropped stroke does not reset the clock",
    (() => {
      const u = createStrokeThrottle();
      u.shouldFire("p", 1000);
      u.shouldFire("p", 1100); // dropped
      return u.shouldFire("p", 1140) === true; // 140 after the FIRE, not the drop
    })()
  );
  check(
    "B6 peers are independent",
    (() => {
      const u = createStrokeThrottle();
      u.shouldFire("alice", 1000);
      return (
        u.shouldFire("bob", 1000) === true &&
        u.shouldFire("alice", 1050) === false &&
        u.shouldFire("bob", 1050) === false
      );
    })()
  );
  check(
    "B7 a storm of 60 points in 100 ms → exactly 1 pulse",
    (() => {
      const u = createStrokeThrottle();
      let fired = 0;
      for (let k = 0; k < 60; k++) {
        if (u.shouldFire("storm", 2000 + k * 1.6)) fired++;
      }
      return fired === 1;
    })()
  );
  check(
    "B8 a sustained stream pulses at the window, never faster",
    (() => {
      const u = createStrokeThrottle();
      const times = [];
      for (let k = 0; k < 500; k++) {
        const now = 3000 + k * 16; // ~60 Hz points for 8 s
        if (u.shouldFire("stream", now)) times.push(now);
      }
      return (
        times.length >= 50 &&
        times.length <= 60 &&
        times.every((v, i) => i === 0 || v - times[i - 1] >= 140)
      );
    })()
  );
  check(
    "B9 reset() forgets every peer",
    (() => {
      const u = createStrokeThrottle();
      u.shouldFire("alice", 1000);
      u.shouldFire("bob", 1000);
      u.reset();
      return u.shouldFire("alice", 1001) === true && u.shouldFire("bob", 1001) === true;
    })()
  );
  check(
    "B10 custom interval is honored",
    (() => {
      const u = createStrokeThrottle(50);
      return (
        u.shouldFire("p", 0) === true &&
        u.shouldFire("p", 49) === false &&
        u.shouldFire("p", 50) === true
      );
    })()
  );
  check(
    "B11 a non-finite interval falls back to 140",
    (() => {
      const u = createStrokeThrottle(NaN);
      u.shouldFire("p", 1000);
      return u.shouldFire("p", 1100) === false && u.shouldFire("p", 1140) === true;
    })()
  );
}

/* ---- §C the gate, end to end ---------------------------------------- */

const vibCalls = [];
setNavigator({
  vibrate: (p) => {
    vibCalls.push(p);
    return true;
  },
});
let notices = 0;
// NB: resetVibrationForTests clears the listener sets, so the
// subscription must come AFTER the reset or it is wiped.
resetVibrationForTests();
subscribeHapticSuppression(() => {
  notices += 1;
});

// The handler's exact composition, three lines, in the check so the
// gate + mapping + throttle are proven TOGETHER (the handler text
// itself is pinned verbatim in §D).
function fireStroke(throttle, peerId, pressure, now) {
  const ms = strokePulseDuration(pressure);
  if (ms > 0 && throttle.shouldFire(peerId, now)) {
    // Return the duration ONLY when the gate actually fired —
    // a suppressed pulse is not a fired one (gate OFF must
    // read as 0, not 48).
    return vibrate(ms) ? ms : 0;
  }
  return 0;
}

check(
  "C1 gate ON: a firm remote stroke fires 32 through the gate",
  vibrationEnabledNow() === true &&
    (() => {
      const t = createStrokeThrottle();
      const fired = fireStroke(t, "alice", 0.8, 1000);
      return fired === 32 && vibCalls.length === 1 && vibCalls[0] === 32;
    })() &&
    hapticNoticeState() === "armed" &&
    notices === 0
);
await tick();

check(
  "C2 gate ON: a light remote stroke stays silent (no gate call at all)",
  (() => {
    const before = vibCalls.length;
    const t = createStrokeThrottle();
    const fired = fireStroke(t, "alice", 0.2, 2000);
    return fired === 0 && vibCalls.length === before;
  })()
);
check(
  "C3 gate ON: a 60-point storm in 100 ms → exactly one motor call",
  (() => {
    const before = vibCalls.length;
    const t = createStrokeThrottle();
    let fired = 0;
    for (let k = 0; k < 60; k++) {
      if (fireStroke(t, "storm", 0.85, 3000 + k * 1.6) > 0) fired++;
    }
    return fired === 1 && vibCalls.length === before + 1 && vibCalls[vibCalls.length - 1] === 32;
  })()
);

mirrorHapticsPreference(false);
check(
  "C4 gate OFF: a firm stroke fires nothing, notice raised once",
  (() => {
    const before = vibCalls.length;
    const t = createStrokeThrottle();
    const fired = fireStroke(t, "alice", 0.95, 4000);
    return (
      fired === 0 &&
      vibCalls.length === before &&
      notices === 1 &&
      hapticNoticeState() === "shown"
    );
  })()
);
check(
  "C5 gate OFF: repeat suppressions stay silent (anti-nag)",
  (() => {
    const t = createStrokeThrottle();
    fireStroke(t, "alice", 0.95, 4200);
    fireStroke(t, "bob", 0.95, 4200);
    return notices === 1 && hapticNoticeState() === "shown";
  })()
);
resetVibrationForTests();
mirrorHapticsPreference(true);
check(
  "C6 the switch coming back on restores the pulse",
  (() => {
    const before = vibCalls.length;
    const t = createStrokeThrottle();
    const fired = fireStroke(t, "alice", 0.95, 5000);
    return fired === 48 && vibCalls.length === before + 1 && vibCalls[vibCalls.length - 1] === 48;
  })()
);
resetVibrationForTests();
setNavigator(undefined);
mirrorHapticsPreference(false);
check(
  "C7 platform with no vibrator: nothing fires, no notice raised",
  (() => {
    const t = createStrokeThrottle();
    const fired = fireStroke(t, "alice", 0.95, 6000);
    return fired === 0 && notices === 1 && hapticNoticeState() === "armed";
  })()
);
resetVibrationForTests();

/* ---- §D the wiring ---------------------------------------------------- */

const legacy = read("src/components/fluid/LegacyFluid.tsx");
const feltSrc = read("src/sensory/feltStroke.ts");
const verbsSrc = read("src/sensory/verbs.ts");
const multiSrc = read("src/hooks/useFluidMultiUser.ts");

const feltBlockIdx = legacy.indexOf("if (!isGhost && !i.verb && i.kind !== \"shake\")");
const splatIdx = legacy.indexOf(
  "engine.splatAt(i.position.x, i.position.y, i.force.x, i.force.y, splatColor, i.radiusScale ?? 1);"
);
const shakeVibrateIdx = legacy.indexOf("vibrate(60);");
const effectStart = legacy.lastIndexOf("useEffect(() => {", feltBlockIdx);
const effectClose = legacy.indexOf("}, [remoteInteractions]);", feltBlockIdx);

check(
  "D1 LegacyFluid imports the felt module (both exports)",
  legacy.includes(
    'import {\n  createStrokeThrottle,\n  strokePulseDuration,\n} from "../../sensory/feltStroke";'
  )
);
check(
  "D2 one throttle lives on the component (ref beside peerStrokeRef)",
  legacy.includes("const feltStrokeRef = useRef(createStrokeThrottle());") &&
    legacy.indexOf("const feltStrokeRef") > legacy.indexOf("const peerStrokeRef")
);
check(
  "D3 the felt block sits in the remoteInteractions effect, after splatAt",
  feltBlockIdx > 0 &&
    splatIdx > 0 &&
    feltBlockIdx > splatIdx &&
    effectStart > 0 &&
    feltBlockIdx > effectStart &&
    effectClose > feltBlockIdx
);
check(
  "D4 the guard is exactly !isGhost && !i.verb && kind !== \"shake\"",
  legacy.includes('if (!isGhost && !i.verb && i.kind !== "shake") {')
);
check(
  "D5 the block calls duration → throttle → gate, in that order",
  (() => {
    const block = legacy.slice(feltBlockIdx, feltBlockIdx + 400);
    const d = block.indexOf("strokePulseDuration(i.pressure)");
    const t = block.indexOf("feltStrokeRef.current.shouldFire(i.userId)");
    const v = block.indexOf("vibrate(strokeMs)");
    return d > 0 && t > d && v > t;
  })()
);
check(
  "D6 sub-threshold pressure never reaches the gate (ms > 0 guard)",
  legacy.slice(feltBlockIdx, feltBlockIdx + 400).includes("strokeMs > 0")
);
check(
  "D7 shake still vibrates 60 and returns BEFORE the splat",
  shakeVibrateIdx > 0 && shakeVibrateIdx < splatIdx
);
check(
  "D8 verb path untouched: playVerbEffects still fires for verbs",
  legacy.includes("playVerbEffects(verb, false)") &&
    verbsSrc.includes("[120, 80, 220]")
);
check(
  "D9 recipe haptic player untouched (intensity drop is a separate fix)",
  legacy.includes("getHapticPattern(step.hapticId)")
);
check(
  "D10 sender's own tick unchanged (pressure > 0.7, [50, 30, 50])",
  multiSrc.includes("if (!fromUserId && interaction.pressure > 0.7)") &&
    multiSrc.includes("vibrate([50, 30, 50]);")
);
check(
  "D11 feltStroke is used in exactly one place (the remote effect)",
  (legacy.match(/strokePulseDuration/g) || []).length === 2 && // import + the one call
    (legacy.match(/feltStrokeRef/g) || []).length === 2 && // declaration + one use
    !multiSrc.includes("feltStroke")
);
check(
  "D12 feltStroke.ts never touches navigator (pure mapping + throttle)",
  !feltSrc.includes("navigator") && !feltSrc.includes("vibrate(")
);

/* ---- §E exclusions ---------------------------------------------------- */

// The handler is React code and cannot run in node. The guard IS the
// exclusion mechanism, so it is pinned verbatim above (D4); this
// section pins the facts the guard relies on.
check(
  "E1 the shake branch returns before any splat can reach the felt block",
  (() => {
    const shakeIf = legacy.indexOf('if (i.kind === "shake" && !isGhost) {');
    const shakeReturn = legacy.indexOf("return;", shakeIf);
    return shakeIf > 0 && shakeReturn > shakeIf && shakeReturn < splatIdx;
  })()
);
check(
  "E2 ghost splats take the ghost branch, never the felt block (guard)",
  legacy.includes("const isGhost = isGhostPeerId(i.userId);") &&
    legacy.slice(feltBlockIdx, feltBlockIdx + 60).includes("!isGhost")
);
check(
  "E3 verb interactions carry the verb into the guard, so they skip it",
  legacy.slice(feltBlockIdx, feltBlockIdx + 60).includes("!i.verb")
);
function* walkTs(dir) {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(path.join(root, rel));
    if (st.isDirectory()) yield* walkTs(rel);
    else if (/\.tsx?$/.test(name)) yield rel;
  }
}
const filesWith = (needle) =>
  [...walkTs("src"), ...walkTs("app")].filter((f) => read(f).includes(needle));
check(
  "E4 the felt identifiers exist in exactly two files (module + LegacyFluid)",
  (() => {
    const byDuration = filesWith("strokePulseDuration");
    const byThrottle = filesWith("createStrokeThrottle");
    const byRef = filesWith("feltStrokeRef");
    const expect = ["src/components/fluid/LegacyFluid.tsx", "src/sensory/feltStroke.ts"].sort();
    const same = (a, b) => a.slice().sort().join("|") === b.slice().sort().join("|");
    return (
      same(byDuration, expect) &&
      same(byThrottle, expect) &&
      same(byRef, ["src/components/fluid/LegacyFluid.tsx"])
    );
  })()
);

console.log(`\nfeltstroke-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
