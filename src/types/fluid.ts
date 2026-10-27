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
  /**
   * Optional sensory-verb id (see src/sensory/verbs.ts, e.g. "heart").
   * When present, receivers also fire the verb's vibration pattern and
   * audio cue. Absent on plain touch interactions — fully backward
   * compatible with existing transports and payloads.
   */
  verb?: string;
  /**
   * Slice 6 ("Who's Who"): the sender's signature hue (degrees,
   * 0–359) from their persisted participant identity
   * (src/identity/identityStore). Stamped by sendInteraction on the
   * local human's own sends only — ghosts and pattern machinery keep
   * their own color logic. Receivers tint the splat toward this hue
   * and pitch the sender's stroke sound by it. Optional and additive:
   * older clients neither send nor require it.
   */
  hue?: number;
  /**
   * Hotfix 1.8: splat radius multiplier (1 = the engine's standard
   * radius) for emitters that are not fingers — the piano's note
   * streams are narrow jets (0.45) from a key-side nozzle, not
   * full-width touch splats. Receivers pass it to engine.splatAt so
   * a peer renders the sender's jet with the same geometry the
   * sender sees; the parameters derive from the interaction itself,
   * never from receiver-local state. Optional and additive: absent
   * means 1, and older clients simply render the standard radius.
   */
  radiusScale?: number;
}