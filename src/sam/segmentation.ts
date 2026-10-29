/**
 * segmentation — Slice 30: the one seam every "find X in the
 * camera frame" question goes through (the SAM layer's manual
 * Segment flow and the See acts alike).
 *
 *   Tier A — cloud SAM 3.1 through the resolved model config
 *     (Slice 14's segmentFrame, unchanged): boxes AND masks.
 *     Chosen whenever a config resolves. An act ask counts as
 *     the user's Segment authorization for that one frame: the
 *     frame is captured for the ask and dropped right after,
 *     exactly the discipline the manual flow has always kept.
 *   Tier B — on-device grounding (src/sam/deviceGrounding.ts):
 *     GroundingDINO-tiny via transformers.js, frames analyzed
 *     on this device and never sent anywhere. Boxes only;
 *     masks remain Tier A's enhancement. Chosen only when the
 *     model is ALREADY READY — a tier check never starts, joins,
 *     or waits on the download.
 *
 * Order: A when configured -> B when ready -> honest
 * unavailable. A Tier A failure (network, quota) falls back to
 * a ready Tier B before it reports an error — the ask should
 * land if ANY eyes can serve it.
 *
 * getSegmentationStatus() is the read the layer chrome can use
 * to know whether segmentation is available at all (the Essence
 * crew's See-chrome seam can implement its availability read as
 * a one-line call into it when both slices are on main).
 *
 * No frame is stored by either tier: the capture below is a
 * transient canvas, dropped with the ask.
 *
 * Powered by Nirvana
 */

import { segmentFrame, type SamConfig } from "./samSegment";
import { getSamVideoElement } from "./samCameraStore";
import {
  detectOnDevice,
  isDeviceGroundingReady,
} from "./deviceGrounding";

/** One found region, in normalized IMAGE space (0..1). */
export interface GroundRegion {
  box: { x: number; y: number; w: number; h: number };
  /** Detection confidence when the tier reports one (Tier B). */
  score: number | null;
  label: string;
  /** Mask data exists (Tier A only, when SAM returned one). */
  hasMask: boolean;
}

export type SegmentationTier = "cloud-sam" | "device-grounding";

export type SegmentationOutcome =
  | { status: "ok"; tier: SegmentationTier; regions: GroundRegion[] }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export interface SeeFrame {
  dataUrl: string;
  width: number;
  height: number;
}

export interface SegmentationDeps {
  /** Tier A config from the resolved model, or null. */
  cloud: SamConfig | null;
  /** Test seams (production callers use the defaults). */
  captureFrame?: () => SeeFrame | null;
  fetchFn?: typeof fetch;
  deviceReady?: () => boolean;
  deviceDetect?: typeof detectOnDevice;
}

const CAMERA_NOT_UP =
  "Camera isn't ready yet — give it a moment and ask again.";

/**
 * Capture ONE frame from the live See camera, at the same
 * discipline as Slice 14's capture (max 1024 px wide, JPEG).
 * SAM 3.1 reads its frame from a data URL; Tier B reads the
 * same capture locally. The canvas is transient.
 */
export function captureSeeFrame(): SeeFrame | null {
  const video = getSamVideoElement();
  if (
    !video ||
    typeof document === "undefined" ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    return null;
  }
  const scale = Math.min(1, 1024 / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    width: canvas.width,
    height: canvas.height,
  };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Segment one phrase over the current camera frame through the
 * best available tier. Never throws; never waits on a download.
 */
export async function segmentPhrase(
  phrase: string,
  deps: SegmentationDeps
): Promise<SegmentationOutcome> {
  const capture = deps.captureFrame ?? captureSeeFrame;
  const deviceReady = deps.deviceReady ?? isDeviceGroundingReady;
  const deviceDetect = deps.deviceDetect ?? detectOnDevice;

  const viaDevice = async (): Promise<SegmentationOutcome | null> => {
    if (!deviceReady()) return null;
    const frame = capture();
    if (!frame) return { status: "error", message: CAMERA_NOT_UP };
    try {
      const raw = await deviceDetect(frame.dataUrl, phrase);
      if (!raw) return null; // not ready after all: tier absent
      const regions: GroundRegion[] = raw
        .map((r) => {
          const x = clamp01(r.box.xmin / frame.width);
          const y = clamp01(r.box.ymin / frame.height);
          const w = clamp01(r.box.xmax / frame.width) - x;
          const h = clamp01(r.box.ymax / frame.height) - y;
          return {
            box: { x, y, w, h },
            score: r.score,
            label: r.label,
            hasMask: false,
          };
        })
        .filter((r) => r.box.w > 0.005 && r.box.h > 0.005);
      return { status: "ok", tier: "device-grounding", regions };
    } catch {
      return {
        status: "error",
        message: "The on-device eyes stumbled — ask again in a moment.",
      };
    }
  };

  if (deps.cloud) {
    const frame = capture();
    if (!frame) return { status: "error", message: CAMERA_NOT_UP };
    try {
      const found = await segmentFrame(
        deps.cloud,
        phrase,
        frame.dataUrl,
        deps.fetchFn
      );
      return {
        status: "ok",
        tier: "cloud-sam",
        regions: found.map((r) => ({
          box: { x: r.x, y: r.y, w: r.w, h: r.h },
          score: null,
          label: r.label,
          hasMask: r.hasMask,
        })),
      };
    } catch (error) {
      // The cloud failed; a ready on-device tier still serves
      // the ask before anyone hears about the failure.
      const fallback = await viaDevice();
      if (fallback) return fallback;
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "See couldn't look just now.",
      };
    }
  }

  const device = await viaDevice();
  if (device) return device;
  return { status: "unavailable" };
}

/**
 * The availability read: is there ANY tier that could serve a
 * segment right now? (Configured cloud counts even before a
 * frame exists — configuration is the availability question;
 * the camera question is answered per-ask.)
 */
export function getSegmentationStatus(deps: {
  cloud: SamConfig | null;
  deviceReady?: () => boolean;
}): {
  cloudConfigured: boolean;
  deviceReady: boolean;
  anyAvailable: boolean;
} {
  const deviceReady = (deps.deviceReady ?? isDeviceGroundingReady)();
  return {
    cloudConfigured: deps.cloud !== null,
    deviceReady,
    anyAvailable: deps.cloud !== null || deviceReady,
  };
}
