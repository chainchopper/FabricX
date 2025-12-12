/**
 * useMenuSounds - Video game style menu sound effects
 * Powered by Nirvana
 */
import { useEffect, useRef } from "react";
import * as Tone from "tone";

export interface MenuSounds {
  playHover: () => void;
  playSelect: () => void;
  playOpen: () => void;
  playClose: () => void;
  playSwitch: () => void;
  playError: () => void;
  playSuccess: () => void;
  playNotification: () => void;
}

export function useMenuSounds(enabled: boolean = true): MenuSounds {
  const synthRef = useRef<Tone.Synth | null>(null);
  const fmSynthRef = useRef<Tone.FMSynth | null>(null);
  const noiseRef = useRef<Tone.NoiseSynth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Initialize audio context
    const initAudio = async () => {
      await Tone.start();

      // Create reverb for spatial feel
      reverbRef.current = new Tone.Reverb({
        decay: 1.2,
        wet: 0.3,
      }).toDestination();

      // Simple synth for quick sounds
      synthRef.current = new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: {
          attack: 0.005,
          decay: 0.1,
          sustain: 0.1,
          release: 0.1,
        },
      }).connect(reverbRef.current);

      // FM synth for complex sounds
      fmSynthRef.current = new Tone.FMSynth({
        harmonicity: 3,
        modulationIndex: 10,
        envelope: {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.1,
          release: 0.3,
        },
      }).connect(reverbRef.current);

      // Noise for percussive sounds
      noiseRef.current = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: {
          attack: 0.005,
          decay: 0.05,
          sustain: 0,
          release: 0.05,
        },
      }).connect(reverbRef.current);
    };

    initAudio();

    return () => {
      synthRef.current?.dispose();
      fmSynthRef.current?.dispose();
      noiseRef.current?.dispose();
      reverbRef.current?.dispose();
    };
  }, [enabled]);

  const playHover = () => {
    if (!enabled || !synthRef.current) return;
    synthRef.current.triggerAttackRelease("C5", "32n", undefined, 0.1);
  };

  const playSelect = () => {
    if (!enabled || !fmSynthRef.current) return;
    fmSynthRef.current.triggerAttackRelease("C4", "16n", undefined, 0.3);
  };

  const playOpen = () => {
    if (!enabled || !fmSynthRef.current) return;
    // Ascending chord for opening
    const now = Tone.now();
    fmSynthRef.current.triggerAttackRelease("C4", "8n", now, 0.3);
    fmSynthRef.current.triggerAttackRelease("E4", "8n", now + 0.05, 0.3);
    fmSynthRef.current.triggerAttackRelease("G4", "8n", now + 0.1, 0.3);
  };

  const playClose = () => {
    if (!enabled || !fmSynthRef.current) return;
    // Descending chord for closing
    const now = Tone.now();
    fmSynthRef.current.triggerAttackRelease("G4", "8n", now, 0.25);
    fmSynthRef.current.triggerAttackRelease("E4", "8n", now + 0.05, 0.25);
    fmSynthRef.current.triggerAttackRelease("C4", "8n", now + 0.1, 0.25);
  };

  const playSwitch = () => {
    if (!enabled || !synthRef.current || !noiseRef.current) return;
    const now = Tone.now();
    synthRef.current.triggerAttackRelease("G4", "16n", now, 0.2);
    noiseRef.current.triggerAttackRelease("16n", now);
  };

  const playError = () => {
    if (!enabled || !synthRef.current) return;
    const now = Tone.now();
    synthRef.current.triggerAttackRelease("F3", "32n", now, 0.4);
    synthRef.current.triggerAttackRelease("D3", "32n", now + 0.1, 0.4);
  };

  const playSuccess = () => {
    if (!enabled || !fmSynthRef.current) return;
    const now = Tone.now();
    fmSynthRef.current.triggerAttackRelease("C5", "16n", now, 0.4);
    fmSynthRef.current.triggerAttackRelease("E5", "16n", now + 0.08, 0.4);
    fmSynthRef.current.triggerAttackRelease("G5", "8n", now + 0.16, 0.5);
  };

  const playNotification = () => {
    if (!enabled || !synthRef.current) return;
    const now = Tone.now();
    synthRef.current.triggerAttackRelease("G5", "32n", now, 0.3);
    synthRef.current.triggerAttackRelease("C6", "32n", now + 0.05, 0.3);
  };

  return {
    playHover,
    playSelect,
    playOpen,
    playClose,
    playSwitch,
    playError,
    playSuccess,
    playNotification,
  };
}
