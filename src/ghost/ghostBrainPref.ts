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
 * What this does NOT do today — stated plainly so nobody over-reads
 * the row in AI Services: flipping it does not swap any model. The
 * ghost's local rules always run on-device, the pattern composer
 * keeps using the AI Services configured-model path exactly as
 * before, and the ghost's optional LLM mood-bias poll is unchanged.
 * The preference is stored now so the tier routing lands on a value
 * the user already chose, in the open, instead of a default invented
 * later.
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
