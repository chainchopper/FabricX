/**
 * essence-check.mjs — Slice 60: the ghostie leaves the corner.
 *
 * Terrell (Nov 3, 2026, on device): "That ghostie icon in the
 * top right needs to be in the info panel with the fabric info."
 *
 * Proves, headlessly:
 *   A. The corner is empty: the root ChromeLayer mounts no
 *      visual Essence in any size, the component carries no
 *      absolute corner positioning and no expand/collapse
 *      machinery, and nothing else in the layout took its place.
 *   B. The block lives in the panel: FabricInfo renders the
 *      Essence once, under its own YOUR GHOSTIE section, ahead
 *      of the fabric's sections; the block shows the ghost's
 *      name, the brain line, and the connection line in words.
 *   C. One sim, genuinely alive: the block runs the SHARED
 *      module's lineage (src/identity/fdna — the same module,
 *      import path, and stepper the Ghostie Home runs), keeps
 *      no local stepper and no ad-hoc reseed, steps it on the
 *      behavior cadence — and the bundled lineage itself runs
 *      400 steps from a fixed seed without repeating a state.
 *   D. Doors, not duplicates: the block dispatches both menu
 *      events (ID card, Ghostie Home); FabricMenu listens for
 *      both; FabricInfo imports no GhostieHome — the Home is
 *      linked, its only home stays the menu.
 *   E. The keeper: the badge's presence-retry loop survives
 *      headless — exported from Essence.tsx, mounted once in
 *      the layout, rendering null, its 8s countdown, gate and
 *      re-announce dispatch intact.
 *   F. The tint: with the panel closed, the info icon's tint is
 *      the canvas's only connection signal — FabricInfo derives
 *      "reconnecting" from essenceState's own mapping over the
 *      realtime status and spends colors.danger on exactly the
 *      icon's two tint tokens, nowhere else.
 *   G. Every touched TSX parses clean under esbuild.
 *
 * Run: node scripts/essence-check.mjs
 */
import { readFileSync } from "node:fs";
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

const layout = read("app/_layout.tsx");
const essence = read("app/components/fabric/Essence.tsx");
const finfo = read("app/components/fabric/FabricInfo.tsx");
const fmenu = read("app/components/fabric/FabricMenu.tsx");
const home = read("app/components/fabric/GhostieHome.tsx");

/* ------------------------------------------------------------------ */
/* A. The corner is empty                                             */
/* ------------------------------------------------------------------ */

check(
  "A1 the root layout mounts no visual Essence (no <Essence /> in the chrome tree)",
  !layout.includes("<Essence />") && !layout.includes('import Essence from')
);
check(
  "A2 Essence.tsx carries no corner positioning in any size (no absolute, no top/right 12, no corner zIndex)",
  !essence.includes('position: "absolute"') &&
    !essence.includes("top: 12") &&
    !essence.includes("right: 12") &&
    !essence.includes("zIndex: 70") &&
    !essence.includes("zIndex: 65")
);
check(
  "A3 the corner's expand/collapse machinery is gone (no expanded state, no collapse scrim, no width-304 card)",
  !essence.includes("setExpanded") &&
    !essence.includes("Collapse your essence") &&
    !essence.includes("width: 304")
);
check(
  "A4 the layout imports the Essence module for the keeper only (named import, no default visual import)",
  layout.includes(
    'import { EssenceRetryKeeper } from "./components/fabric/Essence"'
  )
);

/* ------------------------------------------------------------------ */
/* B. The block lives in the panel                                    */
/* ------------------------------------------------------------------ */

check(
  "B1 FabricInfo imports the Essence and renders it exactly once",
  finfo.includes('import Essence from "./Essence"') &&
    (finfo.match(/<Essence \/>/g) ?? []).length === 1
);
check(
  "B2 the block sits under its own YOUR GHOSTIE section, ahead of the fabric's own sections",
  finfo.includes("<SectionTitle>YOUR GHOSTIE</SectionTitle>") &&
    finfo.indexOf("YOUR GHOSTIE") < finfo.indexOf("WHAT THIS FABRIC IS") &&
    finfo.indexOf("<Essence />") > finfo.indexOf("YOUR GHOSTIE") &&
    finfo.indexOf("<Essence />") < finfo.indexOf("WHAT THIS FABRIC IS")
);
check(
  "B3 the block shows the ghost's name (with its standing fallback) and temperament",
  essence.includes("ghost.ghostName") &&
    essence.includes('"Your ghostie"') &&
    essence.includes("ghost.temperament")
);
check(
  "B4 the block carries the brain line and the connection line, in words",
  essence.includes("essenceBrainLine(") &&
    essence.includes("{brainLine}") &&
    essence.includes("essenceConnectionLine(") &&
    essence.includes("{connLine}")
);

/* ------------------------------------------------------------------ */
/* C. One sim, genuinely alive                                        */
/* ------------------------------------------------------------------ */

check(
  "C1 the block runs the shared module's lineage (same import path as the Home)",
  essence.includes("createFdnaLineage") &&
    essence.includes('from "../../../src/identity/fdna"') &&
    home.includes('from "../../../src/identity/fdna"')
);
check(
  "C2 no local stepper, no ad-hoc reseed on this surface (the module owns the life)",
  !essence.includes("seedFdnaGrid") &&
    !essence.includes("stepFdnaGrid") &&
    !essence.includes("0x9e3779b9")
);
check(
  "C3 the block steps the lineage on the behavior's cadence (it evolves while shown)",
  essence.includes("lineage.step()") && essence.includes("essenceStepMs(behavior)")
);

const BUNDLE = "/tmp/essence-fdna.mjs";
await esbuild.build({
  entryPoints: [path.join(root, "src/identity/fdna.ts")],
  bundle: true,
  format: "esm",
  outfile: BUNDLE,
  logLevel: "silent",
});
const fdna = await import(BUNDLE);
{
  const lin = fdna.createFdnaLineage(42);
  const seen = new Set([fdna.fdnaStateKey(lin.grid)]);
  let repeats = 0;
  for (let i = 0; i < 400; i++) {
    const k = fdna.fdnaStateKey(lin.step().grid);
    if (seen.has(k)) repeats++;
    seen.add(k);
  }
  check(
    "C4 the sim the block renders is the living lineage: 400 steps from seed 42, zero repeated states",
    repeats === 0 && seen.size === 401
  );
}

/* ------------------------------------------------------------------ */
/* D. Doors, not duplicates                                           */
/* ------------------------------------------------------------------ */

check(
  "D1 the block dispatches both doors (ID card + Ghostie Home events)",
  essence.includes('ESSENCE_OPEN_GHOST_CARD_EVENT = "fabric:open-own-ghost-card"') &&
    essence.includes('ESSENCE_OPEN_GHOSTIE_HOME_EVENT = "fabric:open-ghostie-home"') &&
    essence.includes("new CustomEvent(ESSENCE_OPEN_GHOST_CARD_EVENT)") &&
    essence.includes("new CustomEvent(ESSENCE_OPEN_GHOSTIE_HOME_EVENT)")
);
check(
  "D2 FabricMenu listens for both doors; the Home door lands on the Home sub-view",
  fmenu.includes('addEventListener("fabric:open-own-ghost-card"') &&
    fmenu.includes('addEventListener("fabric:open-ghostie-home"') &&
    fmenu.includes("setGhostHomeOpen(true)")
);
check(
  "D3 the Home is linked, not duplicated: FabricInfo imports no GhostieHome",
  !finfo.includes("GhostieHome")
);

/* ------------------------------------------------------------------ */
/* E. The keeper                                                      */
/* ------------------------------------------------------------------ */

const keeperBody = essence.slice(
  essence.indexOf("export function EssenceRetryKeeper"),
  essence.indexOf("/* Emblem geometry")
);
check(
  "E1 EssenceRetryKeeper is exported, mounted exactly once in the layout, and renders null",
  keeperBody.length > 0 &&
    keeperBody.includes("return null") &&
    (layout.match(/<EssenceRetryKeeper \/>/g) ?? []).length === 1
);
check(
  "E2 the retry behavior is the badge's, intact: 8s countdown, online-with-zero-peers gate, re-announce dispatch",
  essence.includes("const RETRY_SECONDS = 8") &&
    keeperBody.includes("RETRY_SECONDS") &&
    keeperBody.includes('mode === "online" && peers === 0') &&
    keeperBody.includes('new CustomEvent("fabric:webrtc-reannounce")')
);

/* ------------------------------------------------------------------ */
/* F. The tint                                                        */
/* ------------------------------------------------------------------ */

check(
  "F1 FabricInfo derives the tint state from essenceState's own mapping over the realtime status",
  finfo.includes("subscribeRealtimeStatus") &&
    finfo.includes("essenceBehaviorFor(") &&
    finfo.includes('=== "reconnecting"')
);
check(
  "F2 colors.danger is spent on exactly the icon's two tint tokens — nothing else in the panel reddens",
  (finfo.match(/colors\.danger/g) ?? []).length === 2 &&
    finfo.includes("const iconTint = reconnecting ? colors.danger : colors.accent") &&
    finfo.includes("const iconTintLine = reconnecting ? colors.danger : colors.accentLine")
);

/* ------------------------------------------------------------------ */
/* G. Touched files parse                                             */
/* ------------------------------------------------------------------ */

{
  let clean = true;
  for (const rel of [
    "app/_layout.tsx",
    "app/components/fabric/Essence.tsx",
    "app/components/fabric/FabricInfo.tsx",
    "app/components/fabric/FabricMenu.tsx",
  ]) {
    try {
      await esbuild.build({
        entryPoints: [path.join(root, rel)],
        bundle: false,
        write: false,
        logLevel: "silent",
      });
    } catch {
      clean = false;
      console.log(`     esbuild failed: ${rel}`);
    }
  }
  check("G1 every touched TSX parses clean under esbuild", clean);
}

console.log(`\nessence-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
