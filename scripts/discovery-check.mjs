/**
 * discovery-check — behavioral check for Slice 59 ("finding
 * people": session discovery + request-to-join).
 *
 * Terrell's ground truth before this slice: joining was
 * invite-link only and NO discovery existed. This check proves,
 * headlessly, the whole shape of what was built:
 *
 *  (1) UNLISTED = SILENT. A client holding a lobby seat without
 *      listing puts zero frames on the wire and shows nobody
 *      anything (the MicroDuck rule: consent first, default off).
 *  (2) LISTING FIELDS COMPLETE. A listed host's beacon sanitizes
 *      into a full row — fabric, host, participants, mode,
 *      ghostie, badges, secure tag — and malformed beacons
 *      (missing tag, bad mode, zero participants) are rejected.
 *  (3) HEARTBEAT / LAST-SEEN MATH. activityLabel boundaries,
 *      the Active-now window (5 min), and listing expiry at the
 *      TTL — all from the pure protocol core.
 *  (4) FRIENDS FILTER. Known tags only (deliberate friend marks
 *      union people remembered from shared fabrics); followed
 *      hosts sort first in the gallery.
 *  (5) REQUEST → APPROVE → JOINED, and DENIAL, and TIMEOUT.
 *      Two real LobbyService instances over an in-memory hub
 *      transport: ask lands in the host's request list, deny
 *      lands as "denied", grant lands as "granted" carrying the
 *      room/mode/fabric the menu applies through the invite
 *      transition, and silence lands as "timeout".
 *  (6) ENCOUNTERS. Following a host makes their NEXT listing
 *      fire exactly one encounter; repeat beacons don't re-fire;
 *      leaving and returning fires again (the tracker's
 *      discipline, proven pure AND end-to-end).
 *
 * The services under test are bundled from the real sources
 * with esbuild (AsyncStorage stubbed in-memory; the WebRTC
 * transport is injected — the wire transport itself is the
 * device-proven session path and is not what this slice adds).
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await sleep(15);
  }
  ok(false, `timed out waiting: ${label}`);
  return false;
}

/* ------------------------------------------------------------------ */
/* Bundle the real discovery modules                                   */
/* ------------------------------------------------------------------ */
const esbuildPath =
  process.env.ESBUILD_PATH ?? "/home/hatch/workspace/.tools/node_modules/esbuild/lib/main.js";
const { build } = await import(esbuildPath);
const stubPlugin = {
  name: "discovery-check-stubs",
  setup(b) {
    b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({
      path: "async-storage",
      namespace: "stub",
    }));
    b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "stub" }));
    b.onResolve({ filter: /services\/SignalingService$/ }, () => ({
      path: "signaling",
      namespace: "svc",
    }));
    b.onResolve({ filter: /services\/WebRTCManager$/ }, () => ({
      path: "webrtc",
      namespace: "svc",
    }));
    b.onResolve({ filter: /^[^./]/ }, (args) => ({ path: args.path, external: true }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
      contents:
        args.path === "react"
          ? `
            // Inert hooks: nothing renders headlessly; the stores
            // under test never call these at module level.
            export const useState = (init) => [typeof init === "function" ? init() : init, () => {}];
            export const useEffect = () => {};
            export const useRef = (v) => ({ current: v });
            export const useMemo = (fn) => fn();
            export const useCallback = (fn) => fn;
            export const useSyncExternalStore = (_sub, get) => get();
            export default {};
          `
          : `
            const mem = new Map();
            export default {
              getItem: async (k) => (mem.has(k) ? mem.get(k) : null),
              setItem: async (k, v) => { mem.set(k, v); },
              removeItem: async (k) => { mem.delete(k); },
            };`,
      loader: "js",
    }));
    b.onLoad({ filter: /.*/, namespace: "svc" }, (args) => ({
      contents:
        args.path === "signaling"
          ? `export class SignalingService {
               connect() { return Promise.resolve(); }
               disconnect() {}
               send() {}
               onMessage() { return () => {}; }
               offMessage() {}
             }`
          : `export class WebRTCManager {
               constructor() {}
               getPeerIds() { return []; }
               send() {}
               sendTo() {}
               onMessage() { return () => {}; }
               destroy() {}
             }`,
      loader: "js",
    }));
  },
};
const root = process.cwd();
const entry = join(mkdtempSync(join(tmpdir(), "discovery-check-")), "entry.ts");
writeFileSync(
  entry,
  `
  export * as P from ${JSON.stringify(root + "/src/discovery/lobbyProtocol")};
  export * as K from ${JSON.stringify(root + "/src/discovery/knownPeople")};
  export * as S from ${JSON.stringify(root + "/src/discovery/socialStore")};
  export { LobbyService } from ${JSON.stringify(root + "/src/discovery/lobbyService")};
  `
);
const out = join(tmpdir(), `discovery-check-bundle-${Date.now()}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  outfile: out,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
  plugins: [stubPlugin],
});
const M = await import(out);
const { P, K, S } = M;

const HOST = { name: "Host Human", hue: 210, tag: "FBR-ABCD-EFGH" };
const GUEST = { name: "Guest Human", hue: 120, tag: "FBR-WXYZ-2345" };
const FIELDS = {
  fabricId: "default-fluid",
  fabricName: "Fluid",
  roomId: "live-abc123",
  mode: "collab",
  ghostName: "Boop",
  badges: ["first-light"],
};
const listingRaw = (over = {}) => ({
  fabricId: FIELDS.fabricId,
  fabricName: FIELDS.fabricName,
  roomId: FIELDS.roomId,
  mode: FIELDS.mode,
  participants: 3,
  beat: 1_000_000,
  hostName: HOST.name,
  hostHue: HOST.hue,
  hostTag: HOST.tag,
  ghostName: "Boop",
  badges: ["first-light"],
  ...over,
});

/* ------------------------------------------------------------------ */
/* (2) sanitize: complete fields in, malformed out                     */
/* ------------------------------------------------------------------ */
{
  const good = P.sanitizeListing(listingRaw(), 1_000_000);
  ok(
    good !== null &&
      good.fabricName === "Fluid" &&
      good.hostName === "Host Human" &&
      good.participants === 3 &&
      good.mode === "collab" &&
      good.ghostName === "Boop" &&
      good.badges?.length === 1,
    "sanitize: a complete beacon survives whole (fabric, host, count, mode, ghostie, badges)"
  );
  ok(P.sanitizeListing(listingRaw({ hostTag: "not-a-tag" }), 0) === null, "sanitize: a bad secure tag is rejected");
  ok(P.sanitizeListing(listingRaw({ hostTag: undefined }), 0) === null, "sanitize: a missing tag is rejected");
  ok(P.sanitizeListing(listingRaw({ mode: "annarchy" }), 0) === null, "sanitize: an unknown mode is rejected");
  ok(P.sanitizeListing(listingRaw({ participants: 0 }), 0) === null, "sanitize: zero participants is rejected");
  ok(P.sanitizeListing(listingRaw({ participants: 400 }), 1_000_000)?.participants === 256, "sanitize: absurd counts clamp to the cap");
  ok(P.sanitizeListing("junk", 0) === null && P.sanitizeListing(null, 0) === null, "sanitize: non-objects are rejected");
}

/* ------------------------------------------------------------------ */
/* (3) heartbeat / last-seen math                                      */
/* ------------------------------------------------------------------ */
{
  const now = 10_000_000;
  ok(P.activityLabel(now - 10_000, now) === "live now", "last seen: 10s old reads 'live now'");
  ok(P.activityLabel(now - 44_000, now) === "live now", "last seen: 44s old still reads 'live now'");
  ok(P.activityLabel(now - 3 * 60_000, now) === "active 3m ago", "last seen: 3m old reads 'active 3m ago'");
  ok(P.activityLabel(now - 26 * 60_000, now) === "quiet 26m", "last seen: 26m old reads 'quiet 26m'");
  ok(
    P.isActiveNow(now - 4 * 60_000, now) === true && P.isActiveNow(now - 6 * 60_000, now) === false,
    "active now: the window is 5 minutes (4m in, 6m out)"
  );
  const book = P.createListingBook();
  P.upsertListing(book, P.sanitizeListing(listingRaw(), now), "peer-host", now);
  ok(P.bookRows(book).length === 1, "book: a fresh listing is a row");
  P.expireListings(book, now + P.LISTING_TTL_MS - 1);
  ok(P.bookRows(book).length === 1, "book: a row lives until the TTL");
  P.expireListings(book, now + P.LISTING_TTL_MS + 1);
  ok(P.bookRows(book).length === 0, "book: a row expires once beacons stop past the TTL");
}

/* ------------------------------------------------------------------ */
/* (4) filters + gallery order                                         */
/* ------------------------------------------------------------------ */
{
  const now = 20_000_000;
  const mk = (tag, name, fabric, beat) => ({
    listing: P.sanitizeListing(
      listingRaw({ hostTag: tag, hostName: name, fabricName: fabric, beat }),
      now
    ),
    seenAt: now,
  });
  const rows = [
    mk(HOST.tag, "Host Human", "Fluid", now - 1000),
    mk(GUEST.tag, "Guest Human", "Piano", now - 1000),
    mk("FBR-QQQQ-7777", "Third Human", "Fluid", now - 60 * 60_000),
  ];
  const known = new Set([HOST.tag]);
  const F = (over) => ({
    query: "",
    friendsOnly: false,
    activeOnly: false,
    knownTags: new Set(),
    ownTag: null,
    now,
    ...over,
  });
  ok(
    P.filterListings(rows, F({ friendsOnly: true, knownTags: known })).map((r) => r.listing.hostTag).join() === HOST.tag,
    "friends filter: only known LifePacket tags match"
  );
  ok(
    P.filterListings(rows, F({ ownTag: HOST.tag })).length === 2,
    "filters: your own listing never shows to you"
  );
  ok(
    P.filterListings(rows, F({ query: "piano" })).length === 1,
    "filters: text search matches fabric names"
  );
  ok(
    P.filterListings(rows, F({ query: "third" })).length === 1,
    "filters: text search matches host names"
  );
  ok(
    P.filterListings(rows, F({ activeOnly: true })).length === 2,
    "filters: Active now drops the hour-quiet room"
  );
  const sorted = P.sortGalleryRows(rows, new Set([GUEST.tag]));
  ok(sorted[0].listing.hostTag === GUEST.tag, "gallery order: followed hosts surface first");
}

/* ------------------------------------------------------------------ */
/* (5a) outgoing reducer discipline                                    */
/* ------------------------------------------------------------------ */
{
  let o = P.reduceOutgoing({ phase: "idle" }, { type: "ask", requestId: "ask-1", hostPeerId: "peer-host", hostTag: HOST.tag, hostName: HOST.name, now: 100 });
  ok(o.phase === "pending", "ask: outgoing goes pending");
  const stray = P.reduceOutgoing(o, { type: "granted", requestId: "ask-OTHER", roomId: "live-x", mode: "view", fabricId: null });
  ok(stray.phase === "pending", "ask: a grant for a different request is ignored");
  o = P.reduceOutgoing(o, { type: "granted", requestId: "ask-1", roomId: "live-abc123", mode: "collab", fabricId: "default-fluid" });
  ok(
    o.phase === "granted" && o.roomId === "live-abc123" && o.hostTag === HOST.tag,
    "ask: the matching grant lands with the room, mode and host"
  );
  let d = P.reduceOutgoing({ phase: "idle" }, { type: "ask", requestId: "ask-2", hostPeerId: "peer-host", hostTag: HOST.tag, hostName: HOST.name, now: 0 });
  d = P.reduceOutgoing(d, { type: "denied", requestId: "ask-2", now: 5 });
  ok(d.phase === "denied" && d.hostTag === HOST.tag, "ask: a denial lands as denied");
  let t = P.reduceOutgoing({ phase: "idle" }, { type: "ask", requestId: "ask-3", hostPeerId: "peer-host", hostTag: HOST.tag, hostName: HOST.name, now: 0 });
  t = P.reduceOutgoing(t, { type: "tick", now: P.REQUEST_TIMEOUT_MS + 1 }, P.REQUEST_TIMEOUT_MS);
  ok(t.phase === "timeout", "ask: silence past the timeout lands as timeout");
}

/* ------------------------------------------------------------------ */
/* (6a) encounter tracker discipline (pure)                            */
/* ------------------------------------------------------------------ */
{
  const B = 1_000_000_000; // epoch-scale times, like Date.now()
  const tr = P.createEncounterTracker();
  ok(P.encounterSeen(tr, HOST.tag, true, B) === false, "encounter: before warm-up, sightings seed silently");
  P.encounterWarmUp(tr, [HOST.tag]);
  ok(P.encounterSeen(tr, HOST.tag, true, B + 1000) === false, "encounter: the warmed-up population never fires");
  ok(P.encounterSeen(tr, GUEST.tag, true, B + 2000) === true, "encounter: a deliberate arrival after warm-up fires");
  ok(P.encounterSeen(tr, GUEST.tag, true, B + 3000) === false, "encounter: repeat beacons do not re-fire");
  ok(
    P.encounterSeen(tr, "FBR-QQQQ-7777", false, B + 9000) === false,
    "encounter: an unmarked arrival never fires (deliberate marks only)"
  );
  P.encounterGone(tr, GUEST.tag);
  ok(P.encounterSeen(tr, GUEST.tag, true, B + 12000) === true, "encounter: leaving and returning fires again");
  const tr2 = P.createEncounterTracker();
  P.encounterWarmUp(tr2, []);
  const burst = [
    P.encounterSeen(tr2, "FBR-AAAA-AAAA", true, B),
    P.encounterSeen(tr2, "FBR-BBBB-BBBB", true, B + 100),
    P.encounterSeen(tr2, "FBR-CCCC-CCCC", true, B + 200),
  ];
  ok(
    burst.filter(Boolean).length === 1,
    "encounter: a burst of arrivals coalesces into one reaction"
  );
}

/* ------------------------------------------------------------------ */
/* social + known-people stores (pure cores)                           */
/* ------------------------------------------------------------------ */
{
  const entries = S.sanitizeSocialEntries([
    { tag: HOST.tag, name: "Host Human", hue: 210, at: 5 },
    { tag: "bogus", name: "Nope", hue: 1, at: 5 },
    { tag: GUEST.tag, name: "Guest Human", hue: 120, at: 6 },
  ]);
  ok(entries.length === 2, "social store: malformed tags never persist");
  const up = S.upsertSocialEntry(entries, { tag: HOST.tag, name: "Host Human", hue: 200, at: 9 });
  ok(up.length === 2 && up.find((e) => e.tag === HOST.tag)?.hue === 200, "social store: re-marking refreshes the face, no duplicate");
  ok(S.removeSocialEntry(up, HOST.tag).length === 1, "social store: unmarking removes");
  const kp = K.upsertKnownPerson([], { tag: HOST.tag, name: "Host Human", hue: 210, metAt: 100 });
  ok(kp.length === 1 && kp[0].tag === HOST.tag, "known people: a met face is remembered by tag");
  ok(K.sanitizeKnownPeople([{ tag: "nope" }, null, 42]).length === 0, "known people: junk never loads");
}

/* ------------------------------------------------------------------ */
/* (1) + (5b) + (6b): two real services over an in-memory hub          */
/* ------------------------------------------------------------------ */
function makeHub() {
  const peers = new Map();
  const wire = [];
  const notify = () => {
    for (const t of peers.values()) t.peersCb?.(t.others());
  };
  return {
    wire,
    transport(selfId) {
      const t = {
        peerId: selfId,
        frameCb: null,
        peersCb: null,
        others: () => [...peers.keys()].filter((id) => id !== selfId),
        start() {
          peers.set(selfId, t);
          notify();
        },
        destroy() {
          peers.delete(selfId);
          notify();
        },
        send(data) {
          wire.push({ from: selfId, data });
          for (const o of peers.values()) if (o !== t) o.frameCb?.(data, selfId);
        },
        sendTo(peerId, data) {
          wire.push({ from: selfId, to: peerId, data });
          peers.get(peerId)?.frameCb?.(data, selfId);
        },
        onFrame(cb) {
          t.frameCb = cb;
          return () => { if (t.frameCb === cb) t.frameCb = null; };
        },
        onPeersChanged(cb) {
          t.peersCb = cb;
          return () => { if (t.peersCb === cb) t.peersCb = null; };
        },
      };
      return t;
    },
  };
}

const hub = makeHub();
let peerSeq = 0;
const makeService = () =>
  new M.LobbyService({
    beaconMs: 25,
    pollMs: 10,
    requestTimeoutMs: 200,
    settleMs: 40,
    transportFactory: () => hub.transport(`peer-${++peerSeq}`),
  });

const hostSvc = makeService();
const guestSvc = makeService();
try {
  hostSvc.setIdentity(HOST);
  hostSvc.setHostFields(FIELDS);
  guestSvc.setIdentity(GUEST);

  // (1) Both hold seats (host watching, guest browsing); the host
  // is NOT listed. Nothing may go on the wire from the host and
  // the guest must see nobody.
  hostSvc.startWatching();
  guestSvc.startBrowsing();
  await sleep(160);
  const hostFrames = hub.wire.filter((w) => w.from === "peer-1");
  ok(hostFrames.length === 0, "unlisted = silent: a seated but unlisted host sends zero frames");
  ok(guestSvc.getSnapshot().rows.length === 0, "unlisted = invisible: the browser sees no rows");

  // (2) Listing: the guest's gallery fills with the full row.
  hostSvc.setListed(true);
  await until(() => guestSvc.getSnapshot().rows.length === 1, "guest sees the listed host");
  const row = guestSvc.getSnapshot().rows[0];
  ok(
    row.listing.hostTag === HOST.tag &&
      row.listing.fabricName === "Fluid" &&
      row.listing.roomId === "live-abc123" &&
      row.listing.participants >= 1 &&
      row.listing.ghostName === "Boop" &&
      row.listing.badges?.[0] === "first-light",
    "listing: the row carries tag, fabric, room, count, ghostie and badges"
  );

  // (5) Denial first.
  guestSvc.askToJoin(row);
  await until(() => hostSvc.getSnapshot().requests.length === 1, "host receives the ask");
  const ask1 = hostSvc.getSnapshot().requests[0];
  ok(ask1.from.tag === GUEST.tag, "ask: the host sees who is asking (tag + face)");
  hostSvc.respondToRequest(ask1.requestId, false);
  await until(() => guestSvc.getSnapshot().outgoing.phase === "denied", "guest lands on denied");
  ok(hostSvc.getSnapshot().requests.length === 0, "ask: an answered ask leaves the host's list");

  // (5) Then a grant — the joined state path.
  guestSvc.askToJoin(guestSvc.getSnapshot().rows[0]);
  await until(() => hostSvc.getSnapshot().requests.length === 1, "host receives the second ask");
  hostSvc.respondToRequest(hostSvc.getSnapshot().requests[0].requestId, true);
  await until(() => guestSvc.getSnapshot().outgoing.phase === "granted", "guest lands on granted");
  const granted = guestSvc.getSnapshot().outgoing;
  ok(
    granted.roomId === "live-abc123" && granted.mode === "collab" && granted.fabricId === "default-fluid",
    "joined: the grant carries the room, mode and fabric for the invite transition"
  );
  guestSvc.resetOutgoing();

  // (5) Silence is a timeout, in the asker's own state.
  guestSvc.askToJoin(guestSvc.getSnapshot().rows[0]);
  await until(() => hostSvc.getSnapshot().requests.length === 1, "host receives the third ask");
  await until(() => guestSvc.getSnapshot().outgoing.phase === "timeout", "guest lands on timeout", 4000);
  // Clear the dangling host-side ask the way its own expiry will.
  hostSvc.setListed(false);
  await until(() => guestSvc.getSnapshot().rows.length === 0, "unlisting empties the gallery");
  ok(hostSvc.getSnapshot().requests.length === 0, "unlisting clears pending asks");

  // (6) Encounters end-to-end: follow, then the host lists again.
  let encounters = 0;
  const offEncounter = guestSvc.onEncounter(() => {
    encounters += 1;
  });
  S.setFollow(HOST, true);
  await sleep(30);
  hostSvc.setListed(true);
  await until(() => encounters === 1, "the followed host's arrival fires one encounter");
  await sleep(220); // ~9 beacons later
  ok(encounters === 1, "encounter: beacons keep coming, the reaction does not repeat");
  // The anti-chop window is 3s of real time: the departure and
  // return must happen after it closes, or the return is —
  // correctly — read as the same burst still ringing.
  await sleep(3200);
  ok(encounters === 1, "encounter: still one reaction after the window, presence unbroken");
  hostSvc.setListed(false);
  await sleep(150);
  hostSvc.setListed(true);
  await until(() => encounters === 2, "leaving and returning fires a second encounter");
  offEncounter();
  S.setFollow(HOST, false);
} finally {
  hostSvc.destroy();
  guestSvc.destroy();
}

/* ------------------------------------------------------------------ */
/* known-people feed (store level)                                     */
/* ------------------------------------------------------------------ */
{
  K.noteKnownPerson({ tag: "FBR-ZZZZ-9999", name: "Met Once", hue: 42 });
  K.noteKnownPerson({ tag: "bogus-tag", name: "Nobody", hue: 1 });
  await sleep(80);
  ok(K.getKnownTags().has("FBR-ZZZZ-9999"), "known people: a shared-fabric face joins the Friends source");
  ok(!K.getKnownTags().has("bogus-tag"), "known people: an invalid tag is never remembered");
}

/* ------------------------------------------------------------------ */
/* Source pins: the menu-side application of a grant + the ghost chain */
/* ------------------------------------------------------------------ */
{
  const menu = readFileSync("app/components/fabric/FabricMenu.tsx", "utf8");
  ok(
    menu.includes('url.searchParams.set("room", o.roomId)') &&
      menu.includes("roomId: o.roomId") &&
      menu.includes("updateConfig({"),
    "joined state path: the menu applies a grant through the invite transition (URL + config roomId)"
  );
  const find = readFileSync("app/components/fabric/FindFabrics.tsx", "utf8");
  ok(
    find.includes("BadgeGlyphMark") && find.includes("Nearby isn't a filter"),
    "gallery: thumbnails carry badges, and the Nearby gap is stated, not faked"
  );
  const ghostStore = readFileSync("src/ghost/ghostStore.ts", "utf8");
  const ghostPeer = readFileSync("src/ghost/GhostPeer.ts", "utf8");
  const fluid = readFileSync("src/components/fluid/LegacyFluid.tsx", "utf8");
  ok(
    ghostStore.includes("FABRIC_GHOST_ENCOUNTER_EVENT") &&
      ghostPeer.includes("noteEncounter(") &&
      ghostPeer.includes('emitSfx("sniff")') &&
      fluid.includes("FABRIC_GHOST_ENCOUNTER_EVENT"),
    "encounter chain: event constant → GhostPeer.noteEncounter (greeting chirp) → fluid listener"
  );
  const hook = readFileSync("src/hooks/useFluidMultiUser.ts", "utf8");
  ok(
    hook.includes("noteKnownPerson("),
    "known people: the session announce handler feeds the remembered-faces store"
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
