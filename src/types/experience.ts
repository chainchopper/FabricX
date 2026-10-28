import React from "react";

export type ExperienceType =
  | "default-fluid"
  | "ar-piano"
  | "camera-effects"
  | "sam-see"
  | "multi-sensory"
  | "gesture-control"
  | "custom";

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
  type: ExperienceType;
  version: string;
  author: string;
  capabilities: ExperienceCapabilities;
  configDefaults: ExperienceConfig;
  /**
   * The idle contract (see IdleBehavior above): what this layer
   * does when nobody is touching it. Declare one — undeclared is
   * treated as "still", and stillness should be a choice.
   */
  idleBehavior?: IdleBehavior;
}