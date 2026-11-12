import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { usePreferences } from "../../../app/context/PreferencesContext";
import { getSharedAudioContext } from "../../audio/sharedAudio";

type Preset = "ambience" | "A4" | "C5";

// Slice J (audibles): the drone's target gain, levelled into
// the verb-cue band (0.025–0.03) so it sits under the piano
// and beside the ghost (MASTER_GAIN 0.024 in useGhostSfx) —
// not 15x above it, as the old 0.35 target was. The rAF loop
// clamps to this same value; the drone can never exceed it.
const DRONE_TARGET_GAIN = 0.03;

export default function Ambience() {
  if (Platform.OS !== "web") return null;

  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { audioEnabled } = usePreferences();

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
      // Slice J: schedule onto the ONE shared context (Tone's —
      // see src/audio/sharedAudio, the Hotfix 1.8 pattern), so
      // the root gesture unlock covers the drone too. The
      // private `new AudioContext()` this file used to build is
      // gone: on iOS a context resumed outside a gesture stays
      // suspended, and the root unlock listener resumes only
      // Tone's context — the drone likely never sounded on
      // Terrell's iPhone at all.
      ctxRef.current = getSharedAudioContext();
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
      // Slice J: Audio off ramps the gain to 0 exactly the way
      // ambienceEnabled off does — the master switch means
      // silence. The target is the leveled drone gain, never
      // the old 0.35.
      const target = enabled && audioEnabled ? DRONE_TARGET_GAIN : 0.0;
      const next = current + (target - current) * 0.04;
      gainRef.current.gain.value = Math.max(0, Math.min(DRONE_TARGET_GAIN, next));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    if (enabled && audioEnabled) {
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
  }, [isDefaultFluid, enabled, chosenName, audioEnabled]);

  // Keep AudioContext alive across unmounts for user-gesture unlock persistence
  useEffect(() => {
    return () => {};
  }, []);

  return null;
}