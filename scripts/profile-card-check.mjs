/**
 * profile-card-check — node unit check for Slice 21 ("Profile Cards").
 *
 * Proves, headlessly:
 * - the announce round-trip: extras built by the ONE builder
 *   survive a JSON wire pass and rebuild the same card; a legacy
 *   announce (name + hue only) builds a graceful card with no
 *   tag, no ghost, no badges;
 * - tag parity: the tag the builder puts on the wire is EXACTLY
 *   Ghostie Home's tag expression (deriveFdnaTag of the ghost
 *   seed, identity-seed fallback) — same function, same order;
 * - the own-card property: a card built from the announce object
 *   matches the payload field-for-field (what you see is what
 *   you send);
 * - the sanitizer: malformed tags, over-length names, unknown
 *   temperaments, junk badge ids, and non-object extras are
 *   dropped field-by-field without throwing and without taking
 *   the good fields down with them;
 * - the badge registry: all nine design badges resolve with a
 *   label, story, glyph, and hue; unknown ids resolve to null
 *   (the card renders them as a plain dot + id);
 * - send-action gating: the card's heart (a verb) and pet
 *   (strokes = draw) pass through the REAL fabricGate under the
 *   Slice 5 mode verdicts — the mode×rule spot matrix;
 * - the pet chain, live against GhostPeer: a sighting gives a
 *   position; strokes at that position register as remote pets
 *   on the owner's brain; with the owner's accept-pets setting
 *   off, they don't land at all;
 * - structural wiring (source-level): the menu dispatches the
 *   VerbBar's own FABRIC_VERB_EVENT for the heart and
 *   FABRIC_PET_GHOST_EVENT for the pet; the canvas answers the
 *   pet event through sendInteraction; the transport carries
 *   and sanitizes the extras; no file sends the seed anywhere.
 *
 * Run: esbuild src/identity/profile.ts --bundle --format=esm --outfile=/tmp/profile.mjs
 *      esbuild src/identity/fdna.ts --bundle --format=esm --outfile=/tmp/fdna.mjs
 *      esbuild src/session/fabricStore.ts --bundle --format=esm --outfile=/tmp/fabricStore.mjs
 *      esbuild src/ghost/GhostPeer.ts --bundle --format=esm --outfile=/tmp/GhostPeer.mjs
 *      node scripts/profile-card-check.mjs /tmp/profile.mjs /tmp/fdna.mjs \
 *        /tmp/fabricStore.mjs /tmp/GhostPeer.mjs
 * (run from the repo root so the structural reads resolve)
 */
import { readFileSync } from "node:fs";

const profile = await import(process.argv[2] ?? "/tmp/profile.mjs");
const fdna = await import(process.argv[3] ?? "/tmp/fdna.mjs");
const fabricStore = await import(process.argv[4] ?? "/tmp/fabricStore.mjs");
const peerMod = await import(process.argv[5] ?? "/tmp/GhostPeer.mjs");

const {
  buildAnnounceExtras,
  buildProfileCardData,
  sanitizePeerExtras,
  sanitizeBadgeIds,
  resolveFdnaTag,
  badgeInfo,
  BADGE_REGISTRY,
} = profile;
const { deriveFdnaTag } = fdna;
const { fabricGate } = fabricStore;
const { GhostPeer, ghostPeerIdFor } = peerMod;

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

/* ---------------- announce round-trip ---------------- */
console.log("== announce round-trip ==");
{
  const inputs = {
    ghostSeed: 123456789,
    identitySeed: 987654321,
    ghostName: "Boop",
    temperament: "playful",
    badges: ["heartfelt", "first-thread"],
    trail: "sparkle",
  };
  const extras = buildAnnounceExtras(inputs);
  const announce = {
    type: "peer-announce",
    from: "user-abc123",
    name: "Terrell",
    hue: 200,
    ...extras,
  };
  // The wire is JSON; nothing else about the trip is simulated.
  const wire = JSON.parse(JSON.stringify(announce));
  const card = buildProfileCardData({
    peerId: wire.from,
    isSelf: false,
    name: wire.name,
    hue: wire.hue,
    extras: wire,
    fabricLine: "On this room's fabric",
    roleLine: "Guest",
  });
  check("tag survives the wire", card.tag === extras.tag, card.tag ?? "null");
  check("ghost survives the wire", card.ghost?.name === "Boop" && card.ghost?.temperament === "playful");
  check("badges survive the wire", JSON.stringify(card.badges) === JSON.stringify(["heartfelt", "first-thread"]));
  check("trail survives the wire", card.trail === "sparkle");
  check("name + hue pass through", card.name === "Terrell" && card.hue === 200);
  // Own-card property: the card EQUALS the payload, field for field.
  check(
    "own card == broadcast payload",
    card.tag === announce.tag &&
      card.ghost?.name === announce.ghost.name &&
      card.ghost?.temperament === announce.ghost.temperament &&
      JSON.stringify(card.badges) === JSON.stringify(announce.badges) &&
      card.trail === announce.trail
  );
  // Wire size honesty: a fully-loaded announce stays small.
  const bytes = JSON.stringify(announce).length;
  check("fully-loaded announce is small", bytes < 320, `${bytes} bytes`);
  // The seed is never on the wire: the extras carry exactly four
  // possible keys, and no "seed" appears anywhere in the payload.
  check(
    "extras keys are exactly the public four",
    JSON.stringify(Object.keys(extras).sort()) ===
      JSON.stringify(["badges", "ghost", "tag", "trail"])
  );
  check("no seed anywhere in the announce payload", !JSON.stringify(announce).includes("seed"));
}

console.log("== legacy announce renders gracefully ==");
{
  const legacy = { type: "peer-announce", from: "user-old99", name: "Ash", hue: 120 };
  const card = buildProfileCardData({
    peerId: legacy.from,
    isSelf: false,
    name: legacy.name,
    hue: legacy.hue,
    extras: legacy,
    fabricLine: "On their own fabric",
    roleLine: "Here",
  });
  check(
    "legacy card: face intact, extras empty",
    card.name === "Ash" && card.hue === 120 && card.tag === null &&
      card.ghost === null && card.badges.length === 0 && card.trail === null
  );
}

/* ---------------- tag parity with Ghostie Home ---------------- */
console.log("== tag parity ==");
{
  // GhostieHome's exact expression: deriveFdnaTag(ghostSeed ?? identitySeed).
  let allMatch = true;
  for (const [g, i] of [
    [123456789, 987654321],
    [42, 42],
    [0, 7],
    [4294967295, 1],
    [null, 987654321],
    [null, 0],
  ]) {
    const homeTag = deriveFdnaTag(g ?? i);
    if (resolveFdnaTag(g, i) !== homeTag) allMatch = false;
    if (buildAnnounceExtras({
      ghostSeed: g, identitySeed: i, ghostName: null, temperament: null, badges: [], trail: null,
    }).tag !== homeTag) allMatch = false;
  }
  check("announce tag == Home tag, every seed pair", allMatch);
  check(
    "tag shape is the FBR alphabet",
    /^FBR-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(resolveFdnaTag(123, 456))
  );
  check(
    "different ghost seeds → different tags",
    resolveFdnaTag(111, 999) !== resolveFdnaTag(222, 999)
  );
}

/* ---------------- sanitizer ---------------- */
console.log("== sanitizer ==");
{
  const s = sanitizePeerExtras({
    tag: "FBR-0000-OOOO", // forbidden alphabet chars
    ghost: { name: "Boop", temperament: "playful" },
    badges: ["heartfelt"],
    trail: "sparkle",
  });
  check("bad-alphabet tag dropped, rest kept", !s.tag && s.ghost?.name === "Boop" && s.badges?.length === 1 && s.trail === "sparkle");
  const s2 = sanitizePeerExtras({ tag: "fbr-abcd-efgh" });
  check("lowercase tag dropped (case matters)", !s2.tag);
  const s3 = sanitizePeerExtras({ ghost: { name: "X".repeat(100), temperament: "evil" } });
  check("ghost name capped at 40", s3.ghost?.name.length === 40);
  check("unknown temperament dropped, name kept", s3.ghost && !("temperament" in s3.ghost));
  check(
    "badge ids normalized + deduped + junk dropped",
    JSON.stringify(sanitizeBadgeIds(["Heartfelt", "bad id!", 42, "heartfelt", "ok-id"])) ===
      JSON.stringify(["heartfelt", "ok-id"]),
    JSON.stringify(sanitizeBadgeIds(["Heartfelt", "bad id!", 42, "heartfelt", "ok-id"]))
  );
  check(
    "badge list capped",
    sanitizeBadgeIds(Array.from({ length: 40 }, (_, i) => `badge-${i}`)).length === 24
  );
  check("non-object extras → {}", JSON.stringify(sanitizePeerExtras("junk")) === "{}" && JSON.stringify(sanitizePeerExtras(null)) === "{}");
  const card = buildProfileCardData({
    peerId: "user-x", isSelf: false, name: "N", hue: 725, extras: null,
    fabricLine: "f", roleLine: null,
  });
  check("hue 725 normalizes to 5", card.hue === 5);
  const card2 = buildProfileCardData({
    peerId: "user-x", isSelf: false, name: "N", hue: Number.NaN, extras: undefined,
    fabricLine: "f", roleLine: null,
  });
  check("NaN hue → null (no card crash)", card2.hue === null);
}

/* ---------------- badge registry ---------------- */
console.log("== badge registry ==");
{
  const designIds = [
    "first-thread", "heartfelt", "good-host", "composer", "pattern-mind",
    "pet-whisperer", "stage-presence", "night-owl", "first-light",
  ];
  check(
    "all nine design badges resolve",
    designIds.every((id) => {
      const b = badgeInfo(id);
      return b && b.label && b.story && ["ring", "dot", "ringDot", "diamond", "bars"].includes(b.glyph) &&
        typeof b.hue === "number";
    })
  );
  check("registry size is nine", Object.keys(BADGE_REGISTRY).length === 9);
  check("unknown id → null (dot fallback at render)", badgeInfo("some-future-badge") === null);
}

/* ---------------- send-action gating (mode × rule spots) ---------------- */
console.log("== card actions under the real fabricGate ==");
{
  // modeCanSend values are computeCanSend's documented truth table
  // (Slice 5): open/collab → true; mirror/view guest → false;
  // control non-driver → false; host → true. The gate itself is
  // the production fabricGate — the same function the funnel runs.
  const rules = (verbs, draw) => ({ verbs, draw, notes: true });
  const cases = [
    // [label, gateArgs, kind, expected]
    ["collab guest, verbs on → heart sends", { modeCanSend: true, role: "guest", rules: rules(true, true) }, "verbs", true],
    ["collab guest, verbs OFF → heart held", { modeCanSend: true, role: "guest", rules: rules(false, true) }, "verbs", false],
    ["collab guest, verbs OFF → pet (draw) still sends", { modeCanSend: true, role: "guest", rules: rules(false, true) }, "draw", true],
    ["collab guest, draw OFF → pet held", { modeCanSend: true, role: "guest", rules: rules(true, false) }, "draw", false],
    ["view guest → heart held by mode alone", { modeCanSend: false, role: "guest", rules: rules(true, true) }, "verbs", false],
    ["view guest → pet held by mode alone", { modeCanSend: false, role: "guest", rules: rules(true, true) }, "draw", false],
    ["mirror guest → heart held by mode alone", { modeCanSend: false, role: "guest", rules: rules(true, true) }, "verbs", false],
    ["control non-driver → heart held by mode alone", { modeCanSend: false, role: "guest", rules: rules(true, true) }, "verbs", false],
    ["host, verbs OFF (own rules) → heart still sends", { modeCanSend: true, role: "host", rules: rules(false, false) }, "verbs", true],
    ["open room, no rules → heart sends", { modeCanSend: true, role: "open", rules: null }, "verbs", true],
    ["guest, no rules stated → mode verdict stands", { modeCanSend: true, role: "guest", rules: null }, "draw", true],
  ];
  for (const [label, args, kind, expected] of cases) {
    check(label, fabricGate({ ...args, kind }) === expected);
  }
}

/* ---------------- the pet chain, live ---------------- */
console.log("== pet chain (GhostPeer) ==");
{
  const mkPeer = (name, seed) => {
    const peer = new GhostPeer({
      peerId: ghostPeerIdFor(name),
      identity: { seed, hue: 200 },
      injectLocal: () => {},
      broadcast: () => {},
      ghostName: name,
    });
    return peer;
  };
  const stroke = (userId, x, y) => ({
    userId, position: { x, y }, force: { x: 0, y: 0 },
    pressure: 0.55, timestamp: Date.now(),
  });

  // The viewer-side brain senses the visiting ghost and can aim.
  const viewer = mkPeer("viewer", 777);
  viewer.noteGhostSighting({
    userId: ghostPeerIdFor("bob"), position: { x: 0.3, y: 0.4 },
    force: { x: 0, y: 0 }, pressure: 0.5, timestamp: Date.now(),
  });
  const pos = viewer.otherGhostPosition(ghostPeerIdFor("bob"));
  check("sighting → position known", pos?.x === 0.3 && pos?.y === 0.4, JSON.stringify(pos));
  check("unseen ghost → null position", viewer.otherGhostPosition(ghostPeerIdFor("nobody")) === null);
  viewer.destroy();

  // The owner-side brain: strokes at its ghost's spot land as
  // remote pets (its ghost rests at 0.5, 0.42 from birth).
  const owner = mkPeer("bob", 1234);
  for (let k = 0; k < 3; k++) owner.noteInteraction(stroke("user-abc123", 0.5, 0.42), "remote");
  check(
    "card-style strokes land as remote pets",
    owner.buildScenario().pets_in_last_5s >= 1,
    `pets=${owner.buildScenario().pets_in_last_5s}`
  );
  owner.destroy();

  // …unless the primary turned remote pets off.
  const guarded = mkPeer("carol", 1234);
  guarded.setSharedSettings({ socialize: true, acceptRemotePets: false, followHostFabric: true });
  for (let k = 0; k < 3; k++) guarded.noteInteraction(stroke("user-abc123", 0.5, 0.42), "remote");
  check(
    "accept-pets OFF → nothing lands",
    guarded.buildScenario().pets_in_last_5s === 0,
    `pets=${guarded.buildScenario().pets_in_last_5s}`
  );
  guarded.destroy();
}

/* ---------------- structural wiring ---------------- */
console.log("== structural wiring ==");
{
  const menu = readFileSync("app/components/fabric/FabricMenu.tsx", "utf8");
  const card = readFileSync("app/components/fabric/ProfileCard.tsx", "utf8");
  const fluid = readFileSync("src/components/fluid/LegacyFluid.tsx", "utf8");
  const transport = readFileSync("src/hooks/useFluidMultiUser.ts", "utf8");
  const profileSrc = readFileSync("src/identity/profile.ts", "utf8");

  check("menu heart = the VerbBar's event", menu.includes("FABRIC_VERB_EVENT") && menu.includes('detail: "heart"'));
  check("menu pet dispatches the pet event with the peer id", menu.includes("FABRIC_PET_GHOST_EVENT") && menu.includes("detail: profilePeerId"));
  check("canvas answers pet event through the funnel", fluid.includes("FABRIC_PET_GHOST_EVENT") && fluid.includes("otherGhostPosition") && fluid.includes("sendRef.current(interaction)"));
  check("own card built from buildAnnounceExtras", menu.includes("buildAnnounceExtras") && menu.includes("THIS IS WHAT THE ROOM SEES"));
  check("roster rows open cards", menu.includes("setProfilePeerId(pid)"));
  check("transport announces the extras", transport.includes("buildAnnounceExtras") && transport.includes("type: \"peer-announce\""));
  check("transport sanitizes received extras", transport.includes("sanitizePeerExtras(msg)"));
  check("transport prunes profile extras with presence", transport.includes("prunePeerProfiles(ids)"));
  check("card renders no transport calls", !/sendInteraction|postRef|postViaCurrent/.test(card));
  check("profile module derives via fdna only", profileSrc.includes('from "./fdna"') && profileSrc.includes("deriveFdnaTag"));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
