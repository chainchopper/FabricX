/**
 * useComposeVoice — Slice 17's voice-first compose input.
 *
 * Capture chain, in the order the product promises:
 * 1. A voice service the user explicitly enabled in AI Services.
 *    It is reached through the existing VoiceInputService. Providers
 *    that service cannot actually run fail honestly into a caption;
 *    they are never silently replaced.
 * 2. Otherwise, the platform speech recognizer
 *    (SpeechRecognition / webkitSpeechRecognition). Recognition is
 *    local to the browser engine and its permission flow.
 * 3. If neither exists, pressing the mic explains that plainly and
 *    typing remains the working alternative.
 *
 * A FINAL transcript is handed to the same submit path typed text
 * uses. Interim text is only a preview. Nothing is recorded by this
 * hook, and no transcript is sent anywhere by the capture layer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "../../../app/utils/storage";
import {
  getVoiceInputService,
  type VoiceInputConfig,
} from "../../services/VoiceInputService";

interface AIConfigShape {
  voice?: {
    provider: "browser" | "whisper" | "custom" | "none";
    "apiKey"?: string;
    endpoint: string;
    enabled: boolean;
    language: string;
  };
}

type RecognitionCtor = new () => any;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as RecognitionCtor) ||
    (w.webkitSpeechRecognition as RecognitionCtor) ||
    null;
}

export interface ComposeVoice {
  listening: boolean;
  interim: string;
  message: string | null;
  toggle: () => void;
}

export function useComposeVoice(
  onFinal: (text: string) => void
): ComposeVoice {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const recognitionRef = useRef<any>(null);
  const serviceCleanupRef = useRef<(() => void) | null>(null);
  const serviceActiveRef = useRef(false);
  const configPromiseRef = useRef<Promise<VoiceInputConfig | null> | null>(
    null
  );

  const loadConfig = useCallback((): Promise<VoiceInputConfig | null> => {
    if (!configPromiseRef.current) {
      configPromiseRef.current = (async () => {
        try {
          const cfg = await getJSON<AIConfigShape | null>(
            "fabric_ai_config_v1",
            null
          );
          const voice = cfg?.voice;
          if (!voice || !voice.enabled || voice.provider === "none") {
            return null;
          }
          const { enabled: _enabled, ...serviceConfig } = voice;
          if (!serviceConfig.language) serviceConfig.language = "en-US";
          return serviceConfig satisfies VoiceInputConfig;
        } catch {
          return null;
        }
      })();
    }
    return configPromiseRef.current;
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Already ended.
      }
      recognitionRef.current = null;
    }
    if (serviceCleanupRef.current) {
      serviceCleanupRef.current();
      serviceCleanupRef.current = null;
    }
    serviceActiveRef.current = false;
    setListening(false);
  }, []);

  useEffect(() => {
    void loadConfig();
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Nothing to abort.
        }
        recognitionRef.current = null;
      }
      if (serviceCleanupRef.current) {
        serviceCleanupRef.current();
        serviceCleanupRef.current = null;
      }
    };
  }, [loadConfig]);

  const startDirect = useCallback(
    (language: string): boolean => {
      const Ctor = recognitionCtor();
      if (!Ctor) return false;
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = language;
      let handledFinal = false;

      recognition.onresult = (event: any) => {
        let finalText = "";
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result?.[0]?.transcript ?? "";
          if (result?.isFinal) finalText += text;
          else interimText += text;
        }
        if (finalText.trim()) {
          handledFinal = true;
          setInterim("");
          setListening(false);
          recognitionRef.current = null;
          try {
            recognition.stop();
          } catch {
            // The engine may already have ended the session.
          }
          onFinalRef.current(finalText.trim());
        } else if (interimText) {
          setInterim(interimText);
        }
      };
      recognition.onerror = (event: any) => {
        recognitionRef.current = null;
        setListening(false);
        if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
          setMessage("Mic permission was blocked — typing works.");
        } else if (event?.error === "no-speech") {
          setMessage("Didn't catch that — typing works.");
        } else if (event?.error !== "aborted") {
          setMessage("Voice stopped — typing works.");
        }
      };
      recognition.onend = () => {
        if (!handledFinal) setListening(false);
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
      };
      try {
        recognition.start();
        setListening(true);
        return true;
      } catch {
        recognitionRef.current = null;
        return false;
      }
    },
    []
  );

  const startConfigured = useCallback(
    async (config: VoiceInputConfig): Promise<void> => {
      // A configured browser service IS the platform recognizer,
      // with the user's chosen language.
      if (config.provider === "browser") {
        if (!startDirect(config.language)) {
          setMessage("Voice isn't available on this browser — typing works.");
        }
        return;
      }
      const service = getVoiceInputService(config);
      service.updateConfig(config);
      let handledFinal = false;
      const offTranscription = service.onTranscription((t) => {
        if (!t.isFinal) {
          setInterim(t.text);
          return;
        }
        if (handledFinal) return;
        handledFinal = true;
        setInterim("");
        setListening(false);
        serviceActiveRef.current = false;
        void service.stopListening().catch(() => undefined);
        if (serviceCleanupRef.current) {
          serviceCleanupRef.current();
          serviceCleanupRef.current = null;
        }
        if (t.text.trim()) onFinalRef.current(t.text.trim());
      });
      const offError = service.onError(() => {
        if (handledFinal) return;
        setListening(false);
        serviceActiveRef.current = false;
        setMessage(
          "Your configured voice service couldn't start — typing works."
        );
      });
      serviceCleanupRef.current = () => {
        offTranscription();
        offError();
        if (serviceActiveRef.current) {
          void service.stopListening().catch(() => undefined);
        }
      };
      serviceActiveRef.current = true;
      setListening(true);
      await service.startListening();
      // VoiceInputService reports some unsupported-provider failures
      // through its error callback without throwing; the callback
      // above owns the caption in that case.
    },
    [startDirect]
  );

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    setMessage(null);
    setInterim("");
    void (async () => {
      const config = await loadConfig();
      if (config) {
        await startConfigured(config);
        return;
      }
      const language =
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "en-US";
      if (!startDirect(language)) {
        setMessage("Voice isn't available on this browser — typing works.");
      }
    })();
  }, [listening, loadConfig, startConfigured, startDirect, stop]);

  return { listening, interim, message, toggle };
}
