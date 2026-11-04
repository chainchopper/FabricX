/**
 * infoicon-check.mjs — Slice 49: ONE info icon per fabric.
 *
 * Terrell (Nov 3): "too much menu stuff is included over our fabric
 * space still so a small animated info icon seems in order which
 * will pull up the fabrics information panel each fabric is
 * different so."
 *
 * Proves, headlessly:
 *   A. Exactly one info icon exists, it belongs to the loaded
 *      fabric (keyed by fabric id, leaves when the fabric/menu
 *      state leaves), and its docked rect at 390x844 clears the
 *      top-right corner, the brain chip's slot, the keep-clear
 *      center, and every fabric's own bottom band — numerically.
 *      (Slice 60 amendment: A6's corner rect used to be the
 *      Essence's footprint, which the icon had to clear; the
 *      Essence lives in this panel now and the corner is empty —
 *      the pin survives as clearance of the vacated corner, same
 *      rect, same count. The Essence's tenancy of the panel is
 *      essence-check's proof, not this file's.)
 *   B. The panel's content is keyed by the loaded fabric id: a
 *      complete FABRIC_INFO record for every builtin fabric, the
 *      view resolving content through fabricInfoFor(active.id)
 *      with NO per-fabric branches, and ghostToolsHere gating the
 *      ghost's tools by layer + session rules for real.
 *   C. Closed means parked: the panel rides ChromeMount with
 *      visible={open} (unmount-after-exit), closes on fabric
 *      switch and on menu open, holds the chrome while open, and
 *      is the only panel the component renders.
 *   D. Motion discipline: both icon and panel transition through
 *      ChromeMount (house 240/280ms tokens), the icon's breathing
 *      pulse runs on the house loop, reduced motion is respected.
 *   E. The clutter this replaces is gone: the HUD's standing
 *      "{name} driving" line and its identity subscription are
 *      removed (the driver now reads in the panel's room section),
 *      the Dancer Stage's standing RigLabel name tag is unmounted
 *      (file kept, retired not deleted) — while the play surfaces
 *      stay: the piano keys still mount from the HUD.
 *   F. The icon exists nowhere off a loaded fabric: the only
 *      mount site in the app is the root ChromeLayer, and the
 *      component returns null with no active fabric.
 *
 * Run: node scripts/infoicon-check.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const esbuild = require("esbuild");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
  }
}
const read = (p) => readFileSync(path.join(root, p), "utf8");

/* ------------------------------------------------------------------ */
/* Bundle the pure data module                                        */
/* ------------------------------------------------------------------ */

const BUNDLE = "/tmp/infoicon-fabricInfo.mjs";
await esbuild.build({
  entryPoints: [path.join(root, "app/components/fabric/fabricInfo.ts")],
  bundle: true,
  format: "esm",
  outfile: BUNDLE,
  logLevel: "silent",
});
const data = await import(BUNDLE);
const { FABRIC_INFO, fabricInfoFor, ghostToolsHere, iconBottomFor } = data;

const layout = read("app/_layout.tsx");
const finfo = read("app/components/fabric/FabricInfo.tsx");
const fdata = read("app/components/fabric/fabricInfo.ts");
const hud = read("app/components/ExperienceHUD.tsx");
const rig = read("src/dancer/DancerRig.tsx");
const iconSrc = read("src/components/ui/Icon.tsx");
const chromeMount = read("src/components/ui/ChromeMount.tsx");
const registry = read("src/contexts/ExperienceContext.tsx");

const DEMO = ["default-fluid", "ar-piano", "dancer-stage", "genx-fold"];
const ALL = [...DEMO, "sam-see", "camera-effects"];

/* ------------------------------------------------------------------ */
/* A. One icon, fabric-bound, clear of every resident rect            */
/* ------------------------------------------------------------------ */

check(
  "A1 the root layout mounts FabricInfo exactly once",
  (layout.match(/<FabricInfo \/>/g) ?? []).length === 1 &&
    layout.includes('import FabricInfo from "./components/fabric/FabricInfo"')
);
check(
  "A2 FabricInfo renders exactly one info icon (one button; its glyph becomes the close while the panel is open)",
  (finfo.match(/name=\{open \? "close" : "info"\}/g) ?? []).length === 1 &&
    (iconSrc.match(/^\s+info: \[/gm) ?? []).length === 1 &&
    (iconSrc.match(/\| "info";/g) ?? []).length === 1
);
check(
  "A3 the icon is keyed by the loaded fabric id (leaves with its fabric)",
  finfo.includes("key={active.id}")
);
check(
  "A4 the icon yields while the fabric menu is open (not a menu-screen element)",
  finfo.includes("visible={!menuOpen}")
);
check(
  "A5 no fabric, no icon: the component returns null without an active fabric or info record",
  finfo.includes("if (Platform.OS !== \"web\" || !active) return null") &&
    finfo.includes("if (!info) return null")
);

// Geometry at the reference handset 390x844 (Slice 44's frame).
const W = 390;
const H = 844;
const SIZE = data.FABRIC_ICON_SIZE; // 44 hit target
const RIGHT = data.FABRIC_ICON_RIGHT; // 12
const iconRect = (id) => {
  const bottom = iconBottomFor(id);
  return { x0: W - RIGHT - SIZE, x1: W - RIGHT, yb0: bottom, yb1: bottom + SIZE };
};
const VACATED_CORNER = { x0: W - 12 - 56, x1: W - 12, yt0: 12, yt1: 76 }; // top-right — the Essence's old footprint (Slice 60: empty)
const BRAIN_CHIP = { x0: 85, x1: 305, yt0: 60, yt1: 97 }; // top-center slot
const KEEP_CLEAR = { x0: 98, x1: 292, yt0: 211, yt1: 633 }; // Slice 44 center
const HUD_BAND = { "default-fluid": 98, "sam-see": 98, "camera-effects": 98, "dancer-stage": 144, "ar-piano": 214 };
const FOLD_CLUSTER_BOTTOM = 118; // GenxLayer CLUSTER_BOTTOM on main
const COMPOSE_PILL = { x0: 45, x1: 345, yb0: 14, yb1: 62 };

for (const id of ALL) {
  const r = iconRect(id);
  const topY = H - r.yb1;
  check(
    `A6 ${id}: icon clears the vacated top-right corner and the brain chip slot`,
    topY > VACATED_CORNER.yt1 && (r.x0 > BRAIN_CHIP.x1 || topY > BRAIN_CHIP.yt1)
  );
  check(
    `A7 ${id}: icon stays out of the keep-clear center`,
    r.x0 > KEEP_CLEAR.x1 || r.x1 < KEEP_CLEAR.x0 || topY > KEEP_CLEAR.yt1 || H - r.yb0 < KEEP_CLEAR.yt0
  );
  if (id === "genx-fold") {
    check(
      "A8 genx-fold: icon rides the air gap under the board (8pt below the cluster, clears the compose pill)",
      r.yb1 <= FOLD_CLUSTER_BOTTOM - 8 && r.yb0 >= COMPOSE_PILL.yb1 + 4
    );
  } else {
    check(
      `A8 ${id}: icon rides 12pt above the fabric's own HUD band (${HUD_BAND[id]})`,
      iconBottomFor(id) === HUD_BAND[id] + 12
    );
  }
}

/* ------------------------------------------------------------------ */
/* B. Panel content keyed by the loaded fabric                        */
/* ------------------------------------------------------------------ */

for (const id of ALL) {
  const rec = fabricInfoFor(id);
  check(
    `B1 ${id}: complete info record (about, modes, rules, controls)`,
    !!rec &&
      typeof rec.about === "string" &&
      rec.about.length > 20 &&
      rec.modes.length >= 1 &&
      rec.rules.length >= 1 &&
      rec.controls.length >= 1 &&
      registry.includes(`id: "${id}"`)
  );
}
check(
  "B2 fabricInfoFor is keyed strictly by fabric id (unknown id -> null, no cross-fabric panel)",
  fabricInfoFor("genx-fold") !== fabricInfoFor("default-fluid") &&
    fabricInfoFor("no-such-fabric") === null &&
    fabricInfoFor(null) === null
);
check(
  "B3 the view resolves content through fabricInfoFor(active.id) — one code path for every fabric",
  finfo.includes("fabricInfoFor(active.id)") && finfo.includes("{active.name}")
);
check(
  "B4 the view carries NO per-fabric branches (content lives in the data module, not the JSX)",
  !/active\.id === "/.test(finfo) && !finfo.includes("switch (active.id")
);
check(
  "B5 panel sections: what it is / modes / rules here / controls / ghostie here / this room",
  ["WHAT THIS FABRIC IS", "MODES", "RULES HERE", "CONTROLS", "YOUR GHOSTIE HERE", "THIS ROOM"].every(
    (s) => finfo.includes(s)
  )
);

const ALL_ON = { draw: true, verbs: true, notes: true };
const tool = (list, id) => list.find((t) => t.id === id);
check(
  "B6 ghost tools: draw follows the fabric's draw rule (guest with draw off -> unavailable)",
  tool(ghostToolsHere("default-fluid", "fluid", ALL_ON), "draw").available === true &&
    tool(ghostToolsHere("default-fluid", "fluid", { ...ALL_ON, draw: false }), "draw").available === false
);
check(
  "B7 ghost tools: asked verbs follow the verbs rule",
  tool(ghostToolsHere("default-fluid", "fluid", { ...ALL_ON, verbs: false }), "verb-perform").available === false
);
check(
  "B8 ghost tools: note tools exist ONLY at the Piano layer, under the notes rule",
  tool(ghostToolsHere("ar-piano", "fluid", ALL_ON), "play-note").available === true &&
    tool(ghostToolsHere("ar-piano", "fluid", { ...ALL_ON, notes: false }), "play-note").available === false &&
    tool(ghostToolsHere("default-fluid", "fluid", ALL_ON), "play-note").available === false &&
    tool(ghostToolsHere("dancer-stage", "stage3d", ALL_ON), "note-perform").available === false
);
check(
  "B9 ghost tools: the stage has no drawing surface and no heartbeat splat (honest refusals, in product language)",
  tool(ghostToolsHere("dancer-stage", "stage3d", ALL_ON), "draw").note === "The stage has no drawing surface" &&
    tool(ghostToolsHere("dancer-stage", "stage3d", ALL_ON), "heartbeat-answer").available === false &&
    tool(ghostToolsHere("dancer-stage", "stage3d", ALL_ON), "splat-play").available === true
);
const registrySrc = read("src/ghost/ghostTools.ts");
const registryBlock = registrySrc.slice(
  registrySrc.indexOf("GHOST_TOOL_REGISTRY"),
  registrySrc.indexOf("];", registrySrc.indexOf("GHOST_TOOL_REGISTRY"))
);
const registryIds = [...registryBlock.matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]);
check(
  "B10 the tool list is the registry's own (every registered tool accounted for, none invented)",
  registryIds.length >= 6 &&
    ghostToolsHere("default-fluid", "fluid", ALL_ON).map((t) => t.id).join(",") ===
      registryIds.join(",")
);

/* ------------------------------------------------------------------ */
/* C. Parked truly, one panel only                                    */
/* ------------------------------------------------------------------ */

check(
  "C1 the panel mounts through ChromeMount with visible={open}",
  finfo.includes("visible={open}") && (finfo.match(/<ChromeMount/g) ?? []).length === 2
);
check(
  "C2 ChromeMount parks by unmounting after the exit (0px, no touch interception)",
  chromeMount.includes("if (finished) setRender(false)") &&
    chromeMount.includes("if (!render) return null")
);
check(
  "C3 the panel closes on fabric switch and when the menu opens",
  finfo.includes("prevIdRef.current !== activeId") &&
    finfo.includes("if (menuOpen) setOpen(false)")
);
check(
  "C4 while the panel is open the chrome holds (no idle fade under a reading panel)",
  finfo.includes("setHoldVisible(open)")
);
check(
  "C5 the panel is a single cluster: one sheet on one scrim, tap-away and the close button both close it",
  finfo.includes("backgroundColor: colors.sheet") &&
    finfo.includes("backgroundColor: colors.backdrop") &&
    finfo.includes('maxHeight: "62%"') &&
    (finfo.match(/onPress=\{\(\) => setOpen\(false\)\}/g) ?? []).length === 2
);

/* ------------------------------------------------------------------ */
/* D. Motion discipline                                               */
/* ------------------------------------------------------------------ */

check(
  "D1 icon and panel both transition through ChromeMount (house 240/280ms tokens, no pop)",
  chromeMount.includes("motion.base") && chromeMount.includes("motion.fast")
);
check(
  "D2 the icon breathes: a soft ring + gentle scale on the house pulse loop",
  finfo.includes("duration: 1600") &&
    finfo.includes("ringScale") &&
    finfo.includes("ringOpacity")
);
check(
  "D3 reduced motion is respected (the breathing pulse stills)",
  finfo.includes('window.matchMedia("(prefers-reduced-motion: reduce)")') &&
    finfo.includes("if (reduceMotion) return undefined;")
);

/* ------------------------------------------------------------------ */
/* E. The clutter this replaces                                       */
/* ------------------------------------------------------------------ */

check(
  "E1 the HUD's standing \"{name} driving\" line is gone from the canvas",
  !hud.includes("displayNameFor") && !hud.includes("useIdentitySnapshot")
);
check(
  "E2 the driver now reads in the panel's room section (moved, not deleted)",
  finfo.includes("displayNameFor(session.driverId, session.selfId)") &&
    finfo.includes("driving")
);
check(
  "E3 the Dancer Stage's standing name tag is unmounted from DancerRig",
  !rig.includes("<RigLabel") && !rig.includes('from "./RigLabel"')
);
check(
  "E4 RigLabel.tsx itself is retired, not deleted (house style)",
  existsSync(path.join(root, "src/dancer/RigLabel.tsx"))
);
check(
  "E5 play surfaces stay: the piano keys still mount from the HUD (they are the fabric, not chrome)",
  hud.includes("PianoKeyboard")
);
check(
  "E6 the Fold's board is content: GenxLayer carries no FabricInfo coupling (untouched by this slice)",
  !read("src/components/genx/GenxLayer.tsx").includes("FabricInfo")
);

/* ------------------------------------------------------------------ */
/* F. Absent off-fabric                                               */
/* ------------------------------------------------------------------ */

check(
  "F1 FabricMenu never mounts FabricInfo (no icon on menu/gallery screens)",
  !read("app/components/fabric/FabricMenu.tsx").includes("FabricInfo")
);
check(
  "F2 the panel's ghostie section reads the per-fabric resolver (Slice 47's manifest joins at ghostToolsHere)",
  finfo.includes("ghostToolsHere(active.id, canvasKindFor(active), rules)") &&
    fdata.includes("Slice 47")
);

console.log(`\ninfoicon-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
