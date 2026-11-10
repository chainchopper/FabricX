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
    capabilities: Record<string, unknown>;
    apply(
      operations: unknown[],
      options: { expectedRevision: number }
    ): void;
    checkpoint(): unknown;
    restore(checkpoint: unknown, options: { expectedRevision: number }): void;
    releaseCheckpoint(checkpoint: unknown): void;
  }

  export function createAgentScene(recipe: unknown): AgentScene;
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
