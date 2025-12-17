/**
 * VoiceInputService - Voice input and speech recognition
 * Supports Web Speech API (browser) and external services (Whisper, custom)
 * Powered by Nirvana
 */

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

export class VoiceInputService {
  private config: VoiceInputConfig;
  private recognition: any = null;
  private isListening = false;
  private callbacks: Set<VoiceInputCallback> = new Set();
  private errorCallbacks: Set<VoiceErrorCallback> = new Set();

  constructor(config: VoiceInputConfig) {
    this.config = config;
  }

  /**
   * Initialize voice recognition based on provider
   */
  async initialize(): Promise<void> {
    if (this.config.provider === "none") {
      throw new Error("Voice input is disabled");
    }

    if (this.config.provider === "browser") {
      return this.initializeBrowserSpeech();
    } else if (this.config.provider === "whisper") {
      return this.initializeWhisper();
    } else if (this.config.provider === "custom") {
      return this.initializeCustom();
    }
  }

  /**
   * Initialize Web Speech API (browser native)
   */
  private async initializeBrowserSpeech(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("Web Speech API is only available in browser");
    }

    // Check for Web Speech API support
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error(
        "Web Speech API is not supported in this browser. Try Chrome, Edge, or Safari."
      );
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.config.language;

    this.recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence;
      const isFinal = lastResult.isFinal;

      const transcription: VoiceTranscription = {
        text: transcript,
        confidence: confidence || 1.0,
        isFinal,
        timestamp: Date.now(),
      };

      this.callbacks.forEach((callback) => callback(transcription));
    };

    this.recognition.onerror = (event: any) => {
      const error = `Speech recognition error: ${event.error}`;
      console.error(error);
      this.errorCallbacks.forEach((callback) => callback(error));
    };

    this.recognition.onend = () => {
      // Auto-restart if still listening
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (err) {
          console.error("Failed to restart recognition:", err);
        }
      }
    };

    console.log("[VoiceInput] Browser Speech API initialized");
  }

  /**
   * Initialize Whisper API
   * TODO: Implement Whisper API support using MediaRecorder
   * - Capture audio chunks with MediaRecorder
   * - Send to OpenAI Whisper endpoint
   * - Handle streaming or batch transcription
   */
  private async initializeWhisper(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error("Whisper API key is required");
    }

    console.log("[VoiceInput] Whisper API mode - not yet implemented");
    throw new Error("Whisper API mode is not yet implemented. Browser mode is recommended.");
  }

  /**
   * Initialize custom endpoint
   * TODO: Implement custom endpoint support
   * - Allow users to provide custom transcription API
   * - Support WebSocket streaming protocols
   * - Handle custom authentication methods
   */
  private async initializeCustom(): Promise<void> {
    if (!this.config.endpoint) {
      throw new Error("Custom endpoint is required");
    }

    console.log("[VoiceInput] Custom endpoint mode - not yet implemented");
    throw new Error("Custom endpoint mode is not yet implemented. Browser mode is recommended.");
  }

  /**
   * Start listening for voice input
   */
  async startListening(): Promise<void> {
    if (this.isListening) {
      console.warn("[VoiceInput] Already listening");
      return;
    }

    if (this.config.provider === "browser") {
      if (!this.recognition) {
        await this.initialize();
      }

      try {
        this.recognition.start();
        this.isListening = true;
        console.log("[VoiceInput] Started listening");
      } catch (err) {
        const error = `Failed to start listening: ${err}`;
        console.error(error);
        this.errorCallbacks.forEach((callback) => callback(error));
      }
    } else {
      const error = "Only browser speech is currently supported";
      this.errorCallbacks.forEach((callback) => callback(error));
    }
  }

  /**
   * Stop listening for voice input
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    if (this.config.provider === "browser" && this.recognition) {
      try {
        this.recognition.stop();
        this.isListening = false;
        console.log("[VoiceInput] Stopped listening");
      } catch (err) {
        console.error("Failed to stop listening:", err);
      }
    }
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

    // If language changed and using browser speech, update it
    if (
      config.language &&
      this.config.provider === "browser" &&
      this.recognition
    ) {
      this.recognition.lang = this.config.language;
    }
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
    this.stopListening();
    this.callbacks.clear();
    this.errorCallbacks.clear();
    this.recognition = null;
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
