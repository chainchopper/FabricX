// mic-clutter-check.mjs — Slice 67 headless proof.
//
// Terrell (Nov 4, 2026, ~4:31 PM ET), verbatim: "There is
// still a mic menu as if we hadn't already basically gotten
// rid of that clutter and put it in settings with a toast
// reminder. Tap to talk off by default."
//
// The compose bar's mic row stood on every canvas in every
// mode — in Natural (the default) it was not even a door.
// This check pins the correction:
//
// §A drives the notice (src/sensory/listeningNotice): the
//    orientation toast fires exactly ONCE PER INSTALL — the
//    first time the natural listener is genuinely live —
//    whether the arm lands before or after the persisted
//    flag is read; the flag is persisted at fire time; a
//    later launch (flag already in storage) never fires.
// §B censuses the surfaces: the mic row (button + standing
//    label + primer + capture captions) renders ONLY under
//    the Tap gate; in Natural at rest the bar returns null
//    (no element, no touch target); no press semantics
//    remain in Natural (the capture-door branch is gone; the
//    blocked restart rides the first touch anywhere); the
//    toast trigger is gated on Natural + a genuinely hot
//    mic; the runtime hooks stay mounted in both modes
//    (only the JSX was chrome); the bridge rides the ONE
//    toast queue via useToast and _layout mounts it beside
//    the haptics bridge in the same slot discipline.
//
// Run: node scripts/mic-clutter-check.mjs   (from the repo root)

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}
const read = (p) => readFileSync(path.join(root, p), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 10));

// AsyncStorage shim whose Map the check can seed + inspect.
writeFileSync(
  "/tmp/mc-stub-asyncstorage.mjs",
  "const m = new Map();\nglobalThis.__mcstore = m;\nexport default {\n  getItem: async (k) => (m.has(k) ? m.get(k) : null),\n  setItem: async (k, v) => { m.set(k, String(v)); },\n  removeItem: async (k) => { m.delete(k); },\n};\n"
);
const ALIAS = [
  "--alias:@react-native-async-storage/async-storage=/tmp/mc-stub-asyncstorage.mjs",
];

async function bundle(rel, out, extra = []) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`, ...extra],
    { cwd: root, stdio: "pipe" }
  );
  return pathToFileURL(out).href;
}

// ---------------------------------------------------------- §A notice
{
  const url = await bundle(
    "src/sensory/listeningNotice.ts",
    "/tmp/mc-notice.mjs",
    ALIAS
  );

  // Arm lands BEFORE the persisted flag has been read: the
  // pending arm must still fire exactly once, and persist.
  const a = await import(url + "?fresh=1");
  let aFires = 0;
  a.subscribeListeningNotice(() => { aFires += 1; });
  a.noteNaturalListeningArmed();
  await tick(); await tick();
  check("§A an arm before the flag read still fires, exactly once", aFires === 1);
  check("§A state is fired after the first genuine arm", a.listeningNoticeState() === "fired");
  check(
    "§A the flag is persisted at fire time",
    JSON.parse(globalThis.__mcstore.get("fabric_listening_notice_v1") ?? "{}").shown === true
  );
  a.noteNaturalListeningArmed();
  await tick();
  check("§A repeat arms in the same session stay silent", aFires === 1);

  // A later launch: the flag is already in storage — the
  // notice never fires again on this install. (The bundled
  // stub's Map is re-created per fresh import, so the later
  // launch's storage is seeded with the persisted record
  // scenario one left behind.)
  const b = await import(url + "?fresh=2");
  globalThis.__mcstore.set(
    "fabric_listening_notice_v1",
    JSON.stringify({ shown: true })
  );
  let bFires = 0;
  b.subscribeListeningNotice(() => { bFires += 1; });
  b.noteNaturalListeningArmed();
  await tick(); await tick();
  check("§A a later launch (flag persisted) never fires", bFires === 0);
  check("§A a later launch reads settled", b.listeningNoticeState() === "settled");

  // Read first, arm second: same single firing.
  globalThis.__mcstore.clear();
  const c = await import(url + "?fresh=3");
  let cFires = 0;
  c.subscribeListeningNotice(() => { cFires += 1; });
  c.ensureListeningNotice();
  await tick(); await tick();
  check("§A an unread install reads armed, not fired", c.listeningNoticeState() === "armed" && cFires === 0);
  c.noteNaturalListeningArmed();
  check("§A the first arm after the read fires once", cFires === 1 && c.listeningNoticeState() === "fired");
}

// ------------------------------------------------------- §B census
{
  const bar = read("src/components/sensory/ComposeBar.tsx");
  const hud = read("app/components/ExperienceHUD.tsx");
  const bridge = read("app/components/fabric/ListeningToastBridge.tsx");
  const layout = read("app/_layout.tsx");
  const notice = read("src/sensory/listeningNotice.ts");

  const gateIdx = bar.indexOf("{showTapDoor ? (");
  const pressIdx = bar.indexOf('accessibilityLabel={voice.listening ? "Stop listening" : "Ask by voice"}');
  const labelIdx = bar.indexOf("typing lives in the Companion panel");

  check(
    "§B the tap door is a render gate on the mode, not a style",
    bar.includes('const showTapDoor = mode === "tap";') && gateIdx >= 0
  );
  check(
    "§B the mic button renders inside the Tap gate (after it in the tree)",
    pressIdx > gateIdx && gateIdx >= 0
  );
  check(
    "§B the standing 'typing lives in the Companion panel' label is inside the gate too",
    labelIdx > gateIdx && gateIdx >= 0
  );
  check(
    "§B in Natural at rest the bar returns literally null — no element, no touch target",
    bar.includes("if (!showTapDoor && !hasTransient) return null;")
  );
  check(
    "§B the press that remains is Tap's alone (onMicPress is voice.toggle, nothing else)",
    bar.includes("const onMicPress = () => {\n    voice.toggle();\n  };")
  );
  check(
    "§B no capture-door branch survives in Natural (no 'unsupported' press path in the bar)",
    !bar.includes('wake.state === "unsupported"')
  );
  check(
    "§B the blocked restart rides the first touch anywhere (compatibility, re-homed)",
    bar.includes('wake.state === "blocked"') &&
      bar.includes("wake.restart()") &&
      bar.includes('addEventListener("pointerdown", onFirstTouch)')
  );
  check(
    "§B the toast trigger is gated on Natural AND a genuinely hot mic (never in Tap, never when blocked/unsupported)",
    bar.includes('if (mode === "natural" && wake.micHot) {') &&
      bar.includes("noteNaturalListeningArmed();")
  );
  check(
    "§B the runtime never left: both voice hooks stay mounted in every mode (only the JSX was chrome)",
    bar.includes("useWakeWord({") && bar.includes("useAutoMicRequest({")
  );
  check(
    "§B the HUD mount is unchanged — the runtime rides every non-stage fabric as before",
    hud.includes("isDancerStage ? null : <ComposeBar />")
  );
  check(
    "§B the notice persists before it notifies (a missed toast can never become a nag)",
    notice.indexOf("setJSON(LISTENING_NOTICE_KEY") >= 0 &&
      notice.indexOf("setJSON(LISTENING_NOTICE_KEY") < notice.indexOf("listeners.forEach")
  );
  check(
    "§B the bridge rides the ONE toast queue (useToast) — no second queue, no stacking",
    bridge.includes('from "../Toast"') &&
      bridge.includes("subscribeListeningNotice") &&
      !bridge.includes("toastQueue") &&
      !bridge.includes("createToastQueue")
  );
  check(
    "§B the toast copy teaches the name and points at Settings, in product language",
    bridge.includes("listening for its name") && bridge.includes("Voice is set in Settings.")
  );
  check(
    "§B _layout mounts the bridge beside the haptics bridge (same slot discipline)",
    layout.includes("<ListeningToastBridge />") &&
      layout.indexOf("<ListeningToastBridge />") > layout.indexOf("<HapticsToastBridge />")
  );
}

console.log(`\nmic-clutter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
