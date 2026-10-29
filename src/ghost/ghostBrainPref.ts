/**
 * Ghost brain tier preference — Slice 9 "LifePacket step 1".
 *
 * Terrell's tier rule (LifePacket design): the ghost's brain is
 * ON-DEVICE by default; the cloud Muse Spark tier is an explicit
 * opt-in, never a silent default. This module is only the recorded
 * preference — the routing contract future tiers read:
 *
 * - "on-device": the ghost thinks here. Its reflexes, temperament,
 *   and (as they ship) the small Fanalogy model builds for WebGPU /
 *   native. This is the default.
 * - "spark-cloud": the user opts into the Muse Spark cloud tier
 *   (Meta Model API) as the ghost's teacher brain.
 *
 * What this does since the Ghost Brain build — stated plainly so
 * nobody over-reads the switch: flipping it DOES route the ghost's
 * deliberation layer (GhostBrain.ts). The ghost's reflexes always
 * run on-device regardless; every ~10s of changed context the
 * ghost deliberates, and the tier picks the brain:
 * - "on-device": the distilled decision table decides locally. No
 *   network, instant, offline.
 * - "spark-cloud": the scenario is posted to the resolved cloud
 *   model through the same loader the composer uses (the user's
 *   saved model, else Fanalogy's build-time-locked cloud — see
 *   PatternComposer's resolution). If no cloud resolves at all,
 *   the on-device table decides instead and the live brain line
 *   publishes the state as "On-device brain" — never a silent
 *   fake, never a plea for a key (Cleanup 2).
 *
 * The switch itself lives in Your Ghostie (Slice 20, GhostieHome)
 * — it moved out of AI Services, which now carries only a pointer
 * line. This module (key, values, defaults) is unchanged.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";

export const GHOST_BRAIN_KEY = "fabric_ghost_brain_v1";

export type GhostBrainTier = "on-device" | "spark-cloud";

export const DEFAULT_GHOST_BRAIN_TIER: GhostBrainTier = "on-device";

export async function getGhostBrainTier(): Promise<GhostBrainTier> {
  try {
    const raw = await getJSON<string | null>(GHOST_BRAIN_KEY, null);
    return raw === "spark-cloud" ? "spark-cloud" : DEFAULT_GHOST_BRAIN_TIER;
  } catch {
    return DEFAULT_GHOST_BRAIN_TIER;
  }
}

export async function setGhostBrainTier(tier: GhostBrainTier): Promise<void> {
  try {
    await setJSON(GHOST_BRAIN_KEY, tier);
  } catch {
    // Preference persistence is best-effort; the row re-reads on open.
  }
}
