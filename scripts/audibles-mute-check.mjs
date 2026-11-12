// audibles-mute-check — pins Slice J: "The switch means silence."
//
// The master Audio switch (`audioEnabled`, default ON) must mute
// the WHOLE app. Before this slice the ghost's music
// (AutoComposer) and the drone (Ambience) never read it: flip
// Audio off and the music kept playing and the drone kept
// droning. Ambience also built its own private AudioContext —
// the one voice Hotfix 1.8 didn't move — at gain 0.35, ~15x
// the ghost's 0.024 peak.
//
// §M1 gate coverage: every playback voice reads `audioEnabled`.
//   The census is exactly the audit's: AutoComposer, Ambience,
//   useGhostSfx, useAudioCues, useToneSynth. The sampled-piano
//   engine (soundfontPiano) schedules onto the shared context
//   and is gated upstream by its sole caller, useToneSynth —
//   pinned as M1b, not silently folded into the voice list.
//   The mic reactive path (useAudioReactive) is input-side and
//   stays OUT of the census, as the shared-audio header
//   documents. useMenuSounds is dead code (zero consumers);
//   it is NOT a live voice and is pinned as such in M1c — the
//   rewire-or-delete decision is a later slice, not this one.
// §M2 one context: no private playback AudioContext remains.
//   A direct `new AudioContext(` / `new AC(` is allowed in
//   exactly one file — the input-side reactive exception. A
//   `new Ctor()` fallback is allowed only in a file that first
//   asks getSharedAudioContext() (the shared-unavailable-only
//   fallback in useGhostSfx / useAudioCues / sharedAudio
//   itself, the one owner).
// §M3 drone level: the drone's target gain is a named constant
//   ≤ the verb-cue band (0.03) at default volume; the old 0.35
//   target and 0.72 cap are gone.
// §M4 copy: SettingsDrawer and DashboardOverlay name the same
//   switch with the same label ("Audio"); the FabricMenu
//   toggle is untouched.
// §M5 mute behavior, by ear: a headless browser drive —
//   `node proof-j/drive-proof-j.mjs <tree>` — starts a phrase,
//   flips Audio off mid-phrase, asserts no further scheduled
//   tones sound (analyser RMS on the shared context's
//   destination + the scheduled-oscillator log, the way the
//   Felt proof logged vibrate calls); flips it back on,
//   asserts the next phrase sounds; same drive for the drone.
//   The drive is a separate script because it Metro-bundles
//   the app and needs a browser; run it with --drive, or run
//   the driver directly. Without --drive this section reports
//   SKIP, never a silent pass.
// §M6 the music's meaning is untouched: `musicEnabled` still
//   gates the standing request, phrases still arrive only from
//   the authored-phrase store (no fallback sequencer), and the
//   release on toggle-off mirrors useToneSynth.
//
// What this check does NOT prove (said plainly): that a human
// EAR hears silence. Headless Chrome has no speakers; the
// drive listens through an AnalyserNode tap on the rendered
// signal (real samples, not a code read) and the oscillator
// schedule log. The iPhone claims — the hardware mute switch,
// iOS routing, the drone sounding on a real phone at all —
// need Terrell's devices, not headless Chrome.
//
// Run: node scripts/audibles-mute-check.mjs [--drive]
//   (from the repo root; --drive also runs proof-j's driver)
//
// Powered by Nirvana

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const withDrive = process.argv.includes("--drive");
let pass = 0;
let fail = 0;
let skipped = 0;
function check(label, ok, extra = "") {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}
function skip(label, why) {
  skipped += 1;
  console.log(`SKIP  ${label} — ${why}`);
}
const read = (p) => readFileSync(path.join(root, p), "utf8");
// A census matches CODE, not prose: the audit comments in these
// files name the old patterns (`new AudioContext()`, 0.35,
// Math.random) in their history. Strip strings-aware comments
// before any literal scan, or the comments themselves trip it.
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += n || ""; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    out += c;
    i += 1;
  }
  return out;
}
function* walkTs(dir) {
  const full = path.join(root, dir);
  if (!existsSync(full)) return;
  for (const name of readdirSync(full)) {
    const rel = `${dir}/${name}`;
    const st = statSync(path.join(root, rel));
    if (st.isDirectory()) yield* walkTs(rel);
    else if (/\.tsx?$/.test(name)) yield rel;
  }
}

/* ---- M1: every playback voice reads audioEnabled ------------------ */

const GATE_VOICES = [
  "src/components/audio/AutoComposer.tsx",
  "src/components/audio/Ambience.tsx",
  "src/ghost/useGhostSfx.ts",
  "app/hooks/useAudioCues.ts",
  "src/hooks/useToneSynth.ts",
];
for (const f of GATE_VOICES) {
  const src = stripComments(read(f));
  check(
    `M1 ${f} reads audioEnabled from Preferences`,
    src.includes("audioEnabled") && src.includes("usePreferences()"),
  );
}

// M1b: the sampled-piano engine is gated upstream, not directly.
{
  const engine = read("src/audio/soundfontPiano.ts");
  const callers = [...walkTs("src"), ...walkTs("app")]
    .filter((f) => f !== "src/audio/soundfontPiano.ts")
    .filter((f) => stripComments(read(f)).includes("soundfontNoteOn"));
  check(
    "M1b soundfontPiano schedules onto the shared context",
    engine.includes("getSharedAudioContext()"),
  );
  check(
    "M1b soundfontPiano's only note caller is the gated useToneSynth",
    callers.length === 1 && callers[0] === "src/hooks/useToneSynth.ts",
    `callers: ${callers.join(", ") || "(none)"}`,
  );
}

// M1c: the menu-sound library is dead code — not a live voice.
// It must stay that way (or be rewired by its own slice): no
// file outside its own definition may import it, so nothing
// schedules menu sound behind the switch's back.
{
  const consumers = [...walkTs("src"), ...walkTs("app")].filter(
    (f) =>
      f !== "src/hooks/useMenuSounds.ts" &&
      stripComments(read(f)).includes("useMenuSounds"),
  );
  check(
    "M1c useMenuSounds has zero consumers (dead code, out of this slice)",
    consumers.length === 0,
    `consumers: ${consumers.join(", ") || "(none)"}`,
  );
}

/* ---- M2: one context ---------------------------------------------- */

// Direct private-context construction is allowed in exactly one
// file: the input-side mic analyser, the documented exception.
const PRIVATE_CTX_EXCEPTIONS = ["src/hooks/useAudioReactive.ts"];
{
  const offenders = [];
  for (const f of [...walkTs("src"), ...walkTs("app")]) {
    const src = stripComments(read(f));
    if (
      (/new\s+AudioContext\s*\(/.test(src) || /new\s+AC\s*\(/.test(src)) &&
      !PRIVATE_CTX_EXCEPTIONS.includes(f)
    ) {
      offenders.push(f);
    }
  }
  check(
    "M2 no private playback AudioContext remains (only the reactive input exception)",
    offenders.length === 0,
    `offenders: ${offenders.join(", ") || "(none)"}`,
  );
  const reactive = read("src/hooks/useAudioReactive.ts");
  check(
    "M2 the one exception is input-side only (mic analyser, never the destination)",
    reactive.includes("getUserMedia") && !reactive.includes(".destination"),
    "useAudioReactive analyses the mic; it schedules no sound",
  );
}

// A `new Ctor()` fallback may exist only where the shared
// context was asked for first — i.e. only when Tone cannot
// provide one. sharedAudio.ts itself is the owner. Scoped to
// AudioContext constructors: `new Ctor()` elsewhere is the
// SpeechRecognition constructor (wake word / voice capture —
// input-side speech, not audio output), which this census
// does not govern.
{
  const offenders = [];
  for (const f of [...walkTs("src"), ...walkTs("app")]) {
    const src = stripComments(read(f));
    if (
      /new\s+Ctor\s*\(/.test(src) &&
      src.includes("AudioContext") &&
      !src.includes("getSharedAudioContext")
    ) {
      offenders.push(f);
    }
  }
  check(
    "M2b every `new Ctor()` fallback sits behind getSharedAudioContext()",
    offenders.length === 0,
    `offenders: ${offenders.join(", ") || "(none)"}`,
  );
  check(
    "M2c Ambience schedules onto the shared context",
    read("src/components/audio/Ambience.tsx").includes("getSharedAudioContext()"),
  );
}

/* ---- M3: the drone is levelled ------------------------------------- */

{
  const amb = stripComments(read("src/components/audio/Ambience.tsx"));
  const m = amb.match(/DRONE_TARGET_GAIN\s*=\s*([0-9.]+)/);
  const target = m ? Number(m[1]) : NaN;
  check(
    "M3 drone target gain is a named constant at or below the verb-cue band (0.03)",
    Number.isFinite(target) && target > 0 && target <= 0.03,
    `DRONE_TARGET_GAIN = ${m ? m[1] : "(not found)"}`,
  );
  check(
    "M3 the old 0.35 target and 0.72 cap are gone from Ambience",
    !amb.includes("0.35") && !amb.includes("0.72"),
  );
  check(
    "M3 the rAF fade, the presets, and the ambience toggle stay as they are",
    amb.includes("requestAnimationFrame") &&
      amb.includes("targetForPreset") &&
      amb.includes("ambienceEnabled"),
  );
}

/* ---- M4: one label for the switch ----------------------------------- */

{
  const drawer = read("app/components/neo/SettingsDrawer.tsx");
  const dash = read("app/components/overlays/DashboardOverlay.tsx");
  const menu = read("app/components/fabric/FabricMenu.tsx");
  check(
    'M4 SettingsDrawer names the switch "Audio" (not "Audio Cues")',
    drawer.includes('Audio: {audioEnabled') && !drawer.includes("Audio Cues:"),
  );
  check(
    'M4 DashboardOverlay names the switch "Audio"',
    dash.includes('Audio: {audioEnabled'),
  );
  check(
    "M4 the FabricMenu toggle is untouched (still prefs.audioEnabled)",
    menu.includes("prefs.audioEnabled") && menu.includes("prefs.setAudioEnabled"),
  );
}

/* ---- M6: the music's meaning is untouched --------------------------- */

{
  const ac = stripComments(read("src/components/audio/AutoComposer.tsx"));
  check(
    "M6 AutoComposer disposes the synth when Audio flips off (releaseAll cannot cancel future-scheduled attacks — J drive measured RMS 0.1364 after releaseAll)",
    ac.includes(".dispose()") && ac.includes("audioEnabled") && ac.includes("synthRef.current = null"),
  );
  check(
    "M6 musicEnabled keeps its own meaning (the ghost's standing request)",
    ac.includes("musicEnabled"),
  );
  check(
    "M6 phrases still arrive only from the authored-phrase store (no fallback sequencer)",
    ac.includes("subscribeGhostMusicPhrases") &&
      ac.includes("phraseToEvents") &&
      !ac.includes("Tone.Sequence") &&
      !ac.includes("Math.random"),
  );
}

/* ---- M5: mute behavior, by ear (headless drive) --------------------- */

if (withDrive) {
  const proofDir = path.join(root, "..", "proof-j");
  const driver = path.join(proofDir, "drive-proof-j.mjs");
  const bundler = path.join(proofDir, "metro-bundle-j.mjs");
  if (!existsSync(driver)) {
    check("M5 by-ear drive exists at proof-j/drive-proof-j.mjs", false, "driver missing");
  } else if (!existsSync(bundler)) {
    check("M5 by-ear drive exists at proof-j/drive-proof-j.mjs", false, "bundler missing");
  } else {
    try {
      // Fresh bundle from THIS tree (clears the shared Metro
      // cache first — copied trees share a stale cache).
      execFileSync("rm", ["-rf", "/tmp/metro-cache"], { encoding: "utf8" });
      execFileSync(process.execPath, [bundler, root], {
        encoding: "utf8",
        timeout: 10 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
      });
      const out = execFileSync(
        process.execPath,
        [driver, root],
        { encoding: "utf8", timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 },
      );
      const verdict = /DRIVE VERDICT: OK/.test(out);
      const rms = [...out.matchAll(/RMS[^\n]*/g)].map((m) => m[0]).slice(-6);
      check("M5 by-ear drive: phrase + drone silent with Audio off, sounding with it on", verdict, rms.join(" | "));
      console.log(out.split("\n").filter((l) => /^(PHASE|DRIVE VERDICT|page errors)/.test(l)).join("\n"));
    } catch (e) {
      check("M5 by-ear drive: phrase + drone silent with Audio off, sounding with it on", false, String((e && e.stdout) || e.message || e).split("\n").filter((l) => /^(PHASE|DRIVE VERDICT|page errors)/.test(l)).join(" | ") || "drive failed");
      if (e && e.stdout) process.stdout.write(String(e.stdout).split("\n").filter((l) => /^(PHASE|DRIVE VERDICT|page errors)/.test(l)).join("\n") + "\n");
    }
  }
} else {
  skip(
    "M5 by-ear drive (phrase + drone silent with Audio off, sounding with it on)",
    "run with --drive (Metro-bundles the app and needs a browser)",
  );
}

console.log(
  `\naudibles-mute-check: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`,
);
process.exit(fail === 0 ? 0 : 1);
