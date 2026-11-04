/**
 * menu-check — structural check for Slice 57 ("menu cleanup: kill
 * the catch-all, put every menu on its relevant panel").
 *
 * Terrell's complaint, twice over: the F menu tailed into a section
 * literally called "Panels" that held half the app's menus, and the
 * rest scrolled forever instead of living on the panels they
 * belong to. This check proves, headlessly, from the source:
 *
 *  (1) THE CATCH-ALL IS GONE. No `<SubHeader>Panels</SubHeader>`,
 *      no PANEL_ROWS registry, no `.map` over a panel list — the
 *      section that held doors for every other part of the app no
 *      longer exists as a destination.
 *
 *  (2) EVERY DOOR HAS EXACTLY ONE HOME. Each of the 13 doors the
 *      catch-all held (12 PANEL_ROWS + the Preferences panel) now
 *      renders inside the ONE section it belongs to:
 *        layer, neo            → FABRICS
 *        friends, call         → PEOPLE
 *        profile, wallet, shop → YOU
 *        studio, plugins       → STUDIO
 *        ai-chat, companion  → AI SERVICES
 *        settings              → SETTINGS & HELP
 *      and no door renders in any other section. Two documented
 *      exceptions, both pre-Slice-57 task links, not homes:
 *      STUDIO's two composer rows open "ai-settings" (configuring
 *      the composer model IS studio work; the panel's home stays
 *      AI SERVICES, where its summary card and door live), and
 *      SettingsDrawer's internal AI quick-access buttons live
 *      inside that drawer, outside this file.
 *
 *  (3) NO ENDLESS LIST. Stated bounds: no section renders more
 *      than 6 door rows; the whole menu renders 18 DoorRows in
 *      total (17 after Slice 57; Slice 59 adds the Find fabrics
 *      door in PEOPLE — the census below was extended honestly
 *      for it, with the new door's own pins), distributed over 6
 *      of the 7 sections; and SETTINGS & HELP — the old tail —
 *      holds exactly ONE door (the Preferences panel) beside
 *      its universal toggles and diagnostics. A setting never
 *      again sits at the bottom of a 13-door list that belongs
 *      to other panels.
 *
 *  (4) NOTHING BECAME UNREACHABLE. All 14 legacy drawers are
 *      still mounted in app/_layout.tsx — Slice 57 moved doors,
 *      it removed nothing.
 *
 * Slice 64 addendum (disclosed pin updates, same check count):
 * camera vision became a fabric of its own, and the legacy
 * Vision AI drawer — a second, divergent vision surface — is
 * RETIRED BY DESIGN. Its door in AI SERVICES now opens the See
 * fabric (through the same session authority as the fabric's
 * gallery card), its still-photo analysis moved onto the See
 * fabric's own surface, and its drawer is unmounted and deleted.
 * The pins below therefore track 13 drawers, "vision-ai" has no
 * home because it has no door, and four new pins prove the
 * re-homing: the See row renders in AI SERVICES, it routes
 * through onFabricCard, no openPanel("vision-ai") survives, and
 * no VisionAIDrawer is mounted in _layout.
 *
 * Run from the repo root:
 *   node scripts/menu-check.mjs
 */
import { readFileSync } from "node:fs";

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};

const menu = readFileSync("app/components/fabric/FabricMenu.tsx", "utf8");
const layout = readFileSync("app/_layout.tsx", "utf8");

// ------------------------------------------------------------ sections
// Split the menu into its seven section blocks, in doctrine order
// (same header parse as menu-organization-check).
const headerSrc = [...menu.matchAll(/<SectionHeader>(.*?)<\/SectionHeader>/gs)].map((x) => ({
  name: x[1].replace(/\{|`|\$\{.*$/g, "").trim(),
  at: x.index,
}));
for (const h of headerSrc) if (h.name.startsWith("THIS LAYER")) h.name = "THIS LAYER";
const ORDER = ["FABRICS", "PEOPLE", "YOU", "THIS LAYER", "STUDIO", "AI SERVICES", "SETTINGS & HELP"];
ok(
  JSON.stringify(headerSrc.map((h) => h.name)) === JSON.stringify(ORDER),
  `seven sections in doctrine order (got: ${headerSrc.map((h) => h.name).join(" · ")})`
);
const blocks = {};
headerSrc.forEach((h, i) => {
  blocks[h.name] = menu.slice(h.at, i + 1 < headerSrc.length ? headerSrc[i + 1].at : menu.length);
});

// ------------------------------------------------------------ (1) catch-all gone
ok(!menu.includes("<SubHeader>Panels</SubHeader>"), "no \"Panels\" sub-header anywhere in the menu");
ok(!/const PANEL_ROWS/.test(menu), "no PANEL_ROWS registry");
ok(!/PANEL_ROWS\.map/.test(menu), "no render maps over a panel registry");
ok(!menu.includes('label="Panels"'), "no door is labeled as a panels list");

// ------------------------------------------------------------ (2) one home per door
// Every way a block can name a drawer it opens: a direct
// openPanel("x") call, or a door-list row's panel: "x" field.
const doorsIn = (block) => {
  const found = [];
  for (const m of block.matchAll(/openPanel\("([^"]+)"\)/g)) found.push(m[1]);
  for (const m of block.matchAll(/panel: "([^"]+)"/g)) found.push(m[1]);
  return found;
};
const HOMES = {
  layer: "FABRICS",
  neo: "FABRICS",
  friends: "PEOPLE",
  call: "PEOPLE",
  profile: "YOU",
  wallet: "YOU",
  shop: "YOU",
  studio: "STUDIO",
  plugins: "STUDIO",
  "ai-chat": "AI SERVICES",
  companion: "AI SERVICES",
  settings: "SETTINGS & HELP",
  "ai-settings": "AI SERVICES",
};
// Pre-existing task links that are not homes (see header).
const ALSO_ALLOWED = { "ai-settings": ["STUDIO"] };
const foundIn = {}; // drawer -> [sections]
for (const name of ORDER) {
  for (const d of doorsIn(blocks[name])) {
    (foundIn[d] ??= []).push(name);
  }
}
for (const [drawer, home] of Object.entries(HOMES)) {
  const sections = [...new Set(foundIn[drawer] ?? [])];
  const allowed = [home, ...(ALSO_ALLOWED[drawer] ?? [])];
  ok(
    sections.includes(home),
    `door home: "${drawer}" renders in ${home} (found in: ${sections.join(", ") || "nowhere"})`
  );
  ok(
    sections.every((s) => allowed.includes(s)),
    `door home: "${drawer}" renders in no section but its home (found in: ${sections.join(", ") || "nowhere"})`
  );
}
// The relocated doors render exactly once each as a DoorRow (or,
// for plugins, exactly once as a door-list row): one door, one
// home, no duplicates left behind.
for (const drawer of ["layer", "neo", "friends", "call", "profile", "wallet", "shop", "ai-chat", "companion", "settings"]) {
  const n = (menu.match(new RegExp(`openPanel\\("${drawer}"\\)`, "g")) ?? []).length;
  ok(n === 1, `door renders exactly once: "${drawer}" (${n})`);
}
ok(
  (menu.match(/panel: "plugins"/g) ?? []).length === 1,
  "door renders exactly once: \"plugins\" (door-list row)"
);
ok(
  (menu.match(/panel: "studio"/g) ?? []).length === 3,
  "Studio's home presence is its three task rows in STUDIO (no duplicate plain door)"
);

// ------------------------------------------------------------ (3) no endless list
// Rendered door rows per section: direct <DoorRow> elements, plus
// the rows of a door-list map (counted by its panel: entries; the
// map's single <DoorRow> element is the renderer, not a row).
const renderedDoors = (block) => {
  const mapRows = (block.match(/panel: "/g) ?? []).length;
  let direct = (block.match(/<DoorRow/g) ?? []).length;
  if (mapRows > 0 && direct > 0) direct -= 1; // the map's renderer element
  return direct + mapRows;
};
let totalDoors = 0;
for (const name of ORDER) {
  const n = renderedDoors(blocks[name]);
  totalDoors += n;
  ok(n <= 6, `no endless list: ${name} renders ${n} door rows (bound: 6)`);
}
ok(totalDoors === 18, `doors distributed across the menu: 18 rendered DoorRows in total (got ${totalDoors})`);
const settingsDoors = (blocks["SETTINGS & HELP"].match(/<DoorRow/g) ?? []).length;
ok(settingsDoors === 1, `the old tail is short: SETTINGS & HELP holds exactly 1 door (got ${settingsDoors})`);
ok(
  blocks["SETTINGS & HELP"].includes('openPanel("settings")'),
  "the one door SETTINGS & HELP keeps is the Preferences panel"
);
ok(!/openPanel\("(profile|neo|layer|studio|plugins|companion|shop|call|wallet|friends|ai-chat)"\)/.test(blocks["SETTINGS & HELP"]), "no relocated door is still opened from SETTINGS & HELP");

// ------------------------------------------------------------ (3b) Slice 59's door
// The Find fabrics door is a sub-view door (like the profile
// cards), not a drawer: it renders exactly once, in PEOPLE, and
// the sub-view branch it opens exists. The host's side of
// discovery lives in PEOPLE too: the opt-in listing toggle and
// the join-requests card, both wired to the lobby service.
ok(
  (menu.match(/label="Find fabrics"/g) ?? []).length === 1,
  "Slice 59: the Find fabrics door renders exactly once"
);
ok(
  blocks["PEOPLE"].includes('label="Find fabrics"'),
  "Slice 59: the Find fabrics door's home is PEOPLE"
);
ok(
  menu.includes("findOpen ?") && menu.includes("<FindFabricsView"),
  "Slice 59: the Find door opens the FindFabricsView sub-view branch"
);
ok(
  (menu.match(/label="List my fabric"/g) ?? []).length === 1 &&
    blocks["PEOPLE"].includes('label="List my fabric"'),
  "Slice 59: the host's opt-in listing toggle lives once, in PEOPLE"
);
ok(
  menu.includes("lobbyService.setListed("),
  "Slice 59: the listing toggle drives the lobby service"
);
ok(
  blocks["PEOPLE"].includes("Requests to join") &&
    menu.includes("respondToRequest(r.requestId, true)") &&
    menu.includes("respondToRequest(r.requestId, false)"),
  "Slice 59: join requests are answered in PEOPLE (let in / not now)"
);
ok(
  menu.includes("lobbyService.setHostFields(") &&
    menu.includes("lobbyService.onEncounter(") &&
    menu.includes("FABRIC_GHOST_ENCOUNTER_EVENT"),
  "Slice 59: host fields follow the session and encounters reach the ghostie"
);

// ------------------------------------------------------------ (4) nothing unreachable
for (const drawer of [
  "NeoLocker", "LayerDrawer", "ProfileDrawer", "StudioDrawer", "PluginsDrawer",
  "CompanionDrawer", "ShopDrawer", "CallDrawer", "WalletDrawer", "FriendsDrawer",
  "SettingsDrawer", "AISettingsDrawer", "AIChatDrawer",
]) {
  ok(layout.includes(`<${drawer} />`), `drawer still mounted in _layout: ${drawer}`);
}

// ------------------------------------------------------------ (5) Slice 64: Vision AI re-homed to See
ok(
  blocks["AI SERVICES"].includes('label="See — the camera fabric"'),
  "Slice 64: the AI SERVICES row that was Vision AI now opens the See fabric"
);
ok(
  menu.includes('e.id === "sam-see"') && menu.includes("onFabricCard(see)"),
  "Slice 64: the See door routes through the session-authority card handler"
);
ok(
  !menu.includes('openPanel("vision-ai")'),
  "Slice 64: no drawer door for vision-ai remains anywhere in the menu"
);
ok(
  !layout.includes("VisionAIDrawer"),
  "Slice 64: the Vision AI drawer is not mounted (or imported) in _layout"
);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
