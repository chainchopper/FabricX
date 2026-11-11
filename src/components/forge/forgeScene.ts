/**
 * forgeScene — the Forge fabric's scene source (Slice A).
 *
 * The Forge is a fabric of its own (canvas kind "forge67"): a
 * real 3D canvas whose ground is a scene made of plain data —
 * a 67js agent-scene recipe — instead of the fluid. This module
 * is the pure half of the layer: the color helper and the
 * starter scene. It imports nothing at runtime (types only),
 * so the check can bundle it and run the scene for real in
 * Node, and ForgeLayer can hand it the agent-scene factory
 * from its web-only dynamic import — the 67js graph stays out
 * of module evaluation on screens that never open the Forge.
 *
 * Slice A ships the starter scene only: a floor and five
 * primitives, standing in the studio light. The ghost's scene
 * tools (Slice B) will drive this same recipe through the
 * agent-scene revision contract — scene.apply(ops,
 * { expectedRevision }) + renderer.updateParts(scene.parts) —
 * so what is authored here is data the ghost can later edit,
 * not a picture baked into the layer.
 *
 * Colors: 67js recipes carry LINEAR RGB under an ACES view
 * transform. Authoring in familiar sRGB hex and converting is
 * what keeps an authored color the color its author meant —
 * raw sRGB numbers fed in as linear render washed-out pastel
 * (the spike's coral cube came out peach). Every material in
 * the starter scene goes through hexToLinear.
 */
import type { AgentScene, AgentSceneRecipe } from "./forge67";

/**
 * sRGB hex ("#e2492f" or "e2492f") -> linear [r, g, b], each
 * component 0..1, via the standard sRGB electro-optical curve.
 */
export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  const toLinear = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255)];
}

/**
 * Linear [r, g, b] (each component 0..1) -> sRGB hex "#rrggbb":
 * hexToLinear's inverse, through the same curve. The scene
 * sense (Slice C) reports node colors in the hex the brain's
 * contract speaks, so a color the ghost authored round-trips:
 * linearToHex(hexToLinear(h)) === h for any 8-bit hex.
 * Components clamp to [0, 1]; a non-array or non-finite input
 * reads as null (unreadable), never a fabricated color.
 */
export function linearToHex(rgb: unknown): string | null {
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const toSrgb = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const c = Math.min(1, Math.max(0, v));
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(s * 255);
  };
  const parts = [toSrgb(rgb[0]), toSrgb(rgb[1]), toSrgb(rgb[2])];
  if (parts.some((p) => p === null)) return null;
  return (
    "#" +
    parts.map((p) => (p as number).toString(16).padStart(2, "0")).join("")
  );
}

/** The starter scene's authored palette (sRGB hex, as a human picks them). */
export const FORGE_PALETTE = {
  floor: "#59606e",
  coral: "#e2492f",
  teal: "#0e7c86",
  brass: "#d9932c",
  grape: "#7a4fd0",
} as const;

/**
 * The starter recipe: a slate floor slab, a coral cube, a teal
 * sphere, a brass post and a grape ring, in the engine's studio
 * environment with one warm point light. Original to this
 * fabric — the same five shapes the Slice A bundling proof
 * renders through Metro and headless Chrome.
 */
export function forgeStarterRecipe() {
  return {
    format: "67js.scene",
    schemaVersion: 1,
    geometries: [
      { id: "unit-box", type: "box", bevel: 0.02 },
      { id: "ball", type: "sphere", segments: 48, rings: 32 },
      { id: "post", type: "cylinder", segments: 48 },
      { id: "ring", type: "torus" },
    ],
    materials: [
      { id: "floor", color: hexToLinear(FORGE_PALETTE.floor), metallic: 0, roughness: 0.95 },
      { id: "coral", color: hexToLinear(FORGE_PALETTE.coral), metallic: 0.05, roughness: 0.32 },
      { id: "teal", color: hexToLinear(FORGE_PALETTE.teal), metallic: 0, roughness: 0.6 },
      { id: "brass", color: hexToLinear(FORGE_PALETTE.brass), metallic: 1, roughness: 0.28 },
      { id: "grape", color: hexToLinear(FORGE_PALETTE.grape), metallic: 0.2, roughness: 0.4 },
    ],
    nodes: [
      { id: "floor-node", geometry: "unit-box", material: "floor", translation: [0, -0.05, 0], scale: [9, 0.1, 9] },
      { id: "cube-node", geometry: "unit-box", material: "coral", translation: [-1.4, 0.5, 0.2] },
      { id: "ball-node", geometry: "ball", material: "teal", translation: [0.8, 0.6, 0.6], scale: [1.2, 1.2, 1.2] },
      { id: "post-node", geometry: "post", material: "brass", translation: [2.1, 0.7, -0.9], scale: [0.8, 1.4, 0.8] },
      { id: "ring-node", geometry: "ring", material: "grape", translation: [-0.2, 1.7, -1.4] },
    ],
    camera: { eye: [4.2, 3.0, 5.6], target: [0, 0.7, 0], fov: 42 },
    environment: {
      setup: "studio",
      pointLights: [{ position: [2.5, 3.5, 2.0], color: [1, 0.85, 0.7], intensity: 60 }],
    },
  } as const;
}

/** Build the starter scene (retained parts + camera + look). */
export function buildForgeStarterScene(
  createScene: (recipe: AgentSceneRecipe) => AgentScene
): AgentScene {
  return createScene(forgeStarterRecipe());
}
