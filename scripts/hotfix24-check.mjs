/**
 * hotfix24-check — headless proof for Hotfix 2.4 "See layer
 * compositing + living fallbacks".
 *
 * Proves:
 * - COMPOSITING (structural): the See layer renders its camera as a
 *   background UNDER the fluid (SamCameraBackground inside the same
 *   renderer slot, zIndex -1; SamLayer overlay at zIndex 30), the
 *   video element is cover-fit with pointerEvents "none", the
 *   outline mapping uses cover frame math, the fluid branch and the
 *   stage3d/piano branches are untouched, and the engine's
 *   transparent-backdrop mode exists + is driven by LegacyFluid
 *   from the active experience only for sam-see.
 * - CHIP, NOT PARAGRAPH (structural): the three chip states exist;
 *   the mechanism paragraph and the "Connect your own model" copy
 *   are GONE from the layer; the mechanism + privacy lines live on
 *   the layer's ID card and in THIS LAYER instead.
 * - LIVING FALLBACK (behavioral, real GhostPeer bundle): an
 *   unshapeable ask (interpreter stubbed to null by construction —
 *   the canvas branch calls expressPuzzlement) makes the ghost
 *   perform puzzlement: returns true, emits >= 2 splats through its
 *   own emit path in its signature color, drifts TOWARD the asker's
 *   last touch, records the performance line, stays inside the
 *   16/10s emit budget under repetition, and refuses (false, no
 *   emits) when disabled — the canvas then ripples in the user's
 *   hue (asserted structurally in LegacyFluid). Slice 17's
 *   heartbeat route still answers (regression).
 * - STRING SWEEP: "beyond the built-in" / "beyond the cloud model"
 *   appear in NO user-facing source file; the successful-source
 *   credits ("Interpreted on-device." / "Interpreted by the cloud
 *   model." / "Answered by your ghost…") survive verbatim.
 *
 * Build + run:
 *   npx esbuild src/ghost/GhostPeer.ts --bundle --format=esm --outfile=/tmp/GhostPeerHF24.mjs
 *   node scripts/hotfix24-check.mjs /tmp/GhostPeerHF24.mjs
 */
import { readFileSync } from "node:fs";

const peerMod = await import(process.argv[2] ?? "/tmp/GhostPeerHF24.mjs");
const { GhostPeer } = peerMod;

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= structural: compositing ================= */
console.log("== compositing: camera under fluid, outlines over ==");
const sam = read("src/components/sam/SamLayer.tsx");
const renderer = read("src/components/experiences/ExperienceRenderer.tsx");
const engine = read("src/components/fluid/LegacyFluidEngine.ts");
const fluid = read("src/components/fluid/LegacyFluid.tsx");

check("SamCameraBackground is exported from SamLayer", sam.includes("export function SamCameraBackground"));
check("video is cover-fit", sam.includes('el.style.objectFit = "cover"'));
check("video never swallows touches (pointerEvents none)", sam.includes('el.style.pointerEvents = "none"'));
check("no contain-fit survives", !sam.includes('"contain"'));
check("camera surface is pointerEvents none", sam.includes('pointerEvents="none"'));
check("camera background sits below the fluid (zIndex -1)", sam.includes("zIndex: -1"));
check("overlay stays above everything in the layer (zIndex 30)", sam.includes("zIndex: 30"));
check(
  "cover frame math (frame may exceed the host, offsets go negative)",
  sam.includes("if (h < hostH)") && sam.includes("w = h * cam.aspect")
);
check(
  "renderer slot: camera background renders before the overlay, in one fragment slot",
  renderer.includes("<SamCameraBackground />") &&
    renderer.indexOf("<SamCameraBackground />") < renderer.indexOf("<SamLayer />")
);
check(
  "fluid branch untouched (WebFluidBackground exactly once, stage3d branch intact)",
  renderer.split("<WebFluidBackground").length - 1 === 1 &&
    renderer.includes("DancerStageLazy") &&
    renderer.includes("isStageCanvas")
);
check("piano layer slot untouched", renderer.includes("{isPianoLayer ? <PianoNoteLayer /> : null}"));
check(
  "engine has the transparent-backdrop mode, default off",
  engine.includes("public transparentBackdrop = false")
);
check(
  "both backdrop paints are gated on it (fill + checkerboard)",
  (engine.match(/!overBackdrop/g) ?? []).length >= 2 &&
    engine.includes("const overBackdrop = this.transparentBackdrop && target == null")
);
check(
  "LegacyFluid drives the flag from the active experience (birth + watcher)",
  fluid.includes('engine.transparentBackdrop = experienceRef.current?.id === "sam-see"') &&
    fluid.includes('state.activeExperience?.id === "sam-see"')
);

/* ================= structural: chip, not paragraph ================= */
console.log("\n== status chip, mechanism copy relocated ==");
check("chip state: Camera live", sam.includes('"See · Camera live"'));
check("chip state: Segmentation resting", sam.includes('"See · Segmentation resting"'));
check("chip state: Segmenting", sam.includes('"See · Segmenting"'));
check("chip is dismissible + re-openable", sam.includes("chipDismissed") && sam.includes("Show the See status"));
check(
  "mechanism paragraph is gone from the layer",
  !sam.includes("segments through the Meta Model API. This build")
);
check("no 'connect your own model' copy anywhere in the layer", !sam.includes("Connect your own model"));
check(
  "privacy paragraph is gone from the layer surface",
  !sam.includes("to your configured Meta endpoint")
);
check(
  "Segment action survives (segmentFrame still the only frame path)",
  sam.includes("segmentFrame(config, expression, frame)") &&
    sam.includes("captureSamCameraFrame()")
);
const idCards = read("app/components/fabric/IdCards.tsx");
check(
  "layer ID card carries the mechanism + privacy lines",
  idCards.includes("How See works") &&
    idCards.includes("A frame is sent only when you tap Segment")
);
const menu = read("app/components/fabric/FabricMenu.tsx");
check(
  "THIS LAYER carries its one factual line for See",
  menu.includes("const isSamSee") &&
    menu.includes("A frame is sent only when")
);

/* ================= string sweep ================= */
console.log("\n== the 'beyond' strings are gone from user-facing copy ==");
const bar = read("src/components/sensory/ComposeBar.tsx");
const userFacing = {
  "ComposeBar.tsx": bar,
  "LegacyFluid.tsx": fluid,
  "SamLayer.tsx": sam,
  "RecipeComposer.ts": read("src/ai/RecipeComposer.ts"),
  "IdCards.tsx": idCards,
  "FabricMenu.tsx": menu,
  "docs/AI.md": read("docs/AI.md"),
};
for (const [name, src] of Object.entries(userFacing)) {
  check(
    `${name}: no 'beyond the built-in' / 'beyond the cloud model'`,
    !src.includes("beyond the built-in") && !src.includes("beyond the cloud model")
  );
}
check(
  "canvas dispatches the puzzled source with the ghost's name",
  fluid.includes('source: "puzzled"') && fluid.includes("expressPuzzlement()")
);
check(
  "no-ghost fallback ripples in the user's hue via splatAt",
  fluid.includes("hueToRgb(hue, 0.5)") && fluid.includes("engineRef.current?.splatAt(0.5, 0.47")
);
check(
  "in-world captions present",
  bar.includes("tilts its head at that one.") &&
    bar.includes("The fabric ripples — that one's still a mystery.")
);
check(
  "successful-source credits survive verbatim",
  bar.includes("Interpreted on-device.") &&
    bar.includes("Interpreted by the cloud model.") &&
    bar.includes("Answered by your ghost, from its live state.")
);

/* ================= cover-fit math (the frameRect formula) ================= */
console.log("\n== cover frameRect math ==");
const coverRect = (hostW, hostH, aspect) => {
  let w = hostW;
  let h = w / aspect;
  if (h < hostH) {
    h = hostH;
    w = h * aspect;
  }
  return { left: (hostW - w) / 2, top: (hostH - h) / 2, w, h };
};
const r1 = coverRect(800, 600, 16 / 9); // landscape feed, squarer canvas: crop sides
check("landscape feed covers a squarer canvas (width overflows, no bands)",
  r1.h === 600 && r1.w > 800 && r1.left < 0 && r1.top === 0);
const r2 = coverRect(800, 600, 9 / 16); // portrait feed, landscape-ish canvas: crop top/bottom
check("portrait feed covers (height overflows, no bands)",
  r2.w === 800 && r2.h > 600 && r2.top < 0 && r2.left === 0);
const r3 = coverRect(800, 450, 16 / 9); // exact match
check("matching aspect fills exactly", r3.w === 800 && r3.h === 450 && r3.left === 0 && r3.top === 0);

/* ================= behavioral: the living fallback ================= */
console.log("\n== living fallback: the ghost performs puzzlement ==");
const mkPeer = () => {
  const seen = { injects: [], perfs: [] };
  const peer = new GhostPeer({
    peerId: "ghost:hf24-check",
    identity: { hue: 210, seed: 42 },
    injectLocal: (i) => seen.injects.push(i),
    broadcast: (i) => seen.injects.push(i),
    ghostName: "Boop",
    getFabricContext: () => null,
    onDrawRecipe: () => {},
    onPerformance: (l) => seen.perfs.push(l),
  });
  return { peer, seen };
};

// The asker's hand, down at (0.85, 0.85) — the ghost should drift
// toward it when it puzzles.
{
  const { peer, seen } = mkPeer();
  peer.noteInteraction(
    {
      userId: "human:asker",
      position: { x: 0.85, y: 0.85 },
      force: { x: 0, y: 0 },
      pressure: 0.4,
      timestamp: Date.now(),
    },
    "local"
  );
  const baseline = seen.injects.length;
  const performed = peer.expressPuzzlement();
  check("expressPuzzlement performs when the ghost can act", performed === true);
  await sleep(600);
  const acts = seen.injects.slice(baseline);
  check("puzzlement emits splats through the ghost's own emit path",
    acts.length >= 2, `${acts.length} acts`);
  check("acts ride under the ghost's own peer id",
    acts.every((i) => i.userId === "ghost:hf24-check"));
  check(
    "acts are in the ghost's signature color",
    acts.length >= 2 &&
      acts.every(
        (i) =>
          i.color &&
          i.color.r === acts[0].color.r &&
          i.color.g === acts[0].color.g &&
          i.color.b === acts[0].color.b
      )
  );
  check(
    "the ghost drifted toward the asker (first act lands right of its 0.5 home)",
    acts.length >= 1 && acts[0].position.x > 0.53,
    acts.length ? `x=${acts[0].position.x.toFixed(3)}` : "no acts"
  );
  check(
    "the brain line records the puzzlement",
    seen.perfs.some((l) => l.includes("puzzled"))
  );
  peer.destroy();
}

// Budget: puzzlement is an act like any other — repetition cannot
// flood past the 16/10s emit budget.
{
  const { peer, seen } = mkPeer();
  for (let k = 0; k < 30; k++) peer.expressPuzzlement();
  await sleep(700);
  check(
    "30 puzzlements stay inside the 16/10s emit budget",
    seen.injects.length <= 16 && seen.injects.length >= 2,
    `${seen.injects.length} injects`
  );
  peer.destroy();
}

// Ghost off: no performance, no emits — the canvas falls back to
// its own ripple (structural assertion above).
{
  const { peer, seen } = mkPeer();
  peer.setEnabled(false);
  const performed = peer.expressPuzzlement();
  await sleep(400);
  check("disabled ghost cannot perform puzzlement", performed === false);
  check("disabled ghost emits nothing", seen.injects.length === 0);
  peer.destroy();
}

// Regression: Slice 17's heartbeat route is untouched.
{
  const { peer } = mkPeer();
  const bpm = peer.answerHeartbeat();
  check("heartbeat answers still work (Slice 17 route intact)",
    typeof bpm === "number" && bpm > 0, bpm ? `${bpm}bpm` : "null");
  peer.destroy();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
