/**
 * fabrics-drawer-check — headless proof for Slice 19 "The Fabrics
 * Drawer + session fabric authority".
 *
 * Proves, against the PURE logic in src/session/fabricStore.ts
 * (the same functions the send funnel, the transport hook, the
 * drawer, and the guest follower call):
 *
 * - the rules matrix: mode × rule × actor — rules bind guests per
 *   kind, never bind the host, never apply in an open room, and
 *   NEVER expand a send the session mode already refused;
 * - fabric-change validation: unknown / empty / oversized layer
 *   ids dropped (registry-checked where the registry is known),
 *   rules clamped to the three known boolean keys, names capped;
 * - the guest follow state machine: follow on host move, toast
 *   ("rules") on a rules-only change while on the fabric, stay on
 *   heartbeat repeats, stay after a deliberate divergence — until
 *   the host picks a DIFFERENT fabric;
 * - the sanitizers: garbled stored rules can never mute a room.
 *
 * Build + run:
 *   esbuild src/session/fabricStore.ts --bundle --format=esm \
 *     --outfile=/tmp/fabricStore19.mjs
 *   node scripts/fabrics-drawer-check.mjs /tmp/fabricStore19.mjs
 */
const store = await import(process.argv[2] ?? "/tmp/fabricStore19.mjs");
const {
  DEFAULT_FABRIC_RULES,
  sanitizeFabricRules,
  sanitizeHostRulesMap,
  validateFabricChange,
  fabricGate,
  decideGuestFollow,
  fabricStateKey,
  fabricRulesKey,
} = store;

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

// --- sanitizeFabricRules -------------------------------------------
check("sanitize(null) = defaults", eq(sanitizeFabricRules(null), DEFAULT_FABRIC_RULES));
check("sanitize(garbage) = defaults", eq(sanitizeFabricRules("nope"), DEFAULT_FABRIC_RULES));
check(
  "sanitize keeps known booleans only",
  eq(sanitizeFabricRules({ draw: false, verbs: "yes", notes: 0, extra: false }), {
    draw: false,
    verbs: true,
    notes: true,
  })
);
check(
  "sanitize all-off survives",
  eq(sanitizeFabricRules({ draw: false, verbs: false, notes: false }), {
    draw: false,
    verbs: false,
    notes: false,
  })
);

// --- sanitizeHostRulesMap ------------------------------------------
check("hostRules(null) = {}", eq(sanitizeHostRulesMap(null), {}));
check(
  "hostRules drops junk, sanitizes entries",
  eq(
    sanitizeHostRulesMap({
      "dancer-stage": { notes: false, bogus: 1 },
      "": { draw: false },
      "ar-piano": "junk",
    }),
    { "dancer-stage": { draw: true, verbs: true, notes: false } }
  )
);

// --- validateFabricChange ------------------------------------------
const known = new Set(["default-fluid", "ar-piano", "dancer-stage"]);
check(
  "valid change passes (registry known)",
  eq(
    validateFabricChange(
      { layerId: "dancer-stage", byName: "Terrell", rules: { notes: false } },
      known
    ),
    { layerId: "dancer-stage", byName: "Terrell", rules: { draw: true, verbs: true, notes: false } }
  )
);
check("unknown layer dropped (registry)", validateFabricChange({ layerId: "nope" }, known) === null);
check("empty layer dropped", validateFabricChange({ layerId: "" }, known) === null);
check("non-string layer dropped", validateFabricChange({ layerId: 42 }, known) === null);
check(
  "oversized layer dropped",
  validateFabricChange({ layerId: "x".repeat(65) }, known) === null
);
check(
  "no-registry: structural only",
  validateFabricChange({ layerId: "future-fabric" })?.layerId === "future-fabric"
);
check("non-object dropped", validateFabricChange([1, 2]) === null && validateFabricChange(null) === null);
check(
  "byName capped at 40",
  validateFabricChange({ layerId: "ar-piano", byName: "n".repeat(80) }, known)?.byName.length === 40
);
check(
  "rules clamped on the wire",
  eq(validateFabricChange({ layerId: "ar-piano", rules: { draw: false, hacks: true } }, known)?.rules, {
    draw: false,
    verbs: true,
    notes: true,
  })
);

// --- fabricGate: the mode × rule × actor matrix ---------------------
const KINDS = ["draw", "verbs", "notes"];
const rulesOff = (kind) => ({ ...DEFAULT_FABRIC_RULES, [kind]: false });

// Mode refuses → nothing sends, for anyone, under any rules.
for (const role of ["host", "guest", "open"]) {
  for (const rules of [null, DEFAULT_FABRIC_RULES, { draw: true, verbs: true, notes: true }]) {
    for (const kind of KINDS) {
      check(
        `mode-off blocks ${role}/${kind}`,
        fabricGate({ modeCanSend: false, role, rules, kind }) === false
      );
    }
  }
}
// Host and open rooms: rules never bind.
for (const role of ["host", "open"]) {
  for (const kind of KINDS) {
    check(
      `${role} unbound by rules (${kind} off)`,
      fabricGate({ modeCanSend: true, role, rules: rulesOff(kind), kind }) === true
    );
    check(
      `${role} unbound by rules (other kind)`,
      fabricGate({ modeCanSend: true, role, rules: rulesOff("draw"), kind }) === true
    );
  }
}
// Guest: no rules yet → mode alone rules.
for (const kind of KINDS) {
  check(`guest no-rules ${kind}`, fabricGate({ modeCanSend: true, role: "guest", rules: null, kind }) === true);
}
// Guest: each rule binds exactly its own kind.
for (const kind of KINDS) {
  check(
    `guest ${kind}-off blocks ${kind}`,
    fabricGate({ modeCanSend: true, role: "guest", rules: rulesOff(kind), kind }) === false
  );
  for (const other of KINDS) {
    if (other === kind) continue;
    check(
      `guest ${kind}-off leaves ${other}`,
      fabricGate({ modeCanSend: true, role: "guest", rules: rulesOff(kind), kind: other }) === true
    );
  }
}
// Rules never expand: guest + all rules ON + mode off = off (covered
// above), and guest + rule on cannot rescue a mode refusal per-kind.
check(
  "rule-on never expands past mode",
  fabricGate({ modeCanSend: false, role: "guest", rules: DEFAULT_FABRIC_RULES, kind: "draw" }) === false
);

// --- decideGuestFollow: the follow state machine --------------------
const F = (over) => ({
  role: "guest",
  activeLayerId: "default-fluid",
  fabricLayerId: "dancer-stage",
  fabricKey: "dancer-stage:111",
  lastKey: null,
  divergedLayerId: null,
  ...over,
});
check("guest follows a host move", decideGuestFollow(F({})) === "follow");
check(
  "heartbeat repeat is stay",
  decideGuestFollow(F({ lastKey: "dancer-stage:111" })) === "stay"
);
check(
  "rules-only change while on the fabric = rules",
  decideGuestFollow(
    F({
      activeLayerId: "dancer-stage",
      fabricKey: "dancer-stage:101",
      lastKey: "dancer-stage:111",
    })
  ) === "rules"
);
check(
  "host is never a follower",
  decideGuestFollow(F({ role: "host" })) === "stay"
);
check(
  "open room never follows",
  decideGuestFollow(F({ role: "open" })) === "stay"
);
check(
  "no fabric published = stay",
  decideGuestFollow(F({ fabricLayerId: null, fabricKey: ":111" })) === "stay"
);
check(
  "diverged guest is not yanked back",
  decideGuestFollow(F({ divergedLayerId: "dancer-stage" })) === "stay"
);
check(
  "diverged guest stays through the same fabric's rule wiggles",
  decideGuestFollow(
    F({ divergedLayerId: "dancer-stage", fabricKey: "dancer-stage:101", lastKey: "dancer-stage:111" })
  ) === "stay"
);
check(
  "a NEW host fabric outranks divergence",
  decideGuestFollow(
    F({ divergedLayerId: "dancer-stage", fabricLayerId: "ar-piano", fabricKey: "ar-piano:111" })
  ) === "follow"
);
check(
  "guest already on the session fabric, no change = stay",
  decideGuestFollow(
    F({ activeLayerId: "dancer-stage", lastKey: "dancer-stage:111" })
  ) === "stay"
);
check(
  "rejoin restatement is an arrival, not an update",
  decideGuestFollow(
    F({ activeLayerId: "dancer-stage", fabricKey: "dancer-stage:111", lastKey: ":111" })
  ) === "stay"
);
check(
  "first sighting while already on the fabric = stay",
  decideGuestFollow(F({ activeLayerId: "dancer-stage", lastKey: null })) === "stay"
);
check(
  "settled guest hears a real rules change",
  decideGuestFollow(
    F({
      activeLayerId: "dancer-stage",
      fabricKey: "dancer-stage:110",
      lastKey: "dancer-stage:111",
    })
  ) === "rules"
);

// --- keys ------------------------------------------------------------
check("rules key stable", fabricRulesKey({ draw: true, verbs: false, notes: true }) === "101");
check(
  "state key composes",
  fabricStateKey({ layerId: "ar-piano", rules: DEFAULT_FABRIC_RULES }) === "ar-piano:111"
);
check(
  "state key null layer",
  fabricStateKey({ layerId: null, rules: DEFAULT_FABRIC_RULES }) === ":111"
);

console.log(`\nfabrics-drawer-check: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log("ALL CHECKS PASSED");
