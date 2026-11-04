/**
 * useComposeVoice — the ONE compose-voice entry (Slice 17's
 * voice-first input, rebuilt by Hotfix 2.5).
 *
 * Why the rebuild: every path used to ride the Web Speech API.
 * Firefox does not implement SpeechRecognition — the constructor
 * is null — so on Firefox the mic button could NEVER trigger the
 * browser's microphone permission prompt; pressing it only ever
 * produced an explanatory caption. A mic that never asks is a
 * mic that does not exist, whatever the caption says.
 *
 * The chain now, in the order the product promises:
 * 1. A voice service the user explicitly enabled in AI Services,
 *    reached through VoiceInputService — now an adapter over the
 *    shared capture core (voiceCapture), so its whisper/custom
 *    providers really capture + transcribe instead of stubbing.
 * 2. The platform speech recognizer where it exists
 *    (SpeechRecognition / webkitSpeechRecognition — Chrome, Edge,
 *    Safari). Fast path, interim previews, unchanged Slice 17
 *    semantics: a FINAL transcript enters the exact same submit
 *    path as typed text.
 * 3. Universal capture everywhere else:
 *    getUserMedia({ audio: true }) + MediaRecorder — the call
 *    that makes EVERY modern browser ask for the microphone,
 *    Firefox included. The recording (capped ~15s) is transcribed
 *    through the core's seam: a registered on-device transcriber
 *    (Slice 27's plug point) first, else the resolved cloud
 *    endpoint (the user's saved model or Fanalogy's built-in
 *    cloud, via resolveLLMConfig; Meta's endpoint transcribes
 *    with muse-voice-transcribe-1.0).
 * 4. If nothing can transcribe, the mic STILL captures — and the
 *    state says so plainly, pointing at AI Services / the
 *    on-device brain. Never a silent no-op again.
 *
 * Every state is visible through the returned state: listening
 * (the bar pulses the mic + shows "Listening…"), busy (a capture
 * is being transcribed), interim (live preview, recognizer path),
 * message (an in-world caption for denial / no-device /
 * no-brain / failure — never a swallowed console error). When
 * the browser refuses the mic, the canvas is told
 * (FABRIC_VOICE_UNHEARD_EVENT) and its ghost answers with the
 * ear-tilt puzzlement, like any moment it can't help with.
 *
 * Privacy: audio is captured only while listening is toggled
 * on; blobs live in memory, are transcribed, and are dropped —
 * never stored, and sent nowhere except the configured
 * transcription endpoint.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "../../../app/utils/storage";
import {
  getVoiceInputService,
  VOICE_MIC_DENIED_MESSAGE,
  type VoiceInputConfig,
} from "../../services/VoiceInputService";
import {
  speechRecognitionCtor,
  startMediaCapture,
  startSpeechRecognition,
  transcribeBlob,
  transcriptionTargetFromLLM,
  VoiceCaptureError,
  type MediaCaptureSession,
  type SpeechSession,
  type TranscriptionTarget,
} from "../../services/voiceCapture";
import { resolveLLMConfig } from "../../ai/PatternComposer";
import { FABRIC_VOICE_UNHEARD_EVENT } from "../../ghost/ghostStore";
import { noteRecognitionOutcome } from "../../sensors/micStream";

interface AIConfigShape {
  voice?: {
    provider: "browser" | "whisper" | "custom" | "none";
    apiKey?: string;
    endpoint: string;
    enabled: boolean;
    language: string;
  };
}

export interface ComposeVoice {
  /** The microphone is live (recognizer running or recorder capturing). */
  listening: boolean;
  /** A finished capture is being transcribed. */
  busy: boolean;
  /** Live preview text (recognizer path only). Preview, never submitted. */
  interim: string;
  /** In-world caption for the states words can't fix. */
  message: string | null;
  toggle: () => void;
}

const CAPTION_DENIED =
  "The fabric can't hear you — the browser said no to the mic.";
const CAPTION_NO_DEVICE = "No microphone found on this device — typing works.";
const CAPTION_UNSUPPORTED =
  "This browser can't capture voice — typing works.";
const CAPTION_NO_BRAIN =
  "The fabric heard you — but turning voice into words needs a transcription brain. Add one in AI Services, or use the on-device brain when it lands.";
const CAPTION_TRANSCRIBE_FAILED =
  "The transcription service couldn't take that — typing works.";
const CAPTION_NO_SPEECH = "Didn't catch that — typing works.";
const CAPTION_SERVICE_FAILED =
  "Your configured voice service couldn't start — typing works.";

/** Tell the canvas the mic was refused; its ghost does the rest. */
function announceUnheard(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(FABRIC_VOICE_UNHEARD_EVENT));
  } catch {
    // No window event bus: the caption carries the moment alone.
  }
}

export function useComposeVoice(
  onFinal: (text: string, confidence?: number | null) => void
): ComposeVoice {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const speechRef = useRef<SpeechSession | null>(null);
  const captureRef = useRef<MediaCaptureSession | null>(null);
  const captureTargetRef = useRef<TranscriptionTarget | null>(null);
  const captureStartingRef = useRef(false);
  const captureStoppingRef = useRef(false);
  const captureCancelledRef = useRef(false);
  const captureFinishedRef = useRef(false);
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
    // A stop that lands while the permission prompt is still up
    // must cancel the capture when it finally starts.
    if (captureStartingRef.current) captureCancelledRef.current = true;
    if (speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
    }
    if (captureRef.current) {
      captureRef.current.cancel();
      captureRef.current = null;
    }
    captureTargetRef.current = null;
    if (serviceCleanupRef.current) {
      serviceCleanupRef.current();
      serviceCleanupRef.current = null;
    }
    serviceActiveRef.current = false;
    setListening(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    void loadConfig();
    return () => {
      if (speechRef.current) {
        speechRef.current.abort();
        speechRef.current = null;
      }
      if (captureRef.current) {
        captureRef.current.cancel();
        captureRef.current = null;
      }
      if (serviceCleanupRef.current) {
        serviceCleanupRef.current();
        serviceCleanupRef.current = null;
      }
    };
  }, [loadConfig]);

  // -- Path 2: platform recognizer ------------------------------------

  const startDirect = useCallback((language: string): boolean => {
    if (!speechRecognitionCtor()) return false;
    // Slice 58: the recognizer's outcome feeds the Slice 50
    // grant memory. This path never calls getUserMedia, so
    // before this the memory never learned the microphone's
    // state on the app's most common voice path — and nothing
    // could honor a persistence the memory didn't have. A
    // session that hears anything proves the grant; a denial
    // proves the refusal. Once per session is enough.
    let notedGrant = false;
    const noteGrantedOnce = () => {
      if (notedGrant) return;
      notedGrant = true;
      noteRecognitionOutcome("granted");
    };
    const session = startSpeechRecognition(language, {
      onInterim: (text) => {
        noteGrantedOnce();
        setInterim(text);
      },
      onFinal: (text, confidence) => {
        noteGrantedOnce();
        setInterim("");
        setListening(false);
        speechRef.current = null;
        // Slice 33: the recognizer's confidence rides along when
        // it reported one (unscored = null, never zero) — the
        // canvas hands it to the ghost's utterance sense, where
        // a low score biases toward honest uncertainty. The
        // capture/transcription paths report no score; their
        // finals enter unscored, like typed text.
        onFinalRef.current(text, confidence ?? null);
      },
      onError: (code) => {
        speechRef.current = null;
        setListening(false);
        if (code === "denied") {
          noteRecognitionOutcome("denied");
          setMessage(CAPTION_DENIED);
          announceUnheard();
        } else if (code === "no-speech") {
          setMessage(CAPTION_NO_SPEECH);
        } else {
          setMessage("Voice stopped — typing works.");
        }
      },
      onEnd: () => {
        if (speechRef.current === session) speechRef.current = null;
        setListening(false);
      },
    });
    if (!session) return false;
    speechRef.current = session;
    setListening(true);
    return true;
  }, []);

  // -- Path 3: universal capture + transcription seam -----------------

  const finishCapture = useCallback(async (blob: Blob | null) => {
    if (captureFinishedRef.current) return;
    captureFinishedRef.current = true;
    captureStoppingRef.current = false;
    captureRef.current = null;
    setListening(false);
    const target = captureTargetRef.current;
    captureTargetRef.current = null;
    if (!blob || blob.size === 0) {
      setMessage(CAPTION_NO_SPEECH);
      return;
    }
    setBusy(true);
    // The blob is transcribed here and dropped — never stored.
    const outcome = await transcribeBlob(blob, target);
    setBusy(false);
    if (outcome.ok) {
      onFinalRef.current(outcome.text);
    } else if (outcome.reason === "unsupported") {
      setMessage(CAPTION_NO_BRAIN);
    } else if (outcome.reason === "empty") {
      setMessage(CAPTION_NO_SPEECH);
    } else {
      setMessage(CAPTION_TRANSCRIBE_FAILED);
    }
  }, []);

  const startCapture = useCallback(async (): Promise<void> => {
    if (captureStartingRef.current || captureRef.current) return;
    captureStartingRef.current = true;
    captureFinishedRef.current = false;
    setListening(true);
    try {
      // Resolve the transcription brain while the browser asks
      // for the mic — the ask itself never waits on config.
      const resolutionPromise = resolveLLMConfig().catch(() => null);
      const session = await startMediaCapture({
        onAutoStop: (blob) => {
          void finishCapture(blob);
        },
      });
      if (captureCancelledRef.current) {
        // Stopped while the browser was still asking: never go live.
        captureCancelledRef.current = false;
        session.cancel();
        setListening(false);
        return;
      }
      captureRef.current = session;
      const resolution = await resolutionPromise;
      captureTargetRef.current = transcriptionTargetFromLLM(
        resolution?.config ?? null
      );
    } catch (err) {
      setListening(false);
      if (err instanceof VoiceCaptureError) {
        if (err.code === "denied") {
          setMessage(CAPTION_DENIED);
          announceUnheard();
        } else if (err.code === "no-device") {
          setMessage(CAPTION_NO_DEVICE);
        } else if (err.code === "unsupported") {
          setMessage(CAPTION_UNSUPPORTED);
        } else {
          setMessage("The mic couldn't start — typing works.");
        }
      } else {
        setMessage("The mic couldn't start — typing works.");
      }
    } finally {
      captureStartingRef.current = false;
      captureCancelledRef.current = false;
    }
  }, [finishCapture]);

  // -- Path 1: AI Services provider (via the adapter) -----------------

  const startConfigured = useCallback(
    async (config: VoiceInputConfig): Promise<void> => {
      const service = getVoiceInputService(config);
      service.updateConfig(config);
      let handledFinal = false;
      // Slice 58: same grant-memory feed for the configured
      // provider path (its browser provider rides the same
      // recognizer; its truth belongs in the same memory).
      let notedGrant = false;
      const offTranscription = service.onTranscription((t) => {
        if (!notedGrant) {
          notedGrant = true;
          noteRecognitionOutcome("granted");
        }
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
      const offError = service.onError((serviceMessage) => {
        if (handledFinal) return;
        setListening(false);
        serviceActiveRef.current = false;
        if (serviceMessage === VOICE_MIC_DENIED_MESSAGE) {
          noteRecognitionOutcome("denied");
          setMessage(CAPTION_DENIED);
          announceUnheard();
        } else {
          setMessage(CAPTION_SERVICE_FAILED);
        }
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
      // VoiceInputService reports start failures through its error
      // callback without throwing; the callback above owns the
      // caption in that case.
    },
    []
  );

  const toggle = useCallback(() => {
    if (captureStoppingRef.current) return;
    if (listening) {
      // Stopping a capture finishes it (transcribe what was
      // heard); stopping anything else just stops.
      if (captureRef.current) {
        captureStoppingRef.current = true;
        const session = captureRef.current;
        void session.stop().then((blob) => finishCapture(blob));
        return;
      }
      stop();
      return;
    }
    if (busy || captureStartingRef.current) return;
    setMessage(null);
    setInterim("");
    void (async () => {
      try {
        const config = await loadConfig();
        if (config && config.provider !== "browser") {
          await startConfigured(config);
          return;
        }
        const language =
          config?.language ??
          (typeof navigator !== "undefined" && navigator.language
            ? navigator.language
            : "en-US");
        if (!startDirect(language)) {
          // No platform recognizer (Firefox): capture universally.
          await startCapture();
        }
      } catch {
        setListening(false);
        setMessage(CAPTION_SERVICE_FAILED);
      }
    })();
  }, [listening, busy, loadConfig, startConfigured, startDirect, startCapture, stop, finishCapture]);

  return { listening, busy, interim, message, toggle };
}
