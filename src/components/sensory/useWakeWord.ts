/**
 * useWakeWord — Slice 58: the natural listener's lifecycle.
 *
 * The DECISIONS live in the pure machine (src/sensory/
 * wakeWord.ts): idle until the ghostie's name, then attending
 * — every spoken final is an ask, routed into the SAME ask
 * path the tap uses (ComposeBar's submit, unchanged). This
 * hook owns only the platform: a continuous speech-recognition
 * session feeding finals to the machine.
 *
 * There is no conversation here and nothing to look at
 * (Terrell's correction, Nov 3): the ghostie makes no words,
 * no window opens, and no chrome anywhere shows a listening
 * state. The signal that the mic is hot is the ghostie
 * ITSELF: this hook reports the listener's transitions on
 * FABRIC_VOICE_ATTENTION_EVENT, and the canvas's ghost
 * answers in-world (GhostPeer.expressAttention — a soft halo
 * while it listens for its name; a perk and a glow when the
 * name lands). Interim text is plumbing: it is never shown,
 * never submitted, never stored.
 *
 * Platform truth, built into the behavior rather than
 * promised away:
 * - The recognizer is the platform's (SpeechRecognition /
 *   webkitSpeechRecognition). Where it does not exist
 *   (Firefox), the loop reports "unsupported" and tap-to-talk
 *   remains the door — listening is never faked.
 * - Continuous sessions END on their own (silence timeouts,
 *   engine rotations). The loop restarts itself on end while
 *   armed — that restart loop, not any single session, is
 *   the listener.
 * - A start can be refused before any user interaction
 *   (iOS Safari's gesture rule) or by a real denial. Both
 *   land in "blocked": the loop stops instead of spinning,
 *   and a tap (a real gesture, from the compose bar's mic
 *   button via restart()) starts it again. A refusal is only
 *   written to the grant memory when the platform reports
 *   user activation — a gesture-starved refusal is not a
 *   refusal (the micStream law).
 *
 * Privacy: passive finals that carry no name are discarded
 * by the machine and never submitted, stored, or sent.
 *
 * Powered by Nirvana
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { speechRecognitionCtor } from "../../services/voiceCapture";
import { FABRIC_VOICE_ATTENTION_EVENT } from "../../ghost/ghostStore";
import {
  createWakeWordMachine,
  type WakeWordMachine,
} from "../../sensory/wakeWord";
import { noteRecognitionOutcome } from "../../sensors/micStream";

export type WakeLoopState =
  /** Mode is tap, or no name to listen for yet: loop off. */
  | "off"
  /** Listening for the name; finals without it are discarded. */
  | "idle"
  /** The name landed: the ghostie attends; finals are asks. */
  | "attending"
  /** A start was refused: stopped until a gesture restarts it. */
  | "blocked"
  /** This browser has no speech recognizer to listen with. */
  | "unsupported";

export interface WakeWord {
  state: WakeLoopState;
  /** True exactly while a recognition session is live. */
  micHot: boolean;
  /** Re-arm after a blocked start (call from a user gesture). */
  restart: () => void;
}

const RESTART_BACKOFF_MS = 300;

/** Tell the canvas the listener's state changed; its ghost shows it. */
function announceAttention(listening: boolean, attending: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(FABRIC_VOICE_ATTENTION_EVENT, {
        detail: { listening, attending },
      })
    );
  } catch {
    // No event bus: the listener still hears; nobody to show it.
  }
}

export function useWakeWord(opts: {
  enabled: boolean;
  phrase: string | null;
  /** The tap path is live: the natural listener yields the mic. */
  suspended: boolean;
  onAsk: (text: string, confidence?: number | null) => void;
}): WakeWord {
  const [state, setState] = useState<WakeLoopState>("off");
  const [micHot, setMicHot] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const onAskRef = useRef(opts.onAsk);
  onAskRef.current = opts.onAsk;

  const machineRef = useRef<WakeWordMachine | null>(null);
  if (!machineRef.current) {
    machineRef.current = createWakeWordMachine({
      phrase: opts.phrase ?? "",
    });
  }
  useEffect(() => {
    if (opts.phrase) machineRef.current?.setPhrase(opts.phrase);
  }, [opts.phrase]);

  const restart = useCallback(() => setEpoch((e) => e + 1), []);

  const { enabled, phrase, suspended } = opts;

  useEffect(() => {
    if (!enabled || !phrase) {
      setState("off");
      setMicHot(false);
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      setState("unsupported");
      setMicHot(false);
      return;
    }
    if (suspended) {
      // The tap path owns the mic right now; the machine
      // keeps its attention and the loop resumes after.
      setMicHot(false);
      return;
    }

    const machine = machineRef.current!;
    let stopped = false;
    let blocked = false;
    let recog: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let notedGrant = false;
    let announcedLive = false;
    let lastAttending = machine.state() === "attending";

    setState(lastAttending ? "attending" : "idle");

    const noteGrantedOnce = () => {
      if (notedGrant) return;
      notedGrant = true;
      noteRecognitionOutcome("granted");
    };

    const syncAttention = () => {
      const attending = machine.state() === "attending";
      if (attending !== lastAttending) {
        lastAttending = attending;
        setState(attending ? "attending" : "idle");
        announceAttention(true, attending);
      }
    };

    const start = () => {
      if (stopped || blocked) return;
      try {
        recog = new Ctor();
      } catch {
        setState("unsupported");
        return;
      }
      recog.continuous = true;
      recog.interimResults = true;
      recog.maxAlternatives = 1;
      recog.lang =
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "en-US";

      recog.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result?.isFinal) continue; // interim = plumbing
          const text = (result?.[0]?.transcript ?? "").trim();
          if (!text) continue;
          noteGrantedOnce();
          const c = result?.[0]?.confidence;
          const confidence =
            typeof c === "number" && Number.isFinite(c) && c > 0
              ? Math.min(1, c)
              : null;
          const ev = machine.hearFinal(text);
          if (ev.type === "wake") {
            syncAttention();
            if (ev.command) onAskRef.current(ev.command, confidence);
          } else if (ev.type === "utterance") {
            onAskRef.current(ev.text, confidence);
          } else if (ev.type === "attend") {
            syncAttention();
          }
          // "ignore": heard by the platform, discarded here.
        }
      };

      recog.onerror = (event: any) => {
        const err = event?.error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          blocked = true;
          setState("blocked");
          setMicHot(false);
          // Only an activated refusal is a refusal (the
          // micStream law): a start refused before any user
          // interaction is the platform's gesture rule, and
          // the grant memory must not learn it as a denial.
          const activation = (
            globalThis as {
              navigator?: { userActivation?: { hasBeenActive?: boolean } };
            }
          ).navigator?.userActivation;
          if (!activation || activation.hasBeenActive !== false) {
            noteRecognitionOutcome("denied");
          }
        }
        // Every other error (no-speech, network, aborted)
        // ends the session; onend's restart is the recovery.
      };

      recog.onend = () => {
        setMicHot(false);
        if (stopped || blocked) return;
        restartTimer = setTimeout(start, RESTART_BACKOFF_MS);
      };

      try {
        recog.start();
        setMicHot(true);
        if (!announcedLive) {
          announcedLive = true;
          // The session is genuinely live: the ghostie shows
          // it — halo for listening, perk + glow if attention
          // was already held when the loop resumed.
          announceAttention(true, lastAttending);
        }
      } catch {
        // A start that throws synchronously (a session already
        // live somewhere) retries on the same backoff as an end.
        if (!stopped && !blocked) {
          restartTimer = setTimeout(start, RESTART_BACKOFF_MS);
        }
      }
    };

    start();

    // Attention relaxing in silence is a state the ghostie
    // shows (its glow settles): poll the machine's clock on a
    // slow beat. Plumbing only — nothing renders from this.
    const tickTimer = setInterval(() => {
      if (machine.tick()) syncAttention();
    }, 400);

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      clearInterval(tickTimer);
      if (recog) {
        try {
          recog.abort();
        } catch {
          // Already ended.
        }
        recog = null;
      }
      setMicHot(false);
      announceAttention(false, false);
    };
  }, [enabled, phrase, suspended, epoch]);

  return { state, micHot, restart };
}
