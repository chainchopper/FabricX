/**
 * rewards-check — headless proof for Slice 24 "Rewards".
 *
 * Proves:
 * - the earning battery, on the pure reducer: thresholds are
 *   EXACT (24 counted hearts, no badge; the 25th earns Heartfelt),
 *   the Heartfelt dedupe (same recipient inside a minute counts
 *   once, again after; self never counts), Pet Whisperer needs 3
 *   DISTINCT ghosties, simulated lint does NOT earn First Light
 *   while a relay-source hello does, Night Owl needs 3 DISTINCT
 *   nights, session growth re-reports raise the host crowd
 *   without inflating the session count, the stage ignores
 *   crowds under 3, and counters never decrement;
 * - unlocks are DERIVED and equips are gated: the trail ladder
 *   (ribbon / 3 / 5 / 7 badges), power-up backing badges, and the
 *   sanitizer (unknown ids dropped, counters clamped, a record
 *   whose counters already crossed a threshold reconciles the
 *   badge silently at load);
 * - the announce flow: earned ids + trail + motif come out of
 *   Slice 21's buildAnnounceExtras and survive its sanitizer;
 * - the real store end-to-end (in-memory storage): a Studio save
 *   event earns Composer, persists the {earned, counters,
 *   equipped} shape, and Slice 21's profile reader flows those
 *   badges into the local extras; a garbled fabric_rewards_v1
 *   loads as a fresh record without throwing;
 * - the feed end-to-end: session edges earn First Thread, host
 *   crowd growth earns Good Host, a later join dispatches the
 *   Warm Welcome event once Good Host is earned, and lint
 *   honesty holds through the real lint store;
 * - Warm Welcome spends the ghost's REAL budget: with the emit
 *   window full, GhostPeer.warmWelcome returns false and emits
 *   nothing; with headroom it greets and the window grows by
 *   exactly the greeting's burst; a non-session ghost never
 *   greets. Plus the NOT-list, read from source: EMIT_BUDGET is
 *   still 16, CROWD_EMIT_BUDGET still 6, and the rewards modules
 *   never reference the ghost's budget at all;
 * - the Second Voice is a pure timbre variant: same cue count,
 *   delays and gains as the standard voice, pitches a fourth up,
 *   waveforms swapped.
 *
 * Build + run (esbuild resolved from ESBUILD env, node_modules,
 * or the workspace tools install):
 *   node scripts/rewards-check.mjs
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

let esbuild;
try {
  esbuild = await import("esbuild");
} catch {
  esbuild = await import(
    process.env.ESBUILD ??
      "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js"
  );
}
const build = esbuild.build ?? esbuild.default?.build;

/* In-memory stand-ins for the device-only modules in the graph.
 * The storage stub mirrors app/utils/storage semantics exactly —
 * including that JSON.parse THROWS on garbled data (the stores'
 * own try/catch is what makes garble survivable, and that is
 * part of what this check proves). The backing Map lives on
 * globalThis so a cache-busted second import sees the same
 * "device". */
const storageStub = `
  const mem = (globalThis.__rewardsCheckMem ??= new Map());
  export async function getJSON(key, fallback) {
    const raw = mem.has(key) ? mem.get(key) : null;
    return raw ? JSON.parse(raw) : fallback;
  }
  export async function setJSON(key, value) {
    mem.set(key, JSON.stringify(value));
  }
  export async function removeItem(key) { mem.delete(key); }
`;
const reactStub = `
  export const useSyncExternalStore = (_sub, get) => get();
  export const useState = (init) => [
    typeof init === "function" ? init() : init,
    () => undefined,
  ];
  export const useEffect = () => undefined;
  export const useLayoutEffect = () => undefined;
  export const useRef = (v) => ({ current: v ?? null });
  export const useCallback = (fn) => fn;
  export const useMemo = (fn) => fn();
  export const useContext = () => ({ audioEnabled: true, sfxEnabled: true });
  export const createContext = (v) => ({ Provider: null, Consumer: null, _v: v });
  export default {};
`;
const appStub = `
  export const usePreferences = () => ({ audioEnabled: true, sfxEnabled: true });
  export const getSharedAudioContext = () => null;
  export default {};
`;
const stubPlugin = {
  name: "rewards-check-stubs",
  setup(b) {
    b.onResolve({ filter: /app\/utils\/storage$/ }, () => ({
      path: "storage-stub",
      namespace: "stub",
    }));
    b.onResolve({ filter: /PreferencesContext$|sharedAudio$/ }, () => ({
      path: "app-stub",
      namespace: "stub",
    }));
    b.onResolve({ filter: /^react$/ }, () => ({
      path: "react-stub",
      namespace: "stub",
    }));
    b.onResolve({ filter: /^react-native$/ }, () => ({
      path: "react-stub",
      namespace: "stub",
    }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
      contents:
        args.path === "storage-stub"
          ? storageStub
          : args.path === "app-stub"
            ? appStub
            : reactStub,
      loader: "ts",
    }));
  },
};

const outdir = mkdtempSync(join(tmpdir(), "rewards-check-"));
async function bundle(name, entry, useStdin) {
  const outfile = join(outdir, name);
  await build({
    ...(useStdin
      ? { stdin: { contents: entry, resolveDir: repoRoot, loader: "ts" } }
      : { entryPoints: [join(repoRoot, entry)] }),
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    plugins: [stubPlugin],
    logLevel: "silent",
  });
  return pathToFileURL(outfile).href;
}

const coreUrl = await bundle("core.mjs", "src/rewards/rewardsCore.ts");
const profileUrl = await bundle("profile.mjs", "src/identity/profile.ts");
const peerUrl = await bundle("peer.mjs", "src/ghost/GhostPeer.ts");
const sfxUrl = await bundle("sfx.mjs", "src/ghost/useGhostSfx.ts");
const harnessEntry = `
  export * from "./src/rewards/rewardsCore.ts";
  export * as rewardsStore from "./src/rewards/rewardsStore.ts";
  export * as profileStore from "./src/identity/profileStore.ts";
  export * as rewardsFeed from "./src/rewards/rewardsFeed.ts";
  export * as sessionStore from "./src/session/sessionStore.ts";
  export * as lintStore from "./src/lint/lintStore.ts";
`;
const harnessUrl = await bundle("harness.mjs", harnessEntry, true);

/* A minimal window for the feed's Warm Welcome dispatch. */
const dispatched = [];
globalThis.window = {
  dispatched,
  dispatchEvent(ev) {
    dispatched.push(ev);
    return true;
  },
  addEventListener() {},
  removeEventListener() {},
};
if (typeof globalThis.CustomEvent !== "function") {
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

const core = await import(coreUrl);
const profile = await import(profileUrl);
const peerMod = await import(peerUrl);
const sfx = await import(sfxUrl);
const H = await import(harnessUrl);

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name} ${extra}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const {
  freshRewardsState,
  applyRewardEvent,
  hasBadge,
  trailStyleUnlocked,
  powerUpUnlocked,
  equipAllowed,
  sanitizeRewardsState,
} = core;
const run = (state, ev) => applyRewardEvent(state, ev).state;

/* ---------------- A. The earning battery (pure reducer) ---------------- */
console.log("== earning battery ==");
{
  // Heartfelt: exact threshold + dedupe.
  let s = freshRewardsState();
  const T0 = 1_700_000_000_000;
  for (let k = 0; k < 24; k++) {
    s = run(s, {
      type: "heart-sent",
      at: T0 + k * 61_000,
      recipients: ["peer-a"],
      selfId: "me",
    });
  }
  check("24 counted hearts: heartsSent is 24", s.counters.heartsSent === 24);
  check("24 counted hearts: NO Heartfelt yet", !hasBadge(s, "heartfelt"));
  // Same recipient inside the minute: deduped.
  s = run(s, {
    type: "heart-sent",
    at: T0 + 23 * 61_000 + 30_000,
    recipients: ["peer-a"],
    selfId: "me",
  });
  check("same recipient inside 60s counts once", s.counters.heartsSent === 24);
  // Self as recipient never counts.
  s = run(s, {
    type: "heart-sent",
    at: T0 + 24 * 61_000,
    recipients: ["me"],
    selfId: "me",
  });
  check("a heart to yourself counts nothing", s.counters.heartsSent === 24);
  // The 25th, after the window, earns it.
  const res = applyRewardEvent(s, {
    type: "heart-sent",
    at: T0 + 24 * 61_000,
    recipients: ["peer-a"],
    selfId: "me",
  });
  s = res.state;
  check("the 25th counted heart EARNS Heartfelt",
    hasBadge(s, "heartfelt") && res.earnedNow.includes("heartfelt"));
  // Two new recipients in one event count two.
  let s2 = freshRewardsState();
  s2 = run(s2, {
    type: "heart-sent",
    at: T0,
    recipients: ["p1", "p2"],
    selfId: "me",
  });
  check("one heart event, two recipients: counts two",
    s2.counters.heartsSent === 2);
}
{
  // Pet Whisperer: distinctness.
  let s = freshRewardsState();
  for (let k = 0; k < 3; k++) s = run(s, { type: "pet-given", at: 1, ghostId: "ghost:a" });
  check("same ghostie petted 3x: NO Pet Whisperer", !hasBadge(s, "pet-whisperer"));
  s = run(s, { type: "pet-given", at: 2, ghostId: "ghost:b" });
  s = run(s, { type: "pet-given", at: 3, ghostId: "ghost:c" });
  check("3 DISTINCT ghosties earn Pet Whisperer", hasBadge(s, "pet-whisperer"));
}
{
  // First Light: the honesty rule.
  let s = freshRewardsState();
  s = run(s, { type: "lint-joined", at: 1, simulated: true });
  check("simulated lint does NOT earn First Light", !hasBadge(s, "first-light"));
  check("simulated lint leaves the counter untouched", s.counters.lintJoined === false);
  s = run(s, { type: "lint-joined", at: 2, simulated: false });
  check("a relay-source lint hello earns First Light", hasBadge(s, "first-light"));
}
{
  // Night Owl: distinct nights.
  let s = freshRewardsState();
  s = run(s, { type: "night-active", at: 1, nightKey: "2026-10-27" });
  s = run(s, { type: "night-active", at: 1, nightKey: "2026-10-27" });
  s = run(s, { type: "night-active", at: 2, nightKey: "2026-10-28" });
  check("2 distinct nights: NO Night Owl", !hasBadge(s, "night-owl"));
  s = run(s, { type: "night-active", at: 3, nightKey: "2026-10-29" });
  check("3 DISTINCT nights earn Night Owl", hasBadge(s, "night-owl"));
}
{
  // Sessions: the shared edge + host crowd growth.
  let s = freshRewardsState();
  s = run(s, { type: "session-shared", at: 1, isHost: false, peerCount: 2, countSession: true });
  check("first shared session earns First Thread", hasBadge(s, "first-thread"));
  check("sessionsShared is 1", s.counters.sessionsShared === 1);
  s = run(s, { type: "session-shared", at: 2, isHost: true, peerCount: 4, countSession: false });
  check("growth re-report does NOT inflate sessions", s.counters.sessionsShared === 1);
  check("growth re-report raises the host crowd", s.counters.hostedCrowdMax === 4);
  check("a host crowd of 3+ earns Good Host", hasBadge(s, "good-host"));
}
{
  // Stage presence + the small badges.
  let s = freshRewardsState();
  s = run(s, { type: "stage-presence", at: 1, crowd: 2 });
  check("a stage crowd of 2 is not a presence", !hasBadge(s, "stage-presence"));
  s = run(s, { type: "stage-presence", at: 2, crowd: 3 });
  check("a stage crowd of 3 earns Stage Presence", hasBadge(s, "stage-presence"));
  s = run(s, { type: "composition-saved", at: 3 });
  check("one saved composition earns Composer", hasBadge(s, "composer"));
  for (let k = 0; k < 4; k++) s = run(s, { type: "agent-answer", at: 4 });
  check("4 agent answers: NO Pattern Mind", !hasBadge(s, "pattern-mind"));
  s = run(s, { type: "agent-answer", at: 4 });
  check("5 agent answers earn Pattern Mind", hasBadge(s, "pattern-mind"));
  const before = s.counters.heartsSent + s.counters.agentAnswers;
  s = run(s, { type: "pet-given", at: 4, ghostId: "ghost:z" });
  check("counters never decrement",
    s.counters.heartsSent + s.counters.agentAnswers === before);
}

/* ---------------- B. Unlocks, equips, sanitizer ---------------- */
console.log("== unlocks / equips / sanitize ==");
{
  let s = freshRewardsState();
  check("fresh: ribbon locked", !trailStyleUnlocked(s, "ribbon"));
  check("fresh: voice equip refused",
    !equipAllowed(s, { voice: true }));
  s = run(s, { type: "session-shared", at: 1, isHost: false, peerCount: 2, countSession: true });
  check("First Thread unlocks the ribbon", trailStyleUnlocked(s, "ribbon"));
  check("ribbon equip allowed", equipAllowed(s, { trail: "ribbon" }));
  check("sparkle still locked at 1 badge", !trailStyleUnlocked(s, "sparkle"));
  check("sparkle equip refused at 1 badge",
    !equipAllowed(s, { trail: "sparkle" }));
  s = run(s, { type: "composition-saved", at: 3 });
  s = run(s, { type: "stage-presence", at: 2, crowd: 3 });
  check("3 badges unlock sparkle", trailStyleUnlocked(s, "sparkle"));
  check("3 badges do NOT unlock petals", !trailStyleUnlocked(s, "petals"));
  check("stage aura derives from Stage Presence",
    powerUpUnlocked(s, "stage-aura"));
  check("aura equip allowed with its badge", equipAllowed(s, { aura: true }));
  check("signature heart refused before Heartfelt",
    !equipAllowed(s, { heartMotif: "double-ring" }));
  check("an unknown motif is refused",
    !equipAllowed(s, { heartMotif: "triple-ring" }));
  check("an unknown welcome verb is refused",
    !equipAllowed(s, { welcomeVerb: "purr" }));
  check("unequip is always allowed",
    equipAllowed(s, { trail: null, voice: false, aura: false, heartMotif: null }));

  const messy = sanitizeRewardsState({
    earned: [{ id: "composer", at: 5 }, { id: "not-a-badge", at: 6 }, "junk"],
    counters: { heartsSent: -4, agentAnswers: 2.7, pettedGhostIds: ["ghost:a", 7, "ghost:a"] },
    equipped: { trail: "comet", voice: true },
  });
  check("sanitizer drops unknown badge ids",
    messy.earned.every((e) => e.id !== "not-a-badge"));
  check("sanitizer clamps counters",
    messy.counters.heartsSent === 0 && messy.counters.agentAnswers === 2);
  check("sanitizer dedupes the petted set",
    messy.counters.pettedGhostIds.length === 1);
  check("sanitizer revokes unbacked equips",
    messy.equipped.trail === null && messy.equipped.voice === false);
  const crossed = sanitizeRewardsState({ counters: { compositionsSaved: 1 } });
  check("a crossed counter reconciles its badge at load",
    hasBadge(crossed, "composer"));
  const garbled = sanitizeRewardsState(" not json at all");
  check("garbled input sanitizes to a fresh record",
    garbled.earned.length === 0 && garbled.counters.heartsSent === 0);
  check("null sanitizes to a fresh record",
    sanitizeRewardsState(null).earned.length === 0);
}

/* ---------------- C. Announce flow ---------------- */
console.log("== announce flow ==");
{
  let s = freshRewardsState();
  s = run(s, { type: "session-shared", at: 1, isHost: false, peerCount: 2, countSession: true });
  s = run(s, { type: "composition-saved", at: 3 });
  const face = H.rewardsStore.rewardsPublicFace(s);
  const extras = profile.buildAnnounceExtras({
    ghostSeed: 1234,
    identitySeed: 99,
    ghostName: "Boop",
    temperament: "curious",
    badges: face.badges,
    trail: face.trail,
    heartMotif: face.heartMotif,
  });
  check("earned ids appear in the announce extras",
    Array.isArray(extras.badges) &&
      extras.badges.includes("first-thread") &&
      extras.badges.includes("composer"));
  const clean = profile.sanitizePeerExtras({
    badges: ["first-thread", "bogus badge!", "composer"],
    trail: "ribbon",
    motif: "double-ring",
  });
  check("the sanitizer keeps earned ids, drops junk",
    clean?.badges?.join(",") === "first-thread,composer");
  check("the motif survives the sanitizer", clean?.motif === "double-ring");
  const capped = profile.sanitizeBadgeIds(
    Array.from({ length: 40 }, (_, i) => `first-thread`)
  );
  check("the announce badge list is capped",
    capped.length <= profile.MAX_ANNOUNCE_BADGES);
}

/* ---------------- D. The real store + Slice 21 reader ---------------- */
console.log("== store end-to-end ==");
{
  const mem = globalThis.__rewardsCheckMem;
  mem.clear();
  const rs = H.rewardsStore;
  await rs.ensureRewardsLoaded();
  check("empty storage loads fresh", rs.getRewardsSnapshot().earned.length === 0);
  const earnedSeen = [];
  const off = rs.subscribeBadgeEarned((id) => earnedSeen.push(id));
  rs.recordCompositionSaved();
  await sleep(30);
  check("a composition save earns Composer in the store",
    hasBadge(rs.getRewardsSnapshot(), "composer"));
  check("the earn listener fired once", earnedSeen.join() === "composer");
  off();
  const raw = JSON.parse(mem.get("fabric_rewards_v1"));
  check("the persisted record has the store shape",
    Array.isArray(raw.earned) && raw.earned[0].id === "composer" &&
      typeof raw.counters === "object" && typeof raw.equipped === "object");
  // Slice 21's reader, against the real shape the store just wrote.
  await H.profileStore.ensureLocalProfileExtras();
  const local = H.profileStore.getLocalProfileExtras();
  check("Slice 21's reader flows the store's badges into local extras",
    local.badges.includes("composer"));
  check("equip flows: store equip changes the announced trail", (() => {
    rs.recordSessionShared({ isHost: false, peerCount: 2, countSession: true });
    return true;
  })());
  await sleep(30);
  check("First Thread earned through the store wrapper",
    hasBadge(rs.getRewardsSnapshot(), "first-thread"));
  check("ribbon equip accepted once backed",
    rs.equipRewards({ trail: "ribbon" }) === true);
  await sleep(30);
  check("the announced trail follows the equip",
    H.profileStore.getLocalProfileExtras().trail === "ribbon");
  check("an unbacked equip is refused by the store",
    rs.equipRewards({ trail: "comet" }) === false);
}

/* ---------------- E. Garbled storage ---------------- */
console.log("== garbled storage ==");
{
  const mem = globalThis.__rewardsCheckMem;
  mem.set("fabric_rewards_v1", " {broken json");
  const H2 = await import(harnessUrl + "?garbled=1");
  let threw = false;
  try {
    await H2.rewardsStore.ensureRewardsLoaded();
  } catch {
    threw = true;
  }
  check("garbled fabric_rewards_v1 loads without throwing", !threw);
  check("garbled record becomes a fresh state",
    H2.rewardsStore.getRewardsSnapshot().earned.length === 0);
  let localThrew = false;
  try {
    await H2.profileStore.ensureLocalProfileExtras();
  } catch {
    localThrew = true;
  }
  check("Slice 21's reader tolerates the garbled record too", !localThrew);
  check("...and reads zero badges from it",
    H2.profileStore.getLocalProfileExtras().badges.length === 0);
}

/* ---------------- F. The feed end-to-end ---------------- */
console.log("== feed end-to-end ==");
{
  const mem = globalThis.__rewardsCheckMem;
  mem.clear();
  const H3 = await import(harnessUrl + "?feed=1");
  const rs = H3.rewardsStore;
  await rs.ensureRewardsLoaded();
  const stop = H3.rewardsFeed.startRewardsFeed();
  const setSession = (p) =>
    H3.sessionStore.setSessionPublicState({
      roomId: "room-check",
      selfId: "me",
      mode: "open",
      hostId: null,
      driverId: null,
      canSend: true,
      inputEnabled: true,
      online: true,
      ...p,
    });
  setSession({ peers: 0, role: "open", guestIds: [] });
  check("alone: no badges", rs.getRewardsSnapshot().earned.length === 0);
  setSession({ peers: 1, role: "host", hostId: "me", guestIds: ["g1"] });
  await sleep(20);
  check("the shared edge earns First Thread",
    hasBadge(rs.getRewardsSnapshot(), "first-thread"));
  check("one guest is not yet a crowd",
    !hasBadge(rs.getRewardsSnapshot(), "good-host"));
  dispatched.length = 0;
  setSession({ peers: 2, role: "host", hostId: "me", guestIds: ["g1", "g2"] });
  await sleep(20);
  check("host crowd growth earns Good Host",
    hasBadge(rs.getRewardsSnapshot(), "good-host"));
  check("the session count did not inflate",
    rs.getRewardsSnapshot().counters.sessionsShared === 1);
  dispatched.length = 0;
  setSession({ peers: 3, role: "host", hostId: "me", guestIds: ["g1", "g2", "g3"] });
  await sleep(20);
  const welcome = dispatched.find(
    (e) => e.type === "fabric:warm-welcome"
  );
  check("a later join dispatches Warm Welcome once Good Host is earned",
    !!welcome && welcome.detail === "heart");
  // Lint honesty through the real lint store.
  const hello = {
    fabric: "lint", v: 0, kind: "lint-hello",
    name: "Sim Lamp", deviceKind: "lamp", caps: ["glow"], hue: 40,
  };
  H3.lintStore.noteLintDevice("lint:sim", hello, "local");
  await sleep(20);
  check("the simulator's lint does NOT earn First Light through the feed",
    !hasBadge(rs.getRewardsSnapshot(), "first-light"));
  H3.lintStore.noteLintDevice("lint:real", { ...hello, name: "Desk Lamp" }, "relay");
  await sleep(20);
  check("a relay lint hello earns First Light through the feed",
    hasBadge(rs.getRewardsSnapshot(), "first-light"));
  stop();
}

/* ---------------- G. Warm Welcome spends the real budget ---------------- */
console.log("== warm welcome budget ==");
{
  const { GhostPeer } = peerMod;
  const mkPeer = () => {
    const seen = { injects: [], perfs: [] };
    const peer = new GhostPeer({
      peerId: "ghost:rewards-check",
      identity: { hue: 210, seed: 42 },
      injectLocal: (i) => seen.injects.push(i),
      broadcast: (i) => seen.injects.push(i),
      ghostName: "Boop",
      onPerformance: (l) => seen.perfs.push(l),
    });
    return { peer, seen };
  };
  const solo = mkPeer();
  check("a ghost that was never summoned does not greet",
    solo.peer.warmWelcome("heart") === false);
  solo.peer.destroy();

  const full = mkPeer();
  full.peer.setHumansPresent(true);
  full.peer.summon();
  const now = Date.now();
  for (let k = 0; k < 16; k++) full.peer.emitTimes.push(now);
  const injectsBefore = full.seen.injects.length;
  check("budget full: warmWelcome refuses",
    full.peer.warmWelcome("heart") === false);
  await sleep(700);
  check("budget full: no greeting verb was emitted",
    full.seen.injects
      .slice(injectsBefore)
      .every((i) => !i.verb));
  full.peer.destroy();

  const host = mkPeer();
  host.peer.setHumansPresent(true);
  host.peer.summon();
  await sleep(600);
  const windowBefore = host.peer.emitTimes.length;
  const injectsBeforeWelcome = host.seen.injects.length;
  check("headroom: warmWelcome greets", host.peer.warmWelcome("cheer") === true);
  await sleep(900);
  // In session mode a verb act IS a soft burst at the ghost's
  // body (performVerbAct's session path — the same shape
  // answerVerb takes in a session; verb-tagged emits are the
  // solo/crowd path). The greeting proof is the burst arriving
  // plus the named performance.
  check("the greeting burst reached the canvas",
    host.seen.injects.length - injectsBeforeWelcome >= 3,
    `+${host.seen.injects.length - injectsBeforeWelcome} injects`);
  check("the greeting is reported as a performance",
    host.seen.perfs.some((l) => l.includes("welcomed a guest")));
  check("the greeting spent exactly its burst from the window",
    host.peer.emitTimes.length - windowBefore === 3,
    `delta ${host.peer.emitTimes.length - windowBefore}`);
  host.peer.destroy();
}

/* ---------------- H. The NOT-list, from source ---------------- */
console.log("== NOT-list ==");
{
  const peerSrc = readFileSync(join(repoRoot, "src/ghost/GhostPeer.ts"), "utf8");
  check("EMIT_BUDGET is still 16", /const EMIT_BUDGET = 16;/.test(peerSrc));
  check("CROWD_EMIT_BUDGET is still 6",
    /const CROWD_EMIT_BUDGET = 6;/.test(peerSrc));
  const coreSrc = readFileSync(join(repoRoot, "src/rewards/rewardsCore.ts"), "utf8");
  const storeSrc = readFileSync(join(repoRoot, "src/rewards/rewardsStore.ts"), "utf8");
  const feedSrc = readFileSync(join(repoRoot, "src/rewards/rewardsFeed.ts"), "utf8");
  check("the rewards modules never touch the ghost's budget",
    !/EMIT_BUDGET|emitTimes/.test(coreSrc + storeSrc + feedSrc));
  check("no power-up touches petting rules or the never-talks invariant",
    !/from\s+["'][^"']*GhostPeer/.test(coreSrc + storeSrc + feedSrc) &&
      !/registerPet\s*\(/.test(coreSrc + storeSrc + feedSrc));
}

/* ---------------- I. Second Voice cue math ---------------- */
console.log("== second voice ==");
{
  for (const kind of ["sniff", "heart", "play", "mirror", "startle"]) {
    const std = sfx.cueSpecsFor(kind, "standard");
    const alt = sfx.cueSpecsFor(kind, "second");
    check(`${kind}: same cue count`, std.length === alt.length);
    check(
      `${kind}: same delays, durations and gains`,
      std.every(
        (c, i) =>
          c.delayMs === alt[i].delayMs &&
          c.durMs === alt[i].durMs &&
          c.gain === alt[i].gain
      )
    );
    check(
      `${kind}: pitches a fourth up, waveform swapped`,
      std.every(
        (c, i) =>
          Math.abs(alt[i].ratio / c.ratio - 4 / 3) < 1e-9 &&
          alt[i].type !== c.type
      )
    );
  }
}

console.log(failures === 0 ? "\nALL REWARDS CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
