/**
 * Slice 40 — The Fold's molecular view.
 *
 * A real protein structure (Cα backbone) whose shape on screen is a pure
 * function of VERIFIED work in the genx field state:
 *  - each shard owns a contiguous residue range of the structure;
 *  - a range sits in the deterministic unfolded layout, shaking, until
 *    its shard verifies — then it settles into the real coordinates and
 *    takes its verifier's signature hue, with a verification bloom;
 *  - thermal jitter amplitude is (1 - verified/total), so an untouched
 *    job rattles and a finished fold is perfectly still.
 * Nothing here simulates progress: no timers drive the fold, no random
 * numbers are rolled at render. Every input (field state, identity hues)
 * is replicated room state, so spectators see the identical picture.
 *
 * Web-only, like the Dancer Stage (the R3F precedent in this repo): the
 * canvas owns its gestures while open — drag to orbit, pinch/scroll to
 * zoom — and a close button returns to the mote field.
 *
 * Slice 48 — the camera is a rig now (src/genx/molCamera.ts): framed
 * once per structure on the TARGET centroid + bounding sphere, every
 * channel critically damped on real delta time, a slow sinusoidal
 * drift only until the first touch. The fold is never an input to the
 * rig, so folding and verifying move the camera by exactly zero. (The
 * original rig chased pointer targets with a fixed per-frame lerp
 * around a fixed camera — frame-rate-coupled, and it read on device
 * as a camera that "moves wonkey.")
 *
 * Slice 54 — the participants are IN the field now: one vehicle per
 * participant whose verified contributions exist (src/genx/
 * vehicleMath.ts — the roster is the board's own contribution
 * table), rendered in the scene about the rig's frame, colored by
 * the same LifePacket hue their verified ranges settle into. The
 * local vehicle hovers at the field's edge until its owner's first
 * shard verifies; mobility is earned, never claimed. The camera
 * rig is untouched — vehicles are scene, not camera.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { colors, radius, spacing } from "../../theme/tokens";
import { getIdentitySnapshot, subscribeIdentity } from "../../identity/identityStore";
import { getGenxSnapshot, subscribeGenx } from "../../genx/genxStore";
import { missionProgress } from "../../genx/fieldState";
import type { GenxMissionState } from "../../genx/genxTypes";
import {
  SETTLE_MS,
  applyNormalizer,
  easeSettle,
  morphFrame,
  normalizerFor,
  rangeCentroid,
  residueColor,
  residueRangeMap,
  targetPositions,
  unfoldedPositions,
  type MolShardRange,
  type MolStructure,
  type MolVec3,
} from "../../genx/molMath";
import {
  CAMERA_FOV_DEG,
  cameraPose,
  createCameraRig,
  fitDistance,
  frameForTarget,
  rigDragEnd,
  rigDragStart,
  rigOrbit,
  rigZoomBy,
  stepCameraRig,
  type MolCameraFrame,
  type MolCameraRig,
} from "../../genx/molCamera";
import {
  VEHICLE_MAX_REMOTES,
  vehiclePose,
  vehiclesOf,
} from "../../genx/vehicleMath";

/** How the displayed structure binds to the field state. */
export interface StructureBinding {
  /** Deterministic segmentation — one residue range per shard. */
  ranges: MolShardRange[];
  /** shardIds[i] owns ranges[i]. Mission bindings use real shard ids;
   *  the bare sample uses ids that never appear in the field state, so
   *  nothing verifies and nothing is claimed — the honest default. */
  shardIds: string[];
  /** A finished node result: the fold is complete by definition. */
  forceSettled?: boolean;
  /** Changes when the underlying job changes; resets settle tracking. */
  key: string;
}

interface StructureViewProps {
  structure: MolStructure;
  binding: StructureBinding;
  /** Job title shown over the structure name (e.g. the bounty title). */
  title?: string;
  /** Plain-language note about what this structure is (sample / result). */
  note?: string;
  onClose: () => void;
}

const FALLBACK_HUE = 187;
const BLOOM_SLOTS = 8;
const BLOOM_SECONDS = 1.15;

/** The parser's source codes, in product language. */
const SOURCE_LABELS: Record<string, string> = {
  rcsb: "RCSB Protein Data Bank",
  alphafold: "AlphaFold DB prediction",
  node: "GenX node result",
};

function hueOf(peerId: string | null | undefined): number {
  if (!peerId) return FALLBACK_HUE;
  const identity = getIdentitySnapshot();
  if (identity.self && peerId === identity.self.id) return identity.self.hue;
  return identity.peers[peerId]?.hue ?? FALLBACK_HUE;
}

function nameOf(peerId: string | null | undefined): string {
  if (!peerId) return "a folder";
  const identity = getIdentitySnapshot();
  if (identity.self && peerId === identity.self.id) return identity.self.name;
  return identity.peers[peerId]?.name ?? "a folder";
}

/** Per-range verified fact + claimer, read straight from the field state. */
function rangeFacts(
  binding: StructureBinding,
  mission: GenxMissionState | null,
): { verified: boolean; claimedBy: string | null }[] {
  return binding.ranges.map((_range, i) => {
    if (binding.forceSettled) return { verified: true, claimedBy: null };
    const shardId = binding.shardIds[i];
    const shard = mission?.shards.find((s) => s.shardId === shardId);
    if (shard && shard.status === "verified") {
      return { verified: true, claimedBy: shard.claimedBy };
    }
    return { verified: false, claimedBy: null };
  });
}

/* ------------------------------------------------------------------ */
/* Camera rig — pointer input + the molCamera spring rig. No drei.            */
/* ------------------------------------------------------------------ */

interface RigRef {
  current: MolCameraRig;
}

/**
 * Pointer input for the camera rig: drag orbits, pinch/wheel zooms.
 * Handlers write ONLY the rig's targets (through molCamera's input
 * functions); the spring in CameraRig does all actual motion. The
 * drag deltas keep the original rig's mapping and gains.
 */
function OrbitRig({ rig }: { rig: RigRef }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      rigDragStart(rig.current);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        rigOrbit(rig.current, -dx * 0.008, -dy * 0.006);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && d > 0) {
          rigZoomBy(rig.current, (pinchDist - d) * 0.004);
        }
        pinchDist = d;
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchDist = 0;
      if (pointers.size === 0) rigDragEnd(rig.current);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rigZoomBy(rig.current, e.deltaY * 0.003);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl, rig]);
  return null;
}

/**
 * The camera itself: step the rig's critically damped springs on the
 * frame's REAL delta time, then place the camera from the pure pose.
 * Nothing about the fold — no field state, no verified fraction, no
 * morph state — is read here; folding cannot move this camera.
 */
function CameraRig({ rig }: { rig: RigRef }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame((state, delta) => {
    stepCameraRig(rig.current, delta);
    const fit = fitDistance(
      rig.current.frame,
      size.width / Math.max(1, size.height),
    );
    const pose = cameraPose(rig.current, fit, state.clock.elapsedTime);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* The molecule itself.                                                */
/* ------------------------------------------------------------------ */

function Molecule({
  structure,
  binding,
}: {
  structure: MolStructure;
  binding: StructureBinding;
}) {
  const tubeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const sphereRef = useRef<THREE.InstancedMesh>(null);
  const bloomRefs = useRef<(THREE.Mesh | null)[]>([]);
  const settleStartRef = useRef(new Map<number, number>());
  const bloomedRef = useRef(new Set<number>());
  const bindingKeyRef = useRef("");

  const model = useMemo(() => {
    const norm = normalizerFor(structure);
    const target = applyNormalizer(targetPositions(structure), norm);
    const unfolded = applyNormalizer(unfoldedPositions(structure), norm);
    const rangeOf = residueRangeMap(structure, binding.ranges);
    // Flat offsets per chain, for tube slicing.
    const chainSlices: { start: number; len: number }[] = [];
    let acc = 0;
    structure.chains.forEach((chain) => {
      chainSlices.push({ start: acc, len: chain.ca.length });
      acc += chain.ca.length;
    });
    // Tube thickness follows the real Cα spacing of the folded target.
    let spacingSum = 0;
    let spacingN = 0;
    chainSlices.forEach(({ start, len }) => {
      for (let i = 1; i < len; i++) {
        const a = target[start + i - 1];
        const b = target[start + i];
        spacingSum += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        spacingN++;
      }
    });
    const avgSpacing = spacingN > 0 ? spacingSum / spacingN : 0.75;
    return {
      norm,
      target,
      unfolded,
      rangeOf,
      chainSlices,
      tubeRadius: Math.max(0.03, Math.min(0.12, avgSpacing * 0.15)),
    };
  }, [structure, binding.ranges]);

  const bloomsRef = useRef<{ center: MolVec3; hue: number; t0: number }[]>([]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const key = `${binding.key}:${structure.id}`;
    if (bindingKeyRef.current !== key) {
      bindingKeyRef.current = key;
      settleStartRef.current.clear();
      bloomedRef.current.clear();
      bloomsRef.current = [];
    }
    const mission = getGenxSnapshot().field.mission;
    const facts = rangeFacts(binding, mission);
    const progress = binding.forceSettled
      ? 1
      : mission
        ? missionProgress(mission)
        : 0;

    // Per-range settle: 0 until the verified fact exists, then a short
    // ease. The ease is presentation; the fact underneath is the field
    // state, read fresh every frame.
    const rangeT = facts.map((fact, i) => {
      if (binding.forceSettled) return 1;
      if (!fact.verified) {
        settleStartRef.current.delete(i);
        return 0;
      }
      if (!settleStartRef.current.has(i)) {
        settleStartRef.current.set(i, now);
        if (!bloomedRef.current.has(i)) {
          bloomedRef.current.add(i);
          bloomsRef.current.push({
            center: rangeCentroid(structure, binding.ranges[i], model.norm),
            hue: hueOf(fact.claimedBy),
            t0: now,
          });
        }
      }
      return easeSettle((now - settleStartRef.current.get(i)!) / (SETTLE_MS / 1000));
    });
    const rangeClaimerHue = facts.map((f) => (f.claimedBy ? hueOf(f.claimedBy) : null));

    const positions = morphFrame({
      target: model.target,
      unfolded: model.unfolded,
      rangeOf: model.rangeOf,
      rangeT,
      progress,
      timeSec: now,
    });

    // Tubes: one smooth curve per chain through the morphed Cα points,
    // vertex-colored residue by residue.
    const tmpColor = new THREE.Color();
    model.chainSlices.forEach(({ start, len }, chainIndex) => {
      const mesh = tubeRefs.current[chainIndex];
      if (!mesh || len === 0) return;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < len; i++) {
        const p = positions[start + i];
        pts.push(new THREE.Vector3(p[0], p[1], p[2]));
      }
      let geometry: THREE.TubeGeometry;
      if (len === 1) {
        geometry = new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([pts[0], pts[0].clone()]),
          1,
          model.tubeRadius,
          6,
          false,
        );
        const c = residueColor(chainIndex, model.rangeOf[start], rangeT, rangeClaimerHue);
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        for (let v = 0; v < geometry.attributes.position.count; v++) {
          colors[v * 3] = c[0];
          colors[v * 3 + 1] = c[1];
          colors[v * 3 + 2] = c[2];
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      } else {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubular = Math.max(16, (len - 1) * 8);
        geometry = new THREE.TubeGeometry(curve, tubular, model.tubeRadius, 6, false);
        const ringVerts = 7; // radialSegments + 1
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        for (let k = 0; k <= tubular; k++) {
          const f = (k / tubular) * (len - 1);
          const i0 = Math.floor(f);
          const i1 = Math.min(len - 1, i0 + 1);
          const frac = f - i0;
          const c0 = residueColor(chainIndex, model.rangeOf[start + i0], rangeT, rangeClaimerHue);
          const c1 = residueColor(chainIndex, model.rangeOf[start + i1], rangeT, rangeClaimerHue);
          tmpColor.setRGB(
            c0[0] + (c1[0] - c0[0]) * frac,
            c0[1] + (c1[1] - c0[1]) * frac,
            c0[2] + (c1[2] - c0[2]) * frac,
          );
          for (let v = 0; v < ringVerts; v++) {
            const idx = (k * ringVerts + v) * 3;
            colors[idx] = tmpColor.r;
            colors[idx + 1] = tmpColor.g;
            colors[idx + 2] = tmpColor.b;
          }
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      }
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    });

    // Cα spheres.
    const spheres = sphereRef.current;
    if (spheres) {
      const m = new THREE.Matrix4();
      let flat = 0;
      structure.chains.forEach((_chain, chainIndex) => {
        const { start, len } = model.chainSlices[chainIndex];
        for (let i = 0; i < len; i++) {
          const p = positions[start + i];
          m.makeTranslation(p[0], p[1], p[2]);
          spheres.setMatrixAt(flat, m);
          const c = residueColor(chainIndex, model.rangeOf[start + i], rangeT, rangeClaimerHue);
          spheres.setColorAt(flat, tmpColor.setRGB(c[0], c[1], c[2]));
          flat++;
        }
      });
      spheres.instanceMatrix.needsUpdate = true;
      if (spheres.instanceColor) spheres.instanceColor.needsUpdate = true;
    }

    // Verification blooms: expanding, fading shells at settled ranges.
    bloomsRef.current = bloomsRef.current.filter((b) => now - b.t0 < BLOOM_SECONDS);
    for (let s = 0; s < BLOOM_SLOTS; s++) {
      const mesh = bloomRefs.current[s];
      if (!mesh) continue;
      const bloom = bloomsRef.current[s];
      if (!bloom) {
        mesh.visible = false;
        continue;
      }
      const age = (now - bloom.t0) / BLOOM_SECONDS;
      mesh.visible = true;
      mesh.position.set(bloom.center[0], bloom.center[1], bloom.center[2]);
      const scale = 0.35 + age * 1.9;
      mesh.scale.setScalar(scale);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHSL(((bloom.hue % 360) + 360) % 360 / 360, 0.85, 0.6);
      mat.opacity = 0.45 * (1 - age);
    }

  });

  return (
    <group>
      {structure.chains.map((_chain, chainIndex) => (
        <mesh key={chainIndex} ref={(m) => { tubeRefs.current[chainIndex] = m; }}>
          <meshStandardMaterial vertexColors roughness={0.5} metalness={0.08} />
        </mesh>
      ))}
      <instancedMesh
        key={structure.totalResidues}
        ref={sphereRef}
        args={[undefined, undefined, Math.max(1, structure.totalResidues)]}
      >
        <sphereGeometry args={[model.tubeRadius * 1.55, 10, 10]} />
        <meshStandardMaterial roughness={0.4} metalness={0.05} />
      </instancedMesh>
      {Array.from({ length: BLOOM_SLOTS }).map((_, s) => (
        <mesh key={s} ref={(m) => { bloomRefs.current[s] = m; }} visible={false}>
          <sphereGeometry args={[1, 18, 18]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Participant vehicles (Slice 54).                                    */
/* ------------------------------------------------------------------ */

const VEHICLE_SLOTS = 1 + VEHICLE_MAX_REMOTES;

/**
 * The participants' bodies in the field: one small translucent
 * nanite per roster entry of vehicleMath.vehiclesOf — a roster
 * derived from VERIFIED field state alone (the same
 * contributionsOf table the bounty board renders), so a vehicle
 * exists exactly when the verified record says its owner folded
 * something, and its mobility is the verified shard count's pure
 * function. The local vehicle is always present; at zero verified
 * it holds the edge ring and never approaches.
 *
 * Vehicles live in the SCENE: positions come from vehiclePose
 * about Slice 48's frame centroid, and nothing here touches the
 * camera rig. Color resolves through the same hueOf the verifier
 * blooms use — the LifePacket identity hue — so a vehicle's color
 * is the color its owner's ranges settle into. No name labels:
 * presence is the announcement (a new vehicle arrives with its
 * owner's first verification bloom, in the same hue).
 */
function Vehicles({ frame }: { frame: MolCameraFrame }) {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const coreMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const shellMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const field = getGenxSnapshot().field;
    const identity = getIdentitySnapshot();
    const roster = vehiclesOf(field, identity.self?.id ?? null);
    const body0 = Math.max(frame.radius, 0.35);
    for (let s = 0; s < VEHICLE_SLOTS; s++) {
      const group = groupRefs.current[s];
      if (!group) continue;
      const spec = roster[s];
      if (!spec) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      const pose = vehiclePose(spec, frame, now);
      group.position.set(pose[0], pose[1], pose[2]);
      group.scale.setScalar(spec.sizeFactor * body0);
      const h = (((hueOf(spec.participantId) % 360) + 360) % 360) / 360;
      const coreMat = coreMatRefs.current[s];
      if (coreMat) {
        coreMat.color.setHSL(h, 0.55, 0.3);
        coreMat.emissive.setHSL(h, 0.85, 0.48);
      }
      const shellMat = shellMatRefs.current[s];
      if (shellMat) shellMat.color.setHSL(h, 0.85, 0.6);
    }
  });

  return (
    <group>
      {Array.from({ length: VEHICLE_SLOTS }).map((_, s) => (
        <group
          key={s}
          ref={(g) => {
            groupRefs.current[s] = g;
          }}
          visible={false}
        >
          <mesh>
            <icosahedronGeometry args={[1, 2]} />
            <meshStandardMaterial
              ref={(m) => {
                coreMatRefs.current[s] = m;
              }}
              roughness={0.35}
              metalness={0.1}
              transparent
              opacity={0.92}
            />
          </mesh>
          <mesh scale={1.45}>
            <sphereGeometry args={[1, 18, 18]} />
            <meshBasicMaterial
              ref={(m) => {
                shellMatRefs.current[s] = m;
              }}
              transparent
              opacity={0.15}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The view (HUD + canvas).                                            */
/* ------------------------------------------------------------------ */

export default function StructureView({ structure, binding, title, note, onClose }: StructureViewProps) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeGenx(() => setTick((t) => t + 1)), []);
  useEffect(() => subscribeIdentity(() => setTick((t) => t + 1)), []);
  // Slice 48: the camera frame is computed ONCE per structure from
  // the TARGET positions (the same normalizer the morph renders in),
  // and the rig is rebuilt whenever a different structure's frame
  // arrives — framing is a property of the folded target, never of
  // the fold's progress.
  const frame = useMemo(
    () =>
      frameForTarget(
        applyNormalizer(targetPositions(structure), normalizerFor(structure)),
      ),
    [structure],
  );
  const rigRef = useRef<MolCameraRig | null>(null);
  if (rigRef.current === null || rigRef.current.frame !== frame) {
    rigRef.current = createCameraRig(frame);
  }
  const rig: RigRef = rigRef as RigRef;
  const initialPose = cameraPose(rig.current, fitDistance(frame, 1), 0);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>{title ?? structure.id}</Text>
          <Text style={styles.body}>
            {structure.name} — the 3D structure view runs on web in this build.
          </Text>
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close structure view">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const mission = getGenxSnapshot().field.mission;
  const facts = rangeFacts(binding, mission);
  const verifiedCount = facts.filter((f) => f.verified).length;
  const progress = binding.forceSettled
    ? 1
    : mission
      ? missionProgress(mission)
      : 0;
  const claimers = [...new Set(facts.map((f) => f.claimedBy).filter(Boolean) as string[])];

  return (
    <View style={styles.root}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        camera={{ fov: CAMERA_FOV_DEG, near: 0.1, far: 80, position: initialPose.position }}
        style={{ flex: 1 }}
      >
        <color attach="background" args={["#070a12"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 6, 6]} intensity={1.25} />
        <directionalLight position={[-6, -2, -4]} intensity={0.4} />
        <OrbitRig rig={rig} />
        <CameraRig rig={rig} />
        <Molecule structure={structure} binding={binding} />
        <Vehicles frame={frame} />
      </Canvas>

      <View style={styles.hudTop} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.kicker}>THE FOLD · STRUCTURE</Text>
          <Text style={styles.title}>{title ?? structure.name}</Text>
          <Text style={styles.body}>
            {structure.name} · {SOURCE_LABELS[structure.source] ?? structure.source} ·{" "}
            {structure.totalResidues} residues · {structure.chains.length} chain
            {structure.chains.length === 1 ? "" : "s"}
            {structure.ligands ? ` · ${structure.ligands} heme groups` : ""}
          </Text>
          {binding.forceSettled ? (
            <Text style={styles.progress}>Finished fold — computed by the node.</Text>
          ) : (
            <Text style={styles.progress}>
              {verifiedCount} of {binding.ranges.length} domains verified · {Math.round(progress * 100)}%
              {verifiedCount === 0
                ? " — nothing verified yet, so the chain stays unfolded and shaking."
                : ""}
            </Text>
          )}
          {claimers.length > 0 ? (
            <Text style={styles.body}>
              Folded so far by {claimers.map((id) => nameOf(id)).join(", ")}.
            </Text>
          ) : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close structure view">
          <Text style={styles.closeText}>✕ Close</Text>
        </Pressable>
      </View>

      <View style={styles.hudBottom} pointerEvents="none">
        <Text style={styles.hint}>Drag to orbit · pinch or scroll to zoom</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#070a12",
    zIndex: 300,
  },
  hudTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.sm,
  },
  hudBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: "center",
  },
  card: {
    flex: 1,
    maxWidth: 460,
    backgroundColor: "rgba(2,8,23,0.82)",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  body: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  progress: { color: colors.text, fontSize: 12.5, fontWeight: "600", lineHeight: 18 },
  note: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, fontStyle: "italic" },
  closeBtn: {
    backgroundColor: "rgba(2,8,23,0.82)",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  hint: { color: "rgba(226,232,240,0.55)", fontSize: 11.5 },
});
