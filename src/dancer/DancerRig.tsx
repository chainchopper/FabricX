/**
 * DancerRig — one body on the Dancer Stage.
 *
 * Stage v2 ("Ghostie Dancers", Terrell, Oct 28): the stage holds a
 * CAST — one rig per participant, and each rig IS that
 * participant's ghostie embodied. A rig is tinted by its owner's
 * signature hue and wears their name (the local rig: the ghost's
 * own name + hue). Each rig has its OWN DancerDriver, fed only its
 * owner's notes/verbs (attribution lives in DancerStage +
 * useStageNotes); a RigStyle scales how the body takes the pose —
 * the local ghostie's temperament lives in its motion, remotes
 * dance neutral (their temperament is not on the wire).
 *
 * Two figures share one pose pipeline:
 *
 *  1. THE MANNEQUIN (default): a stylized figure built procedurally
 *     on the UE5 Mannequin skeleton — a THREE.Skeleton of named
 *     bones (pelvis, spine_01…03, neck_01, head, clavicle/upperarm/
 *     lowerarm/hand l+r, thigh/calf/foot/ball l+r) skinned to
 *     capsule segments, one SkinnedMesh, six materials (one per
 *     DancerDriver band) so a firing band GLOWS in its note's hue.
 *
 *  2. THE CHARACTER SLOT: when the user loads a glTF from the
 *     stage's settings, GLTFLoader brings it in and it REPLACES the
 *     mannequin — bound by bone NAME against the same UE5 contract
 *     (stageCharacter store; docs/DANCER.md). Bones may also arrive
 *     as a Mixamo skeleton (`mixamorig:Hips.2`, ...) — mixamoBones
 *     maps those onto the contract at adoption. Missing bones are
 *     skipped silently; a failed load leaves the mannequin standing
 *     (the labeled fallback). While a load is IN FLIGHT the rig
 *     renders NO figure at all — the bare mannequin must never
 *     stand as a loading placeholder, where it reads as "the
 *     mannequin is the dancer" (Terrell, Nov 2); the stage shows
 *     its "Loading your character…" note instead.
 *     The slot exists ONLY on the local rig (characterSlot): the
 *     character is YOUR ghostie's body. Models never travel over
 *     the wire — remote ghosties always wear their hue mannequins.
 *
 *     A character that carries an animation clip — the built-in
 *     Trauma above all (traumaCharacter.ts) — gets an IDLE LAYER:
 *     an AnimationMixer loops the clip as the body's base pose,
 *     and the driver's band impulses compose ADDITIVELY over each
 *     frame's clip pose, so the notes still move the body down
 *     the bands while it idles. That is the stage's idle doctrine
 *     for a bound character: the idle clip IS the ambient
 *     behavior — when nobody plays, the character doesn't freeze,
 *     it idles; when the figure is switched off (THIS LAYER), the
 *     mixer rests and the body returns to its bind pose like the
 *     rest of the cast. The character's authored materials stay,
 *     washed lightly toward the owner's hue so the ghostie's
 *     identity still reads (the name tag flies regardless).
 *
 * The DancerDriver is the only choreographer: tick() yields
 * per-band offsets (spring return-to-rest) + the breath phase, and
 * applyPose turns them into joint rotations composed over each
 * figure's captured rest pose. Verb gestures (HEART / CHEER /
 * TICKLE) ride the SAME band channels as additive extras with
 * their own envelopes — HEART lifts both arms and swells the
 * chest, CHEER raises alternating arms with a leg bounce, TICKLE
 * is a fast hips/torso wiggle.
 *
 * Figure off (THIS LAYER: stageDancerEnabled=false) → every rig's
 * offsets are zeroed and the whole cast simply stands at rest.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { DancerDriver, DancerPose, DancerBandId } from "./DancerDriver";
import type { StageFxState } from "./stageFx";
import { NEUTRAL_STYLE, type RigStyle } from "./stageRoster";
import RigLabel from "./RigLabel";
import { resolveContractBoneName } from "./mixamoBones";
import {
  getStageCharacterState,
  setStageCharacterStatus,
  subscribeStageCharacter,
  type StageCharacterState,
} from "./stageCharacter";
import { loadBuiltinCharacterGltf } from "./traumaCharacter";
import { registerSpecGlossConverter } from "./specGlossMaterial";

/** The UE5 Mannequin bone contract (docs/DANCER.md). */
export const UE5_BONE_NAMES = [
  "pelvis",
  "spine_01",
  "spine_02",
  "spine_03",
  "neck_01",
  "head",
  "clavicle_l",
  "clavicle_r",
  "upperarm_l",
  "upperarm_r",
  "lowerarm_l",
  "lowerarm_r",
  "hand_l",
  "hand_r",
  "thigh_l",
  "thigh_r",
  "calf_l",
  "calf_r",
  "foot_l",
  "foot_r",
  "ball_l",
  "ball_r",
] as const;

const UE5_SET = new Set<string>(UE5_BONE_NAMES);

// ---------------------------------------------------------------------------
// Procedural mannequin
// ---------------------------------------------------------------------------

interface BoneDef {
  name: string;
  parent: string | null;
  pos: [number, number, number];
}

const BONE_DEFS: BoneDef[] = [
  { name: "pelvis", parent: null, pos: [0, 0.95, 0] },
  { name: "spine_01", parent: "pelvis", pos: [0, 0.12, 0] },
  { name: "spine_02", parent: "spine_01", pos: [0, 0.13, 0] },
  { name: "spine_03", parent: "spine_02", pos: [0, 0.12, 0] },
  { name: "neck_01", parent: "spine_03", pos: [0, 0.14, 0] },
  { name: "head", parent: "neck_01", pos: [0, 0.09, 0] },
  { name: "clavicle_l", parent: "spine_03", pos: [0.05, 0.1, 0] },
  { name: "upperarm_l", parent: "clavicle_l", pos: [0.15, 0.01, 0] },
  { name: "lowerarm_l", parent: "upperarm_l", pos: [0.26, 0, 0] },
  { name: "hand_l", parent: "lowerarm_l", pos: [0.24, 0, 0] },
  { name: "clavicle_r", parent: "spine_03", pos: [-0.05, 0.1, 0] },
  { name: "upperarm_r", parent: "clavicle_r", pos: [-0.15, 0.01, 0] },
  { name: "lowerarm_r", parent: "upperarm_r", pos: [-0.26, 0, 0] },
  { name: "hand_r", parent: "lowerarm_r", pos: [-0.24, 0, 0] },
  { name: "thigh_l", parent: "pelvis", pos: [0.1, -0.03, 0] },
  { name: "calf_l", parent: "thigh_l", pos: [0, -0.42, 0] },
  { name: "foot_l", parent: "calf_l", pos: [0, -0.41, 0] },
  { name: "ball_l", parent: "foot_l", pos: [0, -0.03, 0.07] },
  { name: "thigh_r", parent: "pelvis", pos: [-0.1, -0.03, 0] },
  { name: "calf_r", parent: "thigh_r", pos: [0, -0.42, 0] },
  { name: "foot_r", parent: "calf_r", pos: [0, -0.41, 0] },
  { name: "ball_r", parent: "foot_r", pos: [0, -0.03, 0.07] },
];

interface SegmentDef {
  bone: string;
  band: DancerBandId;
  from: [number, number, number];
  to: [number, number, number];
  radius: number;
}

/** Capsule runs in bind-pose world space (rest rotations are identity). */
const SEGMENTS: SegmentDef[] = [
  { bone: "pelvis", band: "hips", from: [-0.13, 0.95, 0], to: [0.13, 0.95, 0], radius: 0.1 },
  { bone: "spine_01", band: "torso", from: [0, 0.99, 0], to: [0, 1.19, 0], radius: 0.095 },
  { bone: "spine_02", band: "chest", from: [0, 1.19, 0], to: [0, 1.31, 0], radius: 0.1 },
  { bone: "spine_03", band: "chest", from: [0, 1.31, 0], to: [0, 1.44, 0], radius: 0.095 },
  { bone: "clavicle_l", band: "chest", from: [0.01, 1.4, 0], to: [0.2, 1.43, 0], radius: 0.042 },
  { bone: "clavicle_r", band: "chest", from: [-0.01, 1.4, 0], to: [-0.2, 1.43, 0], radius: 0.042 },
  { bone: "neck_01", band: "head", from: [0, 1.44, 0], to: [0, 1.56, 0], radius: 0.04 },
  { bone: "upperarm_l", band: "arms", from: [0.19, 1.43, 0], to: [0.46, 1.43, 0], radius: 0.05 },
  { bone: "lowerarm_l", band: "arms", from: [0.46, 1.43, 0], to: [0.7, 1.43, 0], radius: 0.042 },
  { bone: "hand_l", band: "arms", from: [0.7, 1.43, 0], to: [0.79, 1.43, 0], radius: 0.034 },
  { bone: "upperarm_r", band: "arms", from: [-0.19, 1.43, 0], to: [-0.46, 1.43, 0], radius: 0.05 },
  { bone: "lowerarm_r", band: "arms", from: [-0.46, 1.43, 0], to: [-0.7, 1.43, 0], radius: 0.042 },
  { bone: "hand_r", band: "arms", from: [-0.7, 1.43, 0], to: [-0.79, 1.43, 0], radius: 0.034 },
  { bone: "thigh_l", band: "legs", from: [0.1, 0.93, 0], to: [0.1, 0.5, 0], radius: 0.07 },
  { bone: "calf_l", band: "legs", from: [0.1, 0.5, 0], to: [0.1, 0.1, 0], radius: 0.05 },
  { bone: "foot_l", band: "legs", from: [0.1, 0.09, 0], to: [0.1, 0.045, 0.09], radius: 0.038 },
  { bone: "thigh_r", band: "legs", from: [-0.1, 0.93, 0], to: [-0.1, 0.5, 0], radius: 0.07 },
  { bone: "calf_r", band: "legs", from: [-0.1, 0.5, 0], to: [-0.1, 0.1, 0], radius: 0.05 },
  { bone: "foot_r", band: "legs", from: [-0.1, 0.09, 0], to: [-0.1, 0.045, 0.09], radius: 0.038 },
];

/** Merge order = material order: one material per driver band. */
const BAND_ORDER: DancerBandId[] = ["head", "chest", "arms", "torso", "hips", "legs"];

interface Mannequin {
  mesh: THREE.SkinnedMesh;
  bones: Map<string, THREE.Object3D>;
  rest: Map<string, THREE.Quaternion>;
  materials: Record<DancerBandId, THREE.MeshStandardMaterial>;
}

function skinGeometry(
  geo: THREE.BufferGeometry,
  boneIndex: number
): THREE.BufferGeometry {
  const count = geo.getAttribute("position").count;
  const idx = new Uint16Array(count * 4);
  const wgt = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    idx[i * 4] = boneIndex;
    wgt[i * 4] = 1;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wgt, 4));
  return geo;
}

function buildMannequin(tintHue: number | null): Mannequin {
  const bones = new Map<string, THREE.Bone>();
  const ordered: THREE.Bone[] = [];
  for (const def of BONE_DEFS) {
    const bone = new THREE.Bone();
    bone.name = def.name;
    bone.position.set(def.pos[0], def.pos[1], def.pos[2]);
    bones.set(def.name, bone);
    ordered.push(bone);
    if (def.parent) bones.get(def.parent)!.add(bone);
  }
  const root = bones.get("pelvis")!;
  root.updateMatrixWorld(true);

  const boneIndex = new Map(BONE_DEFS.map((d, i) => [d.name, i]));
  const up = new THREE.Vector3(0, 1, 0);
  const geoms: THREE.BufferGeometry[] = [];
  // Parallel to `geoms`: which band material each geometry belongs
  // to. mergeGeometries(useGroups) numbers groups per-geometry, so
  // the group -> material map is rewritten to band indices below.
  const geomBands: number[] = [];

  const capsule = (seg: SegmentDef) => {
    const from = new THREE.Vector3(...seg.from);
    const to = new THREE.Vector3(...seg.to);
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.CapsuleGeometry(
      seg.radius,
      Math.max(0.02, len - seg.radius * 0.4),
      4,
      12
    );
    const q = new THREE.Quaternion().setFromUnitVectors(
      up,
      dir.clone().normalize()
    );
    const mid = from.clone().add(to).multiplyScalar(0.5);
    geo.applyQuaternion(q);
    geo.translate(mid.x, mid.y, mid.z);
    geoms.push(skinGeometry(geo, boneIndex.get(seg.bone)!));
    geomBands.push(BAND_ORDER.indexOf(seg.band));
  };

  // Head is a sphere, not a capsule — push it with the head band.
  for (const band of BAND_ORDER) {
    if (band === "head") {
      const s = new THREE.SphereGeometry(0.105, 24, 18);
      s.translate(0, 1.68, 0);
      geoms.push(skinGeometry(s, boneIndex.get("head")!));
      geomBands.push(BAND_ORDER.indexOf("head"));
    }
    for (const seg of SEGMENTS) {
      if (seg.band === band) capsule(seg);
    }
  }

  const materials = {} as Record<DancerBandId, THREE.MeshStandardMaterial>;
  for (const band of BAND_ORDER) {
    materials[band] = new THREE.MeshStandardMaterial({
      // Stage v2: the body wears its owner's signature hue — a soft
      // tint over the v1 mannequin pale, light enough that a firing
      // band's emissive still reads as the note's own color.
      color:
        tintHue === null
          ? new THREE.Color("#d9e0e8")
          : new THREE.Color().setHSL(
              (((tintHue % 360) + 360) % 360) / 360,
              0.32,
              0.74
            ),
      metalness: 0.25,
      roughness: 0.38,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: 0,
    });
  }

  const merged = mergeGeometries(geoms, true)!;
  merged.groups.forEach((g, i) => {
    g.materialIndex = geomBands[i] ?? 0;
  });
  const mesh = new THREE.SkinnedMesh(
    merged,
    BAND_ORDER.map((b) => materials[b])
  );
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(ordered));
  mesh.frustumCulled = false;

  const rest = new Map<string, THREE.Quaternion>();
  bones.forEach((b, name) => rest.set(name, b.quaternion.clone()));
  const objMap = new Map<string, THREE.Object3D>();
  bones.forEach((b, name) => objMap.set(name, b));
  return { mesh, bones: objMap, rest, materials };
}

// ---------------------------------------------------------------------------
// Verb gesture choreography (additive extras on the same band channels)
// ---------------------------------------------------------------------------

interface GestureExtra {
  arms: number;
  armsAlt: number;
  chest: number;
  legsBounce: number;
  wiggle: number;
}

const zeroExtra = (): GestureExtra => ({
  arms: 0,
  armsAlt: 0,
  chest: 0,
  legsBounce: 0,
  wiggle: 0,
});

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** Attack / hold / release envelope over `dur` seconds. */
function envelope(t: number, dur: number, attack: number, release: number) {
  if (t < 0 || t > dur) return 0;
  return Math.min(smooth(t / attack), smooth((dur - t) / release));
}

function gestureExtra(
  active: { verb: string; start: number }[],
  t: number
): GestureExtra {
  const ex = zeroExtra();
  for (const g of active) {
    const lt = t - g.start;
    if (g.verb === "heart") {
      // Both arms lift and open, chest swells — 1.7 s.
      const e = envelope(lt, 1.7, 0.35, 0.65);
      ex.arms += e * 0.95;
      ex.chest += e * 0.5;
    } else if (g.verb === "cheer") {
      // Arms up, alternating wave, legs bounce — 1.9 s.
      const e = envelope(lt, 1.9, 0.25, 0.5);
      ex.arms += e * 0.7;
      ex.armsAlt += Math.sin(lt * Math.PI * 2 * 2.2) * 0.38 * e;
      ex.legsBounce += Math.abs(Math.sin(lt * Math.PI * 2 * 2.6)) * e;
    } else if (g.verb === "tickle") {
      // Fast hips/torso wiggle, decaying — 1.3 s.
      if (lt >= 0 && lt <= 1.3) {
        const decay = 1 - lt / 1.3;
        ex.wiggle += Math.sin(lt * Math.PI * 2 * 11) * 0.3 * decay * decay;
      }
    }
  }
  return ex;
}

// ---------------------------------------------------------------------------
// Pose application: band state -> joint rotations over the rest pose
// ---------------------------------------------------------------------------

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

function applyPose(
  bones: Map<string, THREE.Object3D>,
  rest: Map<string, THREE.Quaternion>,
  pose: DancerPose,
  extra: GestureExtra,
  enabled: boolean,
  style: RigStyle = NEUTRAL_STYLE
) {
  const byId = new Map(pose.bands.map((b) => [b.id, b]));
  // Stage v2 style: band offsets scale by the rig's motion (the
  // local ghostie's temperament; neutral for remotes), the idle
  // breath by its sway. Gesture extras stay literal — a HEART is a
  // HEART at any temperament; the root bounce (useFrame) takes the
  // style's bounce.
  const off = (id: DancerBandId) =>
    enabled ? (byId.get(id)?.offset ?? 0) * style.motion : 0;
  const en = (id: DancerBandId) => (enabled ? byId.get(id)?.energy ?? 0 : 0);
  const breath = enabled ? pose.breath * style.sway : 0;
  const ex = enabled ? extra : zeroExtra();

  const set = (name: string, x: number, y: number, z: number) => {
    const b = bones.get(name);
    const r = rest.get(name);
    if (!b || !r) return; // missing bones are skipped silently
    _e.set(x, y, z);
    _q.setFromEuler(_e);
    b.quaternion.copy(r).multiply(_q);
  };

  const armsOff = off("arms");
  const raise =
    clamp01(Math.abs(armsOff) * 0.4 + en("arms") * 0.3) * 0.45 + ex.arms;
  const legsOff = off("legs");
  const kneeBend = en("legs") * 0.3 + Math.abs(legsOff) * 0.35;

  // Hips -> pelvis (+ tickle wiggle, breath sway)
  set(
    "pelvis",
    ex.wiggle * 0.2,
    off("hips") * 0.22,
    off("hips") * 0.16 + ex.wiggle * 0.5 + breath * 0.02
  );
  // Torso -> spine_01
  set("spine_01", en("torso") * 0.05, 0, off("torso") * 0.22 + ex.wiggle * 0.35 + breath * 0.015);
  // Chest -> spine_02 / spine_03 (+ heart swell)
  set("spine_02", -ex.chest * 0.07, off("chest") * 0.15, off("chest") * 0.17);
  set("spine_03", 0, off("chest") * 0.1, off("chest") * 0.08);
  set("clavicle_l", 0, 0, 0.1 + raise * 0.22);
  set("clavicle_r", 0, 0, -(0.1 + raise * 0.22));
  // Head -> neck_01 / head
  set("neck_01", off("head") * 0.1 + breath * 0.02, off("head") * 0.5, 0);
  set("head", 0, off("head") * 0.32, off("head") * 0.16);
  // Arms -> upperarm / lowerarm / hand (raise lifts both; alt waves them)
  set("upperarm_l", armsOff * 0.22, 0, 0.06 + armsOff * 0.5 + raise * 1.25 + ex.armsAlt);
  set("upperarm_r", armsOff * 0.22, 0, -(0.06 + armsOff * 0.5 + raise * 1.25) + ex.armsAlt);
  set("lowerarm_l", 0, -(0.15 + raise * 0.55 + en("arms") * 0.15), armsOff * 0.2);
  set("lowerarm_r", 0, 0.15 + raise * 0.55 + en("arms") * 0.15, -armsOff * 0.2);
  set("hand_l", 0, -raise * 0.3, 0);
  set("hand_r", 0, raise * 0.3, 0);
  // Legs -> thigh / calf / foot / ball (scissor swing + knee bend)
  set("thigh_l", legsOff * 0.34 - ex.legsBounce * 0.12, 0, 0);
  set("thigh_r", -legsOff * 0.34 - ex.legsBounce * 0.12, 0, 0);
  set("calf_l", kneeBend, 0, 0);
  set("calf_r", kneeBend, 0, 0);
  set("foot_l", -kneeBend * 0.5, 0, 0);
  set("foot_r", -kneeBend * 0.5, 0, 0);
  set("ball_l", -kneeBend * 0.3, 0, 0);
  set("ball_r", -kneeBend * 0.3, 0, 0);
}

// ---------------------------------------------------------------------------
// The rig component
// ---------------------------------------------------------------------------

interface AdoptedCharacter {
  scene: THREE.Object3D;
  bones: Map<string, THREE.Object3D>;
  /** Bind-pose quaternions — the pose base when no clip plays
   *  (and the rest the body returns to when the figure is off). */
  rest: Map<string, THREE.Quaternion>;
  /** Per-frame clip pose, preallocated at adoption: when a mixer
   *  plays, useFrame snapshots the clip's quaternions here and
   *  applyPose composes the driver's impulses over them. */
  clipBase: Map<string, THREE.Quaternion>;
  /** The idle layer: a looping AnimationMixer over the loaded
   *  clip, or null when the character carries no animation. */
  mixer: THREE.AnimationMixer | null;
}

export default function DancerRig({
  driver,
  fx,
  figureEnabled,
  rigKey,
  position = [0, 0, 0],
  rotationY = 0,
  tintHue = null,
  label = null,
  characterSlot = false,
  style = NEUTRAL_STYLE,
  aura = false,
}: {
  driver: DancerDriver;
  fx: StageFxState;
  figureEnabled: boolean;
  /** Participant id this rig embodies — its gesture-queue key. */
  rigKey: string;
  position?: [number, number, number];
  rotationY?: number;
  /** Owner's signature hue; tints the mannequin + the name tag. */
  tintHue?: number | null;
  /** Floating name over the rig (local: the ghost's name). */
  label?: string | null;
  /** True only for the LOCAL rig: the glTF slot is your ghostie's body. */
  characterSlot?: boolean;
  style?: RigStyle;
  /**
   * Slice 24: the Stage Aura power-up — a soft hue ring on the
   * floor under this rig. Passed only for the local rig whose
   * primary earned Stage Presence and equipped it; remote rigs
   * never carry it (their equip state is theirs).
   */
  aura?: boolean;
}) {
  const mannequin = useMemo(() => buildMannequin(tintHue), [tintHue]);
  const groupRef = useRef<THREE.Group>(null);
  const gesturesRef = useRef<{ verb: string; start: number }[]>([]);
  const styleRef = useRef(style);
  styleRef.current = style;
  // Slice 24: the aura ring's color — the rig's own hue, lit.
  const auraColor = useMemo(() => {
    const hue = (((tintHue ?? 190) % 360) + 360) % 360;
    return new THREE.Color().setHSL(hue / 360, 0.85, 0.6);
  }, [tintHue]);

  const [charState, setCharState] = useState<StageCharacterState>(
    getStageCharacterState()
  );
  useEffect(() => subscribeStageCharacter(setCharState), []);

  const [character, setCharacter] = useState<AdoptedCharacter | null>(null);

  // Load / unload the user's glTF character — LOCAL RIG ONLY: the
  // character is your ghostie's body. Remote rigs never load it
  // (models don't travel; a remote ghostie wears its hue mannequin
  // on every client). Any failure — network, parse, or a model
  // with no pelvis to drive — reports "failed" and the mannequin
  // keeps the stage.
  //
  // Built-in binds (Trauma, charState.builtin) resolve through
  // traumaCharacter: raw .glb first, the base64 transport second.
  // Picked files (blob URLs) and every other URL keep the plain
  // loader path below, untouched. ONE loader serves both paths,
  // and it carries the spec-gloss converter (Slice 42), so a
  // legacy spec-gloss material is rebuilt on either path.
  useEffect(() => {
    const url = characterSlot ? charState.url : null;
    if (!url) {
      setCharacter(null);
      return;
    }
    let cancelled = false;
    let adopted: AdoptedCharacter | null = null;
    setStageCharacterStatus("loading");
    const loader = new GLTFLoader();
    // Slice 42: the spec-gloss → metallic-roughness converter
    // rides this loader (specGlossMaterial.ts). Trauma's only
    // color texture lives in the legacy spec-gloss extension
    // three r180 drops; without this, a successful bind still
    // renders as an untextured pale figure.
    registerSpecGlossConverter(loader);
    const loading = charState.builtin
      ? loadBuiltinCharacterGltf(loader, url)
      : loader.loadAsync(url);
    loading
      .then((gltf) => {
        if (cancelled) return;
        const bones = new Map<string, THREE.Object3D>();
        const rest = new Map<string, THREE.Quaternion>();
        gltf.scene.traverse((obj) => {
          // Resolve by the AUTHORED name: GLTFLoader renames
          // nodes to a sanitized unique form and keeps the
          // authored name in userData.name (mixamoBones.ts has
          // the why). UE5 names bind exactly; Mixamo names map
          // onto the contract; anything else is skipped.
          const authored =
            typeof obj.userData?.name === "string" && obj.userData.name
              ? obj.userData.name
              : obj.name;
          const contract = resolveContractBoneName(authored, UE5_SET);
          if (contract && !bones.has(contract)) {
            bones.set(contract, obj);
            rest.set(contract, obj.quaternion.clone());
          }
        });
        if (!bones.has("pelvis")) {
          setStageCharacterStatus("failed");
          setCharacter(null);
          return;
        }
        // Normalize: ~1.78 m tall, feet on the floor, centered.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0.01) {
          gltf.scene.scale.multiplyScalar(1.78 / size.y);
          const box2 = new THREE.Box3().setFromObject(gltf.scene);
          gltf.scene.position.y -= box2.min.y;
          gltf.scene.position.x -= (box2.min.x + box2.max.x) / 2;
          gltf.scene.position.z -= (box2.min.z + box2.max.z) / 2;
        }
        // Identity wash: the character keeps its authored
        // materials, tinted lightly toward the owner's hue so
        // the ghostie still reads as ITSELF in the cast (its
        // name tag carries the same hue). Each unique material
        // is washed once, however many meshes share it.
        if (tintHue !== null) {
          const wash = new THREE.Color().setHSL(
            (((tintHue % 360) + 360) % 360) / 360,
            0.55,
            0.55
          );
          const seen = new Set<THREE.Material>();
          gltf.scene.traverse((obj) => {
            const mats = (obj as THREE.Mesh).material;
            for (const m of mats
              ? Array.isArray(mats)
                ? mats
                : [mats]
              : []) {
              if (seen.has(m)) continue;
              seen.add(m);
              const col = (m as THREE.MeshStandardMaterial).color;
              if (col) col.lerp(wash, 0.22);
            }
          });
        }
        // The idle layer: a character carrying a clip (Trauma's
        // GLBs are character + idle in one file) loops it through
        // a mixer; useFrame composes the driver's impulses over
        // the clip's per-frame pose. Tracks bind by the loader's
        // sanitized node names, so the authored-name mapping
        // above never disturbs playback.
        let mixer: THREE.AnimationMixer | null = null;
        const clipBase = new Map<string, THREE.Quaternion>();
        const clip = gltf.animations?.[0];
        if (clip) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          bones.forEach((b, name) =>
            clipBase.set(name, b.quaternion.clone())
          );
        }
        adopted = { scene: gltf.scene, bones, rest, clipBase, mixer };
        setCharacter(adopted);
        setStageCharacterStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStageCharacterStatus("failed");
        setCharacter(null);
      });
    return () => {
      cancelled = true;
      if (adopted?.mixer) {
        adopted.mixer.stopAllAction();
        adopted.mixer.uncacheRoot(adopted.scene);
      }
    };
  }, [charState.url, charState.builtin, characterSlot, tintHue]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // Drain THIS rig's queued verb gestures onto the render clock
    // (Stage v2: entries are addressed by participant id — a verb
    // moves its sender's body, so other rigs' entries stay queued
    // for their own rigs to drain).
    if (fx.pendingGestures.length) {
      const mine: string[] = [];
      for (let i = fx.pendingGestures.length - 1; i >= 0; i--) {
        if (fx.pendingGestures[i].rig === rigKey) {
          mine.unshift(fx.pendingGestures[i].verb);
          fx.pendingGestures.splice(i, 1);
        }
      }
      for (const verb of mine) {
        gesturesRef.current.push({ verb, start: t });
      }
    }
    gesturesRef.current = gesturesRef.current.filter((g) => t - g.start < 2.2);

    const pose = driver.tick(performance.now());
    const extra = gestureExtra(gesturesRef.current, t);
    if (character) {
      if (character.mixer && figureEnabled) {
        // Idle layer: advance the clip, snapshot its pose as
        // this frame's base, and compose the driver's band
        // impulses ADDITIVELY over it — the body keeps idling
        // and the notes still answer down the bands.
        character.mixer.update(Math.min(delta, 0.1));
        character.bones.forEach((bone, name) => {
          character.clipBase.get(name)?.copy(bone.quaternion);
        });
        applyPose(
          character.bones,
          character.clipBase,
          pose,
          extra,
          figureEnabled,
          styleRef.current
        );
      } else {
        // No clip — or the cast is switched to rest, in which
        // case the mixer rests too and the body composes over
        // its bind pose like every other figure.
        applyPose(
          character.bones,
          character.rest,
          pose,
          extra,
          figureEnabled,
          styleRef.current
        );
      }
    } else {
      applyPose(
        mannequin.bones,
        mannequin.rest,
        pose,
        extra,
        figureEnabled,
        styleRef.current
      );
    }

    // Band glow on the mannequin (the character slot keeps its own
    // authored materials; the stage lights + floor carry its glow).
    for (const band of pose.bands) {
      const mat = mannequin.materials[band.id];
      if (!mat) continue;
      if (figureEnabled && band.energy > 0.01) {
        mat.emissive.setHSL(((band.hue % 360) + 360) % 360 / 360, 0.85, 0.5);
        mat.emissiveIntensity = band.energy * 0.9;
      } else {
        mat.emissiveIntensity = 0;
      }
    }

    // Root bounce: leg energy + cheer hops lift the whole figure,
    // scaled by the rig's style bounce (a playful ghostie hops).
    // The bounce moves the INNER group; the outer group carries
    // the layout position, so the aura ring (below) stays planted
    // on the floor while the body hops inside it.
    if (groupRef.current) {
      const legs = pose.bands.find((b) => b.id === "legs");
      const bounce = figureEnabled
        ? (Math.abs(legs?.offset ?? 0) * 0.05 +
            extra.legsBounce * 0.045 +
            pose.breath * 0.006) *
          styleRef.current.bounce
        : 0;
      groupRef.current.position.y = bounce;
    }
  });

  // A loading slot renders NO figure: while the character's
  // bytes download/decode, the mannequin stays hidden so the
  // stage never presents the bare figure as if it were the
  // dancer (the stage's loading note explains the empty
  // stage). The mannequin returns only when no bind exists
  // (explicit "none") or a bind has FAILED (the fallback,
  // with the stage's failure pill saying so).
  const slotLoading = characterSlot && charState.status === "loading";

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group ref={groupRef}>
        <primitive object={mannequin.mesh} visible={!character && !slotLoading} />
        {character ? <primitive object={character.scene} /> : null}
        {label ? <RigLabel name={label} hue={tintHue ?? 190} /> : null}
      </group>
      {aura ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.64, 48]} />
          <meshBasicMaterial
            color={auraColor}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}
