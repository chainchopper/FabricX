// trauma-choice-check.mjs — Slice 38 headless proof.
//
// Terrell's correction, Nov 2, 2026, on the LIVE build (main
// a3a7937a, Slices 36+37): "Trauma better not be standing
// anywhere unless I choose a fabric or idle behavior that uses
// him. The initial fabric and default is the fluid. Not sure
// what u mean by no pick made."
//
// Slice 37 had read his Nov 1 "can I get my gltf guy" as a
// request for a default and made an UNSET stageTraumaIdle bind
// Trauma (MMA) on stage mount. He overruled the inference.
// This check pins the corrected contract:
//
//   A. The bind rule (the real traumaCharacter module,
//      esbuild-bundled): a stored catalog pick binds that
//      idle; unset / null / unknown / explicit "none" bind
//      NOTHING. No pick, no character.
//   B. The stage wiring: the stage binds only through that
//      resolution (exactly one bind call), never through a
//      back-door default; the failure pill still shows — it
//      can now only be reached by an EXPLICIT pick failing.
//   C. Menu honesty: the THIS LAYER pills key off the same
//      resolution (unset lights no pill), the "he's the
//      default" copy is gone, and the fabrics card editor
//      presents "none" — not an idle — for an unstored pick.
//   D. The landing: ExperienceContext's boot lands on the
//      default fluid (builtin[0]) unless THIS load carries an
//      explicit ?exp= deep link; the persisted record no
//      longer selects the landing, and its config is restored
//      only onto the experience it belongs to. (Source pins —
//      the boot is a React effect over storage + location;
//      the mechanism is what's provable headlessly, the felt
//      landing is Terrell's device verdict.)
//
// Run: node scripts/trauma-choice-check.mjs   (from the repo root)

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

async function bundle(rel, out, extra = []) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`, ...extra],
    { cwd: root, stdio: "pipe" }
  );
  return import(out);
}

// ----------------------------------------------------------------
// A. The bind rule — no pick, no character.
// ----------------------------------------------------------------

const trauma = await bundle("src/dancer/traumaCharacter.ts", "/tmp/s38-trauma.mjs");
const { resolveBuiltinBind, TRAUMA_IDLE_NONE } = trauma;

check("A1 unset pick binds nothing", resolveBuiltinBind(undefined) === null);
check("A2 null pick binds nothing", resolveBuiltinBind(null) === null);
check("A3 an unknown stored value binds nothing", resolveBuiltinBind("garbage") === null && resolveBuiltinBind(42) === null);
check("A4 explicit 'none' binds nothing (bare figure by choice)", TRAUMA_IDLE_NONE === "none" && resolveBuiltinBind("none") === null);
check("A5 an explicit MMA pick binds the MMA idle", resolveBuiltinBind("mma")?.id === "mma" && resolveBuiltinBind("mma")?.url === "/animations/trauma-mma-idle.glb");
check("A6 an explicit bouncing pick binds the bouncing idle", resolveBuiltinBind("bouncing")?.id === "bouncing" && resolveBuiltinBind("bouncing")?.url === "/animations/trauma-bouncing-fight-idles.glb");

// ----------------------------------------------------------------
// B. Stage wiring — one bind path, no back-door default, the
//    failure pill kept for explicit picks.
// ----------------------------------------------------------------

const stage = read("src/dancer/DancerStage.tsx");
check("B1 the stage binds through resolveBuiltinBind", stage.includes("resolveBuiltinBind(traumaIdleSetting)"));
check("B2 the resolved bind is the stage's ONLY built-in bind call", (stage.match(/setStageCharacterRemote\(/g) ?? []).length === 1, `${(stage.match(/setStageCharacterRemote\(/g) ?? []).length} call(s)`);
check("B3 the stage holds no default-idle back door", !stage.includes("DEFAULT_TRAUMA_IDLE_ID") && !stage.includes("traumaIdleDef("));
check("B4 a failed explicit bind still shows on stage", stage.includes("Character didn’t load — showing the fallback figure") && stage.includes('charState.status === "failed"'));

// ----------------------------------------------------------------
// C. Menu honesty — pills and editor tell the same truth.
// ----------------------------------------------------------------

const menu = read("app/components/fabric/FabricMenu.tsx");
check("C1 the idle pills key off the bind resolution", menu.includes("stageBuiltinBind?.id === def.id") && menu.includes("const stageBuiltinBind = resolveBuiltinBind(stageTraumaIdleRaw)"));
check("C2 the 'he's the default' copy is gone", !menu.includes("he’s the default") && !menu.includes("he's the default"));
check("C3 Restore mannequin still stores the explicit none pick", menu.includes("stageTraumaIdle: TRAUMA_IDLE_NONE"));
const fieldIdx = menu.indexOf('key: "stageTraumaIdle"');
const fieldBlock = fieldIdx >= 0 ? menu.slice(fieldIdx, fieldIdx + 700) : "";
check("C4 the card editor's Trauma field defaults to 'none', with a none option", fieldBlock.includes('defaultValue: "none"') && fieldBlock.includes('{ value: "none"'), fieldBlock ? "" : "field block not found");
check("C5 the card editor no longer defaults the field to an idle", !fieldBlock.includes('defaultValue: "mma"'));

// ----------------------------------------------------------------
// D. The landing is the fluid.
// ----------------------------------------------------------------

const ctx = read("src/contexts/ExperienceContext.tsx");
const firstBuiltinId = ctx.match(/const builtin: ExperienceLayer\[\] = \[\s*\{\s*id: "([^"]+)"/)?.[1];
check("D1 the fallback experience (builtin[0]) is the default fluid", firstBuiltinId === "default-fluid", `builtin[0] = ${firstBuiltinId}`);
check("D2 the boot no longer restores the saved experience as the landing", !ctx.includes("savedExp ?? fallback") && !ctx.includes("let next = savedExp"));
check("D3 the landing is the ?exp= deep link, else the fluid", ctx.includes("byParam ?? fallback") && ctx.includes('params.get("exp")'));
check("D4 the saved config restores only onto its own experience", ctx.includes("byParam.id === saved.id") && ctx.includes("restoredConfig"));
check("D5 the persisted record is still written (a record, not a landing)", ctx.includes("setJSON(STORAGE_KEY"));
check("D6 in-session switching still deep-links (?exp= on switch)", ctx.includes('url.searchParams.set("exp", id)'));

console.log(`\ntrauma-choice-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
