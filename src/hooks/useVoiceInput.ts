/**
 * useVoiceInput - React hook for voice input and speech recognition
 * Powered by Nirvana
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  VoiceInputService,
  getVoiceInputService,
  VoiceTranscription,
  VoiceInputConfig,
} from "../services/VoiceInputService";
import { getAIConfig } from "../../app/components/neo/AISettingsDrawer";

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const serviceRef = useRef<VoiceInputService | null>(null);

  // Initialize service from config
  useEffect(() => {
    getAIConfig().then((config) => {
      if (config.voice.enabled && config.voice.provider !== "none") {
        try {
          const voiceConfig: VoiceInputConfig = {
            provider: config.voice.provider,
            apiKey: config.voice.apiKey,
            endpoint: config.voice.endpoint,
            language: config.voice.language,
          };

          serviceRef.current = getVoiceInputService(voiceConfig);

          // Check if supported
          if (voiceConfig.provider === "browser") {
            const SpeechRecognition =
              typeof window !== "undefined"
                ? (window as any).SpeechRecognition ||
                  (window as any).webkitSpeechRecognition
                : null;
            setIsSupported(!!SpeechRecognition);
          }
        } catch (err) {
          console.error("Failed to initialize voice input:", err);
          setError(String(err));
          setIsSupported(false);
        }
      } else {
        setIsSupported(false);
      }
    });
  }, []);

  // Subscribe to transcription events
  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;

    const unsubscribe = service.onTranscription((transcription: VoiceTranscription) => {
      if (transcription.isFinal) {
        setTranscript((prev) => prev + " " + transcription.text);
        setInterimTranscript("");
      } else {
        setInterimTranscript(transcription.text);
      }
    });

    const unsubscribeError = service.onError((error: string) => {
      setError(error);
      setIsListening(false);
    });

    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, []);

  // Start listening
  const startListening = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      setError("Voice input service not initialized");
      return;
    }

    try {
      setError(null);
      setTranscript("");
      setInterimTranscript("");
      await service.startListening();
      setIsListening(true);
    } catch (err) {
      setError(String(err));
      setIsListening(false);
    }
  }, []);

  // Stop listening
  const stopListening = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;

    try {
      await service.stopListening();
      setIsListening(false);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
  };
}
