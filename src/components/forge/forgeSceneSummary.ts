/**
 * forgeSceneSummary — the Forge scene as a sense (Slice C).
 *
 * Forge presence means the ghostie deliberates about the scene
 * it is actually standing in. This module is the read path for
 * that: it summarizes a live agent-scene — its nodes (id,
 * geometry kind, hex color) plus the scene's revision — into
 * the bounded GhostForgeSceneContext the peer's scenario
 * carries (GhostBrain owns the shape and the sanitizer; the
 * peer sanitizes again on entry, so nothing here is trusted
 * blindly).
 *
 * The summary is derived from the scene's OWN recipe
 * (scene.exportRecipe() — the same read path the performer
 * uses for node records), never from render state: geometry
 * ids translate back through the performer's vocabulary
 * (FORGE_GEOMETRY_IDS inverted — a node on the starter's ball
 * geometry reads as "sphere"), and material colors convert
 * from the recipe's linear RGB back to the hex the brain's
 * contract speaks (linearToHex — the exact inverse of the
 * conversion every authored color went through, so an
 * authored color round-trips). A node whose geometry id is
 * not in the vocabulary reads as "other"; a node with no
 * readable material color reads color null — unreadable is
 * reported, never fabricated.
 */
import type { AgentScene } from "./forge67";
import {
  FORGE_SCENE_SUMMARY_MAX_NODES,
  type GhostForgeGeometry,
  type GhostForgeSceneContext,
} from "../../ghost/GhostBrain";
import { FORGE_GEOMETRY_IDS } from "./forgePerformer";
import { linearToHex } from "./forgeScene";

/** Recipe geometry id -> the brain's geometry kind. */
const GEOMETRY_KIND_BY_ID: Record<string, GhostForgeGeometry> = Object.fromEntries(
  (Object.entries(FORGE_GEOMETRY_IDS) as Array<[GhostForgeGeometry, string]>).map(
    ([kind, id]) => [id, kind]
  )
);

/**
 * Summarize a live scene for the ghost's scenario, or null
 * when the scene cannot be read at all (the export threw, or
 * carried no node list) — a null summary is never fed, so the
 * peer keeps its last honest digest instead of a fabricated
 * empty room.
 */
export function buildForgeSceneSummary(
  scene: AgentScene
): GhostForgeSceneContext | null {
  let recipe: ReturnType<AgentScene["exportRecipe"]>;
  try {
    recipe = scene.exportRecipe();
  } catch {
    return null;
  }
  if (!recipe || !Array.isArray(recipe.nodes)) return null;
  const raw = recipe as unknown as {
    materials?: Array<{ id?: unknown; color?: unknown }>;
  };
  const colorByMaterial = new Map<string, string | null>();
  if (Array.isArray(raw.materials)) {
    for (const m of raw.materials) {
      if (m && typeof m.id === "string") {
        colorByMaterial.set(m.id, linearToHex(m.color));
      }
    }
  }
  const nodes: GhostForgeSceneContext["nodes"] = [];
  for (const n of recipe.nodes) {
    if (nodes.length >= FORGE_SCENE_SUMMARY_MAX_NODES) break;
    if (!n || typeof n.id !== "string") continue;
    nodes.push({
      id: n.id,
      geometry:
        typeof n.geometry === "string"
          ? (GEOMETRY_KIND_BY_ID[n.geometry] ?? "other")
          : "other",
      color:
        typeof n.material === "string"
          ? (colorByMaterial.get(n.material) ?? null)
          : null,
    });
  }
  return {
    revision:
      typeof scene.revision === "number" && Number.isFinite(scene.revision)
        ? Math.max(0, Math.floor(scene.revision))
        : 0,
    nodes,
  };
}
