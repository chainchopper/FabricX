/**
 * Segmentation availability — Slice 29: the See layer's one shared
 * answer to "can this device segment right now, by ANY path?"
 *
 * HF2.4's chip spoke whenever no cloud model resolved, because the
 * cloud was the only path it knew. Slice 30 adds an on-device tier,
 * and the interpreter can route — so "is segmentation available" is
 * no longer one component's local fact. It is a seam: each path
 * PUBLISHES its presence here, and any reader (the See chip today,
 * the See Acts crew's surfaces tomorrow) reads the single boolean.
 *
 * Sources:
 * - "cloud":   a cloud model resolved for this device (SamLayer
 *              publishes it from the composer's shared resolution).
 * - "device":  the on-device brain tier is present and ready
 *              (SamLayer publishes it from the brain snapshot).
 * - "acts":    the See Acts on-device interpreter can route
 *              (published by Slice 30's tier when it lands).
 *
 * The seed, frames and prompts never pass through here — presence
 * booleans only.
 *
 * Powered by Nirvana
 */

export type SegmentationSource = "cloud" | "device" | "acts";

export interface SegmentationSources {
  cloud: boolean;
  device: boolean;
  acts: boolean;
}

let sources: SegmentationSources = { cloud: false, device: false, acts: false };

const listeners = new Set<(available: boolean) => void>();

/** The single boolean every See surface reads: any path, anywhere. */
export function segmentationAvailable(): boolean {
  return sources.cloud || sources.device || sources.acts;
}

/** The raw per-source truth, for surfaces that word the difference. */
export function getSegmentationSources(): SegmentationSources {
  return { ...sources };
}

export function subscribeSegmentationAvailable(
  fn: (available: boolean) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** A path announces (or withdraws) its presence. */
export function publishSegmentationSource(
  source: SegmentationSource,
  present: boolean
): void {
  if (sources[source] === present) return;
  const before = segmentationAvailable();
  sources = { ...sources, [source]: present };
  const after = segmentationAvailable();
  if (after !== before) listeners.forEach((fn) => fn(after));
}

/* ------------------------------------------------------------------ */
/* The See chip's decision (Slice 29 silence rule)                     */
/* ------------------------------------------------------------------ */

export type SeeChipDecision =
  | { kind: "none" }
  | { kind: "pill" }
  | { kind: "line"; text: string };

/**
 * Silence by default: when the camera is live and a segmentation
 * path is available, the chip renders NOTHING — the layer working
 * is not news. A line appears only for genuine need states:
 * - the camera is denied/absent ("See · Camera blocked"), or
 * - no segmentation path exists anywhere ("See · Segmentation
 *   resting", and only once resolution has actually finished).
 * A dismissed need state collapses to the small "See" pill, as
 * before. Pure and synchronous so the rule is testable without a
 * camera, a model, or a renderer.
 */
export function seeChipDecision(input: {
  camStatus: string;
  segAvailable: boolean;
  configLoaded: boolean;
  dismissed: boolean;
}): SeeChipDecision {
  if (input.camStatus === "error") {
    return input.dismissed
      ? { kind: "pill" }
      : { kind: "line", text: "See · Camera blocked" };
  }
  if (input.configLoaded && !input.segAvailable) {
    return input.dismissed
      ? { kind: "pill" }
      : { kind: "line", text: "See · Segmentation resting" };
  }
  return { kind: "none" };
}
