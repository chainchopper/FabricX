/**
 * Sam camera store — the meeting point for the See layer's two
 * halves (Hotfix 2.4).
 *
 * The layer is split by the compositing order Terrell's world model
 * demands: the camera is the BACKGROUND and the fluid is an effect
 * drawn OVER it. So the camera surface (SamCameraBackground) renders
 * UNDER the fluid canvas while the outlines, status chip and tools
 * (SamLayer) render ABOVE it — two components that never import each
 * other, meeting here, in the same module pub/sub pattern as
 * src/session/sessionStore and src/lint/lintStore.
 *
 * What passes through:
 * - STATUS (background -> overlay): camera lifecycle, the last
 *   camera error, the stream's aspect ratio, and the host's size —
 *   everything the overlay needs to place SAM's normalized boxes
 *   onto the cover-cropped displayed frame and to word its chip.
 * - THE VIDEO ELEMENT (background -> capture): registered once so
 *   the overlay's Segment action can grab ONE frame. The element
 *   itself is never exposed beyond this module's capture function.
 *
 * PRIVACY: a captured frame exists only as captureSamCameraFrame's
 * return value — segmentFrame puts it in one request body and
 * nothing retains it. Nothing streams, ever.
 *
 * Powered by Nirvana
 */

export type SamCamStatus = "starting" | "live" | "paused" | "error";

export interface SamCameraSnapshot {
  status: SamCamStatus;
  error: string | null;
  /** Stream aspect (videoWidth / videoHeight); 0 until known. */
  aspect: number;
  /** Host size in px — the full-canvas box the camera fills. */
  size: { w: number; h: number };
}

let snapshot: SamCameraSnapshot = {
  status: "starting",
  error: null,
  aspect: 0,
  size: { w: 0, h: 0 },
};

let videoEl: HTMLVideoElement | null = null;

const listeners = new Set<(s: SamCameraSnapshot) => void>();

export function getSamCameraSnapshot(): SamCameraSnapshot {
  return snapshot;
}

export function subscribeSamCamera(
  fn: (s: SamCameraSnapshot) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishSamCamera(partial: Partial<SamCameraSnapshot>): void {
  const next: SamCameraSnapshot = {
    status: partial.status ?? snapshot.status,
    error: partial.error !== undefined ? partial.error : snapshot.error,
    aspect: partial.aspect ?? snapshot.aspect,
    size: partial.size ?? snapshot.size,
  };
  if (
    next.status === snapshot.status &&
    next.error === snapshot.error &&
    next.aspect === snapshot.aspect &&
    next.size.w === snapshot.size.w &&
    next.size.h === snapshot.size.h
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((fn) => fn(snapshot));
}

/** Register the live <video> element (null when the camera stops). */
export function registerSamVideo(el: HTMLVideoElement | null): void {
  videoEl = el;
}

/**
 * The live <video> element, for in-app ON-DEVICE consumers only
 * (Slice 28: the Hands engine runs its HandLandmarker against the
 * element SAM already opened, rather than opening a second stream
 * to the same camera). The privacy contract is unchanged and this
 * accessor does not bend it: detection reads frames locally and
 * drops them, exactly as capture does — no frame, landmark or
 * image leaves the device through either path, and nothing is
 * retained. External code still cannot reach the element; this is
 * a module-level getter for the app's own layers.
 */
export function getSamVideoElement(): HTMLVideoElement | null {
  return videoEl;
}

/**
 * Capture ONE frame from the camera as a JPEG data URL, or null
 * when the camera isn't ready. The data URL exists only as this
 * return value: segmentFrame puts it in one request body, and
 * nothing here retains it.
 */
export function captureSamCameraFrame(): string | null {
  const video = videoEl;
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }
  const scale = Math.min(1, 1024 / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
