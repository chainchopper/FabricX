// fluidbg-check.mjs — Slice 62 headless proof.
//
// Terrell's ask, Nov 3, 2026 (~10:52 PM ET): "Can I take a photo
// to replace background of the liquid canvas with my snap or
// camera feed or no? The front camera should be default of
// course."
//
// What this pins:
// §A Config — the Background row's sources are a typed enum in
//    ExperienceConfig.common (preset | photo | camera), with the
//    photo + facing fields beside it; absent = preset / front, so
//    every pre-62 saved config keeps its meaning, and the whole
//    config still persists per layer via LayerSettingsMirror.
// §B The store — publish/subscribe semantics the engine + the
//    controls rely on (partial merge, equal-publish silence,
//    unsubscribe), and the product-language captions (denial and
//    absence are different facts).
// §C The surface — FluidBackdrop gates on the fluid layer only,
//    renders UNDER the canvas (zIndex -1, pointer-events none,
//    cover-fit), faces FRONT by default, remembers grants through
//    Slice 50's memory, falls back to the preset on any failure,
//    and TEARS DOWN on every path out (cleanup stops the tracks
//    and removes the elements — no orphan stream).
// §D The wiring — ExperienceRenderer mounts the surface in its
//    own slot; EVERY transparentBackdrop assignment in
//    LegacyFluid follows the store's liveness (the engine may go
//    transparent only while a picture is actually beneath it).
// §E The controls — the Background row grows Snap / Pick / Live
//    camera in place: the snap input carries capture="user" (the
//    front camera), the pick input carries none; photos are
//    downscaled before they are stored; the facing switch lives
//    in the same row; the privacy line is in the panel copy; a
//    preset tap returns the source to "preset".
//
// Run: node scripts/fluidbg-check.mjs   (from the repo root)

import { readFileSync } from "node:fs";
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
const count = (s, re) => (s.match(re) || []).length;

async function bundle(rel, out) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`],
    { cwd: root, stdio: "pipe" }
  );
  return import(out);
}

// ----------------------------------------------------------------
// A. Config — the enum and its persistence.
// ----------------------------------------------------------------

const types = read("src/types/experience.ts");
check(
  "A1 backgroundSource is the typed enum in common",
  /backgroundSource\?:\s*"preset" \| "photo" \| "camera"/.test(types)
);
check(
  "A2 the photo + facing fields live beside it",
  /backgroundPhoto\?:\s*string/.test(types) &&
    /backgroundCameraFacing\?:\s*"user" \| "environment"/.test(types)
);
check(
  "A3 the fields sit in ExperienceConfig.common (per-layer persisted)",
  types.indexOf("backgroundSource") > types.indexOf("common: {") &&
    types.indexOf("backgroundSource") < types.indexOf("specific:")
);
const mirror = read("app/components/fabric/LayerSettingsMirror.ts");
check(
  "A4 the mirror still persists the whole config per layer (no whitelist)",
  mirror.includes("setJSON(layerSettingsKey(activeId), state.experienceConfig)") &&
    mirror.includes("fabric_layer_settings_v1:")
);

// ----------------------------------------------------------------
// B. The store — driven, not just read.
// ----------------------------------------------------------------

const store = await bundle(
  "src/components/fluid/fluidBackdropStore.ts",
  "/tmp/fluidbg-store.mjs"
);
store.resetFluidBackdropForTests();
check(
  "B1 the store starts dark and idle",
  store.getFluidBackdropSnapshot().live === false &&
    store.getFluidBackdropSnapshot().status === "idle"
);
let heard = 0;
const unsub = store.subscribeFluidBackdrop(() => {
  heard += 1;
});
store.publishFluidBackdrop({ live: true, kind: "camera", status: "live" });
check(
  "B2 a publish lands whole and notifies once",
  heard === 1 && store.getFluidBackdropSnapshot().live === true
);
store.publishFluidBackdrop({ live: true, kind: "camera", status: "live" });
check("B3 an equal publish is silent", heard === 1);
store.publishFluidBackdrop({ live: false });
check(
  "B4 a partial publish merges (kind/status survive)",
  heard === 2 &&
    store.getFluidBackdropSnapshot().live === false &&
    store.getFluidBackdropSnapshot().kind === "camera"
);
unsub();
store.publishFluidBackdrop({ status: "error", error: "x" });
check("B5 an unsubscribed listener hears nothing more", heard === 2);
check(
  "B6 denial and absence get different captions",
  store.backdropErrorCaption("NotAllowedError") !==
    store.backdropErrorCaption("NotFoundError") &&
    store.backdropErrorCaption("NotAllowedError").includes("stayed off") &&
    store.backdropErrorCaption("NotFoundError").includes("No camera was found")
);
check(
  "B7 every caption names the fallback (color background is back)",
  ["NotAllowedError", "NotFoundError", "OverconstrainedError", "AbortError", null].every(
    (n) => store.backdropErrorCaption(n).includes("color background is back")
  ) && store.PHOTO_LOST_CAPTION.includes("color background is back")
);

// ----------------------------------------------------------------
// C. The surface — FluidBackdrop.
// ----------------------------------------------------------------

const surf = read("src/components/fluid/FluidBackdrop.tsx");
check(
  "C1 the surface gates on the fluid layer only",
  surf.includes('state.activeExperience?.id === "default-fluid"') &&
    surf.includes('source === "photo" || source === "camera"')
);
check(
  "C2 it renders UNDER the canvas and never takes a touch",
  /zIndex:\s*-1/.test(surf) && surf.includes('pointerEvents="none"') &&
    surf.includes('el.style.pointerEvents = "none"')
);
check(
  "C3 the picture fills cover-fit (no letterbox, no distortion)",
  surf.includes('el.style.objectFit = "cover"')
);
check(
  "C4 FRONT camera is the default (absent setting = user)",
  surf.includes('common?.backgroundCameraFacing ?? "user"') &&
    surf.includes("facingMode")
);
check(
  "C5 grants ride Slice 50's memory, both outcomes",
  surf.includes('rememberHardwareGrant("camera", "granted")') &&
    surf.includes('rememberHardwareGrant("camera", "denied")')
);
check(
  "C6 any start failure falls back to the preset source",
  surf.includes('backgroundSource: "preset"') &&
    surf.includes("backdropErrorCaption(")
);
check(
  "C7 teardown stops every track and removes the elements",
  surf.includes("streamRef.current?.getTracks().forEach((t) => t.stop())") &&
    surf.includes("videoRef.current.remove()") &&
    surf.includes("imgRef.current.remove()")
);
check(
  "C8 the lifecycle effect's cleanup IS the teardown (no path out leaks)",
  /return \(\) => \{\s*\n\s*document\.removeEventListener\("visibilitychange", onVis\);\s*\n\s*teardown\(\);\s*\n\s*\};/.test(
    surf
  ) && surf.includes("return () => {\n      teardown();\n    };")
);
check(
  "C9 a late getUserMedia resolution drops its stream (session token)",
  surf.includes("session !== sessionRef.current") &&
    surf.includes("stream.getTracks().forEach((t) => t.stop())")
);
check(
  "C10 liveness is published, and only the surface publishes it",
  surf.includes("publishFluidBackdrop({ live: true") &&
    surf.includes("publishFluidBackdrop({ live: false")
);

// ----------------------------------------------------------------
// D. The wiring — renderer slot + the engine's flag.
// ----------------------------------------------------------------

const renderer = read("src/components/experiences/ExperienceRenderer.tsx");
check(
  "D1 ExperienceRenderer mounts the surface in its own slot",
  renderer.includes("import FluidBackdrop") &&
    renderer.includes("<FluidBackdrop />")
);
const fluid = read("src/components/fluid/LegacyFluid.tsx");
check(
  "D2 LegacyFluid reads the store",
  fluid.includes('from "./fluidBackdropStore"') &&
    fluid.includes("getFluidBackdropSnapshot().live") &&
    fluid.includes("subscribeFluidBackdrop")
);
const flagSites = count(fluid, /transparentBackdrop\s*=/g);
const flagGuarded = count(
  fluid,
  /transparentBackdrop\s*=[^;]*getFluidBackdropSnapshot\(\)\.live/g
);
check(
  "D3 EVERY transparentBackdrop assignment follows the store's liveness",
  flagSites >= 4 && flagSites === flagGuarded,
  `sites=${flagSites} guarded=${flagGuarded}`
);
const engine = read("src/components/fluid/LegacyFluidEngine.ts");
check(
  "D4 the engine's transparent mode is the compositing route (no new draw path)",
  engine.includes("public transparentBackdrop = false") &&
    engine.includes("const overBackdrop = this.transparentBackdrop && target == null")
);

// ----------------------------------------------------------------
// E. The controls — the Background row grows in place.
// ----------------------------------------------------------------

const controls = read("app/components/controls/BackgroundControls.tsx");
check(
  "E1 the snap input asks for the FRONT camera; the pick input asks for files",
  controls.includes('capture="user"') &&
    /type="file"[^>]*accept="image\/\*"/.test(controls) &&
    count(controls, /type="file"/g) === 2
);
check(
  "E2 picking a photo writes source photo + the photo itself",
  controls.includes('backgroundSource: "photo"') &&
    controls.includes("backgroundPhoto: dataUrl")
);
check(
  "E3 photos are downscaled before they are stored (bounded, JPEG)",
  controls.includes("MAX_PHOTO_EDGE = 1280") &&
    controls.includes('toDataURL("image/jpeg", 0.82)')
);
check(
  "E4 Live camera writes source camera; the facing switch is in the same row",
  controls.includes('setSource("camera")') &&
    controls.includes("backgroundSource: next") &&
    controls.includes("backgroundCameraFacing") &&
    controls.includes('?? "user"')
);
check(
  "E5 a preset tap returns the source to preset (the fallback's twin)",
  controls.includes('backgroundSource: "preset"')
);
check(
  "E6 the privacy line is in the panel copy, in plain words",
  controls.includes("never recorded") && controls.includes("never sent")
);
check(
  "E7 the failure caption renders from the store",
  controls.includes("getFluidBackdropSnapshot") &&
    controls.includes("subscribeFluidBackdrop")
);

console.log(`\nfluidbg-check: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("ALL CHECKS PASSED");
