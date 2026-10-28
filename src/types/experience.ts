import React from "react";

export type ExperienceType =
  | "default-fluid"
  | "ar-piano"
  | "camera-effects"
  | "sam-see"
  | "dancer-stage"
  | "multi-sensory"
  | "gesture-control"
  | "custom";

/**
 * The CANVAS KIND (realignment, Oct 28 — Terrell: "there are
 * multiple fabrics, each an experience with its own rules; the
 * fluid is ONE fabric canvas AND an effect usable inside others —
 * it is not the ground under every experience").
 *
 * An experience declares which canvas is its ground:
 *
 * - "fluid" (the default when undeclared): the LegacyFluid WebGL
 *   canvas is the base, and layers stack on it (piano, SAM, …).
 * - "stage3d": the experience owns a full react-three-fiber stage
 *   instead — its own camera, lights, and GPU shaders. The fluid
 *   canvas is NOT mounted as its base; fluid-derived work may
 *   appear inside it only as an effect. The Dancer Stage is the
 *   first stage3d fabric.
 *
 * ExperienceRenderer branches on this field, so a future fabric
 * with its own canvas kind never has to impersonate a fluid layer.
 */
export type ExperienceCanvasKind = "fluid" | "stage3d";

export interface ExperienceCapabilities {
  ar: boolean;
  camera: boolean;
  midi: boolean;
  multiUser: boolean;
  haptics: boolean;
  audio: boolean;
  customInputs: string[];
}

/**
 * THE IDLE CONTRACT (Slice 7 — from the world-model addendum,
 * Terrell: "I hate how the fabric dies after idle… an idle state
 * should be a feature required by all components even if it's just
 * an on or off transition").
 *
 * Every layer MUST declare what it does when nobody is touching it.
 * Going silently dead is not a behavior; it is the absence of one.
 * A layer declares exactly one of:
 *
 * - "ambient": the layer is alive on its own — it breathes, drifts,
 *   and plays a little in the quiet, and yields instantly the moment
 *   anything real happens (a touch, a peer, a note, a ghost). The
 *   base fluid ships this: see useAmbientLife in
 *   src/components/fluid/, driven locally per device, governed by
 *   the layer's own "Ambient life" setting (specific.ambientEnabled,
 *   THIS LAYER settings, default on).
 * - "breathe": minimal life only — a slow pulse or sway, the least
 *   a surface can do and still be present rather than dead.
 * - "still": the layer is EXPLICITLY allowed to rest motionless.
 *   This must be a decision, never a default-by-omission.
 *
 * An undeclared layer is treated as "still" by consumers, but new
 * layers are expected to declare — the field is how the next layer
 * author learns the contract exists. Declaring is cheap: it is this
 * one field, plus honoring the per-layer ambient setting if the
 * layer implements self-play.
 *
 * The contract binds live inputs too (Slice 12): a sensor-driven
 * layer feature (device motion — specific.motionEnabled, default
 * OFF) must declare what it does at rest — listeners pause while
 * the tab is hidden, a physically still device injects no phantom
 * input, and turning the layer setting off tears the listeners
 * down entirely rather than muting them.
 */
export type IdleBehavior = "ambient" | "breathe" | "still";

export interface ExperienceConfig {
  common: {
    backgroundColor: string;
    particleDensity: number;
    audioVolume: number;
    hapticIntensity: number;
    renderMode?: "default" | "compat"; // default=WebGPU (recommended), compat=WebGL
  };
  specific: Record<string, unknown>;
}

export interface ExperienceLayer {
  id: string;
  name: string;
  description: string;
  /**
   * Slice 19: the one-line card text for the Fabrics drawer —
   * shorter and warmer than `description` (which stays the long
   * form). Optional: the drawer falls back to `description`.
   */
  blurb?: string;
  type: ExperienceType;
  version: string;
  author: string;
  capabilities: ExperienceCapabilities;
  /**
   * Which canvas is this experience's ground (see
   * ExperienceCanvasKind above). Undeclared means "fluid" — every
   * pre-realignment layer keeps its exact behavior.
   */
  canvas?: ExperienceCanvasKind;
  configDefaults: ExperienceConfig;
  /**
   * The idle contract (see IdleBehavior above): what this layer
   * does when nobody is touching it. Declare one — undeclared is
   * treated as "still", and stillness should be a choice.
   */
  idleBehavior?: IdleBehavior;
}