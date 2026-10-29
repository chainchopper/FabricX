/**
 * dancer-idle-check — node check for Slice 25's dancer idle
 * wiring (src/dancer/mixamoBones.ts + traumaCharacter.ts, both
 * pure modules).
 *
 * Proves: the Mixamo map covers the full UE5 contract (every
 * contract bone has exactly one Mixamo source, no collisions);
 * authored Mixamo names (`mixamorig:Hips.2`, the Trauma files'
 * real names) normalize + resolve to the right contract bones;
 * exact UE5 names pass through untouched; helper bones (fingers,
 * end nodes) resolve to null instead of crashing; sanitized
 * loader names are NOT silently misresolved (Spine1 vs Spine is
 * the trap — resolution is defined on authored names); and the
 * Trauma catalog defaults to MMA with same-origin .glb URLs
 * behind the one config constant.
 *
 * The companion device-side facts (both real GLBs parse, clips
 * are 5.0 s / 2.97 s, every contract bone present in the files)
 * are verified against the actual asset files at build time —
 * the files are binaries and deliberately not in this repo AS
 * binaries. Slice 26 commits them as base64 text parts under
 * public/animations/ instead; this script also proves the
 * chunked decoder those parts rely on (synthetic payloads here;
 * byte-exactness of the real parts against the original GLBs is
 * proven in Slice 26's verification record) and that the rig
 * routes ONLY built-in binds through the transport fallback.
 *
 * Run: esbuild src/dancer/mixamoBones.ts src/dancer/traumaCharacter.ts \
 *        --bundle --format=esm --outdir=/tmp/slice25-check
 *      (bundle each entry separately, or pass both files:)
 *      esbuild src/dancer/mixamoBones.ts --bundle --format=esm --outfile=/tmp/mixamoBones.mjs
 *      esbuild src/dancer/traumaCharacter.ts --bundle --format=esm --outfile=/tmp/traumaCharacter.mjs
 *      node scripts/dancer-idle-check.mjs /tmp/mixamoBones.mjs /tmp/traumaCharacter.mjs
 */
const bones = await import(process.argv[2] ?? "/tmp/mixamoBones.mjs");
const trauma = await import(process.argv[3] ?? "/tmp/traumaCharacter.mjs");
const { MIXAMO_TO_UE5_BONE, normalizeMixamoBoneName, resolveContractBoneName } =
  bones;
const { TRAUMA_IDLES, DEFAULT_TRAUMA_IDLE_ID, traumaIdleDef, CHARACTER_ASSET_BASE_URL,
  decodeBase64ToArrayBuffer } =
  trauma;

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

// The UE5 contract, mirrored from docs/DANCER.md / DancerRig.
const CONTRACT = new Set([
  "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head",
  "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r",
  "lowerarm_l", "lowerarm_r", "hand_l", "hand_r",
  "thigh_l", "thigh_r", "calf_l", "calf_r",
  "foot_l", "foot_r", "ball_l", "ball_r",
]);

console.log("== the map covers the contract, one source per bone ==");
{
  const targets = Object.values(MIXAMO_TO_UE5_BONE);
  check("every map target is a contract bone", targets.every((t) => CONTRACT.has(t)));
  check("every contract bone has a Mixamo source",
    [...CONTRACT].every((c) => targets.includes(c)));
  check("no two Mixamo bones map to the same contract bone",
    new Set(targets).size === targets.length);
}

console.log("== authored names from the real Trauma files resolve ==");
{
  // Node names exactly as authored in Trauma_Mma_Idle.glb /
  // Trauma_Bouncing_Fight_Idles.glb (identical skeletons).
  const cases = {
    "mixamorig:Hips.2": "pelvis",
    "mixamorig:Spine.3": "spine_01",
    "mixamorig:Spine1.4": "spine_02",
    "mixamorig:Spine2.5": "spine_03",
    "mixamorig:Neck.6": "neck_01",
    "mixamorig:Head.7": "head",
    "mixamorig:LeftShoulder.9": "clavicle_l",
    "mixamorig:LeftArm.10": "upperarm_l",
    "mixamorig:LeftForeArm.11": "lowerarm_l",
    "mixamorig:LeftHand.12": "hand_l",
    "mixamorig:RightShoulder.17": "clavicle_r",
    "mixamorig:RightArm.18": "upperarm_r",
    "mixamorig:RightForeArm.19": "lowerarm_r",
    "mixamorig:RightHand.20": "hand_r",
    "mixamorig:LeftUpLeg.25": "thigh_l",
    "mixamorig:LeftLeg.26": "calf_l",
    "mixamorig:LeftFoot.27": "foot_l",
    "mixamorig:LeftToeBase.28": "ball_l",
    "mixamorig:RightUpLeg.30": "thigh_r",
    "mixamorig:RightLeg.31": "calf_r",
    "mixamorig:RightFoot.32": "foot_r",
    "mixamorig:RightToeBase.33": "ball_r",
  };
  for (const [raw, want] of Object.entries(cases)) {
    check(`${raw} -> ${want}`, resolveContractBoneName(raw, CONTRACT) === want);
  }
  const resolved = new Set(
    Object.keys(cases).map((raw) => resolveContractBoneName(raw, CONTRACT))
  );
  check("zero unmapped REQUIRED bones across the skeleton",
    resolved.size === CONTRACT.size && [...CONTRACT].every((c) => resolved.has(c)));
}

console.log("== normalization + pass-through + honest nulls ==");
{
  check("suffix strip: mixamorig:Spine1.4 -> Spine1",
    normalizeMixamoBoneName("mixamorig:Spine1.4") === "Spine1");
  check("suffix strip without prefix: Hips.2 -> Hips",
    normalizeMixamoBoneName("Hips.2") === "Hips");
  check("exact UE5 name passes through",
    resolveContractBoneName("upperarm_l", CONTRACT) === "upperarm_l");
  check("helper bone resolves null (HeadTop_End)",
    resolveContractBoneName("mixamorig:HeadTop_End.8", CONTRACT) === null);
  check("finger bone resolves null (LeftHandIndex1)",
    resolveContractBoneName("mixamorig:LeftHandIndex1.13", CONTRACT) === null);
  check("empty name resolves null", resolveContractBoneName("", CONTRACT) === null);
  check("sanitized loader name is not misresolved as a contract bone",
    resolveContractBoneName("mixamorigSpine14", CONTRACT) === null);
}

console.log("== the Trauma catalog ==");
{
  check("default idle is MMA", DEFAULT_TRAUMA_IDLE_ID === "mma");
  check("two idles in the catalog", TRAUMA_IDLES.length === 2);
  check("every idle URL hangs off the one config constant",
    TRAUMA_IDLES.every((d) => d.url.startsWith(`${CHARACTER_ASSET_BASE_URL}/`)));
  check("every idle URL is a .glb",
    TRAUMA_IDLES.every((d) => d.url.endsWith(".glb")));
  check("unset value coerces to the MMA default",
    traumaIdleDef(undefined).id === "mma");
  check("stored value resolves to itself",
    traumaIdleDef("bouncing").id === "bouncing");
  check("garbage value falls back to the default, never crashes",
    traumaIdleDef("nonsense").id === "mma");
}

console.log("== the base64 transport decoder (Slice 26) ==");
{
  // Short vector, wrapped at 76 columns exactly like the parts.
  const raw = new TextEncoder().encode("glTF-chunked-decode");
  const wrapped = Buffer.from(raw).toString("base64").replace(/.{76}/g, "$&\n");
  const back = new Uint8Array(decodeBase64ToArrayBuffer(wrapped));
  check("short wrapped payload round-trips",
    Buffer.from(back).equals(Buffer.from(raw)));
  // Large vector spanning many decode chunks (chunk = 32,764
  // base64 chars): ~2M chars in, byte-identical out.
  const big = Buffer.alloc(1_500_003);
  for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff;
  const bigB64 = big.toString("base64").replace(/.{76}/g, "$&\n");
  const bigBack = new Uint8Array(decodeBase64ToArrayBuffer(bigB64));
  check("multi-chunk payload is byte-identical",
    bigBack.length === big.length && Buffer.from(bigBack).equals(big));
  check("decoder ignores stray whitespace",
    Buffer.from(new Uint8Array(decodeBase64ToArrayBuffer("  Z2xU\nRg==  "))).toString() === "glTF");
}

console.log("== the rig routes built-in binds through the transport ==");
{
  const { readFileSync } = await import("node:fs");
  const rig = readFileSync(
    new URL("../src/dancer/DancerRig.tsx", import.meta.url), "utf8");
  check("rig imports the built-in loader",
    rig.includes("loadBuiltinCharacterGltf"));
  check("built-in binds are gated on charState.builtin",
    /charState\.builtin\s*\?\s*loadBuiltinCharacterGltf\(loader, url\)/.test(rig));
  check("non-built-in binds keep plain loadAsync",
    rig.includes(": loader.loadAsync(url)"));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
