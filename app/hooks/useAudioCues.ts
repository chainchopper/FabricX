import { useCallback, useRef } from "react";
import { usePreferences } from "../context/PreferencesContext";
import { getSharedAudioContext } from "../../src/audio/sharedAudio";

type WaveType = OscillatorType;

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return (w.AudioContext || w.webkitAudioContext) ?? null;
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  durationMs: number,
  type: WaveType = "sine",
  gainValue = 0.03
) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainValue, now + 0.005);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.01);
}

export function useAudioCues() {
  const { audioEnabled } = usePreferences();
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (!audioEnabled) return null;
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") {
        void ctxRef.current.resume();
      }
      return ctxRef.current;
    }
    // Hotfix 1.8: schedule onto the ONE shared context (Tone's — see
    // src/audio/sharedAudio) so the root gesture unlock covers verb
    // and UI cues too. Previously this hook constructed a private
    // AudioContext with its own unlock fate. The platform-constructor
    // fallback stays for a world where Tone cannot provide one.
    ctxRef.current = getSharedAudioContext();
    if (!ctxRef.current) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return null;
      try {
        ctxRef.current = new Ctor();
      } catch {
        return null;
      }
    }
    return ctxRef.current;
  }, [audioEnabled]);

  const click = useCallback(() => {
    if (!audioEnabled) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 440, 60, "triangle", 0.025);
  }, [ensureCtx, audioEnabled]);

  const pulse = useCallback(() => {
    if (!audioEnabled) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 220, 70, "sine", 0.03);
    setTimeout(() => scheduleTone(ctx, 180, 70, "sine", 0.03), 80);
  }, [ensureCtx, audioEnabled]);

  const success = useCallback(() => {
    if (!audioEnabled) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 660, 70, "sine", 0.03);
    setTimeout(() => scheduleTone(ctx, 880, 80, "sine", 0.03), 70);
  }, [ensureCtx, audioEnabled]);

  const warning = useCallback(() => {
    if (!audioEnabled) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 520, 120, "square", 0.03);
  }, [ensureCtx, audioEnabled]);

  const error = useCallback(() => {
    if (!audioEnabled) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 220, 140, "sawtooth", 0.03);
  }, [ensureCtx, audioEnabled]);

  return { click, pulse, success, warning, error };
}