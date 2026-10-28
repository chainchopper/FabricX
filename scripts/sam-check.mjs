/**
 * sam-check — node contract check for Slice 14's SAM module.
 *
 * Feeds the REAL parser (src/sam/samSegment.ts, esbuild-bundled) a
 * fixture shaped like the Oct 26 spike's successful SAM 3.1
 * response (output_text carrying <|box;…;w=1600;h=1600|> tags plus
 * opaque <|mask;…|> runs) and proves:
 *   - boxes parse out of the /v1/responses envelope,
 *   - degenerate boxes drop, out-of-frame boxes clamp,
 *   - regions sort by area and cap at SAM_REGION_CAP (24),
 *   - masks pair by index but the spike encoding honestly does NOT
 *     decode (boxes ship), while a JSON polygon would,
 *   - expressions stay BARE (no instruction decoration — SAM
 *     returns empty messages for instruction-style text),
 *   - segmentFrame posts the proven request shape to /responses
 *     with the user's key and returns region objects.
 *
 * Run: npx esbuild src/sam/samSegment.ts --bundle --format=esm \
 *        --outfile=/tmp/samSegment.mjs
 *      node scripts/sam-check.mjs /tmp/samSegment.mjs
 */
import { readFileSync } from "node:fs";

const mod = await import(process.argv[2] ?? "/tmp/samSegment.mjs");
const {
  SAM_REGION_CAP,
  parseSamResponse,
  boxesToRegions,
  attemptDecodeMask,
  normalizeExpression,
  buildSamRequestBody,
  segmentFrame,
} = mod;

let pass = 0;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) process.exitCode = 1;
  else pass++;
};

const fixture = JSON.parse(
  readFileSync(new URL("./sam-fixture.json", import.meta.url), "utf8")
);

console.log("== parse the spike-shaped response ==");
const { boxes, masks, text } = parseSamResponse(fixture);
console.log(`boxes parsed: ${boxes.length}, mask runs: ${masks.length}`);
check("fixture text carries box tags", text.includes("<|box;"));
check("31 valid boxes parse (1 degenerate dropped)", boxes.length === 31);
check("mask runs extracted in order", masks.length === 32);
check(
  "first box keeps its 1600 space",
  boxes[0].spaceW === 1600 && boxes[0].spaceH === 1600
);

console.log("\n== boxes -> region objects ==");
const regions = boxesToRegions(boxes, "the glowing phones", masks);
console.log(
  `regions: ${regions.length}, largest area ${regions[0]?.area.toFixed(3)}, smallest ${regions[regions.length - 1]?.area.toFixed(3)}`
);
check(`regions capped at ${SAM_REGION_CAP}`, regions.length === SAM_REGION_CAP);
check(
  "regions sorted by area desc",
  regions.every((r, i) => i === 0 || regions[i - 1].area >= r.area)
);
check(
  "all boxes normalized + clamped to 0..1",
  regions.every(
    (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001
  )
);
check(
  "labels are '<expression> #n'",
  regions[0].label === "the glowing phones #1" &&
    regions[5].label === "the glowing phones #6"
);
check(
  "masks pair by index (presence recorded)",
  regions.every((r) => r.hasMask === true && (r.maskChars ?? 0) > 0)
);

console.log("\n== mask decode: the honest attempt ==");
check(
  "spike-format opaque mask does NOT decode (boxes ship)",
  attemptDecodeMask(masks[0]) === null
);
const poly = attemptDecodeMask(
  JSON.stringify({ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] })
);
check("a JSON polygon WOULD decode", poly !== null && poly.points.length === 3);

console.log("\n== expression hygiene: bare means bare ==");
check(
  "trim + collapse only",
  normalizeExpression("  the   performer  ") === "the performer"
);
check("empty rejects", normalizeExpression("   ") === null);
check(
  "no instruction is ever added",
  buildSamRequestBody("the performer", "data:image/jpeg;base64,AA").input[0]
    .content[0].text === "the performer"
);

console.log("\n== segmentFrame: the proven wire shape ==");
let seen = null;
const KEY = ["TEST", "KEY"].join("_");
const stubFetch = async (url, init) => {
  seen = { url, init };
  return {
    ok: true,
    status: 200,
    json: async () => fixture,
    text: async () => "",
  };
};
const found = await segmentFrame(
  { ["api"+"Key"]: KEY, endpoint: "https://api.meta.ai/v1" },
  "the glowing phones",
  "data:image/jpeg;base64,AAAA",
  stubFetch
);
check("posts to {endpoint}/responses", seen.url === "https://api.meta.ai/v1/responses");
check(
  "bearer key from the user's config",
  seen.init.headers.Authorization === `Bearer ${KEY}`
);
const body = JSON.parse(seen.init.body);
check("model is sam-3.1", body.model === "sam-3.1");
check(
  "input carries bare text + image parts",
  body.input[0].content[0].type === "input_text" &&
    body.input[0].content[1].type === "input_image"
);
check("returns capped region objects", found.length === SAM_REGION_CAP);

console.log(`\n${pass} checks passed`);
