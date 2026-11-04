/**
 * menu-organization-check — structural check for Cleanup 1
 * ("F-menu organization, doctrine pass").
 *
 * Proves, headlessly:
 *  (a) every settings storage key referenced by the menu and the
 *      components it renders BEFORE the pass is still referenced
 *      after it (inventory extracted from main @ 9d9378d6);
 *  (b) the seven section headers render in the doctrine order
 *      FABRICS · PEOPLE · YOU · THIS LAYER · STUDIO · AI SERVICES ·
 *      SETTINGS & HELP, the old headers (SHARE — SESSION,
 *      STUDIO — CREATE, LINT — OBJECTS, UNIVERSAL, OPEN) are gone,
 *      and the convergence components are wired: BoolPillRow x5
 *      with the original setters, DoorRow in both door lists, one
 *      cardStyle definition backing every bordered card;
 *  (c) the state the moved render paths read survives legacy
 *      shapes: the fabric store's sanitizers/validators take
 *      null/garbled/partial records without throwing, and the
 *      session/fabric/ghost public-state defaults expose every
 *      field the menu reads (the Hotfix 2.3 state-shape exercise,
 *      at the store level the menu actually consumes).
 *
 * Run from the repo root:
 *   node scripts/menu-organization-check.mjs
 * (uses the esbuild package resolvable from this machine's tools;
 * override with ESBUILD_PATH=/path/to/esbuild/lib/main.js)
 *
 * Slice 57 note: this check's Cleanup-1 pin "Panels sub-header
 * inside SETTINGS & HELP" encoded the catch-all Slice 57 exists
 * to dissolve; that one pin is inverted below (absence + the
 * Preferences-door-only tail). Everything else — keys, section
 * order, convergence wiring, state shapes — is unchanged law.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};

const menu = readFileSync("app/components/fabric/FabricMenu.tsx", "utf8");

// ------------------------------------------------------------ (a) keys
// The pre-pass inventory: every versioned storage key referenced
// anywhere in the menu's render closure on main @ 9d9378d6.
// (fabric_diagnostics_v1 is deliberately NOT in this list: it is
// the canvas's own diag gate, read by LegacyFluid — never by the
// menu or anything the menu renders.)
const EXPECTED_KEYS = [
  "fabric_ai_config_v1",
  "fabric_compositions_v1",
  "fabric_experience_state_v1",
  "fabric_ghost_brain_v1",
  "fabric_ghost_personality_v1",
  "fabric_ghost_shared_v1",
  "fabric_ghost_v1",
  "fabric_host_rules_v1",
  "fabric_identity_v1",
  "fabric_layer_settings_v1",
  "fabric_prefs_v1",
];
// Walk the menu's real import closure (relative imports only,
// resolved the way the bundler resolves them) and grep the union.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join as pjoin, normalize } from "node:path";
const CODE_EXT = [".tsx", ".ts", ".jsx", ".js"];
const IMPORT_RE = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;
const resolveLocal = (spec, idir) => {
  const base = normalize(pjoin(idir, spec));
  const cands = base.endsWith(".json")
    ? [base]
    : [...CODE_EXT.map((e) => base + e), ...CODE_EXT.map((e) => pjoin(base, "index" + e))];
  return cands.find((c) => existsSync(c)) ?? null;
};
const seenFiles = new Set();
const queue = ["app/components/fabric/FabricMenu.tsx"];
while (queue.length) {
  const f = queue.pop();
  if (seenFiles.has(f)) continue;
  seenFiles.add(f);
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue; // unresolved leaves are the bundle check's problem, not the key audit's
  }
  for (const m of text.matchAll(IMPORT_RE)) {
    if (!m[1].startsWith(".")) continue;
    const r = resolveLocal(m[1], dirname(f));
    if (r) queue.push(r);
  }
}
let closureText = "";
for (const f of seenFiles) {
  try {
    closureText += readFileSync(f, "utf8") + "\n";
  } catch {}
}
for (const key of EXPECTED_KEYS) {
  ok(closureText.includes(key), `storage key still referenced: ${key}`);
}
// The per-layer key builder itself (the key is constructed, not literal).
ok(menu.includes("layerSettingsKey"), "menu still builds per-layer keys via layerSettingsKey");
ok(menu.includes("FABRIC_HOST_RULES_KEY"), "menu still reads host rules via FABRIC_HOST_RULES_KEY");

// ------------------------------------------------------------ (b) structure
const headerRe = /<SectionHeader>(?:\{`)?([A-Z][A-Z &—-]*)|THIS LAYER/g;
const headers = [];
let m;
const headerSrc = [...menu.matchAll(/<SectionHeader>(.*?)<\/SectionHeader>/gs)].map((x) =>
  x[1].replace(/\{|`|\$\{.*$/g, "").trim()
);
for (const h of headerSrc) headers.push(h.startsWith("THIS LAYER") ? "THIS LAYER" : h);
ok(
  JSON.stringify(headers) ===
    JSON.stringify(["FABRICS", "PEOPLE", "YOU", "THIS LAYER", "STUDIO", "AI SERVICES", "SETTINGS & HELP"]),
  `seven sections in doctrine order (got: ${headers.join(" · ")})`
);
for (const old of ["SHARE — SESSION", "STUDIO — CREATE", "LINT — OBJECTS", "<SectionHeader>UNIVERSAL</SectionHeader>", "<SectionHeader>OPEN</SectionHeader>"]) {
  ok(!menu.includes(old), `old header gone: ${old}`);
}
// Sub-headers sit inside their sections.
const lintAt = menu.indexOf("<SubHeader>Lint — objects</SubHeader>");
const studioAt = menu.indexOf("<SectionHeader>STUDIO</SectionHeader>");
const aiAt = menu.indexOf("<SectionHeader>AI SERVICES</SectionHeader>");
ok(studioAt > -1 && lintAt > studioAt && lintAt < aiAt, "Lint sub-header inside STUDIO");
const panelsAt = menu.indexOf("<SubHeader>Panels</SubHeader>");
const settingsAt = menu.indexOf("<SectionHeader>SETTINGS & HELP</SectionHeader>");
// Slice 57 supersedes Cleanup 1's "Panels sub-header inside
// SETTINGS & HELP" pin: the catch-all is dissolved, so the pin
// inverts — no Panels sub-header anywhere, and SETTINGS & HELP
// keeps exactly one door, the Preferences panel. The doors'
// homes are pinned by scripts/menu-check.mjs.
ok(settingsAt > -1 && panelsAt === -1, "Slice 57: Panels catch-all sub-header is gone");
const settingsBlock = menu.slice(settingsAt);
ok(
  (settingsBlock.match(/<DoorRow/g) ?? []).length === 1 &&
    settingsBlock.includes('openPanel("settings")'),
  "Slice 57: SETTINGS & HELP holds only the Preferences door"
);
// PEOPLE carries the roster + the guest-rules card; YOU carries identity + Ghostie door.
const peopleAt = menu.indexOf("<SectionHeader>PEOPLE</SectionHeader>");
const youAt = menu.indexOf("<SectionHeader>YOU</SectionHeader>");
const peopleBlock = menu.slice(peopleAt, youAt);
ok(peopleBlock.includes("Who's Who"), "roster lives in PEOPLE");
ok(peopleBlock.includes("Guest rules on"), "guest rules summary lives in PEOPLE");
ok(peopleBlock.includes("renderModeRows"), "session mode rows live in PEOPLE");
const youBlock = menu.slice(youAt, menu.indexOf("THIS LAYER", youAt));
ok(youBlock.includes("<LifePacketCard />"), "LifePacketCard lives in YOU");
ok(youBlock.includes("Open Your Ghostie"), "Ghostie door lives in YOU");
ok(youBlock.includes("First Breath — revisit your colors"), "First Breath replay lives in YOU");
// Convergence wiring.
ok((menu.match(/const cardStyle = \{/g) ?? []).length === 1, "exactly one cardStyle definition");
ok((menu.match(/\.\.\.cardStyle/g) ?? []).length >= 10, `cardStyle backs the bordered cards (${(menu.match(/\.\.\.cardStyle/g) ?? []).length} spreads)`);
const pillPairs = [
  ["ghostInLayer", "setGhostInLayer"],
  ["ambientInLayer", "setAmbientInLayer"],
  ["stageDancer", "setStageDancer"],
  ["stageDrift", "setStageDrift"],
  ["motionInLayer", "setMotionInLayer"],
];
for (const [value, setter] of pillPairs) {
  ok(
    menu.includes(`value={${value}}`) && menu.includes(`onPick={${setter}}`),
    `BoolPillRow wired: ${value} / ${setter}`
  );
}
ok((menu.match(/<DoorRow/g) ?? []).length >= 3, "DoorRow renders the door lists (per-section lists + preferences)");
// Hotfix 2.3 invariants inside this file: the 16px input floor.
ok(menu.includes("fontSize: 16"), "16px input floor preserved (Hotfix 2.3)");

// ------------------------------------------------------------ (c) state shapes
const esbuildPath =
  process.env.ESBUILD_PATH ?? "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js";
const { build } = await import(esbuildPath);
const stubPlugin = {
  name: "check-stubs",
  setup(b) {
    b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({
      path: "async-storage",
      namespace: "stub",
    }));
    b.onResolve({ filter: /^[^./]/ }, (args) => ({ path: args.path, external: true }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `
        const mem = new Map();
        export default {
          getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
          setItem: async (k, v) => { mem.set(k, v); },
          removeItem: async (k) => { mem.delete(k); },
        };`,
      loader: "js",
    }));
  },
};
const entry = join(mkdtempSync(join(tmpdir(), "menu-check-")), "entry.ts");
writeFileSync(
  entry,
  `
  export { sanitizeHostRulesMap, sanitizeFabricRules, validateFabricChange, fabricGate,
           getSessionFabricState, DEFAULT_FABRIC_RULES } from ${JSON.stringify(
             process.cwd() + "/src/session/fabricStore"
           )};
  export { getSessionPublicState, SESSION_MODES } from ${JSON.stringify(
    process.cwd() + "/src/session/sessionStore"
  )};
  export { displayNameFor, hueCss } from ${JSON.stringify(process.cwd() + "/src/identity/identityStore")};
  export { getGhostPublicState } from ${JSON.stringify(process.cwd() + "/src/ghost/ghostStore")};
  `
);
const out = join(tmpdir(), `menu-check-bundle-${Date.now()}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  outfile: out,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
  plugins: [stubPlugin],
});
const S = await import(out);

// Legacy / garbled persisted shapes must sanitize, never throw.
for (const [label, input] of [
  ["null", null],
  ["string", "junk"],
  ["array", []],
  ["empty object", {}],
  ["partial rules", { "ar-piano": { draw: false } }],
  ["wrong types", { "default-fluid": { draw: "yes", verbs: 1, notes: null } }],
  ["unknown layer + keys", { "some-future-layer": { draw: true, teleport: true } }],
]) {
  let map;
  let threw = false;
  try {
    map = S.sanitizeHostRulesMap(input);
  } catch {
    threw = true;
  }
  ok(!threw && typeof map === "object" && map !== null, `sanitizeHostRulesMap survives: ${label}`);
}
const partial = S.sanitizeHostRulesMap({ "ar-piano": { draw: false } });
ok(
  partial["ar-piano"].draw === false && partial["ar-piano"].verbs === true && partial["ar-piano"].notes === true,
  "sanitizeHostRulesMap fills missing rules from defaults"
);
for (const [label, input] of [["undefined", undefined], ["null", null], ["junk", 42], ["partial", { notes: false }]]) {
  let rules;
  let threw = false;
  try {
    rules = S.sanitizeFabricRules(input);
  } catch {
    threw = true;
  }
  ok(
    !threw && typeof rules?.draw === "boolean" && typeof rules?.verbs === "boolean" && typeof rules?.notes === "boolean",
    `sanitizeFabricRules survives: ${label}`
  );
}
for (const [label, input] of [
  ["null", null],
  ["empty", {}],
  ["wrong types", { layerId: 42, rules: "all" }],
  ["unknown layer", { layerId: "nope", byName: "x", rules: { draw: true, verbs: true, notes: true } }],
  ["oversized id", { layerId: "x".repeat(500), rules: {} }],
]) {
  let threw = false;
  let res;
  try {
    res = S.validateFabricChange(input, new Set(["default-fluid", "ar-piano", "dancer-stage", "sam-see", "camera-effects"]));
  } catch {
    threw = true;
  }
  ok(!threw && res === null, `validateFabricChange rejects cleanly: ${label}`);
}
// Public-state defaults expose every field the moved render paths read.
const sf = S.getSessionFabricState();
ok(
  "layerId" in sf && "rules" in sf && typeof sf.rules.draw === "boolean",
  "session fabric default has layerId + rules (PEOPLE guest card reads them)"
);
const ss = S.getSessionPublicState();
ok(
  typeof ss.role === "string" && Array.isArray(ss.guestIds) && "hostId" in ss && "mode" in ss && "driverId" in ss,
  "session default has role/guestIds/hostId/mode/driverId (PEOPLE reads them)"
);
const gs = S.getGhostPublicState();
ok(gs !== null && typeof gs === "object", "ghost public state default is an object (YOU door reads it)");
// Identity fallbacks the roster depends on: unknown peers get a name, hues render.
ok(typeof S.displayNameFor("peer-unknown-123", "self-1") === "string", "displayNameFor falls back for unknown peers");
ok(typeof S.hueCss(200) === "string" && S.hueCss(200).length > 0, "hueCss renders a color");
// The gate the PEOPLE rules describe still decides the same way.
ok(
  S.fabricGate({ modeCanSend: true, role: "guest", rules: S.DEFAULT_FABRIC_RULES, kind: "draw" }) === true &&
    S.fabricGate({ modeCanSend: false, role: "guest", rules: S.DEFAULT_FABRIC_RULES, kind: "draw" }) === false &&
    S.fabricGate({ modeCanSend: true, role: "guest", rules: { draw: false, verbs: true, notes: true }, kind: "draw" }) === false &&
    S.fabricGate({ modeCanSend: true, role: "host", rules: { draw: false, verbs: true, notes: true }, kind: "draw" }) === true,
  "fabricGate: mode first, host unbound, guest bound by rules (semantics untouched)"
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
