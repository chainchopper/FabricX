/**
 * voiceCapture — Hotfix 2.5's one capture core for every voice path.
 *
 * Why this file exists: every voice surface used to ride the Web
 * Speech API (SpeechRecognition) directly. Firefox does not
 * implement SpeechRecognition at all — the constructor is null —
 * so on Firefox the mic button could NEVER even ask for the
 * microphone; pressing it produced an explanatory caption and
 * nothing else. The user read that, correctly, as gaslighting.
 *
 * The core offers two capture primitives and one transcription
 * seam, all framework-free (no React, no storage), reading browser
 * globals lazily at call time:
 *
 *  1. startSpeechRecognition — the platform recognizer where it
 *     exists (Chrome/Edge/Safari). Fast, local to the engine,
 *     interim previews. Unchanged Slice 17 semantics: one
 *     utterance, interim is preview only, final fires once.
 *
 *  2. startMediaCapture — universal capture:
 *     navigator.mediaDevices.getUserMedia({ audio: true }) +
 *     MediaRecorder. getUserMedia is what makes the browser ASK
 *     for the microphone, and it exists in every modern browser,
 *     Firefox included. Recording is capped (default 15s,
 *     auto-stop) and yields one in-memory Blob.
 *
 *  3. transcribeBlob(blob, target) — THE transcription seam. In
 *     order: a registered on-device transcriber (the plug point
 *     for Slice 27's on-device brain tier — register one with
 *     setOnDeviceTranscriber and it wins), else the resolved
 *     cloud endpoint when one is configured (OpenAI-compatible
 *     POST {endpoint}/audio/transcriptions, multipart), else an
 *     honest { ok: false, reason: "unsupported" }. It never
 *     fabricates a transcript.
 *
 * Privacy: capture runs only while a session is live; tracks are
 * stopped on stop/cancel; the blob lives in memory, is handed to
 * the transcription seam, and is dropped by the caller — never
 * stored, never sent anywhere except the configured endpoint.
 *
 * Powered by Nirvana
 */

export type VoiceCaptureErrorCode =
  | "denied"
  | "no-device"
  | "unsupported"
  | "failed";

export class VoiceCaptureError extends Error {
  readonly code: VoiceCaptureErrorCode;
  constructor(code: VoiceCaptureErrorCode, message: string) {
    super(message);
    this.name = "VoiceCaptureError";
    this.code = code;
  }
}

/** Recording cap for MediaRecorder capture (auto-stop). */
export const MAX_CAPTURE_MS = 15_000;

// ---------------------------------------------------------------------------
// Platform speech recognition (fast path)
// ---------------------------------------------------------------------------

type RecognitionCtor = new () => any;

export function speechRecognitionCtor(): RecognitionCtor | null {
  const g = globalThis as unknown as Record<string, unknown>;
  const w = (typeof window !== "undefined" ? window : null) as unknown as
    | Record<string, unknown>
    | null;
  const ctor =
    (w?.SpeechRecognition as RecognitionCtor | undefined) ||
    (w?.webkitSpeechRecognition as RecognitionCtor | undefined) ||
    (g.SpeechRecognition as RecognitionCtor | undefined) ||
    (g.webkitSpeechRecognition as RecognitionCtor | undefined);
  return ctor ?? null;
}

export type SpeechErrorCode = "denied" | "no-speech" | "failed";

export interface SpeechRecognitionCallbacks {
  onInterim?: (text: string) => void;
  /**
   * The final transcript, plus the recognizer's confidence for
   * it when the engine reports one (Slice 33: the score rides to
   * the ghost's state digest, where a low score biases toward
   * uncertainty instead of fake comprehension). Engines that do
   * not score report 0 or nothing — both are passed on as
   * undefined ("unscored"), never as zero ("garbled").
   */
  onFinal?: (text: string, confidence?: number) => void;
  onError?: (code: SpeechErrorCode) => void;
  /** Fires exactly once when the session is over, however it ended. */
  onEnd?: () => void;
}

export interface SpeechSession {
  stop: () => void;
  abort: () => void;
}

/**
 * Start a one-utterance platform recognition session. Returns null
 * when the platform has no recognizer (Firefox) — the caller then
 * falls back to media capture. A final transcript fires onFinal
 * exactly once; interim text is preview only.
 */
export function startSpeechRecognition(
  language: string,
  cb: SpeechRecognitionCallbacks
): SpeechSession | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = language;

  let ended = false;
  let handledFinal = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    cb.onEnd?.();
  };

  recognition.onresult = (event: any) => {
    if (ended) return;
    let finalText = "";
    let interimText = "";
    let finalConfidence: number | undefined;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result?.[0]?.transcript ?? "";
      if (result?.isFinal) {
        finalText += text;
        // The weakest final alternative is the honest score for
        // the whole utterance. A reported 0 means the engine
        // does not score — it is not evidence of a garble.
        const c = result?.[0]?.confidence;
        if (typeof c === "number" && Number.isFinite(c) && c > 0) {
          finalConfidence =
            finalConfidence === undefined
              ? Math.min(1, c)
              : Math.min(finalConfidence, c);
        }
      } else {
        interimText += text;
      }
    }
    if (finalText.trim()) {
      if (handledFinal) return;
      handledFinal = true;
      try {
        recognition.stop();
      } catch {
        // The engine may already have ended the session.
      }
      cb.onFinal?.(finalText.trim(), finalConfidence);
      finish();
    } else if (interimText) {
      cb.onInterim?.(interimText);
    }
  };
  recognition.onerror = (event: any) => {
    if (ended) return;
    const err = event?.error;
    if (err === "aborted") {
      finish();
      return;
    }
    if (err === "not-allowed" || err === "service-not-allowed") {
      cb.onError?.("denied");
    } else if (err === "no-speech") {
      cb.onError?.("no-speech");
    } else {
      cb.onError?.("failed");
    }
    finish();
  };
  recognition.onend = () => finish();

  try {
    recognition.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Already ended.
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        // Already ended.
      }
      finish();
    },
  };
}

// ---------------------------------------------------------------------------
// Universal media capture (getUserMedia + MediaRecorder)
// ---------------------------------------------------------------------------

export interface MediaCaptureSession {
  /** Stop recording and resolve with the captured audio blob. */
  stop: () => Promise<Blob | null>;
  /** Stop recording and discard the audio. */
  cancel: () => void;
  readonly mimeType: string;
}

export interface MediaCaptureOptions {
  /** Auto-stop cap; defaults to MAX_CAPTURE_MS. */
  maxMs?: number;
  /** Called with the blob when the cap stops the recording. */
  onAutoStop?: (blob: Blob | null) => void;
}

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(recorderCtor: any): string {
  if (typeof recorderCtor.isTypeSupported === "function") {
    for (const candidate of MIME_CANDIDATES) {
      try {
        if (recorderCtor.isTypeSupported(candidate)) return candidate;
      } catch {
        // Keep looking.
      }
    }
  }
  return "";
}

function captureErrorCode(err: unknown): VoiceCaptureErrorCode {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  ) {
    return "denied";
  }
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError"
  ) {
    return "no-device";
  }
  return "failed";
}

/**
 * Start capturing microphone audio. This is the call that makes
 * the browser show its microphone permission prompt — in every
 * modern browser. Rejects with a VoiceCaptureError whose code
 * names what happened (denied / no-device / unsupported / failed);
 * callers turn codes into product language, never console-only
 * errors.
 */
export async function startMediaCapture(
  options: MediaCaptureOptions = {}
): Promise<MediaCaptureSession> {
  // Slice 50: report the outcome to the grant memory
  // (src/sensors/hardwareGrants) WITHOUT an import — this
  // service's zero-import graph is load-bearing (its headless
  // check bundles it bare). The app answers window events
  // everywhere (the VerbBar pattern): hardwareGrants listens
  // for "fabric:hw-grant" from any module that imports it, and
  // the canvas always has it in the room. Best-effort: a
  // missing listener or a headless host makes this a no-op,
  // and it must never delay or break a capture.
  const noteGrant = (state: "granted" | "denied") => {
    try {
      const g = globalThis as {
        dispatchEvent?: (ev: unknown) => boolean;
      };
      if (typeof g.dispatchEvent === "function" && typeof CustomEvent === "function") {
        g.dispatchEvent(
          new CustomEvent("fabric:hw-grant", {
            detail: { kind: "microphone", state },
          })
        );
      }
    } catch {
      // The memory is a courtesy; the capture is the job.
    }
  };
  const nav = (globalThis as any).navigator as
    | { mediaDevices?: { getUserMedia?: unknown } }
    | undefined;
  const getUserMedia = nav?.mediaDevices?.getUserMedia;
  const RecorderCtor = (globalThis as any).MediaRecorder as
    | (new (stream: unknown, opts?: unknown) => any)
    | undefined;
  if (typeof getUserMedia !== "function" || typeof RecorderCtor !== "function") {
    throw new VoiceCaptureError(
      "unsupported",
      "This browser cannot capture microphone audio."
    );
  }

  let stream: any;
  try {
    stream = await (getUserMedia as (c: unknown) => Promise<any>).call(
      nav!.mediaDevices,
      { audio: true }
    );
    // The browser asked (or remembered) and the answer was yes:
    // the grant stands in the app's memory from here on.
    noteGrant("granted");
  } catch (err) {
    if (captureErrorCode(err) === "denied") noteGrant("denied");
    throw new VoiceCaptureError(
      captureErrorCode(err),
      err instanceof Error ? err.message : "Microphone capture failed."
    );
  }

  const mimeType = pickMimeType(RecorderCtor);
  let recorder: any;
  try {
    recorder = mimeType
      ? new RecorderCtor(stream, { mimeType })
      : new RecorderCtor(stream);
  } catch {
    stopTracks(stream);
    throw new VoiceCaptureError("failed", "The recorder could not start.");
  }

  const chunks: Blob[] = [];
  let settled = false;
  let stopPromise: Promise<Blob | null> | null = null;
  let stopResolve: ((blob: Blob | null) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopTracksOnce = () => stopTracks(stream);
  const finishStop = (): Promise<Blob | null> => {
    // One stop, one promise: repeat callers (a toggle racing the
    // auto-stop cap) all land on the same in-flight stop and the
    // same blob, never on a null that would eat the recording.
    if (stopPromise) return stopPromise;
    settled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    stopPromise = new Promise<Blob | null>((resolve) => {
      stopResolve = resolve;
      try {
        recorder.stop();
      } catch {
        stopTracksOnce();
        resolve(null);
      }
    });
    return stopPromise;
  };

  recorder.ondataavailable = (event: any) => {
    const data = event?.data;
    if (data && typeof data.size === "number" && data.size > 0) {
      chunks.push(data as Blob);
    }
  };
  recorder.onstop = () => {
    stopTracksOnce();
    if (!stopResolve) return;
    const resolve = stopResolve;
    stopResolve = null;
    const type = recorder.mimeType || mimeType || "audio/webm";
    resolve(
      chunks.length
        ? new Blob(chunks, { type })
        : new Blob([], { type })
    );
  };

  try {
    recorder.start();
  } catch {
    stopTracksOnce();
    throw new VoiceCaptureError("failed", "The recorder could not start.");
  }

  const maxMs = options.maxMs ?? MAX_CAPTURE_MS;
  if (maxMs > 0) {
    timer = setTimeout(() => {
      if (settled) return;
      void finishStop().then((blob) => options.onAutoStop?.(blob));
    }, maxMs);
  }

  return {
    mimeType: recorder.mimeType || mimeType || "audio/webm",
    stop: finishStop,
    cancel: () => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      stopResolve = null;
      try {
        recorder.stop();
      } catch {
        // Already stopped.
      }
      stopTracksOnce();
      chunks.length = 0;
    },
  };
}

function stopTracks(stream: any): void {
  try {
    const tracks = stream?.getTracks?.() ?? [];
    for (const track of tracks) {
      try {
        track?.stop?.();
      } catch {
        // One bad track must not strand the others.
      }
    }
  } catch {
    // Nothing to stop.
  }
}

// ---------------------------------------------------------------------------
// Transcription seam
// ---------------------------------------------------------------------------

/** Meta Model API's transcription model (OpenAI-compatible endpoint). */
export const TRANSCRIBE_MODEL_META = "muse-voice-transcribe-1.0";
/** Conventional model name for OpenAI-compatible transcription endpoints. */
export const TRANSCRIBE_MODEL_DEFAULT = "whisper-1";

export interface TranscriptionTarget {
  /** Base URL of an OpenAI-compatible endpoint, e.g. https://api.meta.ai/v1 */
  endpoint: string;
  apiKey?: string;
  model: string;
  /** BCP-47 language; only its primary subtag is sent. */
  language?: string;
}

export type TranscribeOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: "unsupported" | "network" | "empty" };

/**
 * The on-device transcriber slot — Slice 27's plug point. A
 * registered transcriber wins over the cloud target: return a
 * string for a transcript ("" = heard but empty), or null to say
 * "not mine" and fall through to the cloud target.
 */
export type OnDeviceTranscriber = (blob: Blob) => Promise<string | null>;

let onDeviceTranscriber: OnDeviceTranscriber | null = null;

export function setOnDeviceTranscriber(
  fn: OnDeviceTranscriber | null
): void {
  onDeviceTranscriber = fn;
}

export function hasOnDeviceTranscriber(): boolean {
  return onDeviceTranscriber !== null;
}

/** Which transcription model an endpoint speaks, by its shape. */
export function transcriptionModelFor(
  endpoint: string,
  chatModel?: string
): string {
  if (
    endpoint.includes("api.meta.ai") ||
    (chatModel ?? "").startsWith("muse-")
  ) {
    return TRANSCRIBE_MODEL_META;
  }
  return TRANSCRIBE_MODEL_DEFAULT;
}

/** Build a transcription target from a resolved LLM config, if any. */
export function transcriptionTargetFromLLM(
  config: { endpoint?: string; apiKey?: string; model?: string } | null
): TranscriptionTarget | null {
  if (!config?.endpoint) return null;
  return {
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    model: transcriptionModelFor(config.endpoint, config.model),
  };
}

function extensionForMime(mime: string): string {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mpeg":
      return "mp3";
    default:
      return "webm";
  }
}

/**
 * Turn a captured blob into words. On-device transcriber first
 * (when registered), then the cloud target's OpenAI-compatible
 * /audio/transcriptions. With neither, the honest outcome is
 * { ok: false, reason: "unsupported" } — the caller captions that
 * in product language; this seam never invents a transcript and
 * never sends the audio anywhere but the given endpoint.
 */
export async function transcribeBlob(
  blob: Blob,
  target: TranscriptionTarget | null
): Promise<TranscribeOutcome> {
  if (onDeviceTranscriber) {
    try {
      const text = await onDeviceTranscriber(blob);
      if (typeof text === "string") {
        return text.trim()
          ? { ok: true, text: text.trim() }
          : { ok: false, reason: "empty" };
      }
      // null = "not mine": fall through to the cloud target.
    } catch {
      // A failing on-device transcriber must not strand the ask;
      // fall through to the cloud target if there is one.
      if (!target) return { ok: false, reason: "network" };
    }
  }
  if (!target) return { ok: false, reason: "unsupported" };

  const g = globalThis as any;
  if (typeof g.fetch !== "function" || typeof g.FormData !== "function") {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const form = new g.FormData();
    form.append(
      "file",
      blob,
      `voice.${extensionForMime((blob as Blob).type ?? "")}`
    );
    form.append("model", target.model);
    form.append("response_format", "json");
    if (target.language) {
      form.append("language", target.language.split("-")[0]);
    }
    const url = `${target.endpoint.replace(/\/+$/, "")}/audio/transcriptions`;
    const res = await g.fetch(url, {
      method: "POST",
      headers: target.apiKey
        ? { Authorization: `Bearer ${target.apiKey}` }
        : undefined,
      body: form,
    });
    if (!res.ok) {
      return {
        ok: false,
        reason:
          res.status === 404 || res.status === 405 || res.status === 501
            ? "unsupported"
            : "network",
      };
    }
    const data = (await res.json().catch(() => null)) as {
      text?: unknown;
    } | null;
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    return text
      ? { ok: true, text }
      : { ok: false, reason: "empty" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** What this platform can do, for honest state reporting. */
export function voiceCaptureSupport(): {
  speechRecognition: boolean;
  mediaCapture: boolean;
} {
  const nav = (globalThis as any).navigator as
    | { mediaDevices?: { getUserMedia?: unknown } }
    | undefined;
  return {
    speechRecognition: speechRecognitionCtor() !== null,
    mediaCapture:
      typeof nav?.mediaDevices?.getUserMedia === "function" &&
      typeof (globalThis as any).MediaRecorder === "function",
  };
}
