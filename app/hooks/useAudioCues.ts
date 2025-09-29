import { useCallback, useRef } from "react";

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
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    ctxRef.current = new Ctor();
    return ctxRef.current;
  }, []);

  const click = useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 440, 60, "triangle", 0.025);
  }, [ensureCtx]);

  const pulse = useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 220, 70, "sine", 0.03);
    setTimeout(() => scheduleTone(ctx, 180, 70, "sine", 0.03), 80);
  }, [ensureCtx]);

  const success = useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 660, 70, "sine", 0.03);
    setTimeout(() => scheduleTone(ctx, 880, 80, "sine", 0.03), 70);
  }, [ensureCtx]);

  const warning = useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 520, 120, "square", 0.03);
  }, [ensureCtx]);

  const error = useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    scheduleTone(ctx, 220, 140, "sawtooth", 0.03);
  }, [ensureCtx]);

  return { click, pulse, success, warning, error };
}