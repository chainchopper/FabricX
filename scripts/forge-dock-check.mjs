// forge-dock-check — pins Slice H, the Forge dock (motion + hierarchy).
//
// What Slice H is: the visuals audit's finding 4 — the Forge dock
// popped (zero `transition` in ForgeLayer.tsx), five identical
// pills with no hierarchy, no pressed state, a parallel palette,
// 12.5px off-scale type. This check pins the fix at the source
// level; the browser proof (proof-h/) pins it at runtime — the
// entry frame sequence, the branch crossfade, and the pressed
// pill's computed style.
//
// The fix, in one paragraph: the dock's two branches (menu vs
// game) crossfade through ChromeMount, the house mount pattern
// (enter motion.base 280ms, exit motion.fast 240ms, 8px rise),
// the conditional Clear-photos pill and the photo note fade the
// same way, and every pill is a ForgeDockPill in the token visual
// language (forgeDockChrome.tsx) — one primary (play your ghostie,
// the accent, semibold, separated by an xs step), the rest
// secondary, Clear photos in danger. Pressed is the pointer's
// :active (a pill sinks 1px and darkens to the sheet while held);
// these are momentary actions, so no pill fakes a persistent
// toggled state — the active mode IS the branch. All dock type
// is on the token scale (12/14) and every dock color is a token
// color. The lime question is NOT settled here: no lime appears
// in the dock's code, and the decision stays its own slice.
//
// Sections:
//   H0 structure — ChromeMount + ForgeDockPill wiring, no raw buttons
//   H1 transitions — token durations, entering + leaving both
//   H2 hierarchy — exactly one primary (first), four secondary, one danger
//   H3 pressed/active — :hover/:active/:focus-visible, pointer-driven only
//   H4 type — token scale only, the 12.5 is gone
//   H5 palette — token colors only; lime absent from dock code
//   H6 ChromeMount contract — its durations are the token steps
//   H7 parse — both touched files bundle clean
//
// The exactly-one-pressed-at-a-time property is a runtime fact
// (only one pointer exists) and is pinned by the proof drive's
// computed-style assertions, not by this static check — the
// check says so here rather than pretending a grep proves it.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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

const read = (p) => readFileSync(p, "utf8");
const layer = read("src/components/forge/ForgeLayer.tsx");
const dock = read("src/components/forge/forgeDockChrome.tsx");
const chromeMount = read("src/components/ui/ChromeMount.tsx");

/** Strip block comments and full-line // comments (the lime hex is
 *  mentioned in forgeDockChrome's header comment as documentation
 *  of the non-decision; code must not contain it). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const layerCode = stripComments(layer);
const dockCode = stripComments(dock);

/** The dock's stylesheet body (the template literal). */
const cssMatch = dock.match(/FORGE_DOCK_STYLE_CSS = `([\s\S]*?)`;/);
const css = cssMatch ? cssMatch[1] : "";

/** The dock's JSX: from the Slice D comment to the styles element. */
const dockStart = layer.indexOf("Slice D: the game's own chrome");
const dockEnd = layer.indexOf("<ForgeDockStyles />");
const dockJsx =
  dockStart >= 0 && dockEnd > dockStart
    ? layer.slice(dockStart, dockEnd)
    : "";

const count = (src, re) => (src.match(re) || []).length;

/** A rule's body from the dock stylesheet. Rules close with a
 *  brace alone on its line, so the body can span the ${...}
 *  interpolations inside it (a [^}]* class cannot — the
 *  interpolations themselves contain }). */
function ruleBody(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(esc + " \\{([\\s\\S]*?)\\n\\}"));
  return m ? m[1] : null;
}

/** The menu branch's JSX (the game branch renders first in the
 *  file, so "first pill" is judged inside this branch). */
const menuStart = layer.indexOf("visible={gameSnap?.active !== true}");
const menuJsx =
  menuStart >= 0 ? layer.slice(menuStart, dockEnd) : "";

// ---- H0 structure -----------------------------------------------
check(
  "H0 ForgeLayer imports ChromeMount (the house mount pattern)",
  layer.includes('import { ChromeMount } from "../ui/ChromeMount"')
);
check(
  "H0 ForgeLayer imports the dock chrome (pill + styles)",
  layer.includes("ForgeDockPill") &&
    layer.includes("ForgeDockStyles") &&
    layer.includes('from "./forgeDockChrome"')
);
check(
  "H0 no raw <button> remains in ForgeLayer (every pill is a ForgeDockPill)",
  !layer.includes("<button")
);
check(
  "H0 exactly six dock pills (End + 4 menu actions + Clear)",
  count(layer, /<ForgeDockPill/g) === 6,
  `found ${count(layer, /<ForgeDockPill/g)}`
);
check(
  "H0 exactly four ChromeMounts (game branch, menu branch, Clear, note)",
  count(layer, /<ChromeMount/g) === 4,
  `found ${count(layer, /<ChromeMount/g)}`
);
check(
  "H0 the dock stylesheet is rendered once, inside the dock",
  count(layer, /<ForgeDockStyles \/>/g) === 1
);

// ---- H1 transitions ----------------------------------------------
check(
  "H1 the pill stylesheet declares a transition from the tokens",
  css.includes("transition:") &&
    css.includes("${motion.base}ms") &&
    css.includes("${motion.fast}ms"),
  "transition must reference motion.base + motion.fast"
);
check(
  "H1 the pill transition covers background, border, color, transform",
  /transition:[^;]*background-color[^;]*border-color[^;]*color[^;]*transform/.test(
    css
  )
);
check(
  "H1 both dock branches are ChromeMount-wrapped (enter + leave both)",
  layer.includes(
    "<ChromeMount\n          visible={gameSnap?.active === true}"
  ) && layer.includes("<ChromeMount\n          visible={gameSnap?.active !== true}")
);
check(
  "H1 the conditional Clear pill and the photo note are ChromeMount-wrapped",
  layer.includes(
    "<ChromeMount\n            visible={photoSnap.prints + photoSnap.mosaics > 0}"
  ) && layer.includes("<ChromeMount visible={Boolean(photoSnap.note)}>")
);

// ---- H2 hierarchy -------------------------------------------------
check(
  "H2 exactly one primary pill",
  count(layer, /variant="primary"/g) === 1,
  `found ${count(layer, /variant="primary"/g)}`
);
check(
  "H2 the primary is the headline act (play your ghostie, first pill of the menu branch)",
  (() => {
    const i = menuJsx.indexOf('variant="primary"');
    const j = menuJsx.indexOf('variant="secondary"');
    const seg = menuJsx.slice(i, i + 400);
    return (
      i >= 0 &&
      i < j &&
      seg.includes('startGame("vs-ghost")') &&
      seg.includes("Checkers — play your ghostie")
    );
  })()
);
check(
  "H2 the primary is separated from the group by one xs step",
  layer.includes("style={{ marginBottom: spacing.xs }}")
);
check(
  "H2 the primary is semibold in the stylesheet (token weight)",
  (ruleBody(".forge-dock-pill--primary") || "").includes(
    "font-weight: ${type.semibold}"
  )
);
check(
  "H2 the branch wrappers size to their widest label (width max-content — no min-content collapse)",
  layer.includes('width: "max-content"') &&
    count(layer, /width: "max-content"/g) === 2,
  `found ${count(layer, /width: "max-content"/g)}`
);
check(
  "H2 the pill labels never wrap (white-space nowrap — a wrapped pill reads as a broken dock)",
  (ruleBody(".forge-dock-pill") || "").includes("white-space: nowrap")
);
check(
  "H2 exactly four secondary pills (End + two-player + print + blocks)",
  count(layer, /variant="secondary"/g) === 4,
  `found ${count(layer, /variant="secondary"/g)}`
);
check(
  "H2 exactly one danger pill, and it is Clear photos",
  count(layer, /variant="danger"/g) === 1 &&
    layer.slice(layer.indexOf('variant="danger"'), layer.indexOf('variant="danger"') + 200).includes("Clear photos")
);

// ---- H3 pressed/active --------------------------------------------
check(
  "H3 the pill has a :hover state (lifts)",
  (ruleBody(".forge-dock-pill:hover") || "").includes(
    "transform: translateY(-1px)"
  )
);
check(
  "H3 the pill has a :active pressed state (sinks + darkens to the sheet)",
  (() => {
    const body = ruleBody(".forge-dock-pill:active") || "";
    return (
      body.includes("background: ${colors.sheet}") &&
      body.includes("transform: translateY(1px)")
    );
  })()
);
check(
  "H3 the pill has a :focus-visible state (accent outline)",
  (ruleBody(".forge-dock-pill:focus-visible") || "").includes(
    "outline: 2px solid ${colors.accent}"
  )
);
check(
  "H3 pressed is pointer-driven only: no JS pressed state in the dock module",
  !dockCode.includes("useState") && !dockCode.includes("pressed")
);

// ---- H4 type -------------------------------------------------------
check(
  "H4 the 12.5px off-scale type is gone from ForgeLayer",
  !layer.includes("12.5")
);
check(
  "H4 every font-size in the dock stylesheet is a token type step",
  (() => {
    const sizes = [...css.matchAll(/font-size: ([^;]+);/g)].map((m) => m[1].trim());
    return (
      sizes.length > 0 &&
      sizes.every(
        (s) => s === "${type.body}px" || s === "${type.caption}px"
      )
    );
  })()
);
check(
  "H4 the note is caption (12) and the pills/banner are body (14)",
  (ruleBody(".forge-dock-note") || "").includes(
    "font-size: ${type.caption}px"
  ) &&
    (ruleBody(".forge-dock-pill") || "").includes(
      "font-size: ${type.body}px"
    ) &&
    (ruleBody(".forge-dock-banner") || "").includes(
      "font-size: ${type.body}px"
    )
);

// ---- H5 palette -----------------------------------------------------
check(
  "H5 the dock stylesheet has no hardcoded color literals (all colors are token interpolations)",
  !/#[0-9a-fA-F]{3,8}\b/.test(css) && !/rgba?\(/.test(css),
  "found a literal hex or rgba in the CSS template"
);
check(
  "H5 the dock JSX carries no inline color/background/border/type styles (all visuals live in the stylesheet)",
  !/color:|background:|border:|fontSize:|fontWeight:/.test(dockJsx)
);
check(
  "H5 the only hardcoded hex left in ForgeLayer is the canvas ground + the labeled fallback (4 sites, all outside the dock)",
  (() => {
    const hexes = [...layerCode.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
    return (
      hexes.length === 4 &&
      hexes.filter((h) => h === "#0b1020").length === 2 &&
      hexes.includes("#e8ecf4") &&
      hexes.includes("#9aa5b8")
    );
  })(),
  `hexes: ${[...layerCode.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]).join(", ")}`
);
check(
  "H5 no lime (#a3e635) in the dock's code — the second-accent decision is not settled here",
  !layerCode.includes("#a3e635") && !dockCode.includes("#a3e635")
);

// ---- H6 ChromeMount contract ----------------------------------------
check(
  "H6 ChromeMount enters on the token base step (280ms)",
  chromeMount.includes("CHROME_MOUNT_IN_MS = motion.base")
);
check(
  "H6 ChromeMount exits on the token fast step (240ms)",
  chromeMount.includes("CHROME_MOUNT_OUT_MS = motion.fast")
);
check(
  "H6 ChromeMount owns the exit lifetime (it unmounts only after the exit plays)",
  chromeMount.includes("if (finished) setRender(false)")
);

// ---- H7 parse ---------------------------------------------------------
for (const f of [
  "src/components/forge/ForgeLayer.tsx",
  "src/components/forge/forgeDockChrome.tsx",
]) {
  let ok = false;
  try {
    execFileSync(
      "node_modules/.bin/esbuild",
      [
        f,
        "--bundle",
        "--format=esm",
        "--outfile=/dev/null",
        "--external:67js",
        "--external:react-native",
        "--external:react",
      ],
      { stdio: "pipe" }
    );
    ok = true;
  } catch {
    ok = false;
  }
  check(`H7 ${f} bundles clean (esbuild parse)`, ok);
}

console.log(`\nforge-dock-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
