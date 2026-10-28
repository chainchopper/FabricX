/**
 * stageFx — the shared effect state between the Dancer Stage's DOM
 * side (note bus subscription, verb choreo) and its WebGL side
 * (floor ripples, accent lights, motes).
 *
 * The stage is a react-three-fiber canvas; the note bus lives
 * outside it. Instead of prop-drilling events through React state
 * (which would re-render the canvas tree at note rate), both sides
 * share ONE mutable fx object created by DancerStage:
 *
 * - the bus subscription pushes { hue, strength } into
 *   `pendingNotes` for every note-on (local AND remote — the bus
 *   already merges them);
 * - the scene drains `pendingNotes` once per frame: each note
 *   becomes a floor ripple in its hue and a flash on the accent
 *   lights, and tints the drifting motes;
 * - verb gestures queue as bare verb ids in `pendingGestures`; the
 *   rig drains them and stamps their start times on the render
 *   clock, so choreography stays in the same time base as the
 *   DancerDriver pose.
 */

export interface StageFxState {
  pendingNotes: { hue: number; strength: number }[];
  pendingGestures: string[];
}

export function createStageFx(): StageFxState {
  return { pendingNotes: [], pendingGestures: [] };
}

/** Stage hue themes (THIS LAYER setting, `specific.stageTheme`). */
export const STAGE_THEMES = {
  cyan: 190,
  violet: 265,
  magenta: 322,
  amber: 38,
} as const;

export type StageThemeId = keyof typeof STAGE_THEMES;

export function stageThemeHue(value: unknown): number {
  if (typeof value === "string" && value in STAGE_THEMES) {
    return STAGE_THEMES[value as StageThemeId];
  }
  return STAGE_THEMES.cyan;
}

/** Dark stage backdrop shared by the scene bg, fog, and floor edge. */
export const STAGE_BG = "#070a12";
