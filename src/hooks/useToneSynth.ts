import { useEffect, useMemo, useRef } from "react";
import * as Tone from "tone";
import { useMIDI, type NoteName } from "./useMIDI";
import { useVirtualNotes, useRemoteNotes } from "./useVirtualNotes";
import { usePreferences } from "../../app/context/PreferencesContext";
import { useExperience } from "../contexts/ExperienceContext";
import {
  noteNameToMidi,
  setSoundfontMasterVolume,
  soundfontHasNote,
  soundfontNoteOff,
  soundfontNoteOn,
  soundfontReleaseAll,
  useSoundfontPianoStatus,
} from "../audio/soundfontPiano";

// Map 0..1 to dB curve
function volumeToDb(v: number) {
  // soft curve: -36dB (quiet) to 0dB (full)
  const clamped = Math.max(0, Math.min(1, v));
  return -36 + clamped * 36;
}

export function useToneSynth(enabled: boolean) {
  const { activeNotes: hardwareNotes, noteVelocities: hardwareVelocities } =
    useMIDI();
  // On-screen notes arrive over the noteBus (see useVirtualNotes) and
  // merge with hardware notes, so the 2D keyboard and 3D PianoScene
  // sound through this one synth — previously they were inaudible
  // here: PianoScene ran a private synth and nothing else heard them.
  const virtual = useVirtualNotes();
  // Hotfix 1.7: notes played by PEERS arrive over the transport and
  // land on the noteBus as remote events (useFluidMultiUser ->
  // useRemoteNotes). They merge into the sounding set here — the
  // shared synth is the one instrument every end hears — so a piano
  // note is audible on the player's device AND on every other
  // browser in the room. Set semantics keep a note attacked once
  // even when more than one source holds it, and it releases only
  // when every source has let go.
  const remote = useRemoteNotes();
  const activeNotes = useMemo(
    () =>
      Array.from(
        new Set<NoteName>([
          ...hardwareNotes,
          ...(virtual.activeNotes as NoteName[]),
          ...(remote.activeNotes as NoteName[]),
        ])
      ),
    [hardwareNotes, virtual.activeNotes, remote.activeNotes]
  );
  const { audioEnabled } = usePreferences();
  const { state } = useExperience();
  const vol = Number(state.experienceConfig?.common?.audioVolume ?? 0.7);

  // Slice 11 — the piano layer's voice. The sampled FluidR3 grand
  // (soundfontPiano) is the default voice once its packs report
  // "ready"; the Tone synth remains the fallback for every attack
  // the samples can't take (still loading, failed, out of range, or
  // the user picked Synth in THIS LAYER). The choice is per-layer
  // config (specific.pianoVoice), persisted per layer id like every
  // other layer setting — no other layer mounts this hook, so no
  // other layer's sound changes.
  const voicePref =
    ((state.experienceConfig?.specific as Record<string, unknown> | undefined)
      ?.pianoVoice as string | undefined) === "synth"
      ? "synth"
      : "soundfont";
  const soundfontStatus = useSoundfontPianoStatus();

  const synthRef = useRef<Tone.PolySynth<Tone.Synth> | null>(null);
  // Which engine is sounding each held note, so a release always
  // goes back to the engine that attacked it (a note struck on the
  // synth while samples loaded finishes on the synth).
  const playingRef = useRef<Map<NoteName, "synth" | "sample">>(new Map());

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

  // React to volume changes — both engines follow the same curve,
  // so flipping voices never jumps loudness.
  useEffect(() => {
    setSoundfontMasterVolume(vol);
    if (!synthRef.current) return;
    Tone.Destination.volume.value = volumeToDb(vol);
  }, [vol]);

  // Handle Audio on/off
  useEffect(() => {
    if (!audioEnabled) {
      soundfontReleaseAll();
      if (!synthRef.current) return;
      const now = Tone.now();
      try {
        synthRef.current.releaseAll(now);
      } catch {
        // ignore
      }
      return;
    }
  }, [audioEnabled]);

  // Drive the voices with MIDI events. The merged active set is
  // diffed as before, but each NEW attack is routed: sampled grand
  // when the pref says soundfont, the packs are ready, and the note
  // is in range — otherwise the synth, which is also what plays
  // while the packs are still loading. Velocity comes from
  // whichever source (hardware / on-screen / remote) struck the
  // note; the old synth path never had one and keeps its default.
  useEffect(() => {
    if (!enabled || !audioEnabled || !synthRef.current) return;

    const now = Tone.now();
    // Start context when needed
    void Tone.start();

    const velocities: Record<string, number> = {
      ...remote.noteVelocities,
      ...virtual.noteVelocities,
      ...hardwareVelocities,
    };

    // Compute diff between activeNotes and playingRef
    const current = new Set(activeNotes);
    // Notes to start
    for (const n of current) {
      if (!playingRef.current.has(n)) {
        const midi = noteNameToMidi(n);
        let routed: "synth" | "sample" = "synth";
        if (
          voicePref === "soundfont" &&
          soundfontStatus === "ready" &&
          midi >= 0 &&
          soundfontHasNote(midi) &&
          soundfontNoteOn(midi, velocities[n] ?? 0.8)
        ) {
          routed = "sample";
        } else {
          try {
            synthRef.current.triggerAttack(n, now);
          } catch {
            // ignore
          }
        }
        playingRef.current.set(n, routed);
      }
    }
    // Notes to release — back to the engine that attacked them
    for (const n of Array.from(playingRef.current.keys())) {
      if (!current.has(n)) {
        const routed = playingRef.current.get(n);
        if (routed === "sample") {
          const midi = noteNameToMidi(n);
          if (midi >= 0) soundfontNoteOff(midi);
        } else {
          try {
            synthRef.current.triggerRelease(n, now);
          } catch {
            // ignore
          }
        }
        playingRef.current.delete(n);
      }
    }

    return () => {
      // No-op per render
    };
  }, [
    activeNotes,
    enabled,
    audioEnabled,
    voicePref,
    soundfontStatus,
    hardwareVelocities,
    virtual.noteVelocities,
    remote.noteVelocities,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      soundfontReleaseAll();
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