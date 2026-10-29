/**
 * role-resolution-check — headless proof for Hotfix 2.6
 * "Who's hosting?" (deterministic host/guest role resolution).
 *
 * Proves, against the PURE logic in src/session/roleResolution.ts
 * + src/session/fabricStore.ts (the same functions the transport
 * hook, the send funnel, the drawer, and the guest follower call):
 *
 *  (a) solo boot -> host by succession; the follower is inert.
 *  (b) creator + guest -> the creator hosts (claim, or seniority
 *      when unclaimed); the guest resolves guest and follows.
 *  (c) host departs -> the senior PRESENT guest inherits; the
 *      host-change notice fires exactly once per chair.
 *  (d) a persisted/stale claim naming an ABSENT peer is ignored —
 *      role resolution never defers to a ghost.
 *  (e) the host's own client, handed its own fabric state (even
 *      mislabeled "guest"), never follows itself.
 *  (f) a guest's deliberate divergence survives a host change to
 *      the same fabric; a move to a DIFFERENT fabric is a new
 *      invitation, under the new host too.
 *  (+) the resolution's precedence + tiebreak rules: my claim >
 *      a present remote claim > succession; a claim outranks
 *      seniority; equal join times resolve identically from
 *      every chair.
 *
 * The Slice 19 matrix itself is proven by its own suite — run:
 *   esbuild src/session/fabricStore.ts --bundle --format=esm \
 *     --outfile=/tmp/fabricStore.mjs
 *   node scripts/fabrics-drawer-check.mjs /tmp/fabricStore.mjs
 *
 * Build + run this suite:
 *   esbuild src/session/roleResolution.ts --bundle --format=esm \
 *     --outfile=/tmp/roleResolution.mjs
 *   esbuild src/session/fabricStore.ts --bundle --format=esm \
 *     --outfile=/tmp/fabricStore.mjs
 *   node scripts/role-resolution-check.mjs /tmp/roleResolution.mjs /tmp/fabricStore.mjs
 */
const rr = await import(process.argv[2] ?? "/tmp/roleResolution.mjs");
const fs = await import(process.argv[3] ?? "/tmp/fabricStore.mjs");
const { resolveSessionRole, hostChangeNotice } = rr;
const { decideGuestFollow, DEFAULT_FABRIC_RULES } = fs;

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("FAIL:", name);
  }
}
function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const P = (id, joinedAt) => ({ id, joinedAt });
const R = (over) => ({
  selfId: "user-self",
  selfJoinedAt: 1000,
  hasClaim: false,
  remoteHostId: null,
  present: [],
  ...over,
});

// --- (a) solo boot ---------------------------------------------------
{
  const solo = resolveSessionRole(R({}));
  check("(a) solo is host", solo.role === "host" && solo.hostId === "user-self");
  check("(a) solo hosts by succession", solo.source === "succession");
  check(
    "(a) solo never follows",
    decideGuestFollow({
      role: solo.role,
      activeLayerId: "default-fluid",
      fabricLayerId: "dancer-stage",
      fabricKey: "dancer-stage:111",
      lastKey: null,
      divergedLayerId: null,
      fabricHostId: solo.hostId,
      selfId: "user-self",
    }) === "stay"
  );
}

// --- (b) creator + guest ---------------------------------------------
{
  // Claimed session: the claim is the law on both chairs.
  const creator = resolveSessionRole(
    R({ selfId: "user-creator", selfJoinedAt: 100, hasClaim: true, present: [P("user-guest", 200)] })
  );
  check("(b) claimant hosts", creator.role === "host" && creator.source === "claim");
  const guest = resolveSessionRole(
    R({
      selfId: "user-guest",
      selfJoinedAt: 200,
      remoteHostId: "user-creator",
      present: [P("user-creator", 100)],
    })
  );
  check(
    "(b) guest of a present claimant",
    guest.role === "guest" && guest.hostId === "user-creator" && guest.source === "remote-claim"
  );
  // Unclaimed room: the earlier joiner hosts by succession, from
  // BOTH chairs — the same winner, deterministically.
  const first = resolveSessionRole(
    R({ selfId: "user-creator", selfJoinedAt: 100, present: [P("user-guest", 200)] })
  );
  const second = resolveSessionRole(
    R({ selfId: "user-guest", selfJoinedAt: 200, present: [P("user-creator", 100)] })
  );
  check(
    "(b) unclaimed: senior hosts, junior guests — same winner both chairs",
    first.role === "host" &&
      first.source === "succession" &&
      second.role === "guest" &&
      second.hostId === "user-creator" &&
      second.source === "succession"
  );
  check(
    "(b) the succession guest follows the host's fabric",
    decideGuestFollow({
      role: second.role,
      activeLayerId: "default-fluid",
      fabricLayerId: "dancer-stage",
      fabricKey: "dancer-stage:111",
      lastKey: null,
      divergedLayerId: null,
      fabricHostId: second.hostId,
      selfId: "user-guest",
    }) === "follow"
  );
}

// --- (c) host departs -> succession + one notice ----------------------
{
  // Before: guest under the departed host's live claim.
  const before = resolveSessionRole(
    R({
      selfId: "user-senior",
      selfJoinedAt: 200,
      remoteHostId: "user-host",
      present: [P("user-host", 100), P("user-junior", 300)],
    })
  );
  check("(c) before: guest of the live host", before.role === "guest" && before.hostId === "user-host");
  // After: the host is GONE from presence. Its claim (still the
  // last announced value on this chair) must not rule — the senior
  // present participant inherits.
  const after = resolveSessionRole(
    R({
      selfId: "user-senior",
      selfJoinedAt: 200,
      remoteHostId: "user-host",
      present: [P("user-junior", 300)],
    })
  );
  check(
    "(c) senior present guest inherits",
    after.role === "host" && after.hostId === "user-senior" && after.source === "succession"
  );
  const junior = resolveSessionRole(
    R({
      selfId: "user-junior",
      selfJoinedAt: 300,
      remoteHostId: "user-host",
      present: [P("user-senior", 200)],
    })
  );
  check(
    "(c) junior sees the same heir",
    junior.role === "guest" && junior.hostId === "user-senior"
  );
  // The notice: fires on the change, once; baselines and repeats
  // are silent.
  check(
    "(c) heir is told, once",
    hostChangeNotice({ prevHostId: "user-host", nextHostId: "user-senior", selfId: "user-senior", hostName: "you" }) ===
      "You’re hosting now." &&
      hostChangeNotice({ prevHostId: "user-senior", nextHostId: "user-senior", selfId: "user-senior", hostName: "you" }) === null
  );
  check(
    "(c) the room is told, once",
    hostChangeNotice({ prevHostId: "user-host", nextHostId: "user-senior", selfId: "user-junior", hostName: "Sam" }) ===
      "Sam is hosting now." &&
      hostChangeNotice({ prevHostId: undefined, nextHostId: "user-senior", selfId: "user-junior", hostName: "Sam" }) === null &&
      hostChangeNotice({ prevHostId: "user-host", nextHostId: null, selfId: "user-junior", hostName: "—" }) === null
  );
}

// --- (d) stale claim naming an absent peer ----------------------------
{
  // A claim restored from a dead session names a peer who is not
  // here. It is ignored; the present set resolves its own host.
  const res = resolveSessionRole(
    R({
      selfId: "user-self",
      selfJoinedAt: 500,
      remoteHostId: "user-yesterday",
      present: [P("user-other", 400)],
    })
  );
  check(
    "(d) absent claimant ignored — no deference to a ghost",
    res.hostId !== "user-yesterday" && res.source === "succession"
  );
  check("(d) senior present participant hosts", res.role === "guest" && res.hostId === "user-other");
  const alone = resolveSessionRole(
    R({ selfId: "user-self", selfJoinedAt: 500, remoteHostId: "user-yesterday", present: [] })
  );
  check("(d) alone with a stale claim: I host", alone.role === "host" && alone.hostId === "user-self");
  // A remote session naming ME is never a reason to guest myself.
  const selfNamed = resolveSessionRole(
    R({ selfId: "user-self", selfJoinedAt: 500, remoteHostId: "user-self", present: [P("user-other", 900)] })
  );
  check("(d) a session naming myself does not guest me", selfNamed.role === "host");
}

// --- (e) the host never follows itself --------------------------------
{
  const F = (over) => ({
    role: "guest",
    activeLayerId: "default-fluid",
    fabricLayerId: "dancer-stage",
    fabricKey: "dancer-stage:111",
    lastKey: null,
    divergedLayerId: null,
    ...over,
  });
  check(
    "(e) own fabric-change, even mislabeled guest: stay",
    decideGuestFollow(F({ fabricHostId: "user-self", selfId: "user-self" })) === "stay"
  );
  check(
    "(e) own fabric rules wiggle: stay",
    decideGuestFollow(
      F({ fabricHostId: "user-self", selfId: "user-self", fabricKey: "dancer-stage:101", lastKey: "dancer-stage:111", activeLayerId: "dancer-stage" })
    ) === "stay"
  );
  check(
    "(e) host role: stay (the original lock still holds)",
    decideGuestFollow(F({ role: "host", fabricHostId: "user-other", selfId: "user-self" })) === "stay"
  );
  check(
    "(e) a REAL host's fabric still follows (guard is not a blanket)",
    decideGuestFollow(F({ fabricHostId: "user-host", selfId: "user-self" })) === "follow"
  );
}

// --- (f) divergence survives a host change -----------------------------
{
  const F = (over) => ({
    role: "guest",
    activeLayerId: "ar-piano",
    fabricLayerId: "dancer-stage",
    fabricKey: "dancer-stage:111",
    lastKey: "dancer-stage:111",
    divergedLayerId: "dancer-stage",
    fabricHostId: "user-newhost",
    selfId: "user-self",
    ...over,
  });
  check(
    "(f) diverged from the fabric: the NEW host does not yank me back to it",
    decideGuestFollow(F({})) === "stay"
  );
  check(
    "(f) the new host's DIFFERENT fabric is a new invitation",
    decideGuestFollow(F({ fabricLayerId: "default-fluid", fabricKey: "default-fluid:111" })) === "follow"
  );
}

// --- precedence + tiebreak ---------------------------------------------
{
  // My claim beats the room's seniority (I joined last, I claimed).
  const claim = resolveSessionRole(
    R({ selfId: "user-self", selfJoinedAt: 900, hasClaim: true, present: [P("user-elder", 100)] })
  );
  check("(+) my claim outranks seniority", claim.role === "host" && claim.source === "claim");
  // A present remote claim beats my seniority (deliberate hosting
  // outranks default hosting).
  const claimed = resolveSessionRole(
    R({ selfId: "user-self", selfJoinedAt: 100, remoteHostId: "user-claimant", present: [P("user-claimant", 900)] })
  );
  check(
    "(+) a present claim outranks my seniority",
    claimed.role === "guest" && claimed.hostId === "user-claimant" && claimed.source === "remote-claim"
  );
  // Equal join times: the smaller id wins — from both chairs.
  const aChair = resolveSessionRole(
    R({ selfId: "user-aaa", selfJoinedAt: 100, present: [P("user-bbb", 100)] })
  );
  const bChair = resolveSessionRole(
    R({ selfId: "user-bbb", selfJoinedAt: 100, present: [P("user-aaa", 100)] })
  );
  check(
    "(+) tie breaks on id, identically from both chairs",
    aChair.role === "host" && bChair.role === "guest" && bChair.hostId === "user-aaa"
  );
  // No self id yet (pre-join frame): honestly open.
  const pre = resolveSessionRole(R({ selfId: "" }));
  check("(+) no self id: open", pre.role === "open" && pre.hostId === null);
  check(
    "(+) defaults are permissive (rules sanity)",
    eq(DEFAULT_FABRIC_RULES, { draw: true, verbs: true, notes: true })
  );
}

console.log(`\nrole-resolution-check: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log("ALL CHECKS PASSED");
