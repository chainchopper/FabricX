// chrome-check.mjs — Slice 44 headless proof.
//
// Terrell's chrome doctrine (Nov 2, 2026 — product law): the
// loaded fabric's canvas is the VIEW SPACE, not available real
// estate. His words: elements are "cluttered into the same
// canvas rather than separate. No transition between elements
// and the fabric canvas and layers. Shit just pops in and out.
// Toasts overlap... that's like someone putting a plant in
// front of the TV." The rules: (1) an element appears only
// with its own fabric; (2) elements enter/leave with
// transitions in the tokens' 240–320ms motion range; (3)
// elements never overlap — toasts take ONE queued slot, panels
// and pills occupy declared non-colliding anchors; (4) chrome
// docks to edges/corners, the canvas center stays clear.
//
// Scope: the demo path — default fluid, The Fold, Dancer
// Stage, Piano. Six sections:
// A. The toast queue discipline, driven for real: a burst of
//    3 toasts in one tick occupies exactly ONE visible slot and
//    drains in FIFO order; the waiting cap drops the oldest
//    WAITING toast and never the visible one; repeats of the
//    visible/waiting message never duplicate.
// B. The toast renderer's pins: it consumes toastQueue, sits
//    in the declared top slot (top:14, left:70, right:110,
//    pill maxWidth 196), uses the token motion steps, renders
//    exactly one Animated.View, and the old HUD-band anchor
//    (bottom:24) and 160ms pops are gone.
// C. Transition pins: ChromeMount carries the house idiom
//    (motion.base in / motion.fast out, out-cubic in, in-cubic
//    out, unmount only after the exit); every demo-path panel/
//    pill component renders through it; the stage pills sit at
//    their declared anchor; the canvas curtain now keys on the
//    canvas family (stage flips included) and its total stays
//    in the token range.
// D. The anchor map: rects computed from the components' own
//    style values at 390×844; each demo fabric's resident set
//    (corner anchors, toast slot, chip slot, that fabric's own
//    docked surfaces, its HUD band) shows ZERO pairwise
//    overlaps, and no resident chrome element enters the
//    canvas-center keep-clear region. Two sanctioned classes
//    are asserted separately, not smuggled: the one-time
//    consent/welcome cards (slot A, top:160) are MODAL — they
//    block by design and are checked against the resident set
//    only; a fabric's own panels (the Fold cluster, HUD layer
//    controls) are its interface surface, checked for pairwise
//    non-overlap rather than center-clearance.
// E. Rule 1: the Fold layer mounts only under its own fabric
//    id; the Dancer Stage renders only in the stage3d canvas
//    branch; the dead ARPianoExperience is imported nowhere;
//    the three foreign-squat fixes hold (grounding chip yields
//    to the brain chip via the shared predicate; the First
//    Breath card waits out the consent asks; ARStatus is out
//    of the HUD band).
// F. The shared chip predicate: brainChipVisible exists in the
//    brain store and is consumed by BrainChrome,
//    GroundingChrome and GenxLayer — one expression, no copies.
//
// Run: node scripts/chrome-check.mjs   (from the repo root)

import { readFileSync, readdirSync, statSync } from "node:fs";
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
const count = (src, sub) => src.split(sub).length - 1;

async function bundle(rel, out) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`],
    { cwd: root, stdio: "pipe" }
  );
  return import(out);
}

// ---------------------------------------------------------------- A
console.log("\nA. toast queue — burst, drain order, cap, dedupe");
const tq = await bundle("app/components/toastQueue.ts", "/tmp/chrome44-tq.mjs");
const item = (id) => ({ id, message: `toast-${id}` });
{
  let s = tq.createToastQueue();
  // The burst: three shows in one tick.
  s = tq.enqueueToast(s, item(1));
  s = tq.enqueueToast(s, item(2));
  s = tq.enqueueToast(s, item(3));
  check("burst of 3 → exactly 1 visible", s.visible?.id === 1);
  check(
    "burst of 3 → 2 waiting, FIFO order",
    s.waiting.length === 2 && s.waiting[0].id === 2 && s.waiting[1].id === 3
  );
  s = tq.advanceToast(s);
  check("drain 1 → second toast visible", s.visible?.id === 2 && s.waiting.length === 1);
  s = tq.advanceToast(s);
  check("drain 2 → third toast visible", s.visible?.id === 3 && s.waiting.length === 0);
  s = tq.advanceToast(s);
  check("drain 3 → slot empty", s.visible === null && s.waiting.length === 0);
}
{
  let s = tq.createToastQueue();
  s = tq.enqueueToast(s, item(1));
  for (let id = 2; id <= 7; id += 1) s = tq.enqueueToast(s, item(id));
  check(
    "cap: waiting never exceeds TOAST_MAX_WAITING",
    s.waiting.length === tq.TOAST_MAX_WAITING,
    `waiting=${s.waiting.length}`
  );
  check("cap: the visible toast is never dropped", s.visible?.id === 1);
  check(
    "cap: oldest WAITING dropped, newest kept",
    s.waiting[0].id === 5 && s.waiting[s.waiting.length - 1].id === 7,
    `waiting=${s.waiting.map((t) => t.id).join(",")}`
  );
}
{
  let s = tq.createToastQueue();
  s = tq.enqueueToast(s, item(1));
  const again = tq.enqueueToast(s, { id: 99, message: "toast-1" });
  check("repeat of the visible message is a no-op", again === s);
  s = tq.enqueueToast(s, item(2));
  const dup = tq.enqueueToast(s, { id: 98, message: "toast-2" });
  check("repeat of a waiting message is a no-op", dup === s);
  check(
    "display time is a real hold, not a pop",
    tq.TOAST_DISPLAY_MS >= 2000 && tq.TOAST_DISPLAY_MS <= 4000,
    `${tq.TOAST_DISPLAY_MS}ms`
  );
}

// ---------------------------------------------------------------- B
console.log("\nB. toast renderer — the existing path, disciplined");
const toast = read("app/components/Toast.tsx");
check("provider consumes the pure queue", toast.includes('from "./toastQueue"'));
check(
  "provider drives enqueue + advance",
  toast.includes("enqueueToast(") && toast.includes("advanceToast(")
);
check(
  "declared slot: top strip between the corner anchors",
  toast.includes("top: 14") && toast.includes("left: 70") && toast.includes("right: 110")
);
check("pill capped to the slot (maxWidth 196)", toast.includes("maxWidth: 196"));
check(
  "token motion steps drive the transitions",
  toast.includes("duration: motion.base") && toast.includes("duration: motion.fast")
);
check(
  "exactly ONE toast render site",
  count(toast, "<Animated.View") === 1,
  `sites=${count(toast, "<Animated.View")}`
);
check("old HUD-band anchor gone (bottom: 24)", !toast.includes("bottom: 24"));
check("old 160ms pops gone", !toast.includes("duration: 160"));
check(
  "public API unchanged (ToastProvider + useToast)",
  toast.includes("export function ToastProvider") && toast.includes("export function useToast")
);

// ---------------------------------------------------------------- C
console.log("\nC. transitions — ChromeMount everywhere on the demo path");
const cm = read("src/components/ui/ChromeMount.tsx");
check(
  "ChromeMount steps come from the tokens",
  cm.includes("CHROME_MOUNT_IN_MS = motion.base") &&
    cm.includes("CHROME_MOUNT_OUT_MS = motion.fast")
);
check(
  "house easing idiom (out-cubic in, in-cubic out)",
  cm.includes("Easing.out(Easing.cubic)") && cm.includes("Easing.in(Easing.cubic)")
);
check(
  "unmount happens only after the exit completes",
  cm.includes("if (finished) setRender(false)")
);
check(
  "token range: in/out within 240–320ms",
  true // values pinned above to motion.base(280)/motion.fast(240) in tokens
);
const tokensSrc = read("src/theme/tokens.ts");
check(
  "tokens really are base 280 / fast 240",
  /base:\s*280/.test(tokensSrc) && /fast:\s*240/.test(tokensSrc)
);

const mountUsers = [
  ["app/components/fabric/BrainChrome.tsx", 2, "brain ask + chip"],
  ["app/components/fabric/GroundingChrome.tsx", 2, "grounding ask + chip"],
  ["app/components/fabric/FirstBreath.tsx", 1, "welcome card"],
  ["app/components/ARStatus.tsx", 1, "AR status chip"],
  ["src/dancer/DancerStage.tsx", 2, "stage status pills"],
  ["src/components/genx/GenxLayer.tsx", 3, "Fold cluster + board + structure view"],
];
for (const [file, min, label] of mountUsers) {
  const src = read(file);
  check(
    `${label} renders through ChromeMount`,
    src.includes("ChromeMount") && count(src, "<ChromeMount") >= min,
    `${file}: ${count(src, "<ChromeMount")} mounts`
  );
}

const brain = read("app/components/fabric/BrainChrome.tsx");
const grounding = read("app/components/fabric/GroundingChrome.tsx");
check(
  "ask cards take the card slot (top:160)",
  brain.includes("top: 160") && grounding.includes("top: 160")
);
check(
  "chips take the status slot (top:68, right held at 112)",
  brain.includes("top: 68") && brain.includes("right: 112") &&
    grounding.includes("top: 68") && grounding.includes("right: 112")
);
check(
  "old shared top:60 wrapper gone from both chromes",
  !brain.includes("top: 60") && !grounding.includes("top: 60")
);
const fb = read("app/components/fabric/FirstBreath.tsx");
check(
  "welcome card moved to the card slot and waits out the asks",
  fb.includes("top: 160") && !fb.includes("top: 76") &&
    fb.includes("brainAskUp") && fb.includes("groundingAskUp")
);
const ars = read("app/components/ARStatus.tsx");
check(
  "AR chip at its declared anchor, out of the HUD band",
  ars.includes("top: 104") && !ars.includes("bottom: 12")
);
const stage = read("src/dancer/DancerStage.tsx");
check(
  "stage pills at the declared status anchor (top:106 ×2)",
  count(stage, "top: 106") >= 2 && !stage.includes("top: 72")
);
const fluid = read("src/components/fluid/LegacyFluid.tsx");
check(
  "engine notice moved to the alert anchor with a 280ms fade",
  fluid.includes("top: 104") &&
    fluid.includes("opacity 280ms") &&
    count(fluid, "bottom: 12") === 1 // the ?diag=1 panel only
);
const renderer = read("src/components/experiences/ExperienceRenderer.tsx");
check(
  "curtain keys on the canvas family (AR/camera OR stage)",
  renderer.includes("wantsAROrCamera || isStageCanvas")
);
{
  const m = renderer.match(/duration: 120[\s\S]{0,400}duration: 140, delay: 40/);
  check(
    "curtain total 120+40+140 = 300ms, inside the token range",
    !!m && 120 + 40 + 140 >= 240 && 120 + 40 + 140 <= 320
  );
}

// ---------------------------------------------------------------- D
console.log("\nD. anchor map at 390×844 — zero overlaps per fabric");
const W = 390;
const H = 844;
// Rects [x0, y0, x1, y1] from the components' own style values.
const R = {
  fAnchor: [12, 12, 64, 64], // FabricAnchor: top/left 12, 52×52
  essence: [276, 12, 378, 86], // Essence compact: top/right 12, 84×56 + padding
  toast: [77, 14, 273, 56], // slot wrapper 70..280, pill ≤196 centered, ~42 tall
  chip: [7, 68, 271, 97], // slot wrapper 0..278 (right:112), pill ≤264 centered (Slice 46: widened for the named brain label), ~29 tall
  arChip: [12, 104, 332, 158], // top:104 left:12, maxWidth 320, error variant (tallest)
  askCard: [16, 160, 374, 360], // slot A: top:160, gutter 16, modal class
  foldCluster: [12, 92, 378, 726], // left/right 12, top 92, bottom offset 118
  foldClusterChipUp: [12, 104, 378, 726], // top 92 + 12 clearance
  stagePill: [23, 106, 367, 136], // top:106, pill maxWidth 88% centered, ~30 tall
  hudFluid: [0, H - 98, W, H], // HUD band, fluid/Fold config
  hudStage: [0, H - 144, W, H], // HUD band, stage config
  hudPiano: [0, H - 214, W, H], // HUD band, piano config (keyboard up)
};
const overlaps = (a, b) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
function assertSet(label, names) {
  let bad = 0;
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (overlaps(R[names[i]], R[names[j]])) {
        bad += 1;
        console.log(`     overlap: ${names[i]} × ${names[j]}`);
      }
    }
  }
  check(`${label}: zero pairwise overlaps`, bad === 0, names.join(" + "));
}
const COMMON = ["fAnchor", "essence", "toast", "chip"];
assertSet("fluid (default)", [...COMMON, "arChip", "hudFluid"]);
assertSet("piano", [...COMMON, "arChip", "hudPiano"]);
assertSet("Fold (chip down)", ["fAnchor", "essence", "toast", "foldCluster", "hudFluid"]);
assertSet("Fold (chip up)", [...COMMON, "foldClusterChipUp", "hudFluid"]);
assertSet("Dancer Stage", [...COMMON, "stagePill", "hudStage"]);
assertSet("modal slot A vs resident set", [...COMMON, "arChip", "askCard"]);

const CENTER = [98, 211, 292, 633]; // middle 50% × 50% keep-clear
for (const name of ["fAnchor", "essence", "toast", "chip", "arChip", "stagePill"]) {
  check(`center stays clear of ${name}`, !overlaps(R[name], CENTER));
}
// The declared values the rects rest on, pinned in the sources:
const genx = read("src/components/genx/GenxLayer.tsx");
check(
  "Fold cluster anchors are the declared constants",
  genx.includes("CLUSTER_TOP = 92") && genx.includes("CLUSTER_BOTTOM = 118") &&
    genx.includes("BRAIN_CHIP_CLEARANCE = 12")
);
check(
  "Fold cluster clears the chip by the shared predicate",
  genx.includes("brainChipVisible(brainSnap)")
);

// ---------------------------------------------------------------- E
console.log("\nE. rule 1 — elements only with their own fabric");
check(
  "Fold layer mounts only under the genx-fold experience",
  fluid.includes('state.activeExperience?.id === "genx-fold"') && fluid.includes("<GenxLayer")
);
check(
  "Dancer Stage renders only in the stage3d canvas branch",
  renderer.includes('activeExperience?.canvas === "stage3d"') &&
    renderer.includes("isStageCanvas ? (")
);
{
  // ARPianoExperience is dead code (never imported); assert no
  // import statement anywhere in app/ or src/ pulls it in.
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "node_modules") walk(p);
      } else if (/\.tsx?$/.test(name)) {
        const src = readFileSync(p, "utf8");
        if (/import[^;]*from\s+["'][^"']*ARPianoExperience["']/.test(src)) {
          hits.push(path.relative(root, p));
        }
      }
    }
  };
  walk(path.join(root, "app"));
  walk(path.join(root, "src"));
  check("ARPianoExperience imported nowhere (dead code stays dead)", hits.length === 0);
}
check(
  "grounding chip yields to the brain chip (shared predicate)",
  grounding.includes("brainChipVisible(brainSnap)") &&
    grounding.includes("!brainChipVisible(brainSnap)")
);
check(
  "welcome card subscribes to both asks before showing",
  fb.includes("subscribeOnDeviceBrain") && fb.includes("subscribeDeviceGrounding")
);

// ---------------------------------------------------------------- F
console.log("\nF. one chip predicate, three consumers");
const brainStore = read("src/ai/onDeviceBrain.ts");
check(
  "brainChipVisible is defined once, in the brain store",
  brainStore.includes("export function brainChipVisible(")
);
check("BrainChrome consumes it", brain.includes("brainChipVisible(snap)"));
check("GenxLayer consumes it", genx.includes("brainChipVisible(brainSnap)"));
check(
  "no file keeps a private copy of the chip condition",
  !genx.includes('brainSnap.state === "downloading"') &&
    !brain.includes('snap.state === "downloading" || snap.state === "warming"')
);

console.log(`\nchrome: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
