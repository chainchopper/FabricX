/**
 * see-fabric-check — structural check for Slice 64 ("camera
 * vision becomes a fabric of its own").
 *
 * Terrell: "That camera vision shit should be a fabric it's own
 * as well so I'm lost as to how it's currently working." The
 * census (~/workspace/fabric-seefabric/SEE-CENSUS.md) found the
 * smear: a real perception stack (src/sam/) presented as a layer
 * inside an id special-case, while a second, divergent vision
 * surface — the legacy Vision AI drawer — sat in the settings
 * system analyzing still photos through a different config,
 * dead by default. Slice 64 promotes, it does not rebuild: the
 * perception stack is untouched; what changes is the declared
 * architecture around it. This check proves, headlessly, from
 * the source:
 *
 *  (1) SEE IS A FABRIC WITH ITS OWN CANVAS KIND. The registry
 *      declares canvas "camera" on the sam-see experience (the
 *      stage3d precedent), the canvas-kind type carries it, the
 *      built-in registry still holds exactly the same seven ids
 *      (no fabric was added or lost — See was already a card;
 *      now it is a canvas too), and fabricInfo's canvasKindFor
 *      keys on the declaration.
 *
 *  (2) THE RENDERER ROUTES ON THE DECLARATION, NOT THE ID. The
 *      SAM slot gates on canvas === "camera"; the string
 *      "sam-see" appears nowhere in ExperienceRenderer; the
 *      ground/overlay order (SamCameraBackground before
 *      SamLayer) is the one Hotfix 2.4 pinned.
 *
 *  (3) THE CAMERA IS THE CANVAS, FRONT BY DEFAULT. SamLayer's
 *      camera still requests facingMode "user"; the stale
 *      "camera runs under the fluid" copy is gone from the info
 *      record.
 *
 *  (4) ONE HOME FOR VISION. The F menu's AI SERVICES row opens
 *      the See fabric through the session-authority card handler;
 *      no vision-ai drawer door exists in the menu, the drawer
 *      registry, the layout mounts, or the Preferences panel —
 *      and both drawer files are deleted. The drawer's one real
 *      feature (still-photo analysis) is present on the See
 *      fabric's own surface, behind its config gate.
 *
 *  (5) THE ACTS STILL REACH THE FABRIC. The See Acts machinery
 *      (parser, performer, highlight return) is intact in
 *      LegacyFluid, and SamLayer still listens for the highlight
 *      event — the ghost can act on what See sees, on the fabric.
 *
 *  (6) STUBS STAY LABELED. The ASL recognizer remains a reserved
 *      stub in the gesture vocabulary — promoted surfaces may
 *      not quietly claim it.
 *
 * Run from the repo root:
 *   node scripts/see-fabric-check.mjs
 */
import { readFileSync, existsSync } from "node:fs";

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};
const read = (p) => readFileSync(p, "utf8");

const types = read("src/types/experience.ts");
const registry = read("src/contexts/ExperienceContext.tsx");
const renderer = read("src/components/experiences/ExperienceRenderer.tsx");
const sam = read("src/components/sam/SamLayer.tsx");
const menu = read("app/components/fabric/FabricMenu.tsx");
const info = read("app/components/fabric/fabricInfo.ts");
const layout = read("app/_layout.tsx");
const drawersCtx = read("app/components/neo/NewDrawersContext.tsx");
const settings = read("app/components/neo/SettingsDrawer.tsx");
const fluid = read("src/components/fluid/LegacyFluid.tsx");
const gestures = read("src/hands/gestureVocabulary.ts");

// ------------------------------------------------ (1) a fabric, its own canvas kind
ok(
  /"fluid" \| "stage3d" \| "camera"/.test(types),
  'the canvas-kind type carries "camera" beside "fluid" and "stage3d"'
);
const seeEntry = registry.slice(
  registry.indexOf('id: "sam-see"'),
  registry.indexOf('id: "sam-see"') + 1400
);
ok(
  seeEntry.includes('canvas: "camera"'),
  'the See experience declares canvas: "camera" in the registry'
);
const builtinIds = [...registry.matchAll(/^\s+id: "([a-z0-9-]+)",$/gm)].map(
  (m) => m[1]
);
ok(
  JSON.stringify(builtinIds) ===
    JSON.stringify([
      "default-fluid",
      "ar-piano",
      "sam-see",
      "dancer-stage",
      "camera-effects",
      "genx-fold",
      "ghostie-playground",
      "forge",
    ]),
  `the built-in registry holds eight fabrics, See among them (Slice A adds the Forge — nothing here moved) (got: ${builtinIds.join(", ")})`
);
ok(
  info.includes('exp.canvas === "camera"'),
  "fabricInfo's canvasKindFor keys on the declared canvas kind"
);

// ------------------------------------------------ (2) the renderer routes on the declaration
ok(
  renderer.includes('activeExperience?.canvas === "camera"'),
  "the renderer derives the camera canvas from the declaration"
);
ok(
  !renderer.includes('"sam-see"'),
  "the renderer contains no sam-see id special-case any more"
);
ok(
  renderer.indexOf("<SamCameraBackground />") > -1 &&
    renderer.indexOf("<SamCameraBackground />") <
      renderer.indexOf("<SamLayer />"),
  "the camera ground still mounts before the perception overlay"
);

// ------------------------------------------------ (3) the camera is the canvas
ok(
  sam.includes('facingMode: "user"'),
  "the fabric's camera is the front camera by default"
);
ok(
  !info.includes("Layered — the camera runs under the fluid"),
  "the stale layer copy is gone from See's info record"
);
ok(
  info.includes("Camera canvas — the front camera fills the fabric"),
  "See's info record states the camera-canvas truth"
);

// ------------------------------------------------ (4) one home for vision
ok(
  menu.includes('label="See — the camera fabric"') &&
    menu.includes("onFabricCard(see)"),
  "the AI SERVICES row opens the See fabric through the card handler"
);
ok(
  !menu.includes('openPanel("vision-ai")') &&
    !drawersCtx.includes('"vision-ai"') &&
    !layout.includes("VisionAIDrawer") &&
    !settings.includes("VisionAIDrawerButton"),
  "no vision-ai drawer surface remains in menu, registry, layout, or Preferences"
);
ok(
  !existsSync("app/components/neo/VisionAIDrawer.tsx") &&
    !existsSync("app/components/neo/VisionAIDrawerButton.tsx"),
  "the Vision AI drawer files are deleted"
);
ok(
  settings.includes("<SeeFabricButton />"),
  "the Preferences quick-access slot now opens the See fabric"
);
ok(
  sam.includes("Analyze a photo") && sam.includes("VisionAIService"),
  "the drawer's still-photo analysis lives on the See fabric's surface"
);

// ------------------------------------------------ (5) the acts still reach the fabric
ok(
  fluid.includes("parseSeeAct") &&
    fluid.includes("performSeeAct") &&
    fluid.includes("FABRIC_SEE_HIGHLIGHT_EVENT"),
  "the See Acts machinery is intact in the interaction layer"
);
ok(
  sam.includes("FABRIC_SEE_HIGHLIGHT_EVENT"),
  "the fabric's overlay still receives act highlights"
);
ok(
  sam.includes("segmentPhrase(") && sam.includes("loadLLMConfig()"),
  "the segmentation path still resolves through the shared seam"
);

// ------------------------------------------------ (6) stubs stay labeled
ok(
  /reserved/i.test(gestures) && gestures.includes("asl_"),
  "the ASL recognizer is still labeled a reserved stub"
);

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`
);
process.exit(failures === 0 ? 0 : 1);
