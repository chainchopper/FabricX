/**
 * forge67.d.ts — hand-written declarations for the slice of
 * 67js Fabric uses (Slice A: the Forge layer).
 *
 * The @codepawlhq/67js package (installed under the "67js"
 * alias) ships no TypeScript types. These declarations cover
 * ONLY the surface the Forge layer touches, written from the
 * package's own docs (docs/agent-scene.md, docs/agent-look.md)
 * and the runtime shapes verified in the Slice A spike and
 * bundling proof (scene.parts / camera / environment / effects
 * / shadow were printed from a live createAgentScene call).
 * They are deliberately narrow: widening them belongs to the
 * slice that uses more of the engine.
 */

declare module "67js" {
  /** A retained renderer part: plain data, as the engine consumes it. */
  export interface Part67 {
    name: string;
    geometry: unknown;
    material: Record<string, unknown>;
    /** Column-major 4x4. */
    matrix: Float32Array;
  }

  export interface Renderer67Options {
    samples?: number;
    pixelRatio?: number;
    memoryBudgetMiB?: number;
    ground?: boolean;
    transparent?: boolean;
    hdr?: boolean;
    depth?: boolean;
    world?: boolean;
    environment?: Record<string, unknown>;
    shadowBounds?: Record<string, unknown>;
    viewTransform?: string;
    [key: string]: unknown;
  }

  export interface RenderView67 {
    eye: number[];
    target: number[];
    up?: number[];
    fov?: number;
    near?: number;
    far?: number;
    environment?: Record<string, unknown>;
    effects?: Record<string, unknown>;
    exposure?: number;
    time?: number;
    [key: string]: unknown;
  }

  export class Renderer67 {
    constructor(
      canvas: HTMLCanvasElement,
      parts: Part67[],
      options?: Renderer67Options
    );
    render(view: RenderView67): void;
    updateParts(
      parts: Part67[],
      options?: { shadows?: boolean; checks?: boolean }
    ): void;
    /**
     * Slice B: replace the renderer's part set — the sync for
     * topology changes (parts added, removed, or re-identified,
     * e.g. a geometry rebind), where updateParts refuses with
     * "Unknown part identity" / "Geometry changes require a new
     * renderer". The engine's own rule (docs/agent-look.md):
     * use replaceParts when scene.topologyRevision changes.
     */
    replaceParts(
      parts: Part67[],
      options?: { regroupOnly?: boolean }
    ): void;
    resize(): void;
    dispose(): void;
  }
}

declare module "67js/addons/agent-scene" {
  import type { Part67 } from "67js";

  export interface AgentScene {
    parts: Part67[];
    camera: {
      eye: number[];
      target: number[];
      up: number[];
      fov: number;
      near: number;
      far: number;
      [key: string]: unknown;
    };
    environment: { world?: boolean; lightDirection?: number[]; [key: string]: unknown };
    effects: { exposure: number; [key: string]: unknown };
    shadow: Record<string, unknown>;
    revision: number;
    /** Increments only when ordered part identities or membership change. */
    topologyRevision: number;
    capabilities: Record<string, unknown>;
    apply(
      operations: unknown[],
      options: { expectedRevision: number }
    ): void;
    checkpoint(): unknown;
    restore(checkpoint: unknown, options: { expectedRevision: number }): void;
    releaseCheckpoint(checkpoint: unknown): void;
    /**
     * Slice B: the scene's own recipe snapshot — the performer's
     * read path for node records (which geometry/material a node
     * carries). Verified against the real module by
     * forge-tools-check (the recipe round-trips the starter
     * scene's nodes verbatim).
     */
    exportRecipe(): {
      nodes: Array<{
        id: string;
        geometry?: string;
        material?: string;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    };
    /**
     * Slice E: the session's live sequence textures — one entry
     * per material carrying a sequence map, with the texture
     * descriptor the engine built from the host-decoded image
     * ({ image, colorSpace: "srgb" } per docs/material-maps.md).
     * The photo check asserts a print's descriptor against this,
     * the engine's own structure, not app bookkeeping.
     */
    sequenceTextures(): Array<{
      descriptor: { image: unknown; colorSpace?: string };
      [key: string]: unknown;
    }>;
  }

  /**
   * The session factory. The second argument is the limits
   * record (all fields optional). The third is the HOST
   * CONTEXT: { sequenceFrames } — a live Map from catalog
   * image id (64 lowercase hex) to the host-decoded image
   * ({ width, height, data }), read at every compile, so an
   * image registered after creation is found by a later apply
   * (docs/agent-scene.md: "the host decodes catalog images
   * before createAgentScene or apply"). Verified against the
   * real module by forge-photo-check.
   */
  export function createAgentScene(
    recipe: unknown,
    limits?: unknown,
    host?: { sequenceFrames?: Map<string, unknown> }
  ): AgentScene;
  export function resolveAgentShadow(
    shadow: Record<string, unknown>,
    lightDirection: number[] | undefined
  ): Record<string, unknown>;
  export function loadAgentSceneModules(need?: unknown): Promise<void>;
  export function loadAllAgentSceneModules(): Promise<void>;
  export const AGENT_SCENE_CAPABILITIES: {
    format: string;
    [key: string]: unknown;
  };
}

declare module "67js/addons/replace-textured-parts" {
  /**
   * Slice E: a side-effect addon — importing it extends
   * Renderer67.replaceParts to accept textured parts (the
   * engine's own sync error names it: "import
   * replace-textured-parts to add textured ones"). It exports
   * nothing; the import IS the registration. The layer loads
   * it in the photo print flow, before the perform.
   */
  const _registered: void;
  export default _registered;
}

declare module "67js/addons/scene-query" {
  import type { Part67 } from "67js";

  /**
   * Slice D: the engine's own scene raycast (docs/scene-query.md).
   * createSceneQuery(parts) builds a BVH-backed query over the
   * parts' geometry + world matrices; raycast returns the
   * NEAREST hit or null, `id` being the part's id (for an
   * agent-scene, the node id). Parts the query cannot index are
   * listed in `skipped` and never hit. Verified against the
   * real module by checkers-check (agent-scene parts index
   * cleanly; a ray through a piece returns the piece's node id).
   */
  export interface ForgeSceneQueryHit {
    point: number[];
    distance: number;
    normal: number[];
    id: string;
    partIndex: number;
    material: unknown;
    triangle: number;
  }

  export interface ForgeSceneQuery {
    raycast(ray: {
      origin: number[];
      direction: number[];
      maxDistance?: number;
    }): ForgeSceneQueryHit | null;
    skipped: unknown[];
    dispose(): void;
  }

  export interface ForgeSceneQueryModule {
    createSceneQuery(
      parts: Part67[],
      options?: {
        maxTriangles?: number;
        maxVertices?: number;
        memoryBudgetMiB?: number;
      }
    ): ForgeSceneQuery;
  }

  export function createSceneQuery(
    parts: Part67[],
    options?: {
      maxTriangles?: number;
      maxVertices?: number;
      memoryBudgetMiB?: number;
    }
  ): ForgeSceneQuery;
}
