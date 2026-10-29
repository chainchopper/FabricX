/**
 * deviceGrounding — Slice 30, Tier B: See's on-device eyes.
 *
 * Cloud SAM 3.1 (Tier A) is the enhancement — masks, the big
 * model — but See should not go blind without a network or a
 * configured key. Tier B grounds phrases to boxes ENTIRELY on
 * this device: @huggingface/transformers (pinned, loaded from
 * the esm.sh CDN the same computed-specifier way Slice 27 loads
 * WebLLM, so Metro never tries to bundle it) running
 * GroundingDINO-tiny (Apache-2.0, the onnx-community ONNX
 * export) — WebGPU preferred with the q4f16 weights (~152 MB),
 * WASM fallback with the q8 weights (~205 MB). Frames are read
 * locally and never leave; nothing is stored but the model
 * itself, cached by the browser after the one download.
 *
 * The discipline mirrors Slice 27's on-device brain exactly:
 *   - LAZY: nothing downloads because code imported this file.
 *     A want (an act ask the cloud can't serve) notes itself;
 *     the FIRST want raises ONE consent ask in chrome
 *     (GroundingChrome) with the real download size on it.
 *   - A No is forever (this pref key only — the brain's consent
 *     is a separate question and stays separate).
 *   - NOTHING EVER WAITS: readiness is a synchronous snapshot
 *     check. An ask that arrives before the eyes are ready
 *     falls through to the honest unavailable path; the SAME
 *     ask works once the model is on the device.
 *
 * Boxes only — masks remain Tier A's enhancement. (Tier C, a
 * SlimSAM mask grown from a Tier B box, is the named follow-up,
 * deliberately not in this slice.)
 *
 * Framework-free store (React subscribes via useSyncExternalStore
 * or a plain listener, like onDeviceBrain). Storage goes through
 * the app's storage util, never localStorage directly.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";

export const GROUNDING_CONSENT_KEY = "fabric_grounding_consent_v1";

/** The exact library build this tier loads (never a semver range). */
export const TRANSFORMERS_CDN_URL =
  "https://esm.sh/@huggingface/transformers@3.8.1";

/** The exact model artifact (Apache-2.0; transformers.js export). */
export const GROUNDING_MODEL_ID = "onnx-community/grounding-dino-tiny-ONNX";
export const GROUNDING_MODEL_LABEL = "GroundingDINO-tiny";

/**
 * Real download sizes, from the artifact's own file listing:
 * the WebGPU path pulls model_q4f16.onnx (151.1 MB) plus the
 * tokenizer/config files (~1 MB); the WASM path pulls
 * model_quantized.onnx (203.8 MB) plus the same small files.
 * The consent ask quotes the size for THIS device's path.
 */
export const GROUNDING_SIZE_WEBGPU = "about 152 MB";
export const GROUNDING_SIZE_WASM = "about 205 MB";

export type GroundingState =
  | "probing"
  | "idle"
  | "unavailable"
  | "downloading"
  | "ready"
  | "error";

export type GroundingConsent = "unknown" | "granted" | "declined";

export interface GroundingSnapshot {
  state: GroundingState;
  consent: GroundingConsent;
  /** Chrome shows the one-time consent card while this is true. */
  askVisible: boolean;
  /** 0..1 while downloading; 1 when ready. */
  progress: number;
  /** The execution path this device will run (or is running). */
  device: "webgpu" | "wasm" | null;
  /** Human size for the consent ask, for this device's path. */
  sizeNote: string;
  error: string | null;
}

/** One raw detection, in the input image's PIXEL space. */
export interface RawGroundBox {
  score: number;
  label: string;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const INITIAL: GroundingSnapshot = {
  state: "probing",
  consent: "unknown",
  askVisible: false,
  progress: 0,
  device: null,
  sizeNote: GROUNDING_SIZE_WEBGPU,
  error: null,
};

let snapshot: GroundingSnapshot = INITIAL;
const listeners = new Set<(snap: GroundingSnapshot) => void>();

function publish(patch: Partial<GroundingSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch {
      /* a listener's bug is not the store's */
    }
  }
}

export function getGroundingSnapshot(): GroundingSnapshot {
  return snapshot;
}

export function subscribeDeviceGrounding(
  fn: (snap: GroundingSnapshot) => void
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Synchronous readiness — the ONLY readiness any ask may consult. */
export function isDeviceGroundingReady(): boolean {
  return snapshot.state === "ready" && detector !== null;
}

// ---------------------------------------------------------------------------
// Module loading (computed specifier: Metro never sees the CDN URL)
// ---------------------------------------------------------------------------

type TransformersImporter = (url: string) => Promise<any>;

const defaultImporter: TransformersImporter = (url) =>
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("u", "return import(u)")(url) as Promise<any>;

let importer: TransformersImporter = defaultImporter;

/** Test seam: the contract check injects a mock transformers module. */
export function setGroundingImporterForTests(
  fn: TransformersImporter | null
): void {
  importer = fn ?? defaultImporter;
}

let detector: any = null;
let initStarted = false;
let loadStarted = false;

// ---------------------------------------------------------------------------
// Capability probe: WebGPU adapter, else WASM (always available
// where WebAssembly is). Mirrors Slice 27's probe shape.
// ---------------------------------------------------------------------------

async function probeDevicePath(): Promise<"webgpu" | "wasm" | null> {
  try {
    const gpu = (globalThis as any).navigator?.gpu;
    if (gpu && typeof gpu.requestAdapter === "function") {
      const adapter = await gpu.requestAdapter();
      if (adapter) return "webgpu";
    }
  } catch {
    /* fall through to wasm */
  }
  try {
    if (typeof WebAssembly !== "undefined") return "wasm";
  } catch {
    /* no wasm either */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Idempotent startup: read the recorded consent, probe the
 * device path, and resume the download if consent was granted
 * in a previous session. Safe to call from every mount.
 */
export async function ensureGroundingInit(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  const consent = await getJSON<GroundingConsent>(
    GROUNDING_CONSENT_KEY,
    "unknown"
  );
  const path = await probeDevicePath();
  if (path === null) {
    publish({ state: "unavailable", consent, device: null });
    return;
  }
  publish({
    state: "idle",
    consent,
    device: path,
    sizeNote: path === "webgpu" ? GROUNDING_SIZE_WEBGPU : GROUNDING_SIZE_WASM,
  });
  if (consent === "granted") void startGroundingLoad();
}

/**
 * Note that a feature wanted the on-device eyes. Granted ->
 * make sure the download is running. Undecided + capable ->
 * raise the ONE consent ask (chrome renders it). Declined ->
 * silence, forever. Never starts a download by itself.
 */
export function noteGroundingWanted(): void {
  void (async () => {
    await ensureGroundingInit();
    const s = snapshot;
    if (s.state === "unavailable") return;
    if (s.consent === "granted") {
      void startGroundingLoad();
      return;
    }
    if (s.consent === "unknown" && !s.askVisible) {
      publish({ askVisible: true });
    }
  })();
}

/** The consent card's answer. A Yes starts the download now. */
export async function answerGroundingConsent(yes: boolean): Promise<void> {
  await setJSON(GROUNDING_CONSENT_KEY, yes ? "granted" : "declined");
  publish({
    consent: yes ? "granted" : "declined",
    askVisible: false,
  });
  if (yes) void startGroundingLoad();
}

/**
 * Load GroundingDINO-tiny through transformers.js. WebGPU first
 * (q4f16 weights); any failure on that path retries once on
 * WASM (q8 weights) before the tier reports itself in error —
 * the cloud tier and the honest unavailable path are unaffected.
 */
export async function startGroundingLoad(): Promise<void> {
  if (loadStarted || detector) return;
  loadStarted = true;
  publish({ state: "downloading", progress: 0, error: null });

  // Per-file byte progress -> one honest overall fraction.
  const files = new Map<string, { loaded: number; total: number }>();
  const onProgress = (info: any) => {
    if (!info || typeof info.file !== "string") return;
    if (info.status === "progress" || info.status === "done") {
      const loaded =
        typeof info.loaded === "number"
          ? info.loaded
          : info.status === "done"
            ? (files.get(info.file)?.total ?? 0)
            : 0;
      const total = typeof info.total === "number" ? info.total : loaded;
      files.set(info.file, { loaded, total });
    }
    let sumLoaded = 0;
    let sumTotal = 0;
    for (const f of files.values()) {
      sumLoaded += f.loaded;
      sumTotal += f.total;
    }
    if (sumTotal > 0) {
      publish({ progress: Math.min(1, sumLoaded / sumTotal) });
    }
  };

  const attempt = async (
    device: "webgpu" | "wasm",
    dtype: string,
    mod: any
  ): Promise<any> =>
    mod.pipeline("zero-shot-object-detection", GROUNDING_MODEL_ID, {
      device,
      dtype,
      progress_callback: onProgress,
    });

  try {
    const mod = await importer(TRANSFORMERS_CDN_URL);
    try {
      if (mod?.env) mod.env.allowLocalModels = false;
    } catch {
      /* env is advisory */
    }
    const preferred = snapshot.device ?? "webgpu";
    try {
      detector = await attempt(
        preferred,
        preferred === "webgpu" ? "q4f16" : "q8",
        mod
      );
      publish({ device: preferred });
    } catch (firstError) {
      if (preferred !== "webgpu") throw firstError;
      // WebGPU path failed (driver, shader, memory): the WASM
      // path is slower and bigger, but it is still this device.
      detector = await attempt("wasm", "q8", mod);
      publish({ device: "wasm", sizeNote: GROUNDING_SIZE_WASM });
    }
    publish({ state: "ready", progress: 1, error: null });
  } catch (error) {
    loadStarted = false; // a later Yes / want may retry
    publish({
      state: "error",
      error:
        error instanceof Error
          ? error.message
          : "The on-device eyes could not load.",
    });
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Ground one phrase in one frame, fully on-device. Returns raw
 * pixel-space boxes (the segmentation seam normalizes them), an
 * empty array for "looked, found nothing", or null when the
 * eyes are not ready — callers must treat null as "tier not
 * available", never as "nothing there".
 */
export async function detectOnDevice(
  imageDataUrl: string,
  phrase: string
): Promise<RawGroundBox[] | null> {
  if (!isDeviceGroundingReady() || !detector) return null;
  const out = await detector(imageDataUrl, phrase, { threshold: 0.3 });
  // transformers.js returns a flat list for one image; some
  // builds nest per-label — flatten one level defensively.
  const flat: any[] = Array.isArray(out)
    ? out.flatMap((r: any) => (Array.isArray(r) ? r : [r]))
    : [];
  const boxes: RawGroundBox[] = [];
  for (const r of flat) {
    const b = r?.box;
    if (
      !b ||
      typeof b.xmin !== "number" ||
      typeof b.ymin !== "number" ||
      typeof b.xmax !== "number" ||
      typeof b.ymax !== "number" ||
      typeof r.score !== "number"
    ) {
      continue;
    }
    if (r.score < 0.3) continue;
    boxes.push({
      score: r.score,
      label: typeof r.label === "string" ? r.label : phrase,
      box: { xmin: b.xmin, ymin: b.ymin, xmax: b.xmax, ymax: b.ymax },
    });
  }
  boxes.sort((a, b) => b.score - a.score);
  return boxes.slice(0, 8);
}

/** Test-only: reset the whole store between check scenarios. */
export function __resetDeviceGroundingForTests(): void {
  snapshot = INITIAL;
  detector = null;
  initStarted = false;
  loadStarted = false;
  listeners.clear();
}
