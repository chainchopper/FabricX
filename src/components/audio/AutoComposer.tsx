import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Tone from "tone";
import { useExperience } from "../../contexts/ExperienceContext";
import { usePreferences } from "../../../app/context/PreferencesContext";
import { subscribeGhostMusicPhrases } from "../../ghost/ghostMusicStore";
import { phraseToEvents } from "./phraseEvents";

/**
 * AutoComposer (Slice 68) — the Generative-music RENDERER.
 *
 * Until Slice 68 this component was a standalone player: it
 * owned a Tone.Sequence and chose every pitch itself (a fixed
 * ascending loop, a fixed triad cycle, or Math.random over a
 * scale pool). No part of the ghost's decision path fed it,
 * which is exactly the "mockup" Terrell called out on Nov 4,
 * 2026: "if no intelligence is attached to this, we fail."
 *
 * Now the intelligence lives where every other ghost act
 * lives — the brain (GhostBrain's music overlay authors each
 * phrase from temperament, perception and room state under the
 * standing request GhostPeer feeds it) — and this component is
 * demoted to a loudspeaker: it subscribes to the authored-
 * phrase store and schedules EXACTLY the notes the brain
 * wrote, at the phrase's own tempo, through phraseToEvents
 * (the one pure transform, shared with the music check). It
 * contains no pitch choice, no pattern, no randomness.
 *
 * Honest silence: when the ghost is off or absent in the
 * layer, no phrases are authored, nothing arrives here, and
 * the music does not play. The toggle asks the GHOST to play;
 * there is no fallback sequencer pretending otherwise.
 *
 * Slice J (audibles): `audioEnabled` is the MASTER switch.
 * `musicEnabled` keeps its own meaning — the ghost's standing
 * request to play — but when Audio is off this renderer stops
 * scheduling entirely and the synth goes away (see below). A
 * phrase already scheduled keeps no voice past the flip.
 */
export default function AutoComposer() {
  if (Platform.OS !== "web") return null;

  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { audioEnabled } = usePreferences();

  // Only run for default-fluid when enabled
  const isDefaultFluid = activeExperience?.id === "default-fluid";
  const s = (experienceConfig.specific as Record<string, unknown>) || {};
  const enabled = Boolean((s.musicEnabled as boolean) ?? false);
  // Overall volume comes from common config (0..1 mapped to dB)
  const vol = Number(experienceConfig.common?.audioVolume ?? 0.7);

  const synthRef = useRef<Tone.PolySynth<Tone.Synth> | null>(null);
  // Slice J: a live mirror of the master switch for the
  // phrase callback below — a phrase published in the same
  // tick as the flip must not schedule after the release.
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  // Slice J: Audio off DISPOSES the synth the moment the
  // switch flips. A plain releaseAll is not enough here, and
  // the J browser drive proved it (RMS 0.1364 after the flip):
  // triggerAttackRelease schedules each note's attack in the
  // future, and a release issued now cannot cancel an attack
  // that has not happened yet — the note re-opens its envelope
  // at its start time and sounds until its own release. The
  // piano (useToneSynth) can release because its notes are
  // held, not pre-scheduled; this renderer's notes are all
  // scheduled up front. Disposing stops the voices outright,
  // scheduled attacks included. Flip Audio back on and the
  // scheduling effect below re-runs and ensureSynth builds a
  // fresh synth — nothing is lost but the silenced notes.
  useEffect(() => {
    if (audioEnabled) return;
    if (!synthRef.current) return;
    try {
      synthRef.current.dispose();
    } catch {
      // ignore synth dispose failures
    }
    synthRef.current = null;
  }, [audioEnabled]);

  useEffect(() => {
    if (!isDefaultFluid || !enabled || !audioEnabled) {
      return () => {};
    }

    let disposed = false;

    const ensureSynth = async (): Promise<Tone.PolySynth<Tone.Synth> | null> => {
      await Tone.start().catch(() => {});
      if (disposed) return null;
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
      return synthRef.current;
    };

    // Warm the synth up front so the first authored phrase is
    // not lost to audio-context startup.
    void ensureSynth();

    const unsubscribe = subscribeGhostMusicPhrases((phrase) => {
      void (async () => {
        const synth = await ensureSynth();
        if (!synth || disposed) return;
        // Slice J: the flip may have landed while ensureSynth
        // awaited — a phrase that arrived before the flip must
        // not schedule a single note after it.
        if (!audioEnabledRef.current) return;
        const startAt = Tone.now() + 0.06;
        for (const ev of phraseToEvents(phrase)) {
          try {
            synth.triggerAttackRelease(
              ev.note,
              ev.durationSec,
              startAt + ev.offsetSec,
              ev.velocity
            );
          } catch {
            // ignore synth trigger failures
          }
        }
      })();
    });

    return () => {
      disposed = true;
      unsubscribe();
      // Keep synth alive for fast resume; Tone dest remains configured
    };
  }, [isDefaultFluid, enabled, vol, audioEnabled]);

  return null;
}
