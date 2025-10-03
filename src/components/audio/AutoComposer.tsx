import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Tone from "tone";
import { useExperience } from "../../contexts/ExperienceContext";

type ScaleId = "ionian" | "dorian" | "mixolydian" | "minor";
type PatternId = "up" | "random" | "triad";

const SCALES: Record<ScaleId, Array<number>> = {
  ionian:      [0, 2, 4, 5, 7, 9, 11, 12],
  dorian:      [0, 2, 3, 5, 7, 9, 10, 12],
  mixolydian:  [0, 2, 4, 5, 7, 9, 10, 12],
  minor:       [0, 2, 3, 5, 7, 8, 10, 12],
};

function midiToNote(m: number): string {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const name = names[m % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

export default function AutoComposer() {
  if (Platform.OS !== "web") return null;

  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;

  // Only run for default-fluid when enabled
  const isDefaultFluid = activeExperience?.id === "default-fluid";
  const s = (experienceConfig.specific as Record<string, unknown>) || {};
  const enabled = Boolean((s.musicEnabled as boolean) ?? false);
  const bpm = Number.isFinite(s.musicTempo) ? Number(s.musicTempo) : 100;
  const scale = ((s.musicScale as ScaleId) ?? "ionian") as ScaleId;
  const pattern = ((s.musicPattern as PatternId) ?? "up") as PatternId;
  // Overall volume comes from common config (0..1 mapped to dB)
  const vol = Number(experienceConfig.common?.audioVolume ?? 0.7);

  const synthRef = useRef<Tone.PolySynth<Tone.Synth> | null>(null);
  const seqRef = useRef<Tone.Sequence | null>(null);

  useEffect(() => {
    if (!isDefaultFluid || !enabled) {
      return () => {};
    }

    let disposed = false;

    const start = async () => {
      await Tone.start().catch(() => {});
      if (disposed) return;

      // Create synth if not present
      if (!synthRef.current) {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 0.03, decay: 0.25, sustain: 0.5, release: 0.9 },
          volume: 0,
        }).toDestination();
        synthRef.current = synth;
      }

      // Volume mapping -36dB..0dB
      Tone.Destination.volume.value = -36 + Math.max(0, Math.min(1, vol)) * 36;

      // Build note pool in C4 range
      const base = 60 + 12; // C5 base range
      const offsets = SCALES[scale] || SCALES.ionian;
      const notes: string[] = offsets.map((off) => midiToNote(base + off));

      // Pattern function
      const pickNote = (() => {
        if (pattern === "random") {
          return () => notes[Math.floor(Math.random() * notes.length)];
        }
        if (pattern === "triad") {
          const triadIdx = [0, 2, 4, 7].map((i) => i % notes.length);
          let j = 0;
          return () => {
            const n = notes[triadIdx[j % triadIdx.length]];
            j++;
            return n;
          };
        }
        // "up" arpeggio
        let i = 0;
        return () => {
          const n = notes[i % notes.length];
          i++;
          return n;
        };
      })();

      // Create/recreate sequence
      seqRef.current?.dispose();
      const seq = new Tone.Sequence(
        (time) => {
          const n = pickNote();
          try {
            synthRef.current?.triggerAttackRelease(n, "8n", time, 0.7);
          } catch {
            // ignore synth trigger failures
          }
        },
        new Array(16).fill(0), // 16 steps; actual pitch chosen in callback
        "8n"
      );
      seqRef.current = seq;

      Tone.Transport.bpm.value = Math.max(40, Math.min(180, Math.round(bpm)));
      try { seq.start(); } catch {}
      try { Tone.Transport.start("+0.05"); } catch {}
    };

    void start();

    return () => {
      disposed = true;
      try { seqRef.current?.stop(); } catch {}
      try { seqRef.current?.dispose(); } catch {}
      seqRef.current = null;
      // Keep synth alive for fast resume; Tone dest remains configured
    };
  }, [isDefaultFluid, enabled, bpm, scale, pattern, vol]);

  return null;
}