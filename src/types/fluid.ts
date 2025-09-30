export interface FluidConfig {
  SIM_RESOLUTION: number;
  DYE_RESOLUTION: number;
  DENSITY_DISSIPATION: number;
  VELOCITY_DISSIPATION: number;
  PRESSURE: number;
  PRESSURE_ITERATIONS: number;
  CURL: number;
  SPLAT_RADIUS: number;
  SPLAT_FORCE: number;
  SHADING: boolean;
  COLORFUL: boolean;
  PAUSED: boolean;
  BACK_COLOR: { r: number; g: number; b: number };
  TRANSPARENT: boolean;
}

export interface FluidInteraction {
  userId: string;
  position: { x: number; y: number };
  force: { x: number; y: number };
  pressure: number;
  color?: { r: number; g: number; b: number };
  timestamp: number;
}