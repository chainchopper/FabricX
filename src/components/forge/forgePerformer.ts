/**
 * forgePerformer — the Forge ghost tools' execution path (Slice B).
 *
 * A validated forge decision arrives here (GhostDecision with a
 * forge_spec, produced by GhostBrain's validator and carried by
 * GhostPeer through the onForgeDecision sink) and becomes REAL:
 * this module translates the decision to agent-scene operations,
 * applies them to the live scene through the scene seam
 * (forgeSceneStore — the handle ForgeLayer publishes), hands the
 * renderer the scene's parts, and renders.
 *
 * The revision contract is the engine's own (Slice A's G7/G8
 * pins): every apply names the revision it expects, read from
 * the scene AT APPLY TIME. If the scene moved under the act (a
 * stale refusal), the translation is rebuilt against the fresh
 * scene and the apply retried ONCE; a second refusal drops the
 * act — reported, never looped, never forced.
 *
 * The render sync follows the engine's documented rule
 * (docs/agent-look.md): updateParts for in-place changes,
 * replaceParts when the scene's topologyRevision moved — a
 * summon, a banish, or a reshape (the session re-identifies the
 * part) changes the part SET, and updateParts refuses those
 * with "Unknown part identity". Slice B's browser proof caught
 * exactly that refusal before this rule was applied; the
 * topology reading is taken per attempt, before the apply, so
 * the sync always matches the act that landed. If an apply
 * lands but the sync itself refuses, the outcome says so in
 * those words — the scene DID change, and the report never
 * pretends otherwise.
 *
 * Translation discipline matches the validator's: an act that
 * cannot be translated exactly as decided — a node that does not
 * exist, a spec field the scene cannot honor — is REFUSED with
 * a named reason, not improvised. Nothing here invents an act
 * the decision didn't name, and nothing touches a scene that
 * isn't live: with no handle registered the outcome is
 * "no-scene" and the act simply doesn't happen (the Forge canvas
 * isn't open; there is no scene to pretend at).
 *
 * Load-order note (Slice A's proven hazard): Slice A showed
 * preloading every engine module BEFORE scene creation breaks
 * the renderer's part identity. The forge tools need NO
 * on-demand modules at all — every translation below uses core
 * agent-scene ops only (add/remove/set node, set material,
 * set environment, set camera), so this module never calls a
 * module loader, in either order. forge-tools-check drives the
 * real agent-scene in Node and pins that fact.
 *
 * Runtime imports are deliberately engine-free: the scene and
 * renderer arrive through the seam's handle (types only here),
 * so this module evaluates cleanly on native and in Node checks.
 */
import type { AgentScene } from "67js/addons/agent-scene";
import {
  ghostForgeActLabel,
  type GhostDecision,
  type GhostForgeGeometry,
  type GhostForgeLightPreset,
} from "../../ghost/GhostBrain";
import { hexToLinear } from "./forgeScene";
import {
  getForgeSceneHandle,
  type ForgeSceneHandle,
} from "./forgeSceneStore";

/**
 * The geometry vocabulary, decision-side -> recipe-side. The
 * kinds name the starter scene's SHARED geometries (forgeScene
 * authors one geometry per kind): a summoned sphere IS the
 * starter's ball geometry, a reshaped node rebinds to the same
 * shared geometry the starter's own nodes use. forge-tools-check
 * asserts every id here resolves in the real starter scene.
 */
export const FORGE_GEOMETRY_IDS: Record<GhostForgeGeometry, string> = {
  box: "unit-box",
  sphere: "ball",
  cylinder: "post",
  torus: "ring",
};

/** Where a summon lands when the decision names no position. */
const FORGE_SUMMON_DEFAULT_POSITION: [number, number, number] = [0, 0.6, 2.2];
/** A summoned sphere wears the starter ball's scale; others unit. */
const FORGE_SUMMON_SCALE: Record<GhostForgeGeometry, [number, number, number]> = {
  box: [1, 1, 1],
  sphere: [1.2, 1.2, 1.2],
  cylinder: [0.8, 1.4, 0.8],
  torus: [1, 1, 1],
};
/** A summoned material's finish: the starter coral's own values. */
const FORGE_SUMMON_METALLIC = 0.05;
const FORGE_SUMMON_ROUGHNESS = 0.4;

/**
 * The relight presets, as set-environment partials. A preset
 * patches the scene's key light (position is the starter's own
 * [2.5, 3.5, 2.0] — a relight moves the light's COLOR and
 * strength, and the air's intensity, never the rig's geometry)
 * plus the environment/ambient intensities the look layer reads.
 * Patch semantics (the engine's): named fields change, the rest
 * of the environment — the studio setup included — is kept.
 */
export interface ForgeLightPreset {
  pointLights: Array<{
    position: [number, number, number];
    color: [number, number, number];
    intensity: number;
  }>;
  environmentIntensity: number;
  ambientIntensity?: number;
}

const FORGE_KEY_LIGHT_POSITION: [number, number, number] = [2.5, 3.5, 2.0];

export const FORGE_LIGHT_PRESETS: Record<GhostForgeLightPreset, ForgeLightPreset> = {
  studio: {
    pointLights: [
      { position: FORGE_KEY_LIGHT_POSITION, color: [1, 0.85, 0.7], intensity: 60 },
    ],
    environmentIntensity: 1,
  },
  warm: {
    pointLights: [
      { position: FORGE_KEY_LIGHT_POSITION, color: [1, 0.62, 0.34], intensity: 80 },
    ],
    environmentIntensity: 0.8,
  },
  dusk: {
    pointLights: [
      { position: FORGE_KEY_LIGHT_POSITION, color: [0.55, 0.45, 0.8], intensity: 26 },
    ],
    environmentIntensity: 0.45,
    ambientIntensity: 0.25,
  },
  cool: {
    pointLights: [
      { position: FORGE_KEY_LIGHT_POSITION, color: [0.62, 0.78, 1], intensity: 66 },
    ],
    environmentIntensity: 1,
  },
  bright: {
    pointLights: [
      { position: FORGE_KEY_LIGHT_POSITION, color: [1, 0.95, 0.88], intensity: 110 },
    ],
    environmentIntensity: 1.35,
    ambientIntensity: 0.6,
  },
};

/** Camera drift geometry (forge-camera): step sizes, in authored units. */
const FORGE_CAMERA_ORBIT_STEP = Math.PI / 6;
const FORGE_CAMERA_RISE_STEP = 0.9;
const FORGE_CAMERA_MIN_EYE_Y = 0.6;
const FORGE_CAMERA_MIN_RADIUS = 2.5;
const FORGE_CAMERA_MAX_RADIUS = 14;

export type ForgePerformOutcome =
  | {
      kind: "performed";
      /** The act in plain words (the brain's own label). */
      label: string;
      /** The scene's revision after the apply. */
      revision: number;
      /** 1 = landed first try; 2 = landed after the single stale retry. */
      attempts: 1 | 2;
    }
  | { kind: "no-scene" }
  | { kind: "refused"; reason: string }
  | { kind: "stale-dropped"; reason: string }
  | { kind: "failed"; reason: string };

type ForgeTranslation =
  | { ops: unknown[] }
  | { refusal: string };

function sceneNodeRecords(
  scene: AgentScene
): Array<{ id: string; geometry?: string; material?: string }> {
  try {
    const recipe = scene.exportRecipe();
    return Array.isArray(recipe?.nodes) ? recipe.nodes : [];
  } catch {
    return [];
  }
}

function findNode(
  scene: AgentScene,
  nodeId: string
): { id: string; geometry?: string; material?: string } | null {
  return sceneNodeRecords(scene).find((n) => n.id === nodeId) ?? null;
}

/** The next free ghost-summon index, scanned from the live scene. */
function nextSummonIndex(scene: AgentScene): number {
  const used = new Set<string>();
  for (const n of sceneNodeRecords(scene)) used.add(n.id);
  for (const p of scene.parts) used.add(p.name);
  let k = 1;
  while (used.has(`ghost-node-${k}`) || used.has(`ghost-mat-${k}`)) k++;
  return k;
}

/**
 * The camera act's new eye, computed from the scene's CURRENT
 * authored camera — orbit steps rotate the eye around the
 * target at its present radius and height (the same spherical
 * frame ForgeLayer's breathe orbit flies), rise/sink move the
 * eye's height, closer/wider scale the radius, all clamped to
 * sane bounds so repeated drifts never lose the scene.
 */
function forgeCameraEye(
  scene: AgentScene,
  direction: string
): [number, number, number] | null {
  const eye = scene.camera?.eye;
  const target = scene.camera?.target;
  if (
    !Array.isArray(eye) ||
    eye.length !== 3 ||
    !Array.isArray(target) ||
    target.length !== 3 ||
    !eye.every((v) => typeof v === "number" && Number.isFinite(v)) ||
    !target.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return null;
  }
  const dx = eye[0] - target[0];
  const dz = eye[2] - target[2];
  const radius = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  switch (direction) {
    case "orbit-left": {
      const a = angle + FORGE_CAMERA_ORBIT_STEP;
      return [target[0] + radius * Math.cos(a), eye[1], target[2] + radius * Math.sin(a)];
    }
    case "orbit-right": {
      const a = angle - FORGE_CAMERA_ORBIT_STEP;
      return [target[0] + radius * Math.cos(a), eye[1], target[2] + radius * Math.sin(a)];
    }
    case "rise":
      return [eye[0], eye[1] + FORGE_CAMERA_RISE_STEP, eye[2]];
    case "sink":
      return [eye[0], Math.max(FORGE_CAMERA_MIN_EYE_Y, eye[1] - FORGE_CAMERA_RISE_STEP), eye[2]];
    case "closer": {
      const r = Math.max(FORGE_CAMERA_MIN_RADIUS, radius * 0.75);
      return [target[0] + r * Math.cos(angle), eye[1], target[2] + r * Math.sin(angle)];
    }
    case "wider": {
      const r = Math.min(FORGE_CAMERA_MAX_RADIUS, radius * 1.3);
      return [target[0] + r * Math.cos(angle), eye[1], target[2] + r * Math.sin(angle)];
    }
    default:
      return null;
  }
}

/**
 * Translate one validated forge decision to agent-scene ops
 * against the scene AS IT STANDS (the translation reads the
 * live scene: node existence, a node's current material, the
 * next free summon id, the current camera). A decision whose
 * named node does not exist is refused, never improvised.
 * Exported for the check, which drives it against the real
 * agent-scene module headlessly.
 */
export function forgeOpsForDecision(
  decision: GhostDecision,
  scene: AgentScene
): ForgeTranslation {
  const spec = decision.forge_spec;
  if (!spec) return { refusal: "the decision carries no forge_spec" };
  switch (decision.intent) {
    case "forge-summon": {
      if (!spec.geometry || !spec.color) {
        return { refusal: "a summon names a geometry and a color" };
      }
      const k = nextSummonIndex(scene);
      const materialId = `ghost-mat-${k}`;
      const nodeId = `ghost-node-${k}`;
      return {
        ops: [
          {
            type: "add-material",
            material: {
              id: materialId,
              color: hexToLinear(spec.color),
              metallic: FORGE_SUMMON_METALLIC,
              roughness: FORGE_SUMMON_ROUGHNESS,
            },
          },
          {
            type: "add-node",
            node: {
              id: nodeId,
              geometry: FORGE_GEOMETRY_IDS[spec.geometry],
              material: materialId,
              translation: spec.position ?? FORGE_SUMMON_DEFAULT_POSITION,
              scale: FORGE_SUMMON_SCALE[spec.geometry],
            },
          },
        ],
      };
    }
    case "forge-banish": {
      if (!spec.node) return { refusal: "a banish names a node" };
      if (!findNode(scene, spec.node)) {
        return { refusal: `there is no node named ${spec.node} in the scene` };
      }
      return { ops: [{ type: "remove-node", id: spec.node, recursive: false }] };
    }
    case "forge-move": {
      if (!spec.node || !spec.position) {
        return { refusal: "a move names a node and a position" };
      }
      if (!findNode(scene, spec.node)) {
        return { refusal: `there is no node named ${spec.node} in the scene` };
      }
      return {
        ops: [{ type: "set-node", id: spec.node, translation: [...spec.position] }],
      };
    }
    case "forge-recolor": {
      if (!spec.node || !spec.color) {
        return { refusal: "a recolor names a node and a color" };
      }
      const node = findNode(scene, spec.node);
      if (!node) {
        return { refusal: `there is no node named ${spec.node} in the scene` };
      }
      if (!node.material) {
        return { refusal: `${spec.node} carries no material to repaint` };
      }
      return {
        ops: [
          {
            type: "set-material",
            id: node.material,
            color: hexToLinear(spec.color),
          },
        ],
      };
    }
    case "forge-reshape": {
      if (!spec.node || !spec.geometry) {
        return { refusal: "a reshape names a node and a geometry" };
      }
      if (!findNode(scene, spec.node)) {
        return { refusal: `there is no node named ${spec.node} in the scene` };
      }
      return {
        ops: [
          {
            type: "set-node",
            id: spec.node,
            geometry: FORGE_GEOMETRY_IDS[spec.geometry],
          },
        ],
      };
    }
    case "forge-relight": {
      if (!spec.preset) return { refusal: "a relight names a preset" };
      const preset = FORGE_LIGHT_PRESETS[spec.preset];
      const environment: Record<string, unknown> = {
        pointLights: preset.pointLights.map((l) => ({
          position: [...l.position],
          color: [...l.color],
          intensity: l.intensity,
        })),
        environmentIntensity: preset.environmentIntensity,
      };
      if (preset.ambientIntensity !== undefined) {
        environment.ambientIntensity = preset.ambientIntensity;
      }
      return { ops: [{ type: "set-environment", environment }] };
    }
    case "forge-camera": {
      if (!spec.direction) return { refusal: "a camera act names a direction" };
      const eye = forgeCameraEye(scene, spec.direction);
      if (!eye) return { refusal: "the scene's camera cannot be read" };
      return { ops: [{ type: "set-camera", eye }] };
    }
    default:
      return { refusal: `${decision.intent} is not a forge intent` };
  }
}

function isStaleRefusal(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /revision/i.test(msg);
}

/** A stale-revision refusal, distinguished for the retry loops. */
class ForgeStaleError extends Error {}

/**
 * One apply + renderer sync against the live scene (the shared
 * core of every Forge performance): apply with the revision
 * read at apply time, then sync the renderer by the topology
 * rule (replaceParts when the part set changed, updateParts
 * otherwise) and render one frame in the layer's view shape.
 * Throws ForgeStaleError on a stale refusal, and a plain Error
 * with the engine's own words on any other failure — including
 * a landed apply whose sync refused (the message says the act
 * landed; callers report it as failed, never as performed).
 */
function applyOpsOnce(handle: ForgeSceneHandle, ops: unknown[]): number {
  const { scene, renderer } = handle;
  const topologyBefore = scene.topologyRevision;
  try {
    scene.apply(ops, { expectedRevision: scene.revision });
  } catch (err) {
    if (isStaleRefusal(err)) {
      throw new ForgeStaleError(
        err instanceof Error ? err.message : String(err)
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
  try {
    if (scene.topologyRevision !== topologyBefore) {
      renderer.replaceParts(scene.parts);
    } else {
      renderer.updateParts(scene.parts);
    }
    renderer.render({
      ...scene.camera,
      environment: scene.environment,
      effects: scene.effects,
      exposure: scene.effects?.exposure ?? 1,
    });
  } catch (err) {
    throw new Error(
      `the act landed (scene revision ${scene.revision}) but the renderer refused the sync: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  return scene.revision;
}

/**
 * Re-sync the renderer after a NON-op scene change — a
 * checkpoint restore (the checkers game's End) replaces the
 * scene's contents wholesale, so the part set is re-handed
 * entire (replaceParts) and one frame renders. The restore
 * itself is the engine's session API, called by the owner;
 * this is only its renderer shadow.
 */
export function syncForgeScene(handle: ForgeSceneHandle): void {
  const { scene, renderer } = handle;
  renderer.replaceParts(scene.parts);
  renderer.render({
    ...scene.camera,
    environment: scene.environment,
    effects: scene.effects,
    exposure: scene.effects?.exposure ?? 1,
  });
}

/**
 * Perform raw agent-scene ops through the SAME path a forge
 * decision travels (Slice D): the revision contract (read at
 * apply time, one retry on a stale refusal, then the ops drop
 * — never a loop, never a force), the topology sync rule, one
 * render. The checkers game executes every move this way: its
 * ops are absolute (game-owned ids, board positions), so a
 * stale retry re-applies the same ops against the fresh
 * revision instead of re-translating.
 */
export function performForgeOps(
  ops: unknown[],
  handle: ForgeSceneHandle | null = getForgeSceneHandle(),
  label = "scene ops"
): ForgePerformOutcome {
  if (!handle) return { kind: "no-scene" };
  if (!Array.isArray(ops) || ops.length === 0) {
    return { kind: "refused", reason: "there are no ops to perform" };
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const revision = applyOpsOnce(handle, ops);
      return {
        kind: "performed",
        label,
        revision,
        attempts: attempt as 1 | 2,
      };
    } catch (err) {
      if (err instanceof ForgeStaleError) {
        if (attempt === 2) {
          return { kind: "stale-dropped", reason: err.message };
        }
        continue;
      }
      return {
        kind: "failed",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { kind: "stale-dropped", reason: "the scene kept moving" };
}

/**
 * Perform one validated forge decision against the live scene.
 * The handle is read from the seam at perform time (a caller may
 * pass one explicitly — the check does, with the real module's
 * scene and a recording renderer double standing at the seam's
 * far side, which is the renderer's documented contract:
 * updateParts(parts) then render(view)).
 *
 * Apply discipline: translate against the scene as it stands,
 * apply with the revision read at apply time; on a stale
 * refusal, re-translate against the fresh scene and retry ONCE;
 * a second refusal drops the act (stale-dropped). Any other
 * apply failure is reported as failed with the engine's own
 * words. A performed act ends with the render sync — replaceParts
 * when the act changed the part set (topologyRevision moved),
 * updateParts otherwise — plus one render in the layer's own
 * view shape; a forge-camera act also asks the layer to re-read
 * its authored camera, so the breathe orbit continues from
 * where the ghost moved the view.
 */
export function performForgeDecision(
  decision: GhostDecision,
  handle: ForgeSceneHandle | null = getForgeSceneHandle()
): ForgePerformOutcome {
  if (!decision.forge_spec) {
    return { kind: "refused", reason: "the decision carries no forge_spec" };
  }
  if (!handle) return { kind: "no-scene" };
  const { scene } = handle;

  let translated = forgeOpsForDecision(decision, scene);
  if ("refusal" in translated) {
    return { kind: "refused", reason: translated.refusal };
  }
  let ops = translated.ops;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      applyOpsOnce(handle, ops);
    } catch (err) {
      if (err instanceof ForgeStaleError) {
        if (attempt === 2) {
          return { kind: "stale-dropped", reason: err.message };
        }
        // The scene moved under the act: re-translate against
        // the fresh scene and retry ONCE — the loop's second
        // and final pass.
        const retry = forgeOpsForDecision(decision, scene);
        if ("refusal" in retry) {
          return { kind: "refused", reason: retry.refusal };
        }
        ops = retry.ops;
        continue;
      }
      return {
        kind: "failed",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    if (decision.intent === "forge-camera") {
      try {
        handle.refreshCamera();
      } catch {
        // The orbit re-sync is the layer's courtesy, never
        // the act's success condition — the apply landed.
      }
    }
    return {
      kind: "performed",
      label: ghostForgeActLabel(decision),
      revision: scene.revision,
      attempts: attempt as 1 | 2,
    };
  }
  // Unreachable (the loop returns on every path), kept total.
  return { kind: "stale-dropped", reason: "the scene kept moving" };
}
