/**
 * forgePicking — tap-to-pick for the Forge canvas (Slice D).
 *
 * Picking is the ENGINE's own query, not a reimplementation:
 * 67js ships `addons/scene-query`, a BVH raycaster over a
 * scene's parts — createSceneQuery(parts).raycast({origin,
 * direction}) returns the nearest hit with the part's id,
 * which for an agent-scene is the node id. This module is the
 * thin honest wrapper: the camera unprojection (a tap's screen
 * point → a world ray) as a pure function, and a picker that
 * holds the query and rebuilds it when the scene's revision
 * moves (the server's own discipline — a rebuilt query can
 * never answer for a board that has since changed).
 *
 * Load order (Slice A's hazard, respected): the scene-query
 * module is an on-demand addon and is loaded LAZILY — the
 * layer imports it on game start, long after the scene exists;
 * nothing here is evaluated at module scope. The module type
 * is injected (the forgeScene factory idiom), so this file
 * imports no 67js code at runtime and runs in Node checks
 * against the real addon.
 */
import type { Part67 } from "67js";
import type {
  ForgeSceneQuery,
  ForgeSceneQueryModule,
} from "67js/addons/scene-query";

export type { ForgeSceneQuery, ForgeSceneQueryModule };

/**
 * A tap's ray: from the camera eye through the tap's
 * normalized device point (ndcX right, ndcY UP — the caller
 * flips the client Y). Standard perspective unprojection
 * against the view the layer actually rendered (eye, target,
 * fov, aspect), so what you tap is what the ray tests.
 */
export function rayFromCamera(
  eye: readonly number[],
  target: readonly number[],
  fovDeg: number,
  aspect: number,
  ndcX: number,
  ndcY: number
): { origin: [number, number, number]; direction: [number, number, number] } {
  const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
  ];
  const cross = (
    a: [number, number, number],
    b: [number, number, number]
  ): [number, number, number] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (v: [number, number, number]): [number, number, number] => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  };
  const forward = norm(sub(target, eye));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const t = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const dir = norm([
    forward[0] + right[0] * ndcX * t * aspect + up[0] * ndcY * t,
    forward[1] + right[1] * ndcX * t * aspect + up[1] * ndcY * t,
    forward[2] + right[2] * ndcX * t * aspect + up[2] * ndcY * t,
  ]);
  return { origin: [eye[0], eye[1], eye[2]], direction: dir };
}

/**
 * Totally project a world point back to NDC through the same
 * camera — the inverse of rayFromCamera, exported for the
 * check (a tap AT a piece's projected point must pick that
 * piece) and for any future hover affordance.
 */
export function projectToNdc(
  point: readonly number[],
  eye: readonly number[],
  target: readonly number[],
  fovDeg: number,
  aspect: number
): [number, number] | null {
  const cross = (
    a: [number, number, number],
    b: [number, number, number]
  ): [number, number, number] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const norm = (v: [number, number, number]): [number, number, number] => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  };
  const dot = (a: readonly number[], b: readonly number[]): number =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const forward = norm([
    target[0] - eye[0],
    target[1] - eye[1],
    target[2] - eye[2],
  ]);
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d: [number, number, number] = [
    point[0] - eye[0],
    point[1] - eye[1],
    point[2] - eye[2],
  ];
  const z = dot(d, forward);
  if (z <= 0) return null;
  const t = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return [dot(d, right) / (z * t * aspect), dot(d, up) / (z * t)];
}

export interface ForgePicker {
  /**
   * The node id under the ray, or null. `revision` is the
   * scene's current revision: when it differs from the
   * revision the held query was built at, the query is
   * rebuilt first — a pick never answers for a stale board.
   */
  pick(
    parts: Part67[],
    origin: readonly number[],
    direction: readonly number[],
    revision: number
  ): string | null;
  dispose(): void;
}

export function createForgePicker(mod: ForgeSceneQueryModule): ForgePicker {
  let query: ForgeSceneQuery | null = null;
  let builtAtRevision = -1;
  return {
    pick(parts, origin, direction, revision) {
      if (!query || builtAtRevision !== revision) {
        try {
          query?.dispose();
        } catch {
          // A failed dispose never blocks a pick.
        }
        query = mod.createSceneQuery(parts);
        builtAtRevision = revision;
      }
      const hit = query.raycast({
        origin: [origin[0], origin[1], origin[2]],
        direction: [direction[0], direction[1], direction[2]],
        maxDistance: 200,
      });
      return hit?.id ?? null;
    },
    dispose() {
      try {
        query?.dispose();
      } catch {
        // Disposal is courtesy; teardown continues regardless.
      }
      query = null;
      builtAtRevision = -1;
    },
  };
}
