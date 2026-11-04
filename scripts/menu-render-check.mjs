// menu-render-check.mjs — Slice 66: the F menu must MOUNT.
//
// Why this check exists (the gap it closes): on Nov 4, 2026 the
// live production build showed "The menu hit a snag" on first
// paint, menu never opened. Root cause: Slice 59's host-fields
// effect in FabricMenu referenced `active?.id` in its dependency
// array — evaluated during render — while `const active` is not
// declared until ~360 lines later in the same body. A temporal-
// dead-zone ReferenceError on every render, caught by the menu's
// error boundary (Hotfix 2.3) before it could blank the app.
//
// Every existing check missed it, structurally: the menu battery
// is text pins + pure-module drives. esbuild transpiles without
// type-checking or evaluating component bodies, grep pins see
// that an identifier exists in the file (it did — declared later),
// and no check ever RENDERED the menu. This check renders it.
//
// What it does: bundles the real FabricMenu inside the real
// provider stack (the _layout nesting) and the real
// FabricErrorBoundary, using esbuild with react-native aliased to
// react-native-web (the app's own web target) and the native-only
// leaf modules stubbed (AsyncStorage, expo-*, three, tone), then
// server-renders it headlessly. It FAILS if the render throws, if
// the boundary's fallback text appears in the output, or if the
// bundle does not contain the menu at all (a silently empty graph
// must never read as a pass).
//
// Run: node scripts/menu-render-check.mjs   (from the repo root)
// Needs a full checkout (react / react-dom / react-native-web in
// node_modules). FABRIC_RENDER_CHECK_NODE_MODULES can point at an
// alternate node_modules for partial workbench trees.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NM = process.env.FABRIC_RENDER_CHECK_NODE_MODULES || path.join(root, "node_modules");
let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}

const TMP = "/tmp/menu-render-check";
execFileSync("mkdir", ["-p", TMP]);

/* ---------------- stubs (native leaves only) ---------------- */

writeFileSync(
  `${TMP}/stub-asyncstorage.mjs`,
  `const m = new Map();
export default {
  getItem: async (k) => (m.has(k) ? m.get(k) : null),
  setItem: async (k, v) => { m.set(k, String(v)); },
  removeItem: async (k) => { m.delete(k); },
  multiGet: async (ks) => ks.map((k) => [k, m.has(k) ? m.get(k) : null]),
  multiSet: async (pairs) => { for (const [k, v] of pairs) m.set(k, String(v)); },
  getAllKeys: async () => [...m.keys()],
  clear: async () => m.clear(),
};
`
);

writeFileSync(
  `${TMP}/stub-expo.mjs`,
  `const fn = () => undefined;
export default {};
export const setStringAsync = fn;
export const getStringAsync = async () => null;
export const hasStringAsync = async () => false;
export const vibrate = fn;
export const impactAsync = fn;
export const notificationAsync = fn;
export const selectionAsync = fn;
export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy" };
export const NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" };
export const createURL = () => "";
export const openURL = async () => false;
export const canOpenURL = async () => false;
export const addEventListener = () => ({ remove: () => {} });
export const parse = () => ({});
export const expoConfig = {};
export const ExecutionEnvironment = { StoreClient: "store", Standalone: "standalone" };
export const nativeApplicationVersion = "1.0.0";
export const nativeBuildVersion = "1";
export const applicationId = "com.fanalogy.fabric";
export const deviceName = "check";
export const sessionId = "check";
export const statusBarHeight = 0;
export const systemFonts = [];
`
);

writeFileSync(
  `${TMP}/stub-three.mjs`,
  `const cls = class { constructor(...a) {} };
const handler = { get: (_t, p) => (p === "__esModule" ? true : cls) };
export default new Proxy({}, handler);
export const WebGLRenderer = cls; export const Scene = cls; export const PerspectiveCamera = cls;
export const Color = cls; export const Vector2 = cls; export const Vector3 = cls; export const Vector4 = cls;
export const Matrix4 = cls; export const Quaternion = cls; export const Euler = cls; export const BufferGeometry = cls;
export const BufferAttribute = cls; export const Mesh = cls; export const Group = cls; export const Texture = cls;
export const CanvasTexture = cls; export const ShaderMaterial = cls; export const RawShaderMaterial = cls;
export const Points = cls; export const Line = cls; export const Clock = cls; export const Raycaster = cls;
export const AdditiveBlending = 2; export const NormalBlending = 1; export const DoubleSide = 2; export const FrontSide = 0;
export const BackSide = 1; export const SRGBColorSpace = "srgb"; export const LinearSRGBColorSpace = "srgb-linear";
export const REVISION = "160";
`
);

writeFileSync(
  `${TMP}/stub-tone.mjs`,
  `class AnyAudio {
  constructor(...a) {}
  connect() { return this; } disconnect() { return this; } toDestination() { return this; }
  start() { return this; } stop() { return this; }
  triggerAttackRelease() {} triggerAttack() {} triggerRelease() {} dispose() {} set() { return this; }
}
export class FMSynth extends AnyAudio {}
export class PolySynth extends AnyAudio { constructor(...a) { super(); this.maxPolyphony = 0; } }
export class NoiseSynth extends AnyAudio {}
export class Synth extends AnyAudio {}
export class Reverb extends AnyAudio { constructor(...a) { super(); this.ready = Promise.resolve(); } }
export class Sequence extends AnyAudio {}
export const Destination = new AnyAudio();
export const Transport = { start: () => {}, stop: () => {}, scheduleRepeat: () => 0, cancel: () => {}, bpm: { value: 120 }, state: "stopped" };
export const Frequency = (n) => ({ toNote: () => "C4", toFrequency: () => 440 });
export const getContext = () => ({ state: "running", resume: async () => {}, lookAhead: 0 });
export const getDestination = () => Destination;
export const now = () => 0;
export const start = async () => {};
export const loaded = async () => {};
export default { FMSynth, PolySynth, NoiseSynth, Synth, Reverb, Sequence, Destination, Transport, Frequency, getContext, getDestination, now, start, loaded };
`
);

writeFileSync(
  `${TMP}/globals.mjs`,
  `const store = new Map();
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
if (typeof globalThis.localStorage === "undefined") globalThis.localStorage = ls;
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.addEventListener === "undefined") { globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; }
if (typeof globalThis.dispatchEvent === "undefined") globalThis.dispatchEvent = () => true;
if (typeof globalThis.CustomEvent === "undefined") { globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }; }
if (typeof globalThis.matchMedia === "undefined") { globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }); }
if (typeof globalThis.location === "undefined") { globalThis.location = { href: "http://localhost/?enter=1", search: "?enter=1", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/", reload: () => {} }; }
if (typeof globalThis.history === "undefined") globalThis.history = { replaceState: () => {}, pushState: () => {} };
if (typeof globalThis.requestAnimationFrame === "undefined") globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
if (typeof globalThis.cancelAnimationFrame === "undefined") globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
`
);

/* ---------------- entry: the real stack, the real menu ---------------- */

const R = (p) => JSON.stringify(path.join(root, p));
writeFileSync(
  `${TMP}/entry.tsx`,
  `import React from "react";
import { renderToString } from "react-dom/server";
import { ToastProvider } from ${R("app/components/Toast")};
import { PreferencesProvider } from ${R("app/context/PreferencesContext")};
import { LayersProvider } from ${R("app/context/LayersContext")};
import { ARProvider } from ${R("app/context/ARContext")};
import { ExperienceProvider } from ${R("app/context/ExperienceContext")};
import { OverlayProvider } from ${R("app/context/OverlayContext")};
import { UserDrawerProvider } from ${R("app/components/UserDrawer")};
import { LockerProvider } from ${R("app/components/Locker")};
import { NewDrawersProvider } from ${R("app/components/neo/NewDrawersContext")};
import { FabricChromeProvider } from ${R("app/components/fabric/FabricChromeContext")};
import FabricErrorBoundary from ${R("app/components/fabric/FabricErrorBoundary")};
import FabricMenu from ${R("app/components/fabric/FabricMenu")};
try {
  const html = renderToString(
    <ToastProvider><PreferencesProvider><LayersProvider><ARProvider><ExperienceProvider>
    <OverlayProvider><UserDrawerProvider><LockerProvider><NewDrawersProvider><FabricChromeProvider>
      <FabricErrorBoundary label="menu" variant="menu" resetKey={false}>
        <FabricMenu />
      </FabricErrorBoundary>
    </FabricChromeProvider></NewDrawersProvider></LockerProvider></UserDrawerProvider>
    </OverlayProvider></ExperienceProvider></ARProvider></LayersProvider></PreferencesProvider></ToastProvider>
  );
  console.log(html.includes("The menu hit a snag") ? "MENU_RENDER:BOUNDARY" : "MENU_RENDER:CLEAN");
} catch (e) {
  console.log("MENU_RENDER:THREW");
  console.error(e && e.stack ? e.stack.split("\\n").slice(0, 5).join("\\n") : String(e));
}
`
);

writeFileSync(
  `${TMP}/build.mjs`,
  `import { build } from ${JSON.stringify(path.join(NM, "esbuild", "lib", "main.js"))};
await build({
  entryPoints: [${JSON.stringify(`${TMP}/entry.tsx`)}],
  bundle: true,
  outfile: ${JSON.stringify(`${TMP}/bundle.cjs`)},
  format: "cjs",
  platform: "node",
  jsx: "automatic",
  logLevel: "error",
  nodePaths: [${JSON.stringify(NM)}],
  alias: {
    "react": ${JSON.stringify(path.join(NM, "react"))},
    "react-dom": ${JSON.stringify(path.join(NM, "react-dom"))},
    "react-native": "react-native-web",
    "expo-clipboard": ${JSON.stringify(`${TMP}/stub-expo.mjs`)},
    "expo-haptics": ${JSON.stringify(`${TMP}/stub-expo.mjs`)},
    "expo-constants": ${JSON.stringify(`${TMP}/stub-expo.mjs`)},
    "expo-linking": ${JSON.stringify(`${TMP}/stub-expo.mjs`)},
    "@react-native-async-storage/async-storage": ${JSON.stringify(`${TMP}/stub-asyncstorage.mjs`)},
    "three": ${JSON.stringify(`${TMP}/stub-three.mjs`)},
    "tone": ${JSON.stringify(`${TMP}/stub-tone.mjs`)},
  },
  inject: [${JSON.stringify(`${TMP}/globals.mjs`)}],
});
console.log("bundled");
`
);

/* ---------------- run ---------------- */

const esbuildBin = path.join(NM, ".bin", "esbuild");
check("toolchain present (esbuild + react in node_modules)", existsSync(esbuildBin) && existsSync(path.join(NM, "react")), NM);

let bundled = false;
try {
  execFileSync("node", [`${TMP}/build.mjs`], { stdio: "pipe" });
  bundled = existsSync(`${TMP}/bundle.cjs`);
} catch {
  bundled = false;
}
check("menu graph bundles (esbuild, react-native-web target)", bundled);

if (bundled) {
  const bundleSrc = readFileSync(`${TMP}/bundle.cjs`, "utf8");
  check(
    "bundle actually contains FabricMenu (not an empty graph)",
    bundleSrc.includes("Voice input") && bundleSrc.includes("SETTINGS"),
    `${(bundleSrc.length / 1024).toFixed(0)} KiB`
  );
  let out = "";
  try {
    out = execFileSync("node", [`${TMP}/bundle.cjs`], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "");
  }
  check("FabricMenu renders without throwing", !out.includes("MENU_RENDER:THREW"), out.trim().split("\n")[0] || "");
  check("error boundary did NOT trip (no 'menu hit a snag')", out.includes("MENU_RENDER:CLEAN"));
}

console.log(`\nmenu-render-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
