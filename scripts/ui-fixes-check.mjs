// ui-fixes-check.mjs — Slice 37 headless proof.
//
// Terrell's Nov 1 device report, from the LIVE build (main
// 5827ea7e): (1) open panels are an overlapping mess — cards
// bleed through each other, sheets overflow the phone, the
// Boop name tag sits behind the Essence card; (2) a dead
// bottom-center text field steals the scene's focus and
// answers neither typing nor voice; (3) the marshmallow
// mannequin is on stage instead of his Trauma character —
// the built-in bound only after a settings pick, and a failed
// bind was silent; (4) the stage canvas ends ~60% down the
// screen over white page. This check pins the mechanism of
// each fix, and PROVES the character asset end-to-end: the
// GLBs are reassembled from the repo's own .b64 parts using
// the app module's own decoder, SHA-256-compared against the
// hashes recorded in public/animations/README.md, and their
// skeletons are matched against the binder's own Mixamo map.
//
// AMENDMENT (Nov 1, Terrell's correction): for item (1) the
// first account was wrong — in his screenshot NO menu was open.
// The mess at the screen's edge was the CLOSED drawers: always
// mounted, always rendered, their children always touchable,
// parked only by an Animated value resting at exactly -width —
// on web a JS-driven value, animated with no completion snap,
// so any close that never ran to its end left a live panel
// hiding at the edge. Section F pins the closed state itself:
// each drawer's closed rect computed from its own style values
// at a 390pt viewport, plus the park machinery (snap + render
// cut + touch cut) that now makes closed mean closed.
//
// CORRECTIONS (Slice 38, Nov 2 — read Terrell's two messages
// together): for item (3), the DEFAULT was right and stays —
// on the stage Trauma is the figure ("There is never a bare
// figure... I uploaded it. It's trauma."); what his first
// message killed was the AMBUSH LANDING (the persisted
// experience reopening on the stage uninvited), fixed in
// ExperienceContext and pinned by trauma-choice-check §D.
// Amendment (same morning): while a character loads, NO
// figure stands — the bare figure was doubling as the loading
// placeholder; the stage now shows "Loading your character…"
// (pinned by trauma-choice-check §E).
//
// Run: node scripts/ui-fixes-check.mjs   (from the repo root)

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

// ----------------------------------------------------------------
// A. Panel sanity: opaque surfaces, capped widths, one scroll,
//    correct stacking.
// ----------------------------------------------------------------

const plugins = read("app/components/neo/PluginsDrawer.tsx");
check("A1 PluginsDrawer sheet is opaque", plugins.includes('backgroundColor: "#060a16"'));
check("A2 PluginsDrawer cards are opaque", plugins.includes('backgroundColor: "#020817"') && !plugins.includes("rgba(2,8,23,0.5)"));
check("A3 PluginsDrawer keeps no translucent sheet", !plugins.includes("rgba(6,10,22,0.96)"));

const aiSettings = read("app/components/neo/AISettingsDrawer.tsx");
check("A4 AISettings sheet is opaque", aiSettings.includes('backgroundColor: "#0a0e1c"'));
check("A5 AISettings cards are opaque", aiSettings.includes('backgroundColor: "#0f172a"') && !aiSettings.includes("rgba(15,23,42,0.7)"));

const layer = read("app/components/neo/LayerDrawer.tsx");
check("A6 LayerDrawer sheet + preview card are opaque", layer.includes('backgroundColor: "#060a16"') && layer.includes('backgroundColor: "#020817"'));
check("A7 LayerDrawer stacks with the drawer family (zIndex 200, not 84)", layer.includes("zIndex: 200") && !layer.includes("zIndex: 84"));

const companion = read("app/components/neo/CompanionDrawer.tsx");
check("A8 Companion sheet + cards are opaque", companion.includes('backgroundColor: "#060a16"') && companion.includes('backgroundColor: "#020817"') && !companion.includes("rgba(2,8,23,0.5)"));

const drawers = read("app/components/neo/NewDrawersContext.tsx");
check("A9 drawer widths are capped at the window width", drawers.includes('Dimensions.get("window")') && drawers.includes("Math.min(WIDTHS[n], cap)"));
check("A10 the slide animation travels the capped width", drawers.includes("widthsRef.current[name]") && drawers.includes("widthsRef.current[prev]"));

const menu = read("app/components/fabric/FabricMenu.tsx");
check("A11 menu sheet height cap is a window-derived number, not a % string", !menu.includes('maxHeight: "78%"') && menu.includes('Dimensions.get("window").height * 0.78') && menu.includes("maxHeight: menuMaxHeight"));
check("A12 menu keeps exactly ONE vertical content scroll (+ the horizontal gallery rail)", (menu.match(/<ScrollView/g) ?? []).length === 2);
check("A13 menu sheet surface is the opaque theme sheet", menu.includes("backgroundColor: colors.sheet"));

// ----------------------------------------------------------------
// B. The dead field: off the canvas, voice-first where a
//    consumer exists, typing real inside the Companion panel.
// ----------------------------------------------------------------

const composeBar = read("src/components/sensory/ComposeBar.tsx");
check("B1 ComposeBar renders no TextInput at all", !composeBar.includes("TextInput"));
check("B2 ComposeBar keeps the voice ask path (Slice 33 scored detail)", composeBar.includes('via: "voice"') && composeBar.includes("confidence"));
check("B3 ComposeBar says where typing went", composeBar.includes("typing lives in the Companion panel"));

const hud = read("app/components/ExperienceHUD.tsx");
check("B4 the HUD does not mount the ask bar on the Dancer Stage (no consumer there)", hud.includes("isDancerStage ? null : <ComposeBar />"));
check("B5 the stage's key strip remains its playable surface", hud.includes("STAGE KEYS"));

check("B6 Companion typing dispatches the real compose event", companion.includes("FABRIC_COMPOSE_EVENT") && companion.includes("new CustomEvent(FABRIC_COMPOSE_EVENT"));
check("B7 the simulated reply is gone", !companion.includes("demo response") && !companion.includes("Simulate AI response"));

// ----------------------------------------------------------------
// C. His guy, on stage by default — resolution logic + the
//    asset itself, proven from the repo's own parts.
//    Slice history, so the pins make sense: Slice 37's C1–C5
//    asserted unset->Trauma default. Slice 38's first version
//    removed them under a choice-only reading of Terrell's
//    first Nov 2 message; his second message the same morning
//    ("There is never a bare figure... I uploaded it. It's
//    trauma.") restored the default — his first message was
//    about the LANDING (the fluid), not the stage's figure.
//    C1–C5 stand again below with the final semantics;
//    scripts/trauma-choice-check.mjs pins the same rule plus
//    the landing and the loading-no-figure contract.
// ----------------------------------------------------------------

const trauma = await bundle("src/dancer/traumaCharacter.ts", "/tmp/ui37-trauma.mjs");
const { resolveBuiltinBind, TRAUMA_IDLE_NONE, decodeBase64ToArrayBuffer } = trauma;

check("C1 unset pick resolves to the Trauma MMA default", resolveBuiltinBind(undefined)?.id === "mma" && resolveBuiltinBind(undefined)?.url === "/animations/trauma-mma-idle.glb");
check("C2 null pick also resolves to the default", resolveBuiltinBind(null)?.id === "mma");
check("C3 an explicit bouncing pick still wins", resolveBuiltinBind("bouncing")?.id === "bouncing");
check("C4 explicit 'none' yields the bare figure (null)", TRAUMA_IDLE_NONE === "none" && resolveBuiltinBind("none") === null);
check("C5 an unknown stored value falls back to the default, never to nothing", resolveBuiltinBind("garbage")?.id === "mma");

const stage = read("src/dancer/DancerStage.tsx");
check("C6 the stage binds through resolveBuiltinBind", stage.includes("resolveBuiltinBind(traumaIdleSetting)"));
check("C7 the old unset gate is gone", !stage.includes("if (!traumaIdleSetting) return;"));
check("C8 a failed bind shows on stage", stage.includes("Character didn\u2019t load \u2014 showing the fallback figure") && stage.includes('charState.status === "failed"'));

check("C9 Restore mannequin stores the explicit none pick", menu.includes("stageTraumaIdle: TRAUMA_IDLE_NONE"));

// Reassemble both GLBs from the repo's parts with the app's own
// decoder; hash-compare against the README's recorded originals.
const readme = read("public/animations/README.md");
// The README records the originals' hashes in a labeled list
// ("- MMA idle: `<hash>`" / "- Bouncing fight: `<hash>`") —
// extract by label, tied to the catalog id.
function recordedHash(id) {
  const label = id === "mma" ? "MMA idle" : "Bouncing fight";
  const m = readme.match(new RegExp(`${label}:\\s*\`([0-9a-f]{64})\``));
  return m ? m[1] : null;
}
const bones = await bundle("src/dancer/mixamoBones.ts", "/tmp/ui37-bones.mjs");

for (const def of trauma.TRAUMA_IDLES) {
  const file = def.url.split("/").pop();
  // Join the part TEXTS first, then decode once — exactly the
  // app's transport (fetchBase64Transport joins, then
  // decodeBase64ToArrayBuffer decodes). The parts are byte
  // slices of one base64 stream; decoding them separately
  // corrupts the seams and is NOT what the app does.
  const joined = Array.from({ length: 8 }, (_, i) =>
    read(`public/animations/${file}.b64.0${i}`)
  ).join("");
  const glb = Buffer.from(decodeBase64ToArrayBuffer(joined));
  const sha = createHash("sha256").update(glb).digest("hex");
  check(`C10 ${file} reassembles byte-exact (SHA-256)`, sha === recordedHash(def.id), sha.slice(0, 12) + "…");
  check(`C11 ${file} carries the glTF magic`, glb.subarray(0, 4).toString("ascii") === "glTF");
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
  const names = new Set((json.nodes ?? []).map((n) => bones.normalizeMixamoBoneName(n.name ?? "")));
  const missing = Object.keys(bones.MIXAMO_TO_UE5_BONE).filter((k) => !names.has(k));
  check(`C12 ${file} skeleton covers the binder's whole Mixamo map`, missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${Object.keys(bones.MIXAMO_TO_UE5_BONE).length} bones`);
}

// ----------------------------------------------------------------
// D. Full-bleed stage.
// ----------------------------------------------------------------

check("D1 the stage root is pinned to the dynamic viewport height", stage.includes('height: "100dvh"'));
check("D2 the app background sits behind the canvas", stage.includes('backgroundColor: "#070a12"'));
check("D3 the canvas stays opaque (no page color through it)", stage.includes("alpha: false"));

// ----------------------------------------------------------------
// E. Boop's tag yields to the Essence card.
// ----------------------------------------------------------------

// RigLabel imports react / three / fiber, which this headless
// tree doesn't install — alias them to inert stubs. The function
// under test is pure math from the real source file; nothing at
// module top level touches the stubs.
const { writeFileSync } = await import("node:fs");
writeFileSync("/tmp/ui37-stub-react.mjs", "export default {};\nexport const useEffect = () => {};\nexport const useMemo = () => undefined;\n");
writeFileSync("/tmp/ui37-stub-fiber.mjs", "export const useFrame = () => {};\n");
writeFileSync("/tmp/ui37-stub-three.mjs", "export class Vector3 { constructor() { this.x = 0; this.y = 0; this.z = 0; } }\n");
const rig = await bundle("src/dancer/RigLabel.tsx", "/tmp/ui37-riglabel.mjs", [
  "--alias:react=/tmp/ui37-stub-react.mjs",
  "--alias:@react-three/fiber=/tmp/ui37-stub-fiber.mjs",
  "--alias:three=/tmp/ui37-stub-three.mjs",
]);
const op = rig.labelOpacityForNdc;
check("E1 tag is fully visible at screen center", op(0, 0) === 1);
check("E2 tag is fully visible bottom-left", op(-1, -1) === 1);
check("E3 tag never fades along the bottom (Essence is top-right)", op(1, -1) === 1 && op(1, 0) === 1);
check("E4 tag yields inside the Essence corner", Math.abs(op(1, 1) - 0.12) < 1e-9);
check("E5 the yield ramps (no pop): mid-corner is between", op(0.16, 0.6) > 0.3 && op(0.16, 0.6) < 0.8);

// ----------------------------------------------------------------
// F. The closed state is a state (amendment): closed rect math
//    per drawer at a 390pt viewport + the park machinery.
// ----------------------------------------------------------------

const VIEW_W = 390;
const widthsBlock = drawers.match(/const WIDTHS[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? "";
const WIDTHS_PARSED = {};
for (const m of widthsBlock.matchAll(/"?([\w-]+)"?:\s*(\d+)/g)) {
  WIDTHS_PARSED[m[1]] = Number(m[2]);
}
const DRAWER_FILES = {
  profile: "ProfileDrawer",
  neo: "NeoLocker",
  layer: "LayerDrawer",
  studio: "StudioDrawer",
  plugins: "PluginsDrawer",
  companion: "CompanionDrawer",
  shop: "ShopDrawer",
  call: "CallDrawer",
  wallet: "WalletDrawer",
  friends: "FriendsDrawer",
  settings: "SettingsDrawer",
  "ai-settings": "AISettingsDrawer",
  "ai-chat": "AIChatDrawer",
  "vision-ai": "VisionAIDrawer",
};
check("F0 the WIDTHS table parses to all 14 drawers", Object.keys(WIDTHS_PARSED).length === 14, `${Object.keys(WIDTHS_PARSED).length} entries`);

for (const [name, file] of Object.entries(DRAWER_FILES)) {
  const src = read(`app/components/neo/${file}.tsx`);
  // The drawer's own style values: root at left 0, width = the
  // context's capped width, closed tx = -width. Compute the
  // closed rect from those values and intersect with the viewport.
  const W = Math.min(WIDTHS_PARSED[name], VIEW_W);
  const closedLeft = -W; // left: 0 + translateX(-W)
  const closedRight = closedLeft + W;
  const inter = Math.max(0, Math.min(closedRight, VIEW_W) - Math.max(closedLeft, 0));
  check(
    `F1 ${name} closed rect [${closedLeft}, ${closedRight}] ∩ [0, ${VIEW_W}] = 0px`,
    inter === 0 && src.includes(`getAnim("${name}")`) && src.includes("translateX: tx"),
    `W=${W}`
  );
  check(
    `F3 ${file} cuts render + touches when parked`,
    src.includes(`parked } = getAnim("${name}")`) &&
      src.includes('display: parked ? "none" : "flex"') &&
      src.includes('pointerEvents={parked ? "none" : "box-none"}') &&
      !src.includes('pointerEvents="box-none"')
  );
}

check("F2a park state exists and every drawer starts parked", drawers.includes("const [parkedMap, setParkedMap]") && drawers.includes("parkDrawer") && drawers.includes("intentRef") && drawers.includes("parkTimerRef"));
check("F2b a finished close snaps tx to exactly -width before parking", drawers.includes("panelsRef.current[name].tx.setValue(-panelsRef.current[name].width)") && drawers.includes(".start(({ finished }) =>"));
check("F2c a starved/superseded close still parks (safety timer, intent-guarded)", drawers.includes("parkTimerRef.current[name] = window.setTimeout(") && drawers.includes('intentRef.current[name] === "closed"'));
check("F2d opening un-parks before the slide starts", drawers.includes("{ ...m, [name]: false }"));
check("F2e getAnim hands the parked flag to the drawers", drawers.includes("parked: parkedMap[name]"));
check("F4 the FabricMenu sheet renders nothing when closed", menu.includes("if (!menuOpen) return null;"));
check("F5 drawers are born parked AND born off-canvas (tx starts at -width)", drawers.includes("new Animated.Value(-widthsRef.current[n])"));

console.log(`\nui-fixes-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
