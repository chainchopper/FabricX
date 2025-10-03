import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";

type Preset = "ambience" | "A4" | "C5";

export default function Ambience() {
  if (Platform.OS !== "web") return null;

  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;

  const isDefaultFluid = activeExperience?.id === "default-fluid";
  const s = (experienceConfig.specific as Record<string, unknown>) || {};
  const enabled = Boolean((s.ambienceEnabled as boolean) ?? false);
  const chosenName = String((s.ambienceFile as string) || "ambience") as Preset;

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const ensureCtx = () => {
    if (!ctxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  };

  const targetForPreset = (p: Preset) => {
    if (p === "A4") return { baseFreq: 440, type: "triangle" as OscillatorType, lfoHz: 0.2, lfoDepth: 4 };
    if (p === "C5") return { baseFreq: 523.25, type: "sine" as OscillatorType, lfoHz: 0.25, lfoDepth: 5 };
    return { baseFreq: 155, type: "sine" as OscillatorType, lfoHz: 0.12, lfoDepth: 18 };
  };

  useEffect(() => {
    if (!isDefaultFluid) return;

    const ctx = ensureCtx();
    if (!ctx) return;

    if (!gainRef.current) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(ctx.destination);
      gainRef.current = g;
    }

    const { baseFreq, type, lfoHz, lfoDepth } = targetForPreset(chosenName);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = baseFreq;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = lfoHz;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = lfoDepth;

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gainRef.current!);

    oscRef.current = osc;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;

    try { osc.start(); } catch {}
    try { lfo.start(); } catch {}

    const loop = () => {
      if (!gainRef.current) return;
      const current = gainRef.current.gain.value;
      const target = enabled ? 0.35 : 0.0;
      const next = current + (target - current) * 0.04;
      gainRef.current.gain.value = Math.max(0, Math.min(0.72, next));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    if (enabled) {
      void ctx.resume().catch(() => {});
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      try { lfo.stop(); } catch {}
      try { osc.stop(); } catch {}

      try { lfo.disconnect(); } catch {}
      try { lfoGain.disconnect(); } catch {}
      try { osc.disconnect(); } catch {}

      lfoRef.current = null;
      lfoGainRef.current = null;
      oscRef.current = null;
    };
  }, [isDefaultFluid, enabled, chosenName]);

  // Keep AudioContext alive across unmounts for user-gesture unlock persistence
  useEffect(() => {
    return () => {};
  }, []);

  return null;
}