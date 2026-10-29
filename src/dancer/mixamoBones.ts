/**
 * mixamoBones — Mixamo skeleton -> the Dancer Stage's UE5 contract.
 *
 * Terrell's characters are Mixamo exports (docs/DANCER.md): a full
 * skinned character whose bones are named `mixamorig:<Bone>` with a
 * Blender duplicate suffix glued on — `mixamorig:Hips.2`,
 * `mixamorig:Spine1.4`, `mixamorig:LeftForeArm.11`. The stage's
 * driver speaks the UE5 Mannequin contract (pelvis, spine_01,
 * upperarm_l, ...), so adoption resolves every scene node through
 * this module:
 *
 *   authored name -> exact UE5 name? -> normalized Mixamo lookup
 *
 * Two loader facts shape the lookup (three r180, verified against
 * the GLTFLoader source):
 *
 * - GLTFLoader RENAMES every node to a sanitized, deduplicated
 *   form (`mixamorig:Hips.2` loads as `mixamorigHips2`) and binds
 *   animation tracks by that sanitized name — the mixer therefore
 *   just works, untouched.
 * - The AUTHORED name survives in `node.userData.name`. DancerRig
 *   resolves bones by the authored name (falling back to the node
 *   name), which keeps this mapping unambiguous — in the sanitized
 *   form `Spine1.4` and `Spine.14` would be indistinguishable,
 *   while the authored suffix is always a trailing `.N`.
 *
 * Normalization: strip the `mixamorig:` prefix, then strip ONE
 * trailing `.N` duplicate suffix. The map below is DATA — one
 * entry per contract bone; rename a row here and every Mixamo
 * character follows. Names that resolve to nothing (fingers,
 * HeadTop_End, Toe_End helpers) are skipped by the caller, never
 * an error: a partially matching rig dances with the joints it
 * has, exactly like a partial UE5 rig.
 */

/** Mixamo bone (after normalization) -> UE5 Mannequin contract name. */
export const MIXAMO_TO_UE5_BONE: Record<string, string> = {
  // Root + spine chain: note bands run down this chain (head band
  // at the top, hips band at the pelvis).
  Hips: "pelvis",
  Spine: "spine_01",
  Spine1: "spine_02",
  Spine2: "spine_03",
  Neck: "neck_01",
  Head: "head",
  // Arms: shoulder (clavicle) -> arm -> forearm -> hand, per side.
  LeftShoulder: "clavicle_l",
  LeftArm: "upperarm_l",
  LeftForeArm: "lowerarm_l",
  LeftHand: "hand_l",
  RightShoulder: "clavicle_r",
  RightArm: "upperarm_r",
  RightForeArm: "lowerarm_r",
  RightHand: "hand_r",
  // Legs: up-leg (thigh) -> leg (calf) -> foot -> toe base (ball).
  LeftUpLeg: "thigh_l",
  LeftLeg: "calf_l",
  LeftFoot: "foot_l",
  LeftToeBase: "ball_l",
  RightUpLeg: "thigh_r",
  RightLeg: "calf_r",
  RightFoot: "foot_r",
  RightToeBase: "ball_r",
};

/**
 * Normalize an authored Mixamo bone name for the map lookup:
 * `mixamorig:LeftForeArm.11` -> `LeftForeArm`. A name without the
 * prefix still gets its `.N` suffix stripped (`Hips.2` -> `Hips`),
 * so raw exports resolve the same way.
 */
export function normalizeMixamoBoneName(raw: string): string {
  let n = raw.trim();
  if (n.startsWith("mixamorig:")) n = n.slice("mixamorig:".length);
  return n.replace(/\.\d+$/, "");
}

/**
 * Resolve any scene node's authored name to a UE5 contract bone
 * name, or null when the node is not a contract bone. Exact UE5
 * names pass through first (Unreal exports bind exactly as
 * before); Mixamo names go through the map. `contract` is the
 * caller's bone set (DancerRig's UE5_BONE_NAMES) so this module
 * stays the single source for the MAPPING, not the contract.
 */
export function resolveContractBoneName(
  raw: string,
  contract: ReadonlySet<string>
): string | null {
  if (!raw) return null;
  if (contract.has(raw)) return raw;
  const mapped = MIXAMO_TO_UE5_BONE[normalizeMixamoBoneName(raw)];
  return mapped !== undefined && contract.has(mapped) ? mapped : null;
}
