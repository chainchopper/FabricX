#!/usr/bin/env node
/**
 * landing-forge-check.mjs — Slice I ("the public front door shows the Forge").
 *
 * Run (after export): node scripts/landing-forge-check.mjs [repoRoot] [proofPng]
 *   repoRoot defaults to the tree holding this script.
 *   proofPng defaults to ../proof-g/proof-g-frame0-starter-after.png
 *   (the Slice G proof render the card's visual must BE, not resemble).
 *
 * The check reads the SERVED copy — dist/welcome.html, the build output —
 * and fails clearly if it is absent (run `npx expo export -p web` first).
 * It also reads public/welcome.html (the source) and pins the export
 * carried it verbatim.
 *
 * Pins:
 *   L0  served copy exists and is byte-identical to the source.
 *   L1  "forge" appears in the served landing (card + intro prose).
 *   L2  exactly five world-cards; the Forge card is first.
 *   L3  the Forge card carries its name, its one line, and a real visual
 *       (inline JPEG with alt text).
 *   L4  the four standing cards are byte-identical in content (name + line).
 *   L5  no invented claims: every capability the card names exists in the
 *       tree (forge-summon in the brain manifest; vs-ghost mode in the layer).
 *   L6  no lime (#a3e635), no cyan (#22D3EE) in the served landing —
 *       the landing keeps its warm gold/terracotta identity.
 *   L7  the entry path is intact (/?enter=1 links) and the Forge card,
 *       like its siblings, is a plain div with no href of its own.
 *   L8  the gallery layout: five columns at desktop, a 3-column
 *       breakpoint at 1000px, the card-image rule (64px, object-fit cover).
 *   L9  the visual IS the proof render: the inlined JPEG decodes to the
 *       proof PNG's pixels within JPEG tolerance (PIL compare).
 *   L10 the "Worlds to Step Into" intro names the Forge.
 *
 * Powered by Nirvana
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const proofPng = resolve(
  process.argv[3] ?? join(root, "..", "proof-g", "proof-g-frame0-starter-after.png"),
);

let passes = 0;
let failures = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    passes++;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const servedPath = join(root, "dist", "welcome.html");
const sourcePath = join(root, "public", "welcome.html");

/* ---------------- L0: the served copy ---------------- */
check("L0 dist/welcome.html exists (run expo export first)", existsSync(servedPath), servedPath);
check("L0 public/welcome.html exists", existsSync(sourcePath), sourcePath);
if (!existsSync(servedPath) || !existsSync(sourcePath)) {
  console.log(`\nlanding-forge-check: ${passes} passed, ${failures} failed`);
  process.exit(1);
}
const served = readFileSync(servedPath, "utf8");
const source = readFileSync(sourcePath, "utf8");
check("L0 served copy is byte-identical to the source (export carried it)", served === source);

/* ---------------- L1: the word is on the page ---------------- */
const forgeHits = (served.match(/forge/gi) ?? []).length;
check('L1 served landing says "forge"', forgeHits >= 2, `${forgeHits} occurrences`);

/* ---------------- L2: five cards, Forge first ---------------- */
const cards = [...served.matchAll(/<div class="world-card"[^>]*>/g)];
check("L2 exactly five world-cards", cards.length === 5, `${cards.length} found`);
const cardBlocks = served.split('<div class="world-card"').slice(1);
check(
  "L2 the Forge card is first in the gallery",
  cardBlocks.length >= 1 && cardBlocks[0].includes("<b>The Forge</b>"),
);

/* ---------------- L3: the Forge card's contents ---------------- */
const forgeCard = cardBlocks[0] ?? "";
check("L3 card names The Forge", forgeCard.includes("<b>The Forge</b>"));
check(
  "L3 card carries its one line",
  forgeCard.includes("Your ghostie shapes the scene as you watch — then plays you at checkers."),
);
const imgMatch = forgeCard.match(/<img src="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)" alt="([^"]+)"/);
check("L3 card visual is an inline JPEG with alt text", !!imgMatch, imgMatch ? `${imgMatch[2].slice(0, 40)}…` : "no img found");
check(
  "L3 inlined JPEG is a real image, not a stub",
  !!imgMatch && imgMatch[1].length > 10000,
  imgMatch ? `${imgMatch[1].length} base64 chars` : "",
);

/* ---------------- L4: the four standing cards, unchanged ---------------- */
const standing = [
  ["Fluid", "Color that flows like water under every hand in the room."],
  ["Piano", "Keys stretched across the phones in the room, played together."],
  ["Dancer Stage", "Your ghostie, embodied, dancing to what the room plays."],
  ["See", "The camera finds real things and touches them with light."],
];
for (const [name, line] of standing) {
  check(
    `L4 ${name} card unchanged`,
    served.includes(`<b>${name}</b><p>${line}</p>`),
    served.includes(`<b>${name}</b>`) ? "name present" : "name MISSING",
  );
}

/* ---------------- L5: no invented claims ---------------- */
const brain = readFileSync(join(root, "src", "ghost", "GhostBrain.ts"), "utf8");
check('L5 "shapes the scene" is real — forge-summon in the brain manifest', brain.includes('"forge-summon"'));
const layer = readFileSync(join(root, "src", "components", "forge", "ForgeLayer.tsx"), "utf8");
check('L5 "plays you at checkers" is real — vs-ghost mode in ForgeLayer', layer.includes('"vs-ghost"'));

/* ---------------- L6: palette discipline ---------------- */
check("L6 no lime in the served landing", !/#a3e635/i.test(served));
check("L6 no cyan in the served landing (warm identity kept)", !/#22D3EE/i.test(served));

/* ---------------- L7: entry path ---------------- */
const enters = (served.match(/href="\/\?enter=1"/g) ?? []).length;
check("L7 Enter Fabric links intact", enters >= 3, `${enters} links`);
check("L7 Forge card has no href of its own (plain div, like its siblings)", !/href=/i.test(forgeCard));

/* ---------------- L8: gallery layout ---------------- */
check("L8 five-column gallery at desktop", served.includes(".world-cards{display:grid;grid-template-columns:repeat(5,1fr)"));
check("L8 three-column breakpoint at 1000px", served.includes("@media (max-width:1000px){ .world-cards{grid-template-columns:repeat(3,1fr)} }"));
check(
  "L8 card-image rule (64px strip, object-fit cover)",
  served.includes(".world-card img{width:100%;height:64px;object-fit:cover;object-position:center;display:block;margin-bottom:12px;border-radius:6px}"),
);

/* ---------------- L9: the visual IS the proof render ---------------- */
if (!existsSync(proofPng)) {
  check("L9 proof render exists to compare against", false, proofPng);
} else if (!imgMatch) {
  check("L9 visual matches the proof render", false, "no inlined image to compare");
} else {
  const tmpJpg = "/tmp/landing-forge-img.jpg";
  writeFileSync(tmpJpg, Buffer.from(imgMatch[1], "base64"));
  try {
    const out = execFileSync(
      "python3",
      [
        "-c",
        "import sys; from PIL import Image; import numpy as np\n"
          + "a=np.asarray(Image.open(sys.argv[1]).convert('RGB'),dtype=float)\n"
          + "b=np.asarray(Image.open(sys.argv[2]).convert('RGB'),dtype=float)\n"
          + "print(f'{a.shape[0]}x{a.shape[1]} {b.shape[0]}x{b.shape[1]} meanabs={abs(a-b).mean():.2f}')\n",
        tmpJpg,
        proofPng,
      ],
      { encoding: "utf8", timeout: 30000 },
    ).trim();
    const m = out.match(/(\d+)x(\d+) (\d+)x(\d+) meanabs=([\d.]+)/);
    const dimsOk = !!m && m[1] === m[3] && m[2] === m[4] && m[1] === "540" && m[2] === "880";
    const diff = m ? parseFloat(m[5]) : 999;
    check("L9 inlined image is 880x540, the proof render's size", dimsOk, out);
    check("L9 inlined pixels match the proof render (JPEG tolerance)", diff < 8, `mean abs diff ${diff}`);
  } catch (e) {
    check("L9 visual matches the proof render", false, `PIL compare failed: ${String(e.message ?? e).slice(0, 120)}`);
  }
}

/* ---------------- L10: the intro names the Forge ---------------- */
check(
  "L10 Worlds intro names the Forge",
  served.includes("a forge where your ghostie shapes a living scene and plays you at checkers"),
);

console.log(`\nlanding-forge-check: ${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
