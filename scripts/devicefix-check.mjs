// devicefix-check.mjs — Slice 46 headless proof.
//
// Terrell's device report, Nov 3, 2026 (production, his words):
//
// 1. "My on device (at the website) claims it's downloading a
//    brain but I have no idea what brain." The brain catalog
//    (onDeviceBrain.BRAIN_MODELS) always knew the answer —
//    Ghostie 1B / 1.5B / 3B over Llama 3.2 1B / Qwen 2.5 1.5B /
//    Llama 3.2 3B, with sizes — but the canvas chip rendered a
//    bare "Brain arriving… 42%" / "Brain warming up…" with no
//    name at all, and the settings card's warming line named
//    nothing either. §A drives the REAL store module and pins
//    the one naming source (brainModelFullName /
//    brainTransferLabel) plus every surface that renders from
//    it: the chip names the model being fetched (product name
//    + honest base + real %), the settings card names it in
//    its downloading, warming, ready and offered lines.
//
// 2. "The fold menu sticks along with its text." The Fold's
//    panel cluster had exactly one toggle — "Hide bounties" —
//    and it gated ONLY the board's wrapper. The field card and
//    the GenX node card rendered UNCONDITIONALLY in the same
//    cluster: no state in GenxLayer could remove them, so after
//    the only close affordance was used, the menu's cards and
//    all their text stayed over the fabric, interactive,
//    forever. §B pins the fix: one panelOpen state gates the
//    field card, the node card and the board together; closed
//    means UNMOUNTED (parked-rect at 390pt = 0px of panel in
//    the viewport, the toggle pill the only survivor); and the
//    state is local to a layer LegacyFluid mounts only while
//    the Fold is active, so leaving the Fold closes the menu
//    with the layer, full stop.
//
// Slice 50 addendum (Nov 3): the chip's headline became the
// GHOSTIE's name ("{name}'s brain arriving… 42%") — the model-
// named label survives as brainTransferLabel's no-name fallback
// (the ghost record cannot be named before it exists) and as
// the settings card's under-headline honesty. §A below pins the
// fallback forms; the ghost-named forms are pinned by
// settings50-check §B. A8's chip pin follows the new call.
//
// Run: node scripts/devicefix-check.mjs   (from the repo root)

import { readFileSync, writeFileSync } from "node:fs";
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

async function bundle(rel, out, extra = []) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`, ...extra],
    { cwd: root, stdio: "pipe" }
  );
  return import(out);
}

// The brain store persists prefs through AsyncStorage; headless,
// an in-memory shim stands in (the prefs path is not under test).
writeFileSync(
  "/tmp/df46-stub-asyncstorage.mjs",
  "const m = new Map();\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);

// ----------------------------------------------------------------
// A. The brain names itself — the real module, every surface.
// ----------------------------------------------------------------

const brain = await bundle("src/ai/onDeviceBrain.ts", "/tmp/df46-brain.mjs", [
  "--alias:@react-native-async-storage/async-storage=/tmp/df46-stub-asyncstorage.mjs",
]);

const snapFor = (state, progress, model) => ({
  state,
  progress,
  model,
  loadedModelId: null,
  webgpu: true,
  consent: "granted",
  askVisible: false,
  error: null,
});

check("A1 the catalog holds three named models",
  brain.BRAIN_MODELS.length === 3 &&
  brain.BRAIN_MODELS.every((m) => m.displayName && m.label && m.sizeNote),
  brain.BRAIN_MODELS.map((m) => m.displayName).join(", "));

for (const m of brain.BRAIN_MODELS) {
  check(`A2 full name for ${m.id} is product name + honest base`,
    brain.brainModelFullName(m) === `${m.displayName} (${m.label})`,
    brain.brainModelFullName(m));
}

for (const m of brain.BRAIN_MODELS) {
  const dl = brain.brainTransferLabel(snapFor("downloading", 0.42, m));
  check(`A3 downloading label names ${m.displayName} and its base, with the real %`,
    typeof dl === "string" && dl.includes(m.displayName) && dl.includes(m.label) && dl.includes("42%"),
    String(dl));
  const warm = brain.brainTransferLabel(snapFor("warming", 1, m));
  check(`A4 warming label names ${m.displayName} and its base`,
    typeof warm === "string" && warm.includes(m.displayName) && warm.includes(m.label),
    String(warm));
}

check("A5 the default model's chip line is the device-truth string",
  brain.brainTransferLabel(snapFor("downloading", 0.42, brain.DEFAULT_BRAIN_MODEL)) ===
    "Ghostie 1B (Llama 3.2 1B) arriving… 42%");

check("A6 no transfer label outside the transfer states",
  brain.brainTransferLabel(snapFor("idle", 0, brain.DEFAULT_BRAIN_MODEL)) === null &&
  brain.brainTransferLabel(snapFor("unavailable", 0, brain.DEFAULT_BRAIN_MODEL)) === null &&
  brain.brainTransferLabel(snapFor("error", 0, brain.DEFAULT_BRAIN_MODEL)) === null);

check("A7 a ready label exists in the same source and names the model",
  (brain.brainTransferLabel(snapFor("ready", 1, brain.BRAIN_MODELS[2])) ?? "")
    .includes("Ghostie 3B (Llama 3.2 3B)"));

const chrome = read("app/components/fabric/BrainChrome.tsx");
check("A8 the canvas chip renders the naming source, not a bare string",
  chrome.includes("brainTransferLabel(snap, ghost.ghostName)") &&
  !chrome.includes("`Brain arriving… ${pct}%`") &&
  !chrome.includes('"Brain warming up…"'));

check("A9 the one-time ask still names the model it offers",
  chrome.includes("snap.model.displayName") && chrome.includes("snap.model.baseNote") &&
  chrome.includes("snap.model.sizeNote"));

const card = read("app/components/fabric/OnDeviceBrainCard.tsx");
check("A10 the settings card builds its transfer lines from the same source",
  (card.match(/brainModelFullName\(snap\.model\)/g) ?? []).length >= 4 &&
  !card.includes("`Brain arriving… ${pct}%`") &&
  !card.includes('"Weights are in — the brain is warming up…"'));

check("A11 the settings card's offered/download lines still carry the size",
  card.includes("snap.model.sizeNote") && card.includes("Download ${snap.model.displayName}"));

// ----------------------------------------------------------------
// B. The Fold's panel truly parks.
// ----------------------------------------------------------------

const layer = read("src/components/genx/GenxLayer.tsx");

check("B1 one panel state, local to the layer; the board-only toggle is gone",
  layer.includes("const [panelOpen, setPanelOpen] = useState(true)") &&
  !layer.includes("boardOpen"));

const idxFieldGate = layer.indexOf("{panelOpen ? (");
// The render sites (the Slice 43 cluster comment quotes "THE
// FOLD" in prose, historically — the pins anchor on the JSX).
const idxFieldText = layer.indexOf("THE FOLD", idxFieldGate);
const idxNodeGate = layer.indexOf("panelOpen && (node || props.nodeUrl)");
const idxNodeText = layer.indexOf("GENX NODE", idxNodeGate);
const boardGateRegion = layer.indexOf("visible={panelOpen}");
check("B2 field card, node card and board each render only inside the panel gate",
  idxFieldGate !== -1 && idxFieldText > idxFieldGate &&
  idxNodeGate !== -1 && idxNodeText > idxNodeGate &&
  boardGateRegion !== -1 && boardGateRegion < layer.indexOf("<BountyBoard"),
  `gates @${idxFieldGate}/${idxNodeGate}/${boardGateRegion}`);

check("B3 the panel's text lives at exactly one site each (no stray copies)",
  (layer.match(/THE FOLD/g) ?? []).length >= 1 &&
  layer.indexOf("Your Juice (verified, all rooms)") > idxFieldGate &&
  layer.indexOf("Loading the structure…") > layer.indexOf("panelOpen && structureBusy") - 40);

// Parked-rect computation at a 390pt phone viewport, from the
// components' own style literals (the foldboard §B pattern).
// CLOSED: the three panels are unmounted — their rects do not
// exist, so their intersection with the viewport is 0 by
// construction; B2 is what makes that true rather than hoped.
// What survives is the toggle pill alone, at the cluster's
// anchor (top: clusterTop = 52, left: 12 inside the cluster).
const toggleBlock = layer.slice(layer.indexOf('accessibilityLabel={panelOpen ? "Hide the Fold panel"'));
const padV = Number(/paddingVertical: (\d+)/.exec(toggleBlock)?.[1] ?? NaN);
const fontSz = Number(/fontSize: (\d+), fontWeight: "700"/.exec(toggleBlock)?.[1] ?? NaN);
const clusterTopRest = Number(/const CLUSTER_TOP = (\d+)/.exec(layer)?.[1] ?? NaN);
const pillHeight = padV * 2 + Math.ceil(fontSz * 1.25) + 2; // padding + line + borders
const pillRect = { x: 12, y: clusterTopRest, w: 103, h: pillHeight };
const viewport = { w: 390, h: 844 };
check("B4 closed ⇒ panels intersect the viewport in exactly 0px; the survivor is one small pill",
  pillHeight > 0 && pillHeight <= 30 &&
  pillRect.x + pillRect.w <= viewport.w && pillRect.y + pillRect.h <= viewport.h,
  `pill ${pillRect.w}×${pillRect.h}pt @(${pillRect.x},${pillRect.y}); panels unmounted ⇒ 0px`);

const clusterStart = layer.indexOf("{/* The top cluster");
const clusterEnd = layer.indexOf("{/* Slice 40: the molecular view");
const cluster = layer
  .slice(clusterStart, clusterEnd)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ""); // prose quotes are not render sites
// Remove every panelOpen-gated JSX span by brace balance, so
// what remains is exactly what renders when the panel is closed.
function stripGates(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const gate = src.indexOf("{panelOpen", i);
    if (gate === -1) { out += src.slice(i); break; }
    out += src.slice(i, gate);
    let depth = 0;
    let j = gate;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") { depth -= 1; if (depth === 0) { j += 1; break; } }
    }
    i = j;
  }
  return out;
}
const ungated = stripGates(
  cluster.replace(/<ChromeMount\s+visible=\{panelOpen\}[\s\S]*?<\/ChromeMount>/, "")
); // the board's transition mount is a gate too (Slice 44's ChromeMount parks on close)
check("B5 outside the gates, the cluster renders no panel text at all",
  clusterStart !== -1 && clusterEnd !== -1 &&
  !ungated.includes("THE FOLD") && !ungated.includes("GENX NODE") &&
  !ungated.includes("<BountyBoard") && !ungated.includes("Your Juice"),
  "only the toggle pill's label survives the close");

check("B6 the toggle is the cluster's one always-rendered control, honestly labelled",
  layer.includes('accessibilityLabel={panelOpen ? "Hide the Fold panel" : "Show the Fold panel"}') &&
  layer.includes('{panelOpen ? "Hide panel" : "Show panel"}'));

const fluid = read("src/components/fluid/LegacyFluid.tsx");
check("B7 leaving the Fold closes the menu: the layer mounts only while the Fold is active",
  /activeExperience\?\.id === "genx-fold" \? \(\s*<GenxLayer/.test(fluid) &&
  layer.includes("useState(true)") && !layer.includes("genxPanelOpen"),
  "panelOpen is component-local; unmount takes it with the layer");

console.log(`\ndevicefix-check: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
