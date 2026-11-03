// foldboard-check.mjs — Slice 43 headless proof.
// Union note (Slice 44): §B/§D anchor pins updated to Slice 44's
// re-declared values (cluster resting top 92 / chip-up 104, bottom
// offset 118 via CLUSTER_BOTTOM, the shared brainChipVisible()
// predicate, BrainChrome's slot-S wrapper top 68). §A/§C are
// Slice 43's functional proofs, unchanged.
//
// Terrell's Nov 2, 2026 (~6:06 AM) screenshot of The Fold on a
// ~390pt phone, production: the bounty board panel is clipped
// at the left edge — roughly its left third is off-screen, the
// "THE FOLD" title is cut, and TWO empty-state texts render on
// top of each other ("Waiting for the room's host to post the
// seed bounties…" AND "No bounties on the board yet — the
// room's host posts the seed jobs."). The board is EMPTY even
// though a solo session means he IS the host. Below: "Hide
// bounties" and "View structure" buttons. A "Brain arriving…
// 18%" pill overlaps the board's top edge. The Essence sits
// top-right as expected.
//
// Four defects, four sections:
// A. Seed bounties never post for a solo host. The gate was
//    useGenxRoom's `if (!hostRef.current) return;` — the
//    session role (a canvas-hosting election: claims + presence
//    in the shared room) posing as Fold authority. This section
//    boots a solo client through the REAL store path (the
//    hook's own posting loop: missingSeedBounties → the send's
//    local half, ingestGenxWire → sanitize → reducer) and
//    proves the board populates, idempotently and convergently.
// B. Board panel geometry: the old panels' rects overlapped by
//    ~300pt at 390pt (card [12,342], board [42.6,378]). The
//    cluster is now one window-capped flex container; this
//    section computes its rect from the component's own style
//    values and pins the column flow that makes overlap
//    impossible at phone widths.
// C. Double empty-state: exactly one board-empty render site
//    survives (in BountyBoard, role-gated); the layer carries
//    no board copy at all.
// D. Brain pill collision: the layer reads the SAME store and
//    the SAME showChip predicate as BrainChrome and drops its
//    cluster below the chip; rect math from both components'
//    own values proves the clearance.
//
// Run: node scripts/foldboard-check.mjs   (from the repo root)

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

// The genx store persists prefs through AsyncStorage; headless,
// an in-memory shim stands in (the prefs path is not under test).
writeFileSync(
  "/tmp/fb43-stub-asyncstorage.mjs",
  "const m = new Map();\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);

// ----------------------------------------------------------------
// A. Solo boot: the seed defs land through the real store path.
// ----------------------------------------------------------------

const engine = await bundle("src/genx/shardEngine.ts", "/tmp/fb43-engine.mjs");
const fieldMod = await bundle("src/genx/fieldState.ts", "/tmp/fb43-field.mjs");
const store = await bundle("src/genx/genxStore.ts", "/tmp/fb43-store.mjs", [
  "--alias:@react-native-async-storage/async-storage=/tmp/fb43-stub-asyncstorage.mjs",
]);
const board = await bundle("src/genx/boardData.ts", "/tmp/fb43-board.mjs");

const SELF = "user-solo1";
const T0 = 1_700_000_000_000;
store.setGenxSelfId(SELF);

const f0 = store.getGenxSnapshot().field;
check("A1 a fresh client's field starts with an empty board",
  Object.keys(f0.bounties).length === 0);

// Exactly the hook's posting loop (useGenxRoom postSeeds), with
// sendGenx's local half (ingestGenxWire — the same call
// useFluidMultiUser's sendGenx makes after posting to the wire).
const postMissing = (field, from, at) => {
  const missing = engine.missingSeedBounties(field, from, at);
  for (const def of missing) {
    store.ingestGenxWire({ type: "genx-bounty", bounty: def, from });
  }
  return missing;
};

const missing = postMissing(f0, SELF, T0);
const SEED_IDS = [
  engine.ROOM_FOLD_JOB_ID,
  engine.NODE_ESMFOLD_JOB_ID,
  engine.STRUCTURE_FOLD_JOB_ID,
];
check("A2 the solo client's missing set is exactly the three seed defs",
  missing.length === 3 && SEED_IDS.every((id, i) => missing[i].id === id),
  missing.map((d) => d.id).join(", "));

const f1 = store.getGenxSnapshot().field;
check("A3 after the boot post, the field holds all three seed bounties",
  SEED_IDS.every((id) => f1.bounties[id]?.status === "open"),
  Object.keys(f1.bounties).join(", "));
check("A4 the board's view model renders three cards from the booted field",
  board.allCardData(f1, SELF).length === 3);

const again = postMissing(f1, SELF, T0 + 20_000);
check("A5 the 20s heartbeat re-posts nothing once the seeds are in",
  again.length === 0 && Object.keys(store.getGenxSnapshot().field.bounties).length === 3);

// Convergence: another client (a guest seat) whose layer opens
// first posts the same templates; when both posters' defs have
// crossed, the board still holds exactly the three seeds.
for (const def of engine.buildSeedBounties("user-guest2", T0 + 30_000)) {
  store.ingestGenxWire({ type: "genx-bounty", bounty: def, from: "user-guest2" });
}
const f2 = store.getGenxSnapshot().field;
check("A6 a second poster's identical templates converge — still three bounties",
  Object.keys(f2.bounties).length === 3 &&
    SEED_IDS.every((id) => f2.bounties[id]?.def.id === id));

// The gate itself is gone from the hook, and the hook posts
// through the shared missing-defs helper (not a private copy).
const room = read("src/genx/useGenxRoom.ts");
check("A7 the seed effect carries no session-role gate",
  !room.includes("if (!hostRef.current) return;") && !room.includes("hostRef.current"));
check("A8 the hook posts via missingSeedBounties through the send path",
  room.includes("missingSeedBounties(field, userId, Date.now())") &&
    room.includes('sendRef.current({ type: "genx-bounty", bounty: def })'));
check("A9 the hook no longer takes a host flag at all",
  !room.includes("isHost: boolean"));

// ----------------------------------------------------------------
// B. Panel geometry at a 390pt viewport, from the style values.
// ----------------------------------------------------------------

const layer = read("src/components/genx/GenxLayer.tsx");
const VIEW_W = 390;

// The cluster: one absolute container, window-derived insets.
const clusterLeft = 12;
const clusterRight = 12;
check("B1 the cluster's insets are literal window-relative pixels (left 12, right 12)",
  layer.includes("left: 12,") && layer.includes("right: 12,") &&
    layer.includes("top: clusterTop,") && layer.includes("bottom: CLUSTER_BOTTOM,") &&
    layer.includes("const CLUSTER_BOTTOM = 118;"));
const rectL = clusterLeft;
const rectR = VIEW_W - clusterRight;
check(`B2 cluster rect [${rectL}, ${rectR}] lies fully inside [0, ${VIEW_W}]`,
  rectL >= 0 && rectR <= VIEW_W && rectR - rectL === 366);

// Phone widths take the column flow: card first, board below —
// flex siblings cannot overlap, whatever their heights.
check("B3 phone widths (< 640, window-derived) select the column flow",
  layer.includes('Dimensions.get("window").width < 640') &&
    layer.includes('flexDirection: narrow ? "column" : "row"'));
const clusterIdx = layer.indexOf("top: clusterTop,");
const cardIdx = layer.indexOf('THE FOLD{" "}');
const boardIdx = layer.indexOf("<BountyBoard");
check("B4 inside the cluster, the field card precedes the board (column order)",
  clusterIdx > 0 && cardIdx > clusterIdx && boardIdx > cardIdx);
check("B5 the board takes the cluster's remaining space (flex), not an absolute panel",
  layer.includes("style={{ flex: 1, minHeight: 0, minWidth: 0 }}") &&
    layer.includes("flex: 1,\n                backgroundColor: \"rgba(2,8,23,0.66)\""));
check("B6 the old overlapping panels are gone (no 348 width, no % cap, no 330 cap)",
  !layer.includes("width: 348") && !layer.includes('maxWidth: "86%"') &&
    !layer.includes("maxWidth: 330"));

// The arithmetic that convicted the old layout, for the record:
// card [12, 12+330] vs board [390-12-min(348, 0.86*390), 378].
const oldCardR = 12 + 330;
const oldBoardL = VIEW_W - 12 - Math.min(348, 0.86 * VIEW_W);
check("B7 (record) the pre-fix rects overlapped by ~300pt at 390pt",
  Math.round(oldCardR - oldBoardL) === 299,
  `card [12, ${oldCardR}], board [${oldBoardL.toFixed(1)}, 378]`);

// ----------------------------------------------------------------
// C. One empty state, in the board, gated by the viewer's seat.
// ----------------------------------------------------------------

const boardTsx = read("src/components/genx/BountyBoard.tsx");
const structure = read("src/components/genx/StructureView.tsx");
const WAITING = "Waiting for the room's host to post the seed bounties…";
const occurrences = (s, sub) => s.split(sub).length - 1;
check("C1 the waiting-for-the-host line exists exactly once in the Fold's UI",
  occurrences(boardTsx, WAITING) === 1 &&
    occurrences(layer, WAITING) === 0 &&
    occurrences(structure, WAITING) === 0);
check("C2 the waiting line is the guest branch of the seat-gated empty state",
  boardTsx.includes(
    'props.isHost\n            ? "Posting the seed bounties…"\n            : "Waiting for the room\'s host to post the seed bounties…"'
  ));
check("C3 the old second empty line is gone from both components",
  !boardTsx.includes("No bounties on the board yet") &&
    !layer.includes("No bounties on the board yet"));
check("C4 the board's empty state keys on the UNFILTERED defs, before the filter state",
  boardTsx.indexOf("props.cards.length === 0") > 0 &&
    boardTsx.indexOf("props.cards.length === 0") <
      boardTsx.indexOf(") : cards.length === 0 ? (") &&
    boardTsx.includes("Nothing under this filter"));
check("C5 the layer's field card speaks about the field, not the board",
  layer.includes('"The field is idle — no fold is running yet."'));
check("C6 the board still receives the viewer's seat (the Start gate survives)",
  layer.includes("isHost={isHost}") && boardTsx.includes("props.isHost && card.status"));

// ----------------------------------------------------------------
// D. The brain chip and the cluster share a non-overlap layout.
// ----------------------------------------------------------------

const chrome = read("app/components/fabric/BrainChrome.tsx");
const tokens = read("src/theme/tokens.ts");
check("D1 the layer reads the brain from the same store BrainChrome reads",
  layer.includes('from "../../ai/onDeviceBrain"') &&
    layer.includes("subscribeOnDeviceBrain") &&
    layer.includes("getBrainSnapshot()"));
const brain = read("src/ai/onDeviceBrain.ts");
check("D2 the layer's chip predicate is the shared brainChipVisible() BrainChrome also uses",
  layer.includes("brainChipVisible(brainSnap)") &&
    chrome.includes("brainChipVisible(snap)") &&
    brain.includes("export function brainChipVisible") &&
    brain.includes('!s.askVisible && (s.state === "downloading" || s.state === "warming")'));
// Chip rect from BrainChrome's own values: slot-S wrapper top 68
// (Slice 44); the pill carries paddingVertical 5 top+bottom, 1pt
// borders, and the 12pt caption line (line box taken generously
// at 1.5x).
const chipTop = Number(chrome.match(/top: (\d+),\n          left: 0,\n          right: 112,/)?.[1] ?? NaN);
const padV = Number(
  chrome.match(/paddingVertical: (\d+),\n            paddingHorizontal: 12,/)?.[1] ?? NaN
);
const captionPx = Number(tokens.match(/caption: (\d+),/)?.[1] ?? NaN);
const chipBottom = chipTop + padV * 2 + 2 + Math.ceil(captionPx * 1.5);
const clearance = Number(layer.match(/const BRAIN_CHIP_CLEARANCE = (\d+);/)?.[1] ?? NaN);
const clusterRestingTop = Number(layer.match(/const CLUSTER_TOP = (\d+);/)?.[1] ?? NaN);
const clusterTopWithChip = clusterRestingTop + clearance;
check(`D3 chip bottom (${chipBottom}pt from its own values) clears the dropped cluster top (${clusterTopWithChip}pt)`,
  Number.isFinite(chipBottom) && Number.isFinite(clearance) &&
    Number.isFinite(clusterRestingTop) &&
    clusterTopWithChip > chipBottom,
  `gap ${clusterTopWithChip - chipBottom}pt`);
check("D4 the cluster's top is the computed clusterTop (resting 92 + clearance)",
  layer.includes("top: clusterTop,") &&
    layer.includes("const CLUSTER_TOP = 92;") &&
    layer.includes("const clusterTop = CLUSTER_TOP + (brainChipUp ? BRAIN_CHIP_CLEARANCE : 0);"));

console.log(`\nfoldboard-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
