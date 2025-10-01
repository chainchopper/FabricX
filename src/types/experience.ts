import React from "react";

export type ExperienceType =
  | "default-fluid"
  | "ar-piano"
  | "camera-effects"
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
}