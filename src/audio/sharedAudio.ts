import { useEffect, useState } from "react";
import * as Tone from "tone";

/**
 * sharedAudio — ONE playback AudioContext for the whole app, and the
 * gesture that wakes it (Hotfix 1.8).
 *
 * The field failure this fixes: piano notes were silent on iPhone
 * while desktop sang. The synth path was never broken — the context
 * was never unlocked. useToneSynth calls Tone.start() from a React
 * effect reacting to note state: asynchronous, after the gesture,
 * outside the call stack iOS requires. Safari only resumes an
 * AudioContext when resume() runs inside a real user-gesture handler,
 * so on iPhone the context sat "suspended" forever and every note
 * was scheduled into a stopped clock.
 *
 * The audit that came with it (fix 4c): before this module the app
 * ran up to THREE playback contexts — Tone's singleton (notes, menu
 * sounds, the auto-composer) plus a private `new AudioContext()` in
 * useAudioCues (verb/UI cues) and another in useGhostSfx (the ghost's
 * voice) — each with its own unlock fate. Now every playback voice
 * schedules onto Tone's context: the raw-WebAudio hooks obtain it
 * through getSharedAudioContext(), which returns the very same
 * AudioContext object Tone renders through (Tone.getContext().
 * rawContext), so ONE unlock covers notes, verbs, ghost, and menus.
 * (Out of scope by design: useAudioReactive's context is input-side
 * — a mic analyser behind a permission prompt, not a voice.)
 *
 * Unlock discipline: installAudioUnlock() (called once from the app
 * root) listens for gestures at the window in the CAPTURE phase and,
 * synchronously inside the gesture's own call stack, runs
 * Tone.start() + rawContext.resume() whenever the context is not
 * running. It never disarms: iOS re-suspends contexts on
 * interruptions (calls, Siri, screen lock), so every later gesture
 * is another chance to wake it. The piano keys additionally call
 * unlockAudio() inside their own pointerdown before publishing the
 * note (see PianoKeyboard), so a key press is self-unlocking even if
 * it is the session's first gesture.
 *
 * State honesty: getAudioContextState() + useAudioContextState()
 * expose the live context state so the ?diag=1 panel can print it
 * and the HUD can offer a one-tap "Sound on" chip when gestures have
 * happened but the context is somehow still suspended (e.g. a synth
 * constructed its context after the last gesture).
 *
 * The honest platform boundary: if the device's hardware mute switch
 * is on and WebAudio is routed to the ringer channel (iOS behavior
 * for web audio in some modes), NO code can make the phone ring —
 * the diag line reading "running" while notes sound locally on
 * another device is exactly how that case is identified as the
 * device channel, not the app. See the Hotfix 1.8 PR body.
 *
 * Powered by Nirvana
 */

export type SharedAudioState = "running" | "suspended" | "closed" | "none";

let fallbackCtx: AudioContext | null = null;
let trackedCtx: AudioContext | null = null;
let gestureSeen = false;
let unlockInstalled = false;
const stateListeners = new Set<() => void>();

function notifyAudioState(): void {
  stateListeners.forEach((l) => l());
}

function trackState(ctx: AudioContext): void {
  if (trackedCtx === ctx) return;
  trackedCtx = ctx;
  try {
    ctx.addEventListener("statechange", notifyAudioState);
  } catch {
    // Older engines without statechange: unlock attempts still notify.
  }
}

/**
 * The app's one playback AudioContext — Tone's. Falls back to a
 * cached window AudioContext only if Tone's context cannot be
 * obtained (defensive; not expected on web). Returns null where no
 * WebAudio exists (native — these stacks are web voices).
 * Calling this creates Tone's context if it does not exist yet,
 * which is the same moment the old per-hook code created its own.
 */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = (
      Tone.getContext() as unknown as { rawContext?: unknown }
    ).rawContext;
    if (
      raw &&
      typeof (raw as AudioContext).createOscillator === "function"
    ) {
      const ctx = raw as AudioContext;
      trackState(ctx);
      return ctx;
    }
  } catch {
    // Tone unavailable — fall through to the platform constructor.
  }
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!fallbackCtx) {
    try {
      fallbackCtx = new Ctor();
    } catch {
      return null;
    }
  }
  trackState(fallbackCtx);
  return fallbackCtx;
}

/** Live state of the shared context ("none" until it exists). */
export function getAudioContextState(): SharedAudioState {
  if (typeof window === "undefined") return "none";
  try {
    const s = Tone.getContext().state as string;
    if (s === "running" || s === "suspended" || s === "closed") return s;
  } catch {
    // fall through
  }
  const ctx = fallbackCtx;
  if (!ctx) return "none";
  return ctx.state as SharedAudioState;
}

/** True once any gesture has reached the unlock listener. */
export function audioGestureSeen(): boolean {
  return gestureSeen;
}

/**
 * Resume the shared context NOW. Must be called synchronously inside
 * a user-gesture call stack to count on iOS — Tone.start() resumes
 * Tone's context; the raw resume covers the same underlying context
 * object obtained through getSharedAudioContext().
 */
export function unlockAudio(): void {
  try {
    void Tone.start();
  } catch {
    // ignore — the raw resume below is the same context
  }
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === "suspended") {
    try {
      void ctx.resume();
    } catch {
      // ignore
    }
  }
  notifyAudioState();
}

/**
 * Install the global first-gesture unlock at the app root (web only,
 * idempotent). Capture phase, so the resume is attempted before any
 * component handler runs; every gesture re-attempts while the
 * context is not running — that is what lets a later key press wake
 * a context an interruption re-suspended.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled) return;
  if (typeof window === "undefined") return;
  unlockInstalled = true;
  const onGesture = () => {
    gestureSeen = true;
    if (getAudioContextState() !== "running") {
      unlockAudio();
    } else {
      notifyAudioState();
    }
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("touchend", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
}

/** Subscribe to shared-context state changes (diag panel, HUD chip). */
export function subscribeAudioState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** React view of the shared context state, kept live by statechange. */
export function useAudioContextState(): SharedAudioState {
  const [state, setState] = useState<SharedAudioState>(() =>
    getAudioContextState()
  );
  useEffect(() => {
    setState(getAudioContextState());
    return subscribeAudioState(() => setState(getAudioContextState()));
  }, []);
  return state;
}
