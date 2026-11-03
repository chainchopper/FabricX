/**
 * Slice 54 — The Fold's participant vehicles: the pure math.
 *
 * Terrell's GenX vision puts the participants IN the field: each
 * person is a molecule / cell / nanite in the Fold's microcosm,
 * and what their vehicle can DO — how far it ranges, how fast it
 * moves — is earned by verified compute, never claimed. Slice 40
 * rendered the protein and its verified settle; the field had no
 * bodies in it. This module is the body law, kept pure like
 * molMath / molCamera so every screen in the room derives the
 * identical vehicle from the identical field state:
 *
 *  - The ROSTER comes from the field state alone, through the
 *    same derivation the bounty board renders:
 *    fieldState.contributionsOf counts a participant exactly
 *    when a shard they claimed stands VERIFIED. A claim, an
 *    assignment, a progress report — none of it moves a vehicle.
 *  - The local participant always has a vehicle (it is their own
 *    presence in the field). At zero verified shards it holds a
 *    gentle hover on the field's edge ring and never approaches
 *    the structure. Remote participants appear when — and only
 *    when — their first verified shard exists in room state.
 *  - MOBILITY is a pure function of the verified shard count:
 *    0 at zero, strictly rising, saturating toward 1. Mobility
 *    buys orbit closeness, angular speed, bob, and radial
 *    excursion — and nothing else. Every pose stays OUTSIDE the
 *    structure's bounding sphere, so a vehicle can never sit on
 *    the protein it is folding.
 *  - Identity stays where it belongs: this module never sees a
 *    hue or a name. A spec carries a participant id; the view
 *    resolves that id through the same LifePacket identity the
 *    verifier colors use (identityStore), so a vehicle's color
 *    IS the color its verified ranges settle into.
 *
 * No React, no three.js, no clocks, no Math.random: callers pass
 * time in. Same field state + same clock = same pose, everywhere.
 *
 * Powered by Nirvana
 */

import { contributionsOf } from "./fieldState";
import { hash01, type MolVec3 } from "./molMath";
import type { MolCameraFrame } from "./molCamera";
import type { GenxFieldState } from "./genxTypes";

/** Orbit radius at zero verified shards, × the frame's bounding radius. */
export const VEHICLE_EDGE_FACTOR = 2.3;
/** Orbit radius at full mobility, × the frame's bounding radius. */
export const VEHICLE_CLOSE_FACTOR = 1.3;
/** Angular drift (rad/s) of a zero-verified vehicle — a hover, not a patrol. */
export const VEHICLE_BASE_SPEED = 0.05;
/** Extra angular speed (rad/s) mobility can buy, at mobility 1. */
export const VEHICLE_SPEED_SPAN = 0.3;
/** Remote vehicles rendered at most — the roster's head, by verified count. */
export const VEHICLE_MAX_REMOTES = 12;

/** One participant's vehicle, fully derived from verified field state. */
export interface VehicleSpec {
  participantId: string;
  isSelf: boolean;
  /** Shards standing VERIFIED under this participant's claim. */
  verifiedShards: number;
  /** Work units those verified shards represent (residues for structure shards). */
  verifiedWork: number;
  /** 0..1 — the mobility those verified shards buy. */
  mobility: number;
  /** Orbit radius about the structure centroid, × the frame radius. */
  orbitRadiusFactor: number;
  /** Signed angular speed, rad/s (sign = the vehicle's orbit direction). */
  angularSpeed: number;
  /** Vertical bob amplitude, × the frame radius. */
  bobAmplitude: number;
  /** In/out breathing of the orbit, × the frame radius. Exactly 0 at mobility 0. */
  radialExcursion: number;
  /** Vehicle body radius, × the frame radius. */
  sizeFactor: number;
  /** Orbit phase (radians) — hash-derived from the participant id. */
  phase: number;
  /** Vertical lane, -1..1 — hash-derived from the participant id. */
  lane: number;
}

/**
 * THE mobility law: a pure function of the verified shard count.
 * 0 at zero; strictly rising; saturating (n/(n+3): 1 shard buys a
 * quarter of the range, 3 buy half, 9 buy three quarters). Nothing
 * unverified is an input, so nothing unverified can move a vehicle.
 */
export function mobilityFor(verifiedShards: number): number {
  const n = Number.isFinite(verifiedShards) ? Math.max(0, Math.floor(verifiedShards)) : 0;
  if (n === 0) return 0;
  return n / (n + 3);
}

/** One vehicle's full spec from its verified counts. Deterministic. */
export function vehicleSpecFor(
  participantId: string,
  isSelf: boolean,
  verifiedShards: number,
  verifiedWork: number,
): VehicleSpec {
  const mobility = mobilityFor(verifiedShards);
  const direction = hash01(`${participantId}:vdir`) < 0.5 ? -1 : 1;
  return {
    participantId,
    isSelf,
    verifiedShards: Math.max(0, Math.floor(verifiedShards) || 0),
    verifiedWork: Math.max(0, verifiedWork || 0),
    mobility,
    orbitRadiusFactor:
      VEHICLE_EDGE_FACTOR + (VEHICLE_CLOSE_FACTOR - VEHICLE_EDGE_FACTOR) * mobility,
    angularSpeed: direction * (VEHICLE_BASE_SPEED + VEHICLE_SPEED_SPAN * mobility),
    bobAmplitude: 0.015 + 0.085 * mobility,
    radialExcursion: 0.16 * mobility,
    sizeFactor: 0.045 + 0.035 * mobility,
    phase: hash01(`${participantId}:vphase`) * Math.PI * 2,
    lane: hash01(`${participantId}:vlane`) * 2 - 1,
  };
}

/**
 * The roster the field state supports, in render order: the local
 * participant first (always — even at zero verified, where everyone
 * else is absent), then remote participants by verified count,
 * ties broken by id so every screen orders them identically.
 *
 * Remote membership is contributionsOf's membership, verbatim:
 * a participant is in the contribution table exactly when one of
 * their claims stands verified, so "appears when their verified
 * contributions exist" is not a second rule — it is the board's.
 */
export function vehiclesOf(
  field: GenxFieldState,
  selfId: string | null,
): VehicleSpec[] {
  const table = contributionsOf(field.mission, null);
  const byId = new Map(table.map((c) => [c.participantId, c]));
  const out: VehicleSpec[] = [];
  if (selfId) {
    const mine = byId.get(selfId);
    out.push(
      vehicleSpecFor(selfId, true, mine?.verifiedShards ?? 0, mine?.verifiedWork ?? 0),
    );
  }
  const remotes = table
    .filter((c) => c.participantId !== selfId)
    .sort(
      (a, b) =>
        b.verifiedShards - a.verifiedShards ||
        (a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0),
    )
    .slice(0, VEHICLE_MAX_REMOTES);
  for (const c of remotes) {
    out.push(vehicleSpecFor(c.participantId, false, c.verifiedShards, c.verifiedWork));
  }
  return out;
}

/**
 * Where one vehicle is at one instant: an orbit about the frame's
 * centroid (the same frame Slice 48's camera fits — the vehicle
 * lives in the scene, never in the camera). The orbit radius
 * breathes by the vehicle's radial excursion and its lane bobs,
 * but the distance from the centroid never enters the bounding
 * sphere: the closest possible approach is
 * (CLOSE − excursion span) = 1.14 frame radii.
 */
export function vehiclePose(
  spec: VehicleSpec,
  frame: MolCameraFrame,
  timeSec: number,
): MolVec3 {
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const radius = Math.max(frame.radius, 0.35);
  const angle = spec.phase + spec.angularSpeed * t;
  const orbitR =
    radius *
    (spec.orbitRadiusFactor +
      spec.radialExcursion * Math.sin(t * 0.23 + spec.phase * 1.7));
  const y =
    frame.center[1] +
    spec.lane * radius * 0.38 +
    Math.sin(t * 0.9 + spec.phase * 2.3) * spec.bobAmplitude * radius;
  return [
    frame.center[0] + Math.cos(angle) * orbitR,
    y,
    frame.center[2] + Math.sin(angle) * orbitR,
  ];
}
