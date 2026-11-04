// music-brain-check.mjs — Slice 68 headless proof.
//
// Terrell's call (Nov 4, 2026, ~4:41 PM ET): "Generative music
// seems to just play music rather than give the model the
// tools it needs to do so... if no intelligence is attached
// to this not mockup shit, we fail and I refuse to submit
// without intelligence embedded."
//
// The census he was reacting to: the fluid's Generative-music
// toggle mounted AutoComposer, a standalone Tone.Sequence
// whose pitches came from a fixed ascending loop, a fixed
// triad cycle, or Math.random over a scale pool. No output of
// the ghost's decision path fed it. This check pins the fix:
//
// §A census: the renderer contains NO pitch choice (no
//    Math.random, no Tone.Sequence, no pickNote, no scale
//    pool) and DOES render the authored-phrase store through
//    the one pure transform; the host wires the peer's phrase
//    sink + standing request + pack seam.
// §B the BRAIN authors: driving decideOnDevice with a DUE
//    standing request in two different ghost states produces
//    two DIFFERENT valid phrases; the same state reproduces
//    the same phrase (its choices are its own); an un-due or
//    absent request never yields music (legacy purity); the
//    validator refuses play-music without a due request and
//    on a fabric that doesn't offer the tool; the
//    never-repeat law re-seeds; a pack seed is quoted into
//    the chosen scale.
// §C render equality: phraseToEvents (the renderer's only
//    transform) emits a stream EQUAL to the authored phrase —
//    same notes, same order, same velocities, timing pure
//    arithmetic on the phrase's own tempo.
// §D the pack seam: the bundled test pack ships as base64
//    TEXT (the repo's write path is text-only — the Trauma
//    transport); the text decodes to the original phrase
//    bytes bit-identical (sha256-pinned), those bytes parse
//    to exactly the phrase encoded into them, the INDEX
//    names the transport, and garbage parses to null.
//
// Run: node scripts/music-brain-check.mjs   (from the repo root)

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

async function bundle(rel, out) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`],
    { cwd: root, stdio: "pipe" }
  );
  return import(pathToFileURL(out).href);
}

// ------------------------------------------------------------ §A census
{
  const renderer = read("src/components/audio/AutoComposer.tsx");
  // Code only — the file's header comment recounts the old
  // player's sins as history; the pin governs what RUNS.
  const rendererCode = renderer
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  check(
    "§A renderer chooses nothing: no Math.random, no Tone.Sequence, no pickNote, no scale pool",
    !rendererCode.includes("Math.random") &&
      !rendererCode.includes("Tone.Sequence") &&
      !rendererCode.includes("pickNote") &&
      !rendererCode.includes("SCALES")
  );
  check(
    "§A renderer sounds the authored store through the one pure transform",
    renderer.includes("subscribeGhostMusicPhrases") &&
      renderer.includes("phraseToEvents")
  );
  const fluid = read("src/components/fluid/LegacyFluid.tsx");
  check(
    "§A host wires phrase sink + standing request + pack seam",
    fluid.includes("publishGhostMusicPhrase") &&
      fluid.includes("setMusicStanding") &&
      fluid.includes("fetchFirstMusicPackSeed")
  );
  const peer = read("src/ghost/GhostPeer.ts");
  check(
    "§A peer performs play-music and paces the phrase clock",
    peer.includes("performPlayMusic") &&
      peer.includes("onMusicPhrase") &&
      peer.includes("musicDuePending")
  );
}

// ------------------------------------------------- §B the brain authors
const brain = await bundle("src/ghost/GhostBrain.ts", "/tmp/mb-brain.mjs");

const fabric = {
  layer_id: "default-fluid",
  canvas: "fluid",
  role: "solo",
  in_session: false,
  rules: { draw: true, verbs: true, notes: true },
};
const baseScenario = (over = {}) => ({
  temperament: "playful",
  seconds_since_human_touch: 5,
  recent_events: ["quiet room"],
  pets_in_last_5s: 0,
  nearby_splat_intensity: 0.1,
  verbs_seen: [],
  other_ghosts: [],
  room_energy_trend: "steady",
  ghost_identity: { name: "Boop", hue: 200, seed_traits: ["bouncy"] },
  fabric,
  ...over,
});
const musicCtx = (over = {}) => ({
  due: true,
  scale: "ionian",
  pattern_hint: "up",
  tempo_bpm: 100,
  phrase_index: 0,
  last_played_note: null,
  last_phrase_signature: null,
  pack_notes: null,
  ...over,
});

// State 1: playful ghost, a human just played G4, room rising.
const s1 = baseScenario({
  recent_events: ["human played G4"],
  room_energy_trend: "rising",
  music: musicCtx(),
});
const d1 = brain.decideOnDevice(s1);
check(
  "§B state 1 (playful, heard G4, rising) authors a play-music decision",
  d1.decision.intent === "play-music" && d1.ruleId === "music-standing-request",
  `intent=${d1.decision.intent} rule=${d1.ruleId}`
);
const p1 = d1.decision.music_phrase;
check(
  "§B state 1 phrase is a real phrase (>=8 notes, sanitized shape)",
  !!p1 && p1.notes.length >= 8 && p1.bpm === 100 && p1.steps === 16
);
check(
  "§B state 1 notes stay inside the human's scale (ionian over the heard tonic G)",
  !!p1 &&
    p1.notes.every((n) => {
      const midi = brain.ghostNoteNumber(n.note);
      return [0, 2, 4, 5, 7, 9, 11].includes(((midi - 7) % 12 + 12) % 12);
    })
);

// State 2: sleepy ghost, long quiet, room falling, nothing heard.
const s2 = baseScenario({
  temperament: "sleepy",
  seconds_since_human_touch: 300,
  room_energy_trend: "falling",
  music: musicCtx(),
});
const d2 = brain.decideOnDevice(s2);
const p2 = d2.decision.music_phrase;
check(
  "§B state 2 (sleepy, long quiet, falling) authors a sparse phrase (<=6 notes)",
  d2.decision.intent === "play-music" && !!p2 && p2.notes.length <= 6,
  `intent=${d2.decision.intent} notes=${p2?.notes.length}`
);
check(
  "§B two different states author DIFFERENT phrases",
  !!p1 &&
    !!p2 &&
    brain.ghostMusicPhraseSignature(p1) !== brain.ghostMusicPhraseSignature(p2)
);

// Determinism: state 1 again authors state 1's phrase.
const d1b = brain.decideOnDevice(s1);
check(
  "§B the same state reproduces the same phrase (choices are the ghost's own)",
  !!p1 &&
    !!d1b.decision.music_phrase &&
    brain.ghostMusicPhraseSignature(d1b.decision.music_phrase) ===
      brain.ghostMusicPhraseSignature(p1)
);

// Not due: the standing request rides the scenario but the
// phrase clock has not fired — no music decision.
const dNotDue = brain.decideOnDevice(
  baseScenario({ music: musicCtx({ due: false }) })
);
check(
  "§B an un-due standing request never yields music",
  dNotDue.decision.intent !== "play-music"
);

// Absent: no music field at all — legacy purity.
const dAbsent = brain.decideOnDevice(baseScenario());
check(
  "§B no music field -> no music decision (legacy scenarios untouched)",
  dAbsent.decision.intent !== "play-music"
);

// Validator law: a hand-built play-music decision dies without
// a due request, and on a fabric that doesn't offer the tool.
check(
  "§B validator refuses play-music without a due request",
  brain.validateGhostDecision(
    { intent: "play-music", music_phrase: p1 },
    baseScenario({ music: musicCtx({ due: false }) })
  ) === null
);
check(
  "§B validator refuses play-music where the fabric offers no play-music tool (sam-see)",
  brain.validateGhostDecision(
    { intent: "play-music", music_phrase: p1 },
    baseScenario({
      fabric: { ...fabric, layer_id: "sam-see" },
      music: musicCtx(),
    })
  ) === null
);

// Never-repeat: feed phrase 1's signature back as the last
// phrase — the next authoring must differ.
const dRepeat = brain.decideOnDevice(
  baseScenario({
    recent_events: ["human played G4"],
    room_energy_trend: "rising",
    music: musicCtx({
      phrase_index: 1,
      last_phrase_signature: brain.ghostMusicPhraseSignature(p1),
    }),
  })
);
check(
  "§B the never-repeat law: the next phrase differs from the one just played",
  dRepeat.decision.intent === "play-music" &&
    !!dRepeat.decision.music_phrase &&
    brain.ghostMusicPhraseSignature(dRepeat.decision.music_phrase) !==
      brain.ghostMusicPhraseSignature(p1)
);

// Pack quote: the bundled test phrase's notes as seed — the
// phrase opens on the tonic (its root transposed to C) and
// quotes the contour inside the chosen scale.
const dPack = brain.decideOnDevice(
  baseScenario({
    music: musicCtx({ pack_notes: [72, 76, 79, 81, 79, 76, 74, 76] }),
  })
);
const pPack = dPack.decision.music_phrase;
check(
  "§B a pack seed is quoted: phrase opens C5 -> E5 (the seed's root+third, in scale)",
  !!pPack &&
    pPack.notes.length >= 2 &&
    pPack.notes[0].step === 0 &&
    pPack.notes[0].note === "C5" &&
    pPack.notes[1].note === "E5",
  pPack ? `opens ${pPack.notes.slice(0, 3).map((n) => n.note).join(",")}` : "no phrase"
);

// ------------------------------------------- §C render stream == authored
{
  const pe = await bundle(
    "src/components/audio/phraseEvents.ts",
    "/tmp/mb-events.mjs"
  );
  const events = pe.phraseToEvents(p1);
  const stepSec = 30 / p1.bpm;
  check(
    "§C the rendered stream EQUALS the authored phrase (notes, order, velocities, timing)",
    events.length === p1.notes.length &&
      events.every(
        (ev, i) =>
          ev.note === p1.notes[i].note &&
          Math.abs(ev.offsetSec - p1.notes[i].step * stepSec) < 1e-9 &&
          Math.abs(ev.velocity - p1.notes[i].velocity) < 1e-9 &&
          Math.abs(
            ev.durationSec -
              Math.max(0.05, p1.notes[i].len_steps * stepSec * 0.92)
          ) < 1e-9
      )
  );
}

// ------------------------------------------------------------ §D the seam
{
  const mp = await bundle("src/ghost/midiPhrase.ts", "/tmp/mb-midi.mjs");
  // The phrase's original bytes, pinned by hash: the .b64 text
  // in the repo must decode to EXACTLY these — bit-identical,
  // not a re-encode (sha256 of the 105-byte humming-line.mid).
  const PHRASE_SHA256 =
    "2db10854fc1469850c4a750db5dedb4823a3c7b5eb5a3989e86f822889d5fbdf";
  const index = JSON.parse(read("public/music-packs/INDEX.json"));
  check(
    "§D INDEX.json names the bundled pack as base64 text, with the decoded bytes' sha256",
    Array.isArray(index.packs) &&
      index.packs[0]?.file === "humming-line.b64" &&
      index.packs[0]?.encoding === "base64" &&
      index.packs[0]?.sha256 === PHRASE_SHA256
  );
  const decoded = mp.decodeBase64ToBytes(
    read("public/music-packs/humming-line.b64")
  );
  const seed = mp.parseMidiPhrase(decoded);
  // The loader itself, driven end-to-end over a disk-backed
  // fetch: INDEX -> base64 text -> decode -> the same parser
  // must land on the same seed.
  const diskFetch = async (url) => {
    if (url.endsWith("INDEX.json")) {
      return { ok: true, json: async () => index };
    }
    return {
      ok: true,
      text: async () => read("public/music-packs/humming-line.b64"),
    };
  };
  const loaded = await mp.fetchFirstMusicPackSeed(diskFetch);
  check(
    "§D the base64 text decodes to the original phrase bytes (sha256, 105 B) and parses to exactly the encoded phrase",
    decoded.byteLength === 105 &&
      createHash("sha256").update(decoded).digest("hex") === PHRASE_SHA256 &&
      !!seed &&
      JSON.stringify(seed.notes) ===
        JSON.stringify([72, 76, 79, 81, 79, 76, 74, 76]) &&
      seed.bpm === 100 &&
      !!loaded &&
      JSON.stringify(loaded.notes) === JSON.stringify(seed.notes) &&
      loaded.bpm === 100,
    seed ? `notes=${seed.notes.join(",")} bpm=${seed.bpm}` : "parse failed"
  );
  check(
    "§D garbage bytes parse to null, never a guessed seed",
    mp.parseMidiPhrase(new Uint8Array([1, 2, 3, 4, 5])) === null
  );
}

console.log(`\nmusic-brain-check: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
