// haptics-toast-check.mjs — Slice 61 headless proof.
//
// Terrell's spec, Nov 3, 2026 (~10:52 PM ET): "if the ghostie
// tries to use haptics and it's toggled off in settings a
// toast should come momentarily to allow me to enable it."
//
// §A drives the ONE gate (src/sensory/vibration) and pins the
// notice discipline:
// - a suppression BY THE SWITCH (platform able to vibrate)
//   raises the notice exactly once; repeats while it is up
//   stay silent;
// - settling (enable or dismiss) silences the session;
// - a fresh session (module reset) arms again;
// - the switch coming back on by ANY path settles an
//   outstanding notice — and once on, the gate passes through
//   and no notice can ever fire;
// - PLATFORM ABSENCE raises nothing, toggle on or off: a
//   device that simply can't vibrate has nothing to enable.
// §B drives the toast queue: an actionable item's fields ride
// the FIFO intact; message-only items are untouched.
// §C pins the wiring: the bridge turns the notice into the
// toast through the existing useToast path with Terrell's
// Enable, flips the ONE preference through the same setter
// Settings uses, never touches the store or the gate's mirror
// itself; _layout mounts it inside both providers; the toast
// renderer keeps its chrome pins (one slot, one Animated.View,
// the action its only touch target).
// §D pins that both Settings surfaces read that same store —
// so an Enable tap is reflected in Settings immediately.
//
// Run: node scripts/haptics-toast-check.mjs   (from the repo root)

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

async function bundle(rel, out, extra = []) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`, ...extra],
    { cwd: root, stdio: "pipe" }
  );
  return import(out);
}

// AsyncStorage shim (the gate's lazy preference read rides it).
writeFileSync(
  "/tmp/s61-stub-asyncstorage.mjs",
  "const m = new Map();\nglobalThis.__s61store = m;\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);
const ALIAS = [
  "--alias:@react-native-async-storage/async-storage=/tmp/s61-stub-asyncstorage.mjs",
];

function* walk(dir) {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(path.join(root, rel));
    if (st.isDirectory()) yield* walk(rel);
    else if (/\.tsx?$/.test(name)) yield rel;
  }
}
const ALL_FILES = [...walk("src"), ...walk("app"), ...walk("shared")];
const filesMatching = (re) => ALL_FILES.filter((f) => re.test(read(f)));

const setNavigator = (v) =>
  Object.defineProperty(globalThis, "navigator", {
    value: v, configurable: true, writable: true,
  });
const tick = () => new Promise((r) => setTimeout(r, 25));

// ----------------------------------------------------------------
// A. The gate: suppression → one notice; settle → silence.
// ----------------------------------------------------------------

const vib = await bundle("src/sensory/vibration.ts", "/tmp/s61-vibration.mjs", ALIAS);

const vibCalls = [];
setNavigator({ vibrate: (p) => { vibCalls.push(p); return true; } });

let notices = 0;
vib.subscribeHapticSuppression(() => { notices += 1; });

check("A1 switch ON: the gate fires and raises no notice",
  vib.vibrationEnabledNow() === true && vib.vibrate(60) === true &&
  vibCalls.length === 1 && notices === 0 && vib.hapticNoticeState() === "armed");
await tick(); // the lazy pref read (empty store) settles as a no-op

vib.mirrorHapticsPreference(false);
check("A2 switch OFF: suppressions raise the notice exactly once, then stay silent while it's up",
  vib.vibrate(60) === false && vib.vibrate([50, 30, 50]) === false &&
  vib.vibrate(200) === false && vibCalls.length === 1 &&
  notices === 1 && vib.hapticNoticeState() === "shown",
  `notices=${notices}`);

vib.settleHapticSuppressionNotice("dismissed");
check("A3 a dismissal settles it: further suppressions stay silent this session",
  vib.hapticNoticeState() === "settled" && vib.vibrate(60) === false &&
  notices === 1);

vib.resetVibrationForTests();
let notices2 = 0;
vib.subscribeHapticSuppression(() => { notices2 += 1; });
vib.mirrorHapticsPreference(false);
check("A4 a fresh session arms again (reset → the notice can fire once more)",
  vib.hapticNoticeState() === "armed" && vib.vibrate(60) === false &&
  notices2 === 1 && vib.hapticNoticeState() === "shown");

vib.mirrorHapticsPreference(true);
check("A5 the switch coming back on settles an outstanding notice — and the gate passes through, no toast, no replay bookkeeping",
  vib.hapticNoticeState() === "settled" && vib.vibrate(60) === true &&
  vibCalls.length === 2 && notices2 === 1);

vib.mirrorHapticsPreference(false);
check("A6 after an enable, a later switch-off starts NO new nag this session",
  vib.vibrate(60) === false && notices2 === 1 &&
  vib.hapticNoticeState() === "settled");

vib.resetVibrationForTests();
let notices3 = 0;
vib.subscribeHapticSuppression(() => { notices3 += 1; });
setNavigator({}); // a platform with no vibrate at all
vib.mirrorHapticsPreference(false);
check("A7 platform absence + switch OFF: nothing raised (nothing to enable on this device), notice stays armed",
  vib.vibrate(60) === false && notices3 === 0 &&
  vib.hapticNoticeState() === "armed");

vib.resetVibrationForTests();
vib.subscribeHapticSuppression(() => { notices3 += 1; });
setNavigator(undefined);
check("A8 no navigator at all + switch ON: the platform refusal stays a quiet false, no notice",
  vib.vibrate(60) === false && notices3 === 0 &&
  vib.hapticNoticeState() === "armed");
setNavigator({ vibrate: (p) => { vibCalls.push(p); return true; } });
vib.resetVibrationForTests();

// ----------------------------------------------------------------
// B. The queue carries an actionable item intact.
// ----------------------------------------------------------------

const tq = await bundle("app/components/toastQueue.ts", "/tmp/s61-tq.mjs");
const onPress = () => {};
const onSettle = () => {};
{
  let s = tq.createToastQueue();
  s = tq.enqueueToast(s, { id: 1, message: "plain" });
  s = tq.enqueueToast(s, {
    id: 2,
    message: "Your ghostie tried to get your attention — haptics are off.",
    action: { label: "Enable", onPress },
    displayMs: 6000,
    onSettle,
  });
  check("B1 an actionable item waits its turn with action, hold and settle intact",
    s.visible?.id === 1 && s.waiting.length === 1 &&
    s.waiting[0].action?.label === "Enable" &&
    s.waiting[0].action?.onPress === onPress &&
    s.waiting[0].displayMs === 6000 && s.waiting[0].onSettle === onSettle);
  const dup = tq.enqueueToast(s, { id: 3, message: s.waiting[0].message });
  check("B2 message dedupe still holds for an actionable item (one copy in line)",
    dup.waiting.length === 1 && dup.visible?.id === 1);
  s = tq.advanceToast(s);
  check("B3 served, the actionable item keeps its fields; a message-only item has none",
    s.visible?.id === 2 && s.visible?.action?.label === "Enable" &&
    s.visible?.displayMs === 6000 && s.visible?.onSettle === onSettle);
}

// ----------------------------------------------------------------
// C. The wiring.
// ----------------------------------------------------------------

const bridge = read("app/components/fabric/HapticsToastBridge.tsx");
check("C1 the bridge turns the gate's notice into the toast, in Terrell's words, with Enable",
  bridge.includes("subscribeHapticSuppression(") &&
  bridge.includes('from "../Toast"') && bridge.includes("useToast()") &&
  bridge.includes("Your ghostie tried to get your attention — haptics are off.") &&
  bridge.includes('"Enable"') &&
  bridge.includes("settleHapticSuppressionNotice("));

check("C2 Enable flips the ONE store via the Settings setter; the bridge never writes the record or the gate's mirror itself",
  bridge.includes("setHapticsEnabled(true)") &&
  bridge.includes('from "../../context/PreferencesContext"') &&
  !bridge.includes("fabric_prefs_v1") && !bridge.includes("setJSON") &&
  !bridge.includes("mirrorHapticsPreference("));

check("C3 the suppressed pulse is NOT replayed — stated where Enable is pressed",
  bridge.includes("NOT replayed"));

const layout = read("app/_layout.tsx");
check("C4 _layout mounts the bridge exactly once, inside BOTH providers (toast wraps preferences)",
  (layout.match(/<HapticsToastBridge \/>/g) ?? []).length === 1 &&
  layout.indexOf("<ToastProvider>") < layout.indexOf("<PreferencesProvider>") &&
  layout.indexOf("<PreferencesProvider>") < layout.indexOf("<HapticsToastBridge />") &&
  layout.indexOf("<HapticsToastBridge />") < layout.indexOf("</PreferencesProvider>"));

const toast = read("app/components/Toast.tsx");
check("C5 the renderer: the action is the pill's only touch target, settle fires once, chrome pins intact",
  toast.includes("current.action") && toast.includes("pressAction") &&
  toast.includes("<Pressable") && toast.includes('pointerEvents="auto"') &&
  toast.includes('current.action ? "box-none" : "none"') &&
  toast.includes("settledIdRef") && toast.includes('settleItem(item, "action")') &&
  toast.includes('settleItem(item, "expired")') &&
  (toast.match(/<Animated\.View/g) ?? []).length === 1 &&
  toast.includes("maxWidth: 196") && toast.includes("top: 14") &&
  toast.includes("left: 70") && toast.includes("right: 110"));

const gate = read("src/sensory/vibration.ts");
check("C6 the gate: suppression is noted ONLY on the switch-off path, and only when the platform could vibrate",
  gate.includes("noteToggleSuppression()") &&
  gate.includes("platformCanVibrate()") &&
  gate.includes('typeof navigator.vibrate === "function"') &&
  gate.includes('noticeState !== "armed"'));

check("C7 census: navigator.vibrate( still lives in exactly ONE file — the gate",
  JSON.stringify(filesMatching(/navigator\.vibrate\s*\(/).sort()) ===
    JSON.stringify(["src/sensory/vibration.ts"]),
  filesMatching(/navigator\.vibrate\s*\(/).join(", "));

// ----------------------------------------------------------------
// D. Settings reflects an Enable flip (same store, same context).
// ----------------------------------------------------------------

const menu = read("app/components/fabric/FabricMenu.tsx");
const drawer = read("app/components/neo/SettingsDrawer.tsx");
const prefsCtx = read("app/context/PreferencesContext.tsx");
check("D1 both Settings surfaces read/write the very preference the bridge flips",
  menu.includes("value={prefs.hapticsEnabled}") &&
  menu.includes("prefs.setHapticsEnabled") &&
  drawer.includes("setHapticsEnabled(!hapticsEnabled)") &&
  prefsCtx.includes("setHapticsEnabled") &&
  prefsCtx.includes("mirrorHapticsPreference(hapticsEnabled)"));

console.log(`\nhaptics-toast-check: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
