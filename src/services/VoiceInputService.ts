/**
 * VoiceInputService — the AI Services voice-provider adapter.
 *
 * Hotfix 2.5: this service used to wire the Web Speech API
 * itself, and its whisper/custom providers were TODO stubs that
 * threw "not yet implemented". It is now an ADAPTER over the one
 * capture core (src/services/voiceCapture.ts), which every voice
 * surface shares:
 *
 * - provider "browser": the platform speech recognizer via the
 *   core (where it exists — Chrome/Edge/Safari; Firefox has no
 *   SpeechRecognition, and the core says so honestly).
 * - provider "whisper" / "custom": universal capture via
 *   getUserMedia + MediaRecorder (this is what makes the browser
 *   ASK for the microphone, in every modern browser), then the
 *   core's transcription seam POSTs the blob to the configured
 *   endpoint's /audio/transcriptions.
 *
 * The compose bar's live path is useComposeVoice; it reaches
 * configured providers through this adapter and everything else
 * through the core directly. New voice surfaces should build on
 * the core / useComposeVoice, not on this class.
 *
 * Powered by Nirvana
 */

import {
  speechRecognitionCtor,
  startMediaCapture,
  startSpeechRecognition,
  transcribeBlob,
  transcriptionModelFor,
  TRANSCRIBE_MODEL_DEFAULT,
  VoiceCaptureError,
  type MediaCaptureSession,
  type SpeechSession,
  type TranscriptionTarget,
} from "./voiceCapture";

export interface VoiceInputConfig {
  provider: "browser" | "whisper" | "custom" | "none";
  apiKey?: string;
  endpoint?: string;
  language: string;
}

export interface VoiceTranscription {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

export type VoiceInputCallback = (transcription: VoiceTranscription) => void;
export type VoiceErrorCallback = (error: string) => void;

/**
 * The exact error string this adapter reports when the browser
 * refuses the microphone. Exported so callers (useComposeVoice)
 * can recognize the denial state without string-sniffing prose
 * they do not own.
 */
export const VOICE_MIC_DENIED_MESSAGE =
  "Mic permission was blocked by the browser.";

const WHISPER_DEFAULT_ENDPOINT = "https://api.openai.com/v1";

function captureErrorMessage(err: unknown): string {
  if (err instanceof VoiceCaptureError) {
    switch (err.code) {
      case "denied":
        return VOICE_MIC_DENIED_MESSAGE;
      case "no-device":
        return "No microphone found on this device.";
      case "unsupported":
        return "This browser cannot capture microphone audio.";
      default:
        return "The microphone could not start.";
    }
  }
  return "The microphone could not start.";
}

export class VoiceInputService {
  private config: VoiceInputConfig;
  private speech: SpeechSession | null = null;
  private capture: MediaCaptureSession | null = null;
  private captureTarget: TranscriptionTarget | null = null;
  private finishingCapture = false;
  private isListening = false;
  private callbacks: Set<VoiceInputCallback> = new Set();
  private errorCallbacks: Set<VoiceErrorCallback> = new Set();

  constructor(config: VoiceInputConfig) {
    this.config = config;
  }

  /**
   * Validate the configured provider. Capture itself starts in
   * startListening; this stays as the explicit readiness check.
   */
  async initialize(): Promise<void> {
    if (this.config.provider === "none") {
      throw new Error("Voice input is disabled");
    }
    if (this.config.provider === "browser") {
      if (!speechRecognitionCtor()) {
        throw new Error(
          "Web Speech API is not supported in this browser. Try Chrome, Edge, or Safari."
        );
      }
      return;
    }
    if (this.config.provider === "whisper") {
      if (!this.config.apiKey) {
        throw new Error("Whisper API key is required");
      }
      return;
    }
    if (this.config.provider === "custom") {
      if (!this.config.endpoint) {
        throw new Error("Custom endpoint is required");
      }
      return;
    }
  }

  /** The transcription target this provider's config describes. */
  private targetForConfig(): TranscriptionTarget | null {
    if (this.config.provider === "whisper") {
      return {
        endpoint: this.config.endpoint || WHISPER_DEFAULT_ENDPOINT,
        apiKey: this.config.apiKey,
        model: TRANSCRIBE_MODEL_DEFAULT,
        language: this.config.language,
      };
    }
    if (this.config.provider === "custom" && this.config.endpoint) {
      return {
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
        model: transcriptionModelFor(this.config.endpoint),
        language: this.config.language,
      };
    }
    return null;
  }

  private emitError(message: string): void {
    this.errorCallbacks.forEach((callback) => callback(message));
  }

  private emitTranscription(text: string, isFinal: boolean): void {
    const transcription: VoiceTranscription = {
      text,
      confidence: 1.0,
      isFinal,
      timestamp: Date.now(),
    };
    this.callbacks.forEach((callback) => callback(transcription));
  }

  /** Transcribe a finished capture and report through the callbacks. */
  private async finishCapture(blob: Blob | null): Promise<void> {
    if (this.finishingCapture) return;
    this.finishingCapture = true;
    try {
      if (!blob || blob.size === 0) {
        this.emitError("Didn't catch any speech.");
        return;
      }
      const outcome = await transcribeBlob(blob, this.captureTarget);
      if (outcome.ok) {
        this.emitTranscription(outcome.text, true);
      } else if (outcome.reason === "empty") {
        this.emitError("Didn't catch any speech.");
      } else if (outcome.reason === "unsupported") {
        this.emitError(
          "The configured voice service does not offer transcription."
        );
      } else {
        this.emitError("The transcription service could not be reached.");
      }
    } finally {
      this.finishingCapture = false;
      this.captureTarget = null;
    }
  }

  /**
   * Start listening. Failures are reported through onError, never
   * thrown — callers subscribe and caption, they do not catch.
   */
  async startListening(): Promise<void> {
    if (this.isListening) return;

    if (this.config.provider === "none") {
      this.emitError("Voice input is disabled");
      return;
    }

    if (this.config.provider === "browser") {
      const session = startSpeechRecognition(this.config.language, {
        onInterim: (text) => this.emitTranscription(text, false),
        onFinal: (text) => {
          this.isListening = false;
          this.speech = null;
          this.emitTranscription(text, true);
        },
        onError: (code) => {
          this.isListening = false;
          this.speech = null;
          if (code === "denied") this.emitError(VOICE_MIC_DENIED_MESSAGE);
          else if (code === "no-speech") this.emitError("Didn't catch any speech.");
          else this.emitError("Speech recognition stopped.");
        },
        onEnd: () => {
          this.isListening = false;
          this.speech = null;
        },
      });
      if (!session) {
        this.emitError(
          "Web Speech API is not supported in this browser. Try Chrome, Edge, or Safari."
        );
        return;
      }
      this.speech = session;
      this.isListening = true;
      return;
    }

    // whisper / custom: universal capture + the transcription seam.
    const target = this.targetForConfig();
    if (!target) {
      this.emitError(
        this.config.provider === "whisper"
          ? "Whisper API key is required"
          : "Custom endpoint is required"
      );
      return;
    }
    try {
      const session = await startMediaCapture({
        onAutoStop: (blob) => {
          this.capture = null;
          this.isListening = false;
          void this.finishCapture(blob);
        },
      });
      this.capture = session;
      this.captureTarget = target;
      this.isListening = true;
    } catch (err) {
      this.emitError(captureErrorMessage(err));
    }
  }

  /**
   * Stop listening. For capture providers, stopping finishes the
   * recording and transcribes it; the transcript arrives through
   * onTranscription.
   */
  async stopListening(): Promise<void> {
    if (this.speech) {
      this.speech.stop();
      this.speech = null;
    }
    if (this.capture) {
      const session = this.capture;
      this.capture = null;
      this.isListening = false;
      const blob = await session.stop();
      await this.finishCapture(blob);
      return;
    }
    this.isListening = false;
  }

  /**
   * Register a callback for transcription results
   */
  onTranscription(callback: VoiceInputCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Register a callback for errors
   */
  onError(callback: VoiceErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VoiceInputConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if currently listening
   */
  getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.speech) {
      this.speech.abort();
      this.speech = null;
    }
    if (this.capture) {
      this.capture.cancel();
      this.capture = null;
    }
    this.isListening = false;
    this.callbacks.clear();
    this.errorCallbacks.clear();
  }
}

// Singleton instance
let voiceInputService: VoiceInputService | null = null;

export function getVoiceInputService(
  config?: VoiceInputConfig
): VoiceInputService {
  if (!voiceInputService && config) {
    voiceInputService = new VoiceInputService(config);
  } else if (!voiceInputService) {
    // Default config
    voiceInputService = new VoiceInputService({
      provider: "browser",
      language: "en-US",
    });
  }
  return voiceInputService;
}

export function resetVoiceInputService(): void {
  if (voiceInputService) {
    voiceInputService.destroy();
    voiceInputService = null;
  }
}
