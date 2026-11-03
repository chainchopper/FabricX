/**
 * onDeviceBrain — Slice 27: the on-device brain gets real.
 *
 * A real language model that runs ON this device, in the browser,
 * over WebGPU (WebLLM / MLC). This is the tier Terrell has asked
 * for since the beginning — "models we trained, run on device" —
 * and the pattern is ported from Fanalogy's own proven code: the
 * Conduit app's "On-device (WebLLM over WebGPU)" adapter
 * (conduit/app/js/adapters.js), which loads models into WebGPU in
 * production today:
 *
 * - the library is NEVER bundled: it is dynamically imported from
 *   the CDN at first use (`https://esm.sh/@mlc-ai/web-llm@0.2.79`),
 *   so Metro never tries to resolve it and the app shell stays
 *   light;
 * - the engine is a lazy singleton, created only when the user
 *   says yes (see consent below), then cached by the browser —
 *   later visits load from cache, offline;
 * - `navigator.gpu` is the probe: no WebGPU, no tier — reported
 *   honestly, never faked.
 *
 * Tier order (PatternComposer.resolveBrainTier): the user's saved
 * model → Fanalogy's built-in cloud → THIS tier (when ready) →
 * the in-browser rule interpreter / the ghost's decision table.
 * Nothing ever waits on this module: every consumer checks
 * `isOnDeviceBrainReady()` synchronously and falls through to the
 * table exactly as before when the model is absent, downloading,
 * or warming. A download starts ONLY from an explicit yes — the
 * one-time consent ask, or a Download button in AI Services /
 * Your Ghostie.
 *
 * Privacy is structural here, not promised: the model runs
 * locally, so the seed, the Personality text, and every prompt
 * stay on the device. There is no endpoint to leak them to.
 *
 * Framework-free (no React imports) so the node contract check
 * (scripts/slice27-check.mjs) can drive the real state machine
 * with a mocked web-llm module.
 *
 * Powered by Nirvana
 */

import { getJSON, setJSON } from "../../app/utils/storage";

/** The exact CDN module Conduit's production adapter imports. */
export const WEBLLM_CDN_URL = "https://esm.sh/@mlc-ai/web-llm@0.2.79";

export const BRAIN_MODEL_KEY = "fabric_brain_model_v1";
export const BRAIN_CONSENT_KEY = "fabric_brain_consent_v1";

export interface BrainModelInfo {
  /** MLC model id, exactly as web-llm names it. */
  id: string;
  /** Product label. */
  label: string;
  /**
   * Slice 29: the name the picker presents — the models run under
   * ghostie identity. DISPLAY ONLY: ids, keys and the persisted
   * fabric_brain_model_v1 values are untouched.
   */
  displayName: string;
  /** Honest provenance, shown as the picker's subline. */
  baseNote: string;
  /** One-time download size, megabytes (weights, q4f16_1). */
  sizeMB: number;
  /** The size as the consent ask says it: "about 700 MB". */
  sizeNote: string;
}

export const BRAIN_MODELS: BrainModelInfo[] = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    displayName: "Ghostie 1B",
    baseNote: "Llama 3.2 1B inside",
    sizeMB: 700,
    sizeNote: "about 700 MB",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 1.5B",
    displayName: "Ghostie 1.5B",
    baseNote: "Qwen 2.5 1.5B inside",
    sizeMB: 1024,
    sizeNote: "about 1 GB",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    displayName: "Ghostie 3B",
    baseNote: "Llama 3.2 3B inside",
    sizeMB: 1800,
    sizeNote: "about 1.8 GB",
  },
];

export const DEFAULT_BRAIN_MODEL: BrainModelInfo = BRAIN_MODELS[0];

export function brainModelById(id: string | null | undefined): BrainModelInfo {
  return BRAIN_MODELS.find((m) => m.id === id) ?? DEFAULT_BRAIN_MODEL;
}

// ---------------------------------------------------------------------------
// Slice 46: the ONE naming source for every brain surface.
//
// Terrell, on device (Nov 3): the site "claims it's downloading a
// brain but I have no idea what brain." The catalog above always
// knew — displayName (the product name, "Ghostie 1B") + label
// (the honest base, "Llama 3.2 1B") + sizeNote — but the canvas
// chip rendered none of it ("Brain arriving… 42%"), and the
// settings card's warming line named nothing either. Every
// transfer surface now builds its words HERE, from the snapshot's
// own model, so the name on the canvas can never drift from the
// model actually being fetched: progress, warming and ready all
// say WHICH brain, in product name and base name together.
// ---------------------------------------------------------------------------

/** "Ghostie 1B (Llama 3.2 1B)" — product name, honest base in parens. */
export function brainModelFullName(model: BrainModelInfo): string {
  return `${model.displayName} (${model.label})`;
}

/**
 * The canvas chip's line while a transfer is live: the named
 * model, arriving with a real percentage, or warming once the
 * weights are in. Null outside the transfer states — surfaces
 * that only render during a transfer (BrainChrome's chip) can
 * rely on non-null exactly when they render.
 */
export function brainTransferLabel(snap: BrainSnapshot): string | null {
  const pct = Math.round(snap.progress * 100);
  switch (snap.state) {
    case "downloading":
      return `${brainModelFullName(snap.model)} arriving… ${pct}%`;
    case "warming":
      return `${brainModelFullName(snap.model)} warming up…`;
    case "ready":
      return `${brainModelFullName(snap.model)} — thinking on this device`;
    default:
      return null;
  }
}

export type BrainConsent = "granted" | "declined";

export type OnDeviceBrainState =
  | "idle" // known device, model not downloaded (or not this one)
  | "probing" // first look: prefs loading / WebGPU probe in flight
  | "unavailable" // no WebGPU on this browser/device — honest dead end
  | "downloading" // weights arriving; snapshot.progress is real (0..1)
  | "warming" // weights in, engine compiling/first-warm
  | "ready" // the model is thinking on this device
  | "error"; // a download/load attempt failed; snapshot.error says why

export interface BrainSnapshot {
  state: OnDeviceBrainState;
  /** Download progress 0..1 while downloading; 1 when ready. */
  progress: number;
  /** The selected model (persisted preference). */
  model: BrainModelInfo;
  /** The model the live engine holds, when one is loaded. */
  loadedModelId: string | null;
  /** WebGPU presence as probed on this device. */
  webgpu: boolean;
  /** The recorded consent answer, or null when never asked/answered. */
  consent: BrainConsent | null;
  /** The one-time consent ask is currently being shown by chrome. */
  askVisible: boolean;
  /** Plain-words failure line for the error state. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// The web-llm surface we use (structural — the module arrives at
// runtime from the CDN and is never in the bundle to type against).
// ---------------------------------------------------------------------------

export interface WebLLMInitProgress {
  progress: number;
  text: string;
  timeElapsed?: number;
}

export interface WebLLMEngine {
  chat: {
    completions: {
      create: (req: {
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        max_tokens?: number;
      }) => Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
  unload?: () => Promise<void>;
}

export interface WebLLMModule {
  CreateMLCEngine: (
    modelId: string,
    config?: {
      initProgressCallback?: (report: WebLLMInitProgress) => void;
      logLevel?: string;
    }
  ) => Promise<WebLLMEngine>;
}

/** Test seam: the node check injects a mocked web-llm module. */
type WebLLMImporter = (url: string) => Promise<WebLLMModule>;
let importerOverride: WebLLMImporter | null = null;
export function setWebLLMImporterForTests(fn: WebLLMImporter | null): void {
  importerOverride = fn;
}

async function importWebLLM(): Promise<WebLLMModule> {
  if (importerOverride) return importerOverride(WEBLLM_CDN_URL);
  // A runtime-constructed import: Metro must never see the CDN
  // specifier (it would try to bundle it and fail), and on the web
  // this performs the browser's genuine dynamic import — the exact
  // route Conduit's adapter proves. Native runtimes never reach
  // here: the WebGPU probe has already reported them unavailable.
  const dynamicImport = new Function(
    "u",
    "return import(u)"
  ) as (u: string) => Promise<unknown>;
  return (await dynamicImport(WEBLLM_CDN_URL)) as WebLLMModule;
}

// ---------------------------------------------------------------------------
// The store: one snapshot, a listener set, the Conduit-shaped
// lazy engine singleton underneath.
// ---------------------------------------------------------------------------

let snapshot: BrainSnapshot = {
  state: "probing",
  progress: 0,
  model: DEFAULT_BRAIN_MODEL,
  loadedModelId: null,
  webgpu: false,
  consent: null,
  askVisible: false,
  error: null,
};

const listeners = new Set<(s: BrainSnapshot) => void>();

function publish(patch: Partial<BrainSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch {
      // A listener must never break the brain.
    }
  }
}

export function getBrainSnapshot(): BrainSnapshot {
  void ensureBrainInit();
  return snapshot;
}

/**
 * Slice 44: THE predicate for "the brain's progress chip is on
 * screen" — one expression, read by BrainChrome (which renders
 * the chip), GroundingChrome (whose chip yields to it: the top
 * status slot has one occupant) and GenxLayer (whose top
 * cluster drops below it). Before, each site kept its own copy
 * of the condition and they could disagree; the chip is up
 * exactly when the one-time ask is not and a download or warm
 * is in flight.
 */
export function brainChipVisible(s: BrainSnapshot): boolean {
  return (
    !s.askVisible && (s.state === "downloading" || s.state === "warming")
  );
}

export function subscribeOnDeviceBrain(
  fn: (s: BrainSnapshot) => void
): () => void {
  listeners.add(fn);
  void ensureBrainInit();
  return () => {
    listeners.delete(fn);
  };
}

/** Synchronous readiness — the only question consumers ask inline. */
export function isOnDeviceBrainReady(): boolean {
  return snapshot.state === "ready" && engine !== null;
}

function probeWebGPU(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      !!(navigator as { gpu?: unknown }).gpu
    );
  } catch {
    return false;
  }
}

let initPromise: Promise<void> | null = null;

/**
 * First-look initialization: read the two prefs, probe WebGPU,
 * settle into idle/unavailable. Idempotent; never downloads.
 */
export function ensureBrainInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    let model = DEFAULT_BRAIN_MODEL;
    let consent: BrainConsent | null = null;
    try {
      const savedModel = await getJSON<string | null>(BRAIN_MODEL_KEY, null);
      model = brainModelById(savedModel);
    } catch {
      // Prefs are best-effort; the default model stands.
    }
    try {
      const savedConsent = await getJSON<string | null>(
        BRAIN_CONSENT_KEY,
        null
      );
      consent =
        savedConsent === "granted" || savedConsent === "declined"
          ? savedConsent
          : null;
    } catch {
      consent = null;
    }
    const webgpu = probeWebGPU();
    publish({
      state: webgpu ? "idle" : "unavailable",
      model,
      consent,
      webgpu,
    });
  })();
  return initPromise;
}

// ---------------------------------------------------------------------------
// The engine (Conduit's ensureEngine, ported): lazy singleton,
// unloaded and rebuilt when the selected model changes.
// ---------------------------------------------------------------------------

let engine: WebLLMEngine | null = null;
let engineModelId: string | null = null;
let downloadInFlight: Promise<void> | null = null;

/**
 * Start (or join) the download + engine build for the selected
 * model. This IS the explicit first use: callers are the consent
 * ask's Yes and the settings Download buttons — both record
 * consent as granted. Never called by any resolution path.
 */
export function startOnDeviceDownload(): Promise<void> {
  if (downloadInFlight) return downloadInFlight;
  downloadInFlight = (async () => {
    await ensureBrainInit();
    if (snapshot.consent !== "granted") {
      await answerBrainConsent(true);
    }
    if (!snapshot.webgpu) {
      publish({ state: "unavailable" });
      return;
    }
    const want = snapshot.model;
    if (engine && engineModelId === want.id) {
      publish({ state: "ready", progress: 1, loadedModelId: want.id });
      return;
    }
    if (engine) {
      try {
        await engine.unload?.();
      } catch {
        // A stale engine that won't unload is dropped, not fatal.
      }
      engine = null;
      engineModelId = null;
    }
    publish({ state: "downloading", progress: 0, error: null });
    try {
      const mod = await importWebLLM();
      const created = await mod.CreateMLCEngine(want.id, {
        logLevel: "SILENT",
        initProgressCallback: (report) => {
          const p =
            typeof report?.progress === "number"
              ? Math.min(1, Math.max(0, report.progress))
              : 0;
          // Weights arriving read as downloading; a full bar with
          // the engine still compiling reads as warming up.
          publish({
            state: p >= 0.99 ? "warming" : "downloading",
            progress: p,
          });
        },
      });
      engine = created;
      engineModelId = want.id;
      publish({ state: "ready", progress: 1, loadedModelId: want.id });
    } catch (err) {
      engine = null;
      engineModelId = null;
      publish({
        state: "error",
        progress: 0,
        error:
          err instanceof Error
            ? err.message
            : "the model could not be loaded on this device",
      });
    } finally {
      downloadInFlight = null;
    }
  })();
  return downloadInFlight;
}

/**
 * Chat with the on-device model. Returns the reply text, or null
 * when the brain is not ready or the call fails — callers fall
 * through to their next tier on null, so nothing ever waits on,
 * or breaks on, this module.
 */
export async function onDeviceChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string | null> {
  if (!isOnDeviceBrainReady() || !engine) return null;
  try {
    const res = await engine.chat.completions.create({
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 512,
    });
    const text = res?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Consent: asked ONCE per install, in product language, only when
// a feature first wants the brain and this device could host it.
// The option itself never disappears — AI Services and Your
// Ghostie carry the download permanently.
// ---------------------------------------------------------------------------

/**
 * A feature (compose, the ghost's deliberation) wanted the
 * on-device brain. When consent was already granted, that want IS
 * the explicit use: an interrupted download resumes. When consent
 * is undecided and this device has WebGPU, the one-time ask is
 * raised for the chrome to show. When declined: silence, forever —
 * the settings surfaces keep the option, nothing nags.
 */
export function noteBrainWanted(): void {
  void (async () => {
    await ensureBrainInit();
    if (snapshot.state === "ready" || snapshot.state === "downloading" || snapshot.state === "warming") {
      return;
    }
    if (snapshot.consent === "granted") {
      void startOnDeviceDownload();
      return;
    }
    if (snapshot.consent === null && snapshot.webgpu) {
      if (!snapshot.askVisible) publish({ askVisible: true });
    }
  })();
}

/** Record the consent answer; a Yes starts the download at once. */
export async function answerBrainConsent(yes: boolean): Promise<void> {
  const consent: BrainConsent = yes ? "granted" : "declined";
  publish({ consent, askVisible: false });
  try {
    await setJSON(BRAIN_CONSENT_KEY, consent);
  } catch {
    // Persistence is best-effort; the in-memory answer still holds
    // for this session.
  }
  if (yes) void startOnDeviceDownload();
}

/** Hide the ask without answering (chrome housekeeping). */
export function dismissBrainAsk(): void {
  if (snapshot.askVisible) publish({ askVisible: false });
}

/**
 * Pick the device's model (AI Services / Your Ghostie). Persists;
 * if the live engine holds a different model, the tier drops back
 * to idle — the new model downloads on the next explicit start.
 * Picking the already-loaded model keeps the ready state.
 */
export async function selectBrainModel(id: string): Promise<void> {
  const model = brainModelById(id);
  publish({ model });
  try {
    await setJSON(BRAIN_MODEL_KEY, model.id);
  } catch {
    // Best-effort, as above.
  }
  if (engine && engineModelId === model.id) {
    publish({ state: "ready", progress: 1, loadedModelId: model.id });
  } else if (snapshot.state === "ready") {
    publish({ state: "idle", progress: 0, loadedModelId: engineModelId });
  }
}

/** Test-only reset: clears the singleton + snapshot (not storage). */
export function resetOnDeviceBrainForTests(): void {
  engine = null;
  engineModelId = null;
  downloadInFlight = null;
  initPromise = null;
  snapshot = {
    state: "probing",
    progress: 0,
    model: DEFAULT_BRAIN_MODEL,
    loadedModelId: null,
    webgpu: false,
    consent: null,
    askVisible: false,
    error: null,
  };
}
