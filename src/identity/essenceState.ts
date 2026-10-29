/**
 * Essence state — Slice 29: the pure mapping behind the corner
 * Essence (app/components/fabric/Essence.tsx).
 *
 * The Essence shows no connection text in its compact form — the
 * connection state IS its behavior. This module owns that mapping
 * (and the standard mode's two plain lines) with no React and no
 * DOM, so it is testable in isolation:
 *
 * - connected    (online, peers present): steady living glow,
 *                the Home's 300ms fDNA cadence.
 * - reconnecting (connecting, or online with nobody here — the
 *                state the old badge's auto-retry loop serves):
 *                dimmed and slowed, visibly holding its breath.
 * - solo         (local mode — the designed state, not a failure):
 *                a calm, slow pulse.
 *
 * The session retry BEHAVIOR is unchanged by this slice and does
 * not live here: the Essence carries the retired badge's re-announce
 * loop verbatim; only its presentation moved into this mapping.
 *
 * Powered by Nirvana
 */

export type EssenceBehavior = "connected" | "reconnecting" | "solo";

/** Store states -> essence behavior. */
export function essenceBehaviorFor(
  mode: string | undefined,
  peers: number
): EssenceBehavior {
  if (mode === "online") return peers > 0 ? "connected" : "reconnecting";
  if (mode === "connecting") return "reconnecting";
  return "solo";
}

/** fDNA step cadence per behavior (the Home steps at 300ms). */
export function essenceStepMs(behavior: EssenceBehavior): number {
  switch (behavior) {
    case "connected":
      return 300;
    case "solo":
      return 650;
    case "reconnecting":
      return 1300;
  }
}

/** Canvas alpha per behavior — reconnecting visibly dims. */
export function essenceGlowAlpha(
  behavior: EssenceBehavior,
  nowMs: number
): number {
  switch (behavior) {
    case "connected":
      return 1;
    case "reconnecting":
      return 0.45;
    case "solo":
      // The calm pulse: a slow breath between 0.72 and 1.
      return 0.86 + 0.14 * Math.sin(nowMs / 1300);
  }
}

/**
 * The standard mode's ONE plain connection line. Hotfix 2.6: the
 * resolved session role rides along ("Connected · 3 here ·
 * Hosting") — the corner is where he glances, and "am I hosting?"
 * was the question the app used to leave unanswered.
 */
export function essenceConnectionLine(
  behavior: EssenceBehavior,
  peers: number,
  role?: "host" | "guest" | null
): string {
  const base = ((): string => {
    switch (behavior) {
      case "connected":
        return `Connected · ${peers + 1} here`;
      case "reconnecting":
        return "Reconnecting…";
      case "solo":
        return peers > 0 ? `Local · ${peers + 1} here` : "Just you here";
    }
  })();
  if (role === "host") return `${base} · Hosting`;
  if (role === "guest") return `${base} · Guest`;
  return base;
}

/**
 * The standard mode's brain line. The ghost store's brain status
 * (the brain that actually decided last) wins; before it exists,
 * the user's picked tier speaks.
 */
export function essenceBrainLine(
  source: "spark" | "table" | "device" | null,
  tier: "on-device" | "spark-cloud"
): string {
  if (source === "device") return "Brain: on this device";
  if (source === "spark") return "Brain: cloud";
  if (source === "table") return "Brain: decision table";
  return tier === "spark-cloud" ? "Brain: cloud" : "Brain: on this device";
}

/**
 * The emblem's ONE secondary hue: a deterministic hop from the
 * ghost's signature hue, seeded by the device seed — same device,
 * same pairing, forever; the seed itself never leaves the device.
 */
export function essenceSecondaryHue(primaryHue: number, seed: number): number {
  const hop = 55 + (Math.abs(seed | 0) % 65);
  return (((primaryHue + hop) % 360) + 360) % 360;
}
