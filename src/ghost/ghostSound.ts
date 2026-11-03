/**
 * Ghost Sound — composed sound rendering (Slice 52).
 *
 * Slice 47 gave the ghost a generative VOICE: its everyday
 * utterances articulate from act families, varied per utterance.
 * But when Terrell actually asked the live ghost to "make some
 * sounds", it could only answer from that fixed family shelf —
 * two redundant sounds, because nothing in its arsenal could
 * build a NEW sound. His fix: give it synthesis — waveform
 * functions (sine, square, triangle, sawtooth, noise) it can
 * compose with, the way a pygame-style toolkit builds sounds
 * from functions instead of samples.
 *
 * The brain's half lives in GhostBrain: the "compose" intent
 * carries a GhostSoundSpec (waveform, pitch ratio + sweep,
 * onset, duration, gain, envelope per note), gated by the
 * fabric manifest like every other tool. THIS module is the
 * render half: it turns a spec into the concrete tone list the
 * SFX hook (useGhostSfx) schedules onto oscillators — and onto
 * a noise buffer for the noise waveform, which has no
 * oscillator type; the hook gives noise its pitch through a
 * bandpass at the note's ratio, so a noise note still sits in
 * the composition's pitch contour.
 *
 * The variation law, restated for compositions: a composition
 * is AUTHORED — its waveforms, envelopes, note count and shape
 * are the brain's choices and reach the renderer untouched.
 * What the per-utterance seed may still vary is the rendering's
 * micro-grain: a ±1.5% pitch wobble, ±4% onset drift, ±6%
 * duration drift — so the same composition asked for twice is
 * recognizably the same composition, never a byte-identical
 * replay. Same spec + same seed renders identically (pure,
 * provable headlessly — waveform-check §C).
 *
 * Safety bounds are the schema's (GhostBrain's sanitizer clamps
 * ratio to [0.25, 3.5], gains to [0.05, 1], the sequence end to
 * 4.8 s) and survive rendering: jitter is multiplicative inside
 * those clamps, never additive past them.
 *
 * Pure module: no audio, no storage, no timers — the hook owns
 * the AudioContext, exactly as ghostVoice's articulation does.
 *
 * Powered by Nirvana
 */

import {
  GHOST_SOUND_MAX_END_MS,
  type GhostSoundEnv,
  type GhostSoundSpec,
} from "./GhostBrain";
import { ghostVoiceRng, type GhostVoiceVariant } from "./ghostVoice";

/** What one composed note becomes at the oscillator layer. */
export interface GhostSoundTone {
  /** Oscillator waveform, or "noise" (a pitched buffer source). */
  type: OscillatorType | "noise";
  /** Pitch multiplier over the ghost's base frequency. */
  ratio: number;
  /** Pitch contour: sweep target by the note's end. */
  ratioEnd?: number;
  delayMs: number;
  durMs: number;
  gain: number;
  env: GhostSoundEnv;
}

/**
 * The gain-curve an envelope name means at the renderer: attack
 * and release as fractions of the note's duration (pluck also
 * decays exponentially through its body — the curve kind). The
 * hook schedules exactly these numbers, so the envelope a brain
 * chose is provably the envelope that renders.
 */
export interface GhostEnvCurve {
  attackFrac: number;
  releaseFrac: number;
  decay: "linear" | "exponential";
}

export function ghostEnvCurve(env: GhostSoundEnv): GhostEnvCurve {
  switch (env) {
    case "pluck":
      return { attackFrac: 0.03, releaseFrac: 0.98, decay: "exponential" };
    case "swell":
      return { attackFrac: 0.38, releaseFrac: 0.3, decay: "linear" };
    case "soft":
    default:
      return { attackFrac: 0.06, releaseFrac: 0.25, decay: "linear" };
  }
}

/**
 * Render a composition to tones. Pure: same (spec, seed, voice)
 * renders the identical tone list. The Second Voice variant
 * (Slice 24) applies as it does to the family voice: ratios a
 * fourth up, sine and triangle traded — square, sawtooth and
 * noise keep their waveform (the variant is a voicing, not a
 * recomposition).
 */
export function renderGhostSound(
  spec: GhostSoundSpec,
  seed: number,
  voice: GhostVoiceVariant = "standard"
): GhostSoundTone[] {
  const rng = ghostVoiceRng(seed >>> 0);
  return spec.notes.map((n) => {
    const wobble = 1 + (rng() - 0.5) * 0.03;
    let ratio = n.ratio * wobble;
    let ratioEnd = n.ratio_end ? n.ratio_end * (1 + (rng() - 0.5) * 0.03) : undefined;
    let type: GhostSoundTone["type"] =
      n.wave === "noise" ? "noise" : (n.wave as OscillatorType);
    if (voice === "second") {
      ratio *= 4 / 3;
      if (ratioEnd) ratioEnd *= 4 / 3;
      if (type === "sine") type = "triangle";
      else if (type === "triangle") type = "sine";
    }
    const delayMs = Math.min(
      GHOST_SOUND_MAX_END_MS - 30,
      Math.max(0, Math.round(n.delay_ms * (1 + (rng() - 0.5) * 0.08)))
    );
    const durMs = Math.min(
      GHOST_SOUND_MAX_END_MS - delayMs,
      Math.max(30, Math.round(n.dur_ms * (1 + (rng() - 0.5) * 0.12)))
    );
    return {
      type,
      ratio,
      ratioEnd,
      delayMs,
      durMs,
      gain: n.gain,
      env: n.env,
    };
  });
}
