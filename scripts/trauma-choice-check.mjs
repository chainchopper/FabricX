// trauma-choice-check.mjs — Slice 38 headless proof.
//
// Terrell, Nov 2, 2026 — TWO messages, read together (the
// reconciled rule this check pins):
//   (1) "Trauma better not be standing anywhere unless I
//       choose a fabric or idle behavior that uses him. The
//       initial fabric and default is the fluid. Not sure
//       what u mean by no pick made."
//   (2) "There is never a bare figure. Why? We have models
//       available unless someone chooses it. We have the
//       figure we want. I uploaded it. It's trauma."
//
// Message (1) targeted the AMBUSH: the persisted-experience
// restore landing fresh loads on the Dancer Stage uninvited
// (and, under Slice 37, with Trauma standing on it). Slice
// 38's landing fix answers it (§D below stands unchanged).
// The first Slice 38 also reverted the stage's bind to
// choice-only — that overshot, and message (2) corrected it
// within hours: ON the stage, Trauma is THE figure. The
// amendment restores the default bind and pins the synthesis:
//
//   A. The bind rule (the real traumaCharacter module,
//      esbuild-bundled): unset / null / unknown bind the
//      Trauma MMA default; a stored catalog pick wins;
//      explicit "none" — and only "none" — binds nothing.
//   B. The stage wiring: the stage binds only through that
//      resolution (exactly one bind call); the failure pill
//      still shows when a bind (default or picked) fails.
//   C. Menu honesty: the THIS LAYER pills key off the same
//      resolution (an untouched layer lights the MMA pill —
//      that is what binds), the "never takes it uninvited"
//      copy is gone, and the fabrics card editor presents
//      "mma" for an unstored pick, with "none" a real option.
//   D. The landing: ExperienceContext's boot lands on the
//      default fluid (builtin[0]) unless THIS load carries an
//      explicit ?exp= deep link; the persisted record no
//      longer selects the landing, and its config is restored
//      only onto the experience it belongs to. (Source pins —
//      the boot is a React effect over storage + location;
//      the mechanism is what's provable headlessly, the felt
//      landing is Terrell's device verdict.)
//   E. No figure during a load: while the slot's status is
//      "loading", the local rig renders NO figure mesh (the
//      bare figure is never a loading placeholder) and the
//      stage shows its quiet "Loading your character…" note.
//      (Source pins over DancerRig + DancerStage.)
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
// A. The bind rule — on the stage, Trauma is the figure.
// ----------------------------------------------------------------

const trauma = await bundle("src/dancer/traumaCharacter.ts", "/tmp/s38-trauma.mjs");
const { resolveBuiltinBind, TRAUMA_IDLE_NONE } = trauma;

check("A1 unset pick binds the Trauma MMA default", resolveBuiltinBind(undefined)?.id === "mma" && resolveBuiltinBind(undefined)?.url === "/animations/trauma-mma-idle.glb");
check("A2 null pick binds the default too", resolveBuiltinBind(null)?.id === "mma");
check("A3 an unknown stored value falls back to the default, never to nothing", resolveBuiltinBind("garbage")?.id === "mma" && resolveBuiltinBind(42)?.id === "mma");
check("A4 explicit 'none' — and only 'none' — binds nothing (bare figure by choice)", TRAUMA_IDLE_NONE === "none" && resolveBuiltinBind("none") === null);
check("A5 an explicit MMA pick binds the MMA idle", resolveBuiltinBind("mma")?.id === "mma" && resolveBuiltinBind("mma")?.url === "/animations/trauma-mma-idle.glb");
check("A6 an explicit bouncing pick binds the bouncing idle", resolveBuiltinBind("bouncing")?.id === "bouncing" && resolveBuiltinBind("bouncing")?.url === "/animations/trauma-bouncing-fight-idles.glb");

// ----------------------------------------------------------------
// B. Stage wiring — one bind path through the resolution, the
//    failure pill kept for any failed bind.
// ----------------------------------------------------------------

const stage = read("src/dancer/DancerStage.tsx");
check("B1 the stage binds through resolveBuiltinBind", stage.includes("resolveBuiltinBind(traumaIdleSetting)"));
check("B2 the resolved bind is the stage's ONLY built-in bind call", (stage.match(/setStageCharacterRemote\(/g) ?? []).length === 1, `${(stage.match(/setStageCharacterRemote\(/g) ?? []).length} call(s)`);
check("B3 the stage holds no second resolution path", !stage.includes("DEFAULT_TRAUMA_IDLE_ID") && !stage.includes("traumaIdleDef("));
check("B4 a failed bind still shows on stage", stage.includes("Character didn’t load — showing the fallback figure") && stage.includes('charState.status === "failed"'));

// ----------------------------------------------------------------
// C. Menu honesty — pills and editor tell the same truth.
// ----------------------------------------------------------------

const menu = read("app/components/fabric/FabricMenu.tsx");
check("C1 the idle pills key off the bind resolution", menu.includes("stageBuiltinBind?.id === def.id") && menu.includes("const stageBuiltinBind = resolveBuiltinBind(stageTraumaIdleRaw)"));
check("C2 the 'never takes it uninvited' copy is gone", !menu.includes("never takes it") && !menu.includes("until you pick an idle here"));
check("C3 Restore mannequin still stores the explicit none pick", menu.includes("stageTraumaIdle: TRAUMA_IDLE_NONE"));
const fieldIdx = menu.indexOf('key: "stageTraumaIdle"');
const fieldBlock = fieldIdx >= 0 ? menu.slice(fieldIdx, fieldIdx + 700) : "";
check("C4 the card editor's Trauma field defaults to 'mma' (the effective bind), with a none option", fieldBlock.includes('defaultValue: "mma"') && fieldBlock.includes('{ value: "none"'), fieldBlock ? "" : "field block not found");
check("C5 the card editor does not default the field to 'none'", !fieldBlock.includes('defaultValue: "none"'));

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

// ----------------------------------------------------------------
// E. No figure during a load — the bare figure is never the
//    loading placeholder.
// ----------------------------------------------------------------

const rig = read("src/dancer/DancerRig.tsx");
check("E1 the local rig computes the loading gate from the slot status", rig.includes('characterSlot && charState.status === "loading"'));
check("E2 the mannequin mesh renders only when no character is bound AND the slot is not loading", rig.includes("visible={!character && !slotLoading}"));
check("E3 the stage shows the quiet loading note while the slot loads", stage.includes("Loading your character…") && stage.includes('charState.status === "loading"'));

console.log(`\ntrauma-choice-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
