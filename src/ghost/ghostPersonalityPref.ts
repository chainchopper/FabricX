/**
 * Ghost personality — storage (Slice 20, "Ghostie Home").
 *
 * The primary describes their ghostie in their own words ("Shy at
 * first, bold with friends, loves rain sounds…") and the words
 * steer deliberation for real: as context in the Spark-tier brain
 * consult, and as legible keyword biases over the on-device table
 * (both in GhostBrain.ts — sanitizePersonalityText,
 * parseGhostPersonality, applyPersonalityBias).
 *
 * The record is plain text under fabric_ghost_personality_v1,
 * capped at 280 characters, stored on this device only — like
 * every ghost preference it is never transmitted as a record. (On
 * the Spark tier the text rides inside MY OWN deliberation request
 * to MY configured model, the way the scenario does; it is never
 * sent to the room.)
 *
 * This module is only the storage: read/write the text, clamped
 * by the same sanitizer the brain applies, best-effort like the
 * other ghost prefs.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";
import { sanitizePersonalityText } from "./GhostBrain";

export const GHOST_PERSONALITY_KEY = "fabric_ghost_personality_v1";

/** The primary's personality text for their ghost ("" when unset). */
export async function getGhostPersonality(): Promise<string> {
  try {
    const raw = await getJSON<unknown>(GHOST_PERSONALITY_KEY, "");
    return sanitizePersonalityText(raw);
  } catch {
    return "";
  }
}

export async function setGhostPersonality(text: string): Promise<void> {
  try {
    await setJSON(GHOST_PERSONALITY_KEY, sanitizePersonalityText(text));
  } catch {
    // Preference persistence is best-effort; the Home re-reads on open.
  }
}
