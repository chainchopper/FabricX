import React, { useEffect, useMemo } from "react";
import { useExperience } from "../../contexts/ExperienceContext";
import { useMIDIFluid } from "../../hooks/useMIDIFluid";
import ToneEngine from "../audio/ToneEngine";
import { ensureSoundfontPiano } from "../../audio/soundfontPiano";

/**
 * PianoNoteLayer — the AR Piano as a LAYER on the fluid canvas.
 *
 * Terrell's world model (Oct 27): Fabric is the world canvas and
 * instruments are layers ON a compatible canvas, not replacement
 * experiences. The renderer used to swap the fluid out for the 3D
 * branch (FabricWeb3D) whenever AR Piano was active, so the smoke —
 * the very thing piano notes are supposed to stream into — was
 * unmounted: notes played sounds over a solid backdrop and the
 * shared canvas vanished. (Field report, Hotfix 1.7.)
 *
 * This component is the piano layer's engine room, mounted by
 * ExperienceRenderer ABOVE the still-mounted WebFluidBackground
 * when ar-piano is active. It is headless on purpose: the playable
 * surface is the HUD's 2D PianoKeyboard (PR #20 — the 3D keybed
 * renders edge-on and invisible), and everything audible/visible
 * flows from the two hooks that used to be trapped inside
 * FabricWeb3D:
 *
 *   - useMIDIFluid: noteBus + hardware MIDI notes -> fluid streams
 *     (eventBus drags into the mounted LegacyFluid engine) and room
 *     broadcasts (splat streams + discrete note on/off, Hotfix 1.7).
 *   - ToneEngine -> useToneSynth: the shared synth that sounds
 *     local AND remote notes.
 *
 * Config parsing mirrors FabricWeb3D's exactly (same keys, same
 * defaults) so per-layer piano settings behave identically; the 3D
 * branch keeps its own copy for the camera path, which no longer
 * mounts for ar-piano in the shell. The standalone
 * ARPianoExperience still owns the framed 3D scene for reference.
 *
 * Powered by Nirvana
 */
export default function PianoNoteLayer() {
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;

  const isARPiano = activeExperience?.id === "ar-piano";

  const midiEnabled = useMemo(() => {
    if (!isARPiano) return false;
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    return (s?.midiEnabled as boolean | undefined) ?? true;
  }, [isARPiano, experienceConfig]);

  const midiIntensity = useMemo(() => {
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    const v = Number(s?.midiIntensity ?? 1);
    return isFinite(v) ? v : 1;
  }, [experienceConfig]);

  const midiCurve = useMemo(() => {
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    const c = (s?.midiCurve as "soft" | "linear" | "hard" | undefined) ?? "linear";
    return c;
  }, [experienceConfig]);

  const midiTranspose = useMemo(() => {
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    const v = Number(s?.midiTranspose ?? 0);
    return Math.round(v);
  }, [experienceConfig]);

  const midiHueMap = useMemo(() => {
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    const m = (s?.midiHueMap as "chromatic" | "fifths" | undefined) ?? "chromatic";
    return m;
  }, [experienceConfig]);

  const roomId = useMemo(() => {
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    return (s?.roomId as string | undefined) || "main";
  }, [experienceConfig]);

  useMIDIFluid(roomId, !!midiEnabled, midiIntensity, midiCurve, {
    transpose: midiTranspose,
    hueMap: midiHueMap,
  });

  // Slice 11: the sampled grand's packs load HERE — lazily, the
  // first time this layer opens with the Soundfont voice selected,
  // never at app start. While they load (or if they fail), the
  // synth in useToneSynth is the voice; the menu's Piano voice row
  // narrates the true state. Selecting Synth skips the download
  // entirely; flipping back to Soundfont starts it then.
  const pianoVoice = useMemo(() => {
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    return (s?.pianoVoice as string | undefined) === "synth"
      ? "synth"
      : "soundfont";
  }, [experienceConfig]);

  useEffect(() => {
    if (isARPiano && pianoVoice === "soundfont") {
      void ensureSoundfontPiano();
    }
  }, [isARPiano, pianoVoice]);

  return <ToneEngine />;
}
