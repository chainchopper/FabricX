/**
 * stage-cast-check — node check for Stage v2's cast logic
 * (src/dancer/stageRoster.ts, pure functions).
 *
 * Proves: the local participant holds center-front; a fake roster
 * of 3 blocks into distinct arc positions with the right names /
 * hues attached; the 6-rig cap holds with the overflow counted as
 * wings; a ghost's sender id normalizes to its owner; temperament
 * styles order the way the bodies should feel (sleepy < neutral <
 * playful motion) and an unknown temperament falls back to neutral.
 *
 * Run: esbuild src/dancer/stageRoster.ts --bundle --format=esm \
 *        --outfile=/tmp/stageRoster.mjs
 *      node scripts/stage-cast-check.mjs /tmp/stageRoster.mjs
 */
const {
  buildStageCast,
  layoutCast,
  ownerIdForSender,
  placeholderHue,
  styleForTemperament,
  NEUTRAL_STYLE,
  MAX_STAGE_RIGS,
} = await import(process.argv[2] ?? "/tmp/stageRoster.mjs");

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const near = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

console.log("== solo: your ghostie alone, center-front ==");
{
  const local = { id: "user-me", name: "Boop", hue: 187, isLocal: true };
  const { cast, wings } = buildStageCast(local, []);
  const layout = layoutCast(cast);
  check("cast is exactly the local rig", cast.length === 1 && cast[0].isLocal);
  check("no wings when solo", wings === 0);
  check(
    "local at center-front [0, 0, 0.62], unyawed",
    near(layout[0].position[0], 0) &&
      near(layout[0].position[1], 0) &&
      near(layout[0].position[2], 0.62) &&
      near(layout[0].rotationY, 0)
  );
  check("label is the ghost's name", cast[0].name === "Boop");
}

console.log("\n== trio: a fake roster of 3 ==");
{
  const local = { id: "user-me", name: "Boop", hue: 187, isLocal: true };
  const remotes = [
    { id: "user-maya", name: "Maya", hue: 322, isLocal: false },
    { id: "user-ren", name: "Ren", hue: 96, isLocal: false },
  ];
  const { cast, wings } = buildStageCast(local, remotes);
  const layout = layoutCast(cast);
  const byId = new Map(layout.map((l) => [l.id, l]));
  check("cast of 3, no wings", cast.length === 3 && wings === 0);
  check(
    "local still center-front",
    near(byId.get("user-me").position[2], 0.62)
  );
  const maya = byId.get("user-maya").position;
  const ren = byId.get("user-ren").position;
  check(
    "remotes flank the arc (mirrored x, behind local)",
    near(maya[0], -ren[0]) && maya[0] < 0 && ren[0] > 0 && maya[2] < 0.62 && ren[2] < 0.62
  );
  check(
    "all positions distinct and inside the floor disc (r 3.2)",
    layout.every(
      (l) => Math.hypot(l.position[0], l.position[2]) < 3.2
    ) &&
      new Set(layout.map((l) => l.position.join(","))).size === 3
  );
  check(
    "hues ride with their owners",
    cast.find((p) => p.id === "user-maya").hue === 322 &&
      cast.find((p) => p.id === "user-ren").hue === 96
  );
  check(
    "off-center rigs yaw toward the house",
    byId.get("user-maya").rotationY > 0 && byId.get("user-ren").rotationY < 0
  );
}

console.log("\n== the cap: 1 local + 8 remotes ==");
{
  const local = { id: "user-me", name: "Boop", hue: 187, isLocal: true };
  const remotes = Array.from({ length: 8 }, (_, i) => ({
    id: `user-p${i}`,
    name: `P${i}`,
    hue: i * 40,
    isLocal: false,
  }));
  const { cast, wings } = buildStageCast(local, remotes);
  check(`cast capped at ${MAX_STAGE_RIGS}`, cast.length === MAX_STAGE_RIGS);
  check("3 wait in the wings", wings === 3);
  check(
    "wings are the LAST joiners (join order holds the stage)",
    cast[cast.length - 1].id === "user-p4"
  );
  const layout = layoutCast(cast);
  check(
    "a full cast still fits the disc",
    layout.every((l) => Math.hypot(l.position[0], l.position[2]) < 3.2)
  );
}

console.log("\n== attribution helpers ==");
{
  check(
    "ghost sender normalizes to its owner",
    ownerIdForSender("ghost:user-maya") === "user-maya"
  );
  check(
    "human sender passes through",
    ownerIdForSender("user-maya") === "user-maya"
  );
  check(
    "placeholder hue is stable per id",
    placeholderHue("user-maya") === placeholderHue("user-maya") &&
      placeholderHue("user-maya") >= 0 &&
      placeholderHue("user-maya") < 360
  );
}

console.log("\n== temperament in the body ==");
{
  const sleepy = styleForTemperament("sleepy", "present");
  const playful = styleForTemperament("playful", "present");
  check(
    "sleepy moves less than neutral, playful more",
    sleepy.motion < NEUTRAL_STYLE.motion &&
      playful.motion > NEUTRAL_STYLE.motion
  );
  check(
    "playful bounces hardest",
    playful.bounce > sleepy.bounce && playful.bounce > NEUTRAL_STYLE.bounce
  );
  check(
    "a sleeping presence softens any temperament",
    styleForTemperament("playful", "sleeping").motion < playful.motion
  );
  check(
    "unknown / absent temperament is neutral (remote honesty)",
    styleForTemperament(null) === NEUTRAL_STYLE &&
      styleForTemperament("some-future-mood") === NEUTRAL_STYLE
  );
}

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
