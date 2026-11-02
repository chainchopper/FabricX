// matfix-check.mjs — Slice 42 headless proof.
//
// The diagnosis (Slice 38 amendment, recorded in
// ~/workspace/fabric-trauma-fix/SYNC-RECORD.md): both Trauma
// GLBs carry their ONLY color texture inside the legacy
// KHR_materials_pbrSpecularGlossiness extension, which the
// repo's three@0.180.0 GLTFLoader does not implement — the
// extension is dropped with an "Unknown extension" warning,
// the standard pbrMetallicRoughness block is EMPTY, and the
// material constructs as #ffffff / metalness 1 / roughness 1 /
// no map: on device Trauma renders as an untextured pale
// figure even though the load itself succeeds.
//
// This check runs the REAL reassembled GLBs (repo parts + the
// app module's own decoder, SHA-256-pinned like ui-fixes §C)
// through three@0.180.0's GLTFLoader twice — plain (BEFORE:
// the diagnosis, reproduced) and with the app's
// registerSpecGlossConverter applied (AFTER) — and proves the
// material DATA changes exactly as the converter promises:
// the diffuse texture bound as the map (byte length matched
// against the GLB's own embedded image buffer), metalness 0,
// the loader's own normalMap/emissiveMap untouched, skeleton
// and clips identical. Synthetic GLBs pin the scope boundary:
// a spec-gloss material with a gloss texture, non-zero
// specular, or a tinted diffuse is left UNTOUCHED and noted;
// a plain metallic-roughness file is a no-op.
//
// Stub boundary, stated plainly (same as the diagnosis): the
// DOM stubs let the loader CONSTRUCT textures/materials in
// node; the embedded PNGs' pixel decoding is the browser's
// job and is not what is proven here. What IS proven about
// the texture is its provenance: the blob the loader built
// the map from is captured at URL.createObjectURL and its
// byte length compared to the GLB's embedded image buffer.
//
// Run: node scripts/matfix-check.mjs   (from the repo root)
// three resolution: the repo's own node_modules/three when
// installed; otherwise the diagnosis scratch install at
// /tmp/gltf-diag (three@0.180.0, the repo's declared version).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

// ----------------------------------------------------------------
// 0. Locate three@0.180.0 (the repo's declared version).
// ----------------------------------------------------------------

const threeCandidates = [
  path.join(root, "node_modules/three"),
  "/tmp/gltf-diag/node_modules/three",
];
const threeRoot = threeCandidates.find((c) =>
  existsSync(path.join(c, "package.json"))
);
check("0a three is resolvable (repo install or diagnosis scratch)", !!threeRoot, threeRoot ?? "none found");
const threePkg = JSON.parse(readFileSync(path.join(threeRoot, "package.json"), "utf8"));
check("0b three is exactly 0.180.0 (the repo's declared + diagnosed version)", threePkg.version === "0.180.0", threePkg.version);
console.log(`     three root: ${threeRoot}`);

// ----------------------------------------------------------------
// 1. DOM stubs BEFORE three loads (diagnosis pattern), with the
//    blob capture that makes texture provenance provable.
// ----------------------------------------------------------------

const blobBytesByUrl = new Map();
let blobSeq = 0;
class FakeImage {
  constructor() {
    this.width = 2;
    this.height = 2;
    this._handlers = {};
    this.__byteLength = -1;
  }
  addEventListener(ev, fn) {
    (this._handlers[ev] ??= []).push(fn);
  }
  removeEventListener() {}
  set src(v) {
    this._src = v;
    // The loader built this image from a Blob of the GLB's
    // embedded image bytes; the capture map holds its size.
    this.__byteLength = blobBytesByUrl.get(v) ?? -1;
    queueMicrotask(() => {
      this.complete = true;
      // three's ImageLoader handlers read `this` (the image) —
      // fire them bound, like a real load event.
      (this._handlers.load ?? []).forEach((f) => f.call(this));
    });
  }
  get src() {
    return this._src ?? "";
  }
}
globalThis.self = globalThis;
globalThis.navigator ??= { userAgent: "node-matfix-check" };
globalThis.document = {
  createElementNS: (_ns, tag) => (tag === "img" ? new FakeImage() : {}),
  createElement: (tag) => (tag === "img" ? new FakeImage() : {}),
};
URL.createObjectURL = (blob) => {
  const url = `blob:matfix-${blobSeq++}`;
  blobBytesByUrl.set(url, blob.size);
  return url;
};
URL.revokeObjectURL = () => {};

// ----------------------------------------------------------------
// 2. Bundle ONE entry: the app's converter module + three's
//    GLTFLoader, sharing a single three instance.
// ----------------------------------------------------------------

async function bundle(rel, out, extra = []) {
  execFileSync(
    path.join(root, "node_modules/.bin/esbuild"),
    [rel, "--bundle", "--format=esm", "--platform=node", `--outfile=${out}`, ...extra],
    { cwd: root, stdio: "pipe" }
  );
  return import(out);
}

writeFileSync(
  "/tmp/matfix-entry.ts",
  [
    `export { registerSpecGlossConverter, specGlossVerdict, SPEC_GLOSS_EXTENSION } from ${JSON.stringify(
      path.join(root, "src/dancer/specGlossMaterial.ts")
    )};`,
    `export { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";`,
    `export { SRGBColorSpace } from "three";`,
    "",
  ].join("\n")
);
const app = await bundle("/tmp/matfix-entry.ts", "/tmp/matfix-bundle.mjs", [
  `--alias:three=${path.join(threeRoot, "build/three.module.js")}`,
  `--alias:three/addons/loaders/GLTFLoader.js=${path.join(
    threeRoot,
    "examples/jsm/loaders/GLTFLoader.js"
  )}`,
]);
const { GLTFLoader, SRGBColorSpace, registerSpecGlossConverter, specGlossVerdict, SPEC_GLOSS_EXTENSION } = app;
// traumaCharacter now imports the converter (a three value
// import rides along) — bundle it against the same three.
const trauma = await bundle("src/dancer/traumaCharacter.ts", "/tmp/matfix-trauma.mjs", [
  `--alias:three=${path.join(threeRoot, "build/three.module.js")}`,
  `--alias:three/addons/loaders/GLTFLoader.js=${path.join(
    threeRoot,
    "examples/jsm/loaders/GLTFLoader.js"
  )}`,
]);
const { decodeBase64ToArrayBuffer, TRAUMA_IDLES } = trauma;

// ----------------------------------------------------------------
// 3. The pure scope rule — pinned directly, every branch.
// ----------------------------------------------------------------

const inScope = {
  extensions: {
    [SPEC_GLOSS_EXTENSION]: {
      diffuseTexture: { index: 0 },
      specularFactor: [0, 0, 0],
    },
  },
  pbrMetallicRoughness: {},
};
check("V1 the Trauma shape (diffuse-only, specular [0,0,0]) converts", specGlossVerdict(inScope).convert === true);
check(
  "V2 a specularGlossinessTexture skips (real gloss)",
  specGlossVerdict({
    ...inScope,
    extensions: {
      [SPEC_GLOSS_EXTENSION]: {
        diffuseTexture: { index: 0 },
        specularFactor: [0, 0, 0],
        specularGlossinessTexture: { index: 1 },
      },
    },
  }).convert === false
);
check(
  "V3 non-zero specularFactor skips",
  specGlossVerdict({
    ...inScope,
    extensions: {
      [SPEC_GLOSS_EXTENSION]: {
        diffuseTexture: { index: 0 },
        specularFactor: [0.25, 0.25, 0.25],
      },
    },
  }).convert === false
);
check(
  "V4 ABSENT specularFactor skips (spec default is [1,1,1])",
  specGlossVerdict({
    ...inScope,
    extensions: {
      [SPEC_GLOSS_EXTENSION]: { diffuseTexture: { index: 0 } },
    },
  }).convert === false
);
check(
  "V5 a tinted diffuseFactor skips",
  specGlossVerdict({
    ...inScope,
    extensions: {
      [SPEC_GLOSS_EXTENSION]: {
        diffuseTexture: { index: 0 },
        specularFactor: [0, 0, 0],
        diffuseFactor: [1, 0.5, 0.5, 1],
      },
    },
  }).convert === false
);
check(
  "V6 spec-gloss with no diffuseTexture skips",
  specGlossVerdict({
    extensions: {
      [SPEC_GLOSS_EXTENSION]: { specularFactor: [0, 0, 0] },
    },
  }).convert === false
);
check(
  "V7 color already in pbrMetallicRoughness skips (loader's own material stands)",
  specGlossVerdict({
    ...inScope,
    pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
  }).convert === false
);
check(
  "V8 no extension at all does not convert",
  specGlossVerdict({ pbrMetallicRoughness: {} }).convert === false
);
check(
  "V9 a skip carries its reason",
  specGlossVerdict({
    extensions: {
      [SPEC_GLOSS_EXTENSION]: {
        diffuseTexture: { index: 0 },
        specularFactor: [0, 0, 0],
        specularGlossinessTexture: { index: 1 },
      },
    },
  }).reason.includes("specularGlossinessTexture")
);

// ----------------------------------------------------------------
// 4. Parse harness — captures the loader's warnings so the
//    "Unknown extension" line itself is pinned before/after.
// ----------------------------------------------------------------

async function parseWith(buf, { convert }) {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    const loader = new GLTFLoader();
    if (convert) registerSpecGlossConverter(loader);
    const gltf = await loader.parseAsync(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      ""
    );
    return { gltf, warnings };
  } finally {
    console.warn = origWarn;
  }
}

function sceneFacts(gltf) {
  let bones = 0;
  let skinned = 0;
  const mats = new Map();
  gltf.scene.traverse((o) => {
    if (o.isBone) bones += 1;
    if (o.isSkinnedMesh) skinned += 1;
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) if (!mats.has(m.uuid)) mats.set(m.uuid, m);
  });
  return {
    bones,
    skinned,
    materials: [...mats.values()],
    clips: gltf.animations.map((a) => `${a.name}:${a.duration.toFixed(4)}`),
  };
}

function glbJson(buf) {
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
}

function embeddedImageBytes(json, textureIndex) {
  const imageIndex = json.textures[textureIndex].source;
  const bv = json.images[imageIndex].bufferView;
  return json.bufferViews[bv].byteLength;
}

// ----------------------------------------------------------------
// 5. The real Trauma GLBs — BEFORE (diagnosis) vs AFTER.
// ----------------------------------------------------------------

const readme = read("public/animations/README.md");
function recordedHash(id) {
  const label = id === "mma" ? "MMA idle" : "Bouncing fight";
  const m = readme.match(new RegExp(`${label}:\\s*\`([0-9a-f]{64})\``));
  return m ? m[1] : null;
}

for (const def of TRAUMA_IDLES) {
  const file = def.url.split("/").pop();
  const joined = Array.from({ length: 8 }, (_, i) =>
    read(`public/animations/${file}.b64.0${i}`)
  ).join("");
  const buf = Buffer.from(decodeBase64ToArrayBuffer(joined));
  const sha = createHash("sha256").update(buf).digest("hex");
  check(`R0 ${file} reassembles byte-exact (SHA-256)`, sha === recordedHash(def.id), sha.slice(0, 12) + "…");

  const json = glbJson(buf);
  const sg = json.materials[0].extensions[SPEC_GLOSS_EXTENSION];
  check(
    `R1 ${file} source shape is the diagnosed one (spec-gloss only color, empty MR)`,
    !!sg &&
      typeof sg.diffuseTexture?.index === "number" &&
      JSON.stringify(sg.specularFactor) === "[0,0,0]" &&
      sg.specularGlossinessTexture === undefined &&
      Object.keys(json.materials[0].pbrMetallicRoughness ?? {}).length === 0
  );

  // BEFORE — the plain loader: the diagnosis, reproduced.
  const before = await parseWith(buf, { convert: false });
  const bf = sceneFacts(before.gltf);
  const bm = bf.materials[0];
  check(`R2 ${file} BEFORE: one skinned mesh, one material`, bf.skinned === 1 && bf.materials.length === 1);
  check(
    `R3 ${file} BEFORE: material is the pale ghost (#ffffff, metal 1, rough 1, no map)`,
    bm.color.getHexString() === "ffffff" && bm.metalness === 1 && bm.roughness === 1 && bm.map === null,
    `color=#${bm.color.getHexString()} metal=${bm.metalness} rough=${bm.roughness} map=${bm.map ? "yes" : "no"}`
  );
  check(
    `R4 ${file} BEFORE: loader drops the extension with its warning`,
    before.warnings.some((w) => w.includes("Unknown extension") && w.includes(SPEC_GLOSS_EXTENSION)),
    before.warnings[0] ?? "(silent)"
  );

  // AFTER — the converter registered, exactly as the rig does it.
  const after = await parseWith(buf, { convert: true });
  const af = sceneFacts(after.gltf);
  const am = af.materials[0];
  check(
    `R5 ${file} AFTER: the material HAS a map`,
    am.map !== null && am.map !== undefined
  );
  check(
    `R6 ${file} AFTER: the map is the GLB's own embedded diffuse (byte length matches)`,
    am.map?.image?.__byteLength === embeddedImageBytes(json, sg.diffuseTexture.index),
    `texture bytes=${am.map?.image?.__byteLength} embedded=${embeddedImageBytes(json, sg.diffuseTexture.index)}`
  );
  check(
    `R7 ${file} AFTER: rebuilt factors — color #ffffff, metalness 0, roughness 1`,
    am.color.getHexString() === "ffffff" && am.metalness === 0 && am.roughness === 1,
    `color=#${am.color.getHexString()} metal=${am.metalness} rough=${am.roughness}`
  );
  check(
    `R8 ${file} AFTER: map rides the sRGB color slot`,
    am.map?.colorSpace === SRGBColorSpace,
    am.map?.colorSpace ?? "(none)"
  );
  check(
    `R9 ${file} AFTER: the loader's own normalMap + emissiveMap survive untouched`,
    !!bm.normalMap === !!am.normalMap && !!bm.emissiveMap === !!am.emissiveMap && !!am.normalMap && !!am.emissiveMap
  );
  check(
    `R10 ${file} AFTER: no more "Unknown extension" warning`,
    !after.warnings.some((w) => w.includes("Unknown extension"))
  );
  check(
    `R11 ${file} AFTER: skeleton + clips identical before/after`,
    af.bones === bf.bones && af.skinned === bf.skinned && JSON.stringify(af.clips) === JSON.stringify(bf.clips),
    `bones ${bf.bones}→${af.bones}, clips ${bf.clips.join(",")}`
  );
  const report = after.gltf.userData.specGloss;
  check(
    `R12 ${file} AFTER: report records exactly one conversion, no skips`,
    !!report &&
      report.notes.length === 1 &&
      report.notes[0].action === "converted" &&
      report.notes[0].materialIndex === 0,
    report ? JSON.stringify(report.notes.map((n) => n.action)) : "(no report)"
  );
}

// ----------------------------------------------------------------
// 6. Synthetic GLBs — the scope boundary, behaviorally.
// ----------------------------------------------------------------

// A real 1×1 PNG (the loader only needs genuine image bytes to
// slice into a Blob; pixel decode is the browser's, per the
// stub boundary above).
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

function buildGlb(materialDef, { specGloss = false } = {}) {
  // BIN layout: positions (36B) | png0 | png1, 4-byte aligned.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const posBytes = Buffer.from(positions.buffer);
  const pad4 = (n) => (4 - (n % 4)) % 4;
  const chunks = [];
  const views = [];
  let offset = 0;
  for (const bytes of [posBytes, PNG_1PX, PNG_1PX]) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
    chunks.push(bytes);
    offset += bytes.byteLength + pad4(bytes.byteLength);
    if (pad4(bytes.byteLength)) chunks.push(Buffer.alloc(pad4(bytes.byteLength)));
  }
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [materialDef],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.byteLength }],
    images: [
      { bufferView: 1, mimeType: "image/png" },
      { bufferView: 2, mimeType: "image/png" },
    ],
    textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }],
    samplers: [{}],
  };
  if (specGloss) {
    json.extensionsUsed = [SPEC_GLOSS_EXTENSION];
    json.extensionsRequired = [SPEC_GLOSS_EXTENSION];
  }
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = pad4(jsonBytes.byteLength);
  const binPad = pad4(bin.byteLength);
  const total =
    12 + 8 + jsonBytes.byteLength + jsonPad + 8 + bin.byteLength + binPad;
  const out = Buffer.alloc(total);
  out.write("glTF", 0, "ascii");
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let p = 12;
  out.writeUInt32LE(jsonBytes.byteLength + jsonPad, p);
  out.write("JSON", p + 4, "ascii");
  jsonBytes.copy(out, p + 8);
  out.fill(0x20, p + 8 + jsonBytes.byteLength, p + 8 + jsonBytes.byteLength + jsonPad);
  p += 8 + jsonBytes.byteLength + jsonPad;
  out.writeUInt32LE(bin.byteLength + binPad, p);
  out.write("BIN\0", p + 4, "ascii");
  bin.copy(out, p + 8);
  return out;
}

async function syntheticCase(label, materialDef, opts, expect) {
  const buf = buildGlb(materialDef, opts);
  const { gltf } = await parseWith(buf, { convert: true });
  const facts = sceneFacts(gltf);
  const m = facts.materials[0];
  const notes = gltf.userData.specGloss?.notes ?? [];
  if (expect.converted) {
    check(
      `S ${label}: converts — map bound from the embedded image, metalness 0`,
      !!m.map && m.map.image?.__byteLength === PNG_1PX.byteLength && m.metalness === 0,
      `mapBytes=${m.map?.image?.__byteLength} png=${PNG_1PX.byteLength} metal=${m.metalness}`
    );
    check(
      `S ${label}: report = one conversion`,
      notes.length === 1 && notes[0].action === "converted"
    );
  } else if (expect.untouchedReason) {
    check(
      `S ${label}: left untouched (no map, metalness stays 1)`,
      m.map === null && m.metalness === 1,
      `map=${m.map ? "yes" : "no"} metal=${m.metalness}`
    );
    check(
      `S ${label}: the skip is noted with its reason`,
      notes.length === 1 &&
        notes[0].action === "skipped" &&
        notes[0].reason.includes(expect.untouchedReason),
      notes[0]?.reason ?? "(no note)"
    );
  } else {
    check(
      `S ${label}: converter is a no-op (loader's own map + factors stand)`,
      !!m.map && m.metalness === expect.metalness && m.roughness === expect.roughness,
      `metal=${m.metalness} rough=${m.roughness}`
    );
    check(`S ${label}: report is empty (no spec-gloss, no notes)`, notes.length === 0);
  }
}

await syntheticCase(
  "gloss texture present",
  {
    pbrMetallicRoughness: {},
    extensions: {
      [SPEC_GLOSS_EXTENSION]: {
        diffuseTexture: { index: 0 },
        specularFactor: [0, 0, 0],
        specularGlossinessTexture: { index: 1 },
      },
    },
  },
  { specGloss: true },
  { untouchedReason: "specularGlossinessTexture" }
);
await syntheticCase(
  "non-zero specularFactor",
  {
    pbrMetallicRoughness: {},
    extensions: {
      [SPEC_GLOSS_EXTENSION]: {
        diffuseTexture: { index: 0 },
        specularFactor: [0.25, 0.25, 0.25],
      },
    },
  },
  { specGloss: true },
  { untouchedReason: "specularFactor" }
);
await syntheticCase(
  "in-scope synthetic (not a Trauma file)",
  {
    pbrMetallicRoughness: {},
    extensions: {
      [SPEC_GLOSS_EXTENSION]: {
        diffuseTexture: { index: 0 },
        specularFactor: [0, 0, 0],
      },
    },
  },
  { specGloss: true },
  { converted: true }
);
await syntheticCase(
  "plain metallic-roughness file",
  {
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      metallicFactor: 0.4,
      roughnessFactor: 0.6,
    },
  },
  { specGloss: false },
  { metalness: 0.4, roughness: 0.6 }
);

// ----------------------------------------------------------------
// 7. Wiring pins — both app load paths register the converter.
// ----------------------------------------------------------------

const rig = read("src/dancer/DancerRig.tsx");
check(
  "W1 the rig registers the converter on its one loader (covers built-in + picked loads)",
  rig.includes("const loader = new GLTFLoader();") &&
    rig.includes("registerSpecGlossConverter(loader);") &&
    rig.includes('from "./specGlossMaterial"')
);
const tc = read("src/dancer/traumaCharacter.ts");
check(
  "W2 loadBuiltinCharacterGltf registers the converter on the loader it is handed",
  tc.includes("registerSpecGlossConverter(loader);") &&
    tc.includes('from "./specGlossMaterial"')
);
check(
  "W3 the rig still has exactly ONE GLTFLoader construction (the shared character path)",
  (rig.match(/new GLTFLoader\(\)/g) ?? []).length === 1
);

console.log(`\nmatfix-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
