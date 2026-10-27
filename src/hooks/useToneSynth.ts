import { useEffect, useMemo, useRef } from "react";
import * as Tone from "tone";
import { useMIDI, type NoteName } from "./useMIDI";
import { useVirtualNotes } from "./useVirtualNotes";
import { usePreferences } from "../../app/context/PreferencesContext";
import { useExperience } from "../contexts/ExperienceContext";

// Map 0..1 to dB curve
function volumeToDb(v: number) {
  // soft curve: -36dB (quiet) to 0dB (full)
  const clamped = Math.max(0, Math.min(1, v));
  return -36 + clamped * 36;
}

export function useToneSynth(enabled: boolean) {
  const { activeNotes: hardwareNotes } = useMIDI();
  // On-screen notes arrive over the noteBus (see useVirtualNotes) and
  // merge with hardware notes, so the 2D keyboard and 3D PianoScene
  // sound through this one synth — previously they were inaudible
  // here: PianoScene ran a private synth and nothing else heard them.
  const virtual = useVirtualNotes();
  const activeNotes = useMemo(
    () => Array.from(new Set<NoteName>([...hardwareNotes, ...(virtual.activeNotes as NoteName[])])),
    [hardwareNotes, virtual.activeNotes]
  );
  const { audioEnabled } = usePreferences();
  const { state } = useExperience();
  const vol = Number(state.experienceConfig?.common?.audioVolume ?? 0.7);

  const synthRef = useRef<Tone.PolySynth<Tone.Synth> | null>(null);
  const playingRef = useRef<Set<NoteName>>(new Set());

  // Init synth on first mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled) return;
    if (synthRef.current) return;

    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle8" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.8 },
      volume: 0,
    }).toDestination();

    synthRef.current = synth;
    Tone.Destination.volume.value = volumeToDb(vol);
  }, [enabled, vol]);

  // React to volume changes
  useEffect(() => {
    if (!synthRef.current) return;
    Tone.Destination.volume.value = volumeToDb(vol);
  }, [vol]);

  // Handle Audio on/off
  useEffect(() => {
    if (!synthRef.current) return;

    if (!audioEnabled) {
      const now = Tone.now();
      try {
        synthRef.current.releaseAll(now);
      } catch {
        // ignore
      }
      return;
    }
  }, [audioEnabled]);

  // Drive Tone with MIDI events
  useEffect(() => {
    if (!enabled || !audioEnabled || !synthRef.current) return;

    const now = Tone.now();
    // Start context when needed
    void Tone.start();

    // Compute diff between activeNotes and playingRef
    const current = new Set(activeNotes);
    // Notes to start
    for (const n of current) {
      if (!playingRef.current.has(n)) {
        try {
          synthRef.current.triggerAttack(n, now);
          playingRef.current.add(n);
        } catch {
          // ignore
        }
      }
    }
    // Notes to release
    for (const n of Array.from(playingRef.current)) {
      if (!current.has(n)) {
        try {
          synthRef.current.triggerRelease(n, now);
        } catch {
          // ignore
        }
        playingRef.current.delete(n);
      }
    }

    return () => {
      // No-op per render
    };
  }, [activeNotes, enabled, audioEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        try {
          synthRef.current.releaseAll();
        } catch {
          // ignore
        }
        synthRef.current.dispose();
        synthRef.current = null;
      }
      playingRef.current.clear();
    };
  }, []);
}