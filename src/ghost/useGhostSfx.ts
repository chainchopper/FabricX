/**
 * useGhostSfx — the ghost's voice, without speech.
 *
 * Ghosts never talk. They make small, refined retro-game sounds
 * (polished chiptune blips, not beeps), synthesized with the same
 * WebAudio approach as app/hooks/useAudioCues: a lazily created
 * AudioContext, short oscillator tones with soft envelopes, and every
 * sound gated on the user's audioEnabled preference. No audio assets,
 * no new dependencies.
 *
 * Each ghost SOUNDS distinct: its base pitch is derived from its
 * persistent signature hue (300–660 Hz), and every cue is built from
 * intervals over that base, so a ghost keeps the same "voice" across
 * all its sounds and across sessions.
 *
 * Sound map:
 * - sniff   (ghost greeting)   two tiny ascending chirps
 * - purr    (being petted)     soft low warbling tone that loops gently
 *                              while petting continues, then fades out
 * - play    (chase/play start) rising 3-note arpeggio
 * - mirror  (echoing a stroke) one soft blip
 * - startle (startle-hop)      one quick, quiet high squeak
 * - sleep   (falling asleep)   slow descending tones
 * - wake    (waking up)        ascending version of sleep
 * - heart   (sending/receiving a HEART) warm two-note chime
 *
 * Discipline: a global (per-client) limiter allows at most one cue per
 * 1.5 s — higher-priority cues (heart, startle) may interrupt after
 * 400 ms — and a modest gain ceiling keeps ghosts quieter than UI
 * sounds. Cues for ghosts acting far from view (distance > 0.65) are
 * dropped, except hearts; when several ghosts act at once, the limiter
 * naturally keeps the first (callers pass nearest/most-recent first)
 * and drops the rest. The purr is exempt from the cue limiter because
 * it is one continuous, quiet loop, not a sequence of cues.
 *
 * Powered by Nirvana
 */

import { useCallback, useEffect, useRef } from "react";
import { usePreferences } from "../../app/context/PreferencesContext";
import { getSharedAudioContext } from "../audio/sharedAudio";

export type GhostSfxKind =
  | "sniff"
  | "play"
  | "mirror"
  | "startle"
  | "sleep"
  | "wake"
  | "heart";

export interface GhostSfxPlayOptions {
  /**
   * Normalized distance of the acting ghost from the viewer focus
   * (0 = right here). Distant ghosts stay silent (except hearts).
   */
  distance?: number;
  /**
   * Timbre variant (Slice 24, the Second Voice power-up): the
   * SAME cue map heard through a different voice — a fourth up,
   * sine and triangle swapped. Same state-bound rules, same
   * limiter, same gain ceiling: a power-up changes how the ghost
   * sounds, never how often or how loud. Callers pass it only
   * for the LOCAL ghost when its primary has it equipped; remote
   * ghosts keep their standard voice on this client (their
   * equip state is theirs — the trail rides the announce, the
   * voice is a home-device pleasure for now).
   */
  voice?: GhostVoiceVariant;
}

export type GhostVoiceVariant = "standard" | "second";

/**
 * A cue map in a given voice. Pure, so the check can prove the
 * second voice is a TIMBRE change only: same cue count, same
 * delays, gains untouched — ratios shifted a musical fourth
 * (×4/3) and the two soft waveforms traded places.
 */
export function cueSpecsFor(
  kind: GhostSfxKind,
  voice: GhostVoiceVariant
): ToneSpec[] {
  const base = CUES[kind];
  if (voice === "standard") return base;
  return base.map((spec) => ({
    ...spec,
    ratio: spec.ratio * (4 / 3),
    ratioEnd: spec.ratioEnd ? spec.ratioEnd * (4 / 3) : undefined,
    type:
      spec.type === "triangle"
        ? "sine"
        : spec.type === "sine"
          ? "triangle"
          : spec.type,
  }));
}

const MASTER_GAIN = 0.024; // below useAudioCues' levels — ghosts whisper
const MIN_CUE_GAP_MS = 1_500;
const PRIORITY: Record<GhostSfxKind, number> = {
  mirror: 1,
  sniff: 2,
  play: 2,
  sleep: 2,
  wake: 2,
  startle: 3,
  heart: 3,
};

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return (w.AudioContext || w.webkitAudioContext) ?? null;
}

/** A ghost's base pitch: signature hue (degrees) mapped to 300–660 Hz. */
export function ghostBaseFreq(hue: number): number {
  const h = (((hue % 360) + 360) % 360) / 360;
  return 300 + h * 360;
}

/** Recover a hue (degrees) from an RGB float color — for ghosts whose
 *  identity we only know through the color of their splats. */
export function hueFromColor(color: { r: number; g: number; b: number }): number {
  const { r, g, b } = color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

interface ToneSpec {
  ratio: number;
  ratioEnd?: number;
  delayMs?: number;
  durMs: number;
  type?: OscillatorType;
  gain?: number;
}

const CUES: Record<GhostSfxKind, ToneSpec[]> = {
  sniff: [
    { ratio: 1.5, durMs: 50, type: "triangle" },
    { ratio: 1.85, durMs: 45, delayMs: 70, type: "triangle" },
  ],
  play: [
    { ratio: 1.0, durMs: 65, type: "triangle" },
    { ratio: 1.25, durMs: 65, delayMs: 55, type: "triangle" },
    { ratio: 1.5, durMs: 80, delayMs: 110, type: "triangle" },
  ],
  mirror: [{ ratio: 1.2, durMs: 60, type: "sine" }],
  startle: [
    { ratio: 2.3, ratioEnd: 1.9, durMs: 90, type: "sine", gain: 0.45 },
  ],
  sleep: [
    { ratio: 1.2, durMs: 140, type: "sine", gain: 0.8 },
    { ratio: 1.0, durMs: 140, delayMs: 125, type: "sine", gain: 0.8 },
    { ratio: 0.8, durMs: 170, delayMs: 250, type: "sine", gain: 0.8 },
  ],
  wake: [
    { ratio: 0.8, durMs: 110, type: "sine", gain: 0.8 },
    { ratio: 1.0, durMs: 110, delayMs: 100, type: "sine", gain: 0.8 },
    { ratio: 1.2, durMs: 130, delayMs: 200, type: "sine", gain: 0.8 },
  ],
  heart: [
    { ratio: 1.0, durMs: 150, type: "sine" },
    { ratio: 1.5, durMs: 180, delayMs: 95, type: "sine", gain: 0.9 },
  ],
};

interface PurrVoice {
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  stopAt: number;
  hue: number;
  voice: GhostVoiceVariant;
}

/** The purr's pitch factor for a voice (Second Voice sits a fourth up). */
function purrBaseFactor(voice: GhostVoiceVariant): number {
  return voice === "second" ? 0.5 * (4 / 3) : 0.5;
}

export function useGhostSfx() {
  const { audioEnabled } = usePreferences();
  const ctxRef = useRef<AudioContext | null>(null);
  const lastCueAtRef = useRef(0);
  const lastPriorityRef = useRef(0);
  const purrRef = useRef<PurrVoice | null>(null);
  const purrSweeperRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") {
        void ctxRef.current.resume();
      }
      return ctxRef.current;
    }
    // Hotfix 1.8: the ghost's voice schedules onto the ONE shared
    // context (Tone's — see src/audio/sharedAudio), so the root
    // gesture unlock wakes the ghost along with the notes and the
    // verb cues. Previously this hook constructed a private
    // AudioContext with its own unlock fate. The constructor
    // fallback stays for a world where Tone cannot provide one.
    ctxRef.current = getSharedAudioContext();
    if (!ctxRef.current) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return null;
      try {
        ctxRef.current = new Ctor();
      } catch {
        return null;
      }
    }
    return ctxRef.current;
  }, []);

  const play = useCallback(
    (kind: GhostSfxKind, hue: number, opts?: GhostSfxPlayOptions) => {
      if (!audioEnabled) return;
      if (
        opts?.distance !== undefined &&
        opts.distance > 0.65 &&
        kind !== "heart"
      ) {
        return; // acting far from view — stay silent
      }
      const now = performance.now();
      const gap = now - lastCueAtRef.current;
      const priority = PRIORITY[kind];
      if (
        gap < MIN_CUE_GAP_MS &&
        !(priority > lastPriorityRef.current && gap > 400)
      ) {
        return; // rate-limited; also dedupes brain + render-path triggers
      }
      const ctx = ensureCtx();
      if (!ctx) return;
      lastCueAtRef.current = now;
      lastPriorityRef.current = priority;

      const base = ghostBaseFreq(hue);
      const start = ctx.currentTime;
      cueSpecsFor(kind, opts?.voice ?? "standard").forEach((spec) => {
        const t0 = start + (spec.delayMs ?? 0) / 1000;
        const dur = spec.durMs / 1000;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = spec.type ?? "sine";
        osc.frequency.setValueAtTime(base * spec.ratio, t0);
        if (spec.ratioEnd) {
          osc.frequency.exponentialRampToValueAtTime(
            base * spec.ratioEnd,
            t0 + dur
          );
        }
        const peak = MASTER_GAIN * (spec.gain ?? 1);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
        gain.gain.linearRampToValueAtTime(0, t0 + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      });
    },
    [audioEnabled, ensureCtx]
  );

  /**
   * Slice 6: a HUMAN participant's stroke voice. One soft blip pitched
   * by the sender's signature hue — the same ghostBaseFreq mapping the
   * ghosts use (300–660 Hz) — so every person in the room sounds like
   * themselves and nobody sounds like a ghost (triangle, shorter and
   * drier than any ghost cue). Deliberately separate limiter from the
   * ghost cues: a drawing peer produces stroke ONSETS (the caller
   * detects them), and this cap (~5/s) only guards against a burst of
   * onsets stacking into noise. Respects the same audioEnabled
   * preference and lazy AudioContext as every cue here.
   */
  const peerLastAtRef = useRef(0);
  const playPeer = useCallback(
    (hue: number) => {
      if (!audioEnabled) return;
      const now = performance.now();
      if (now - peerLastAtRef.current < 200) return;
      const ctx = ensureCtx();
      if (!ctx) return;
      peerLastAtRef.current = now;
      const base = ghostBaseFreq(hue);
      const t0 = ctx.currentTime;
      const dur = 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(base, t0);
      const peak = MASTER_GAIN * 0.9;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    [audioEnabled, ensureCtx]
  );

  const stopPurr = useCallback((immediate = false) => {
    const purr = purrRef.current;
    purrRef.current = null;
    if (purrSweeperRef.current) {
      clearInterval(purrSweeperRef.current);
      purrSweeperRef.current = null;
    }
    if (!purr || !ctxRef.current) return;
    const ctx = ctxRef.current;
    const now = ctx.currentTime;
    const release = immediate ? 0.03 : 0.18;
    try {
      purr.gain.gain.cancelScheduledValues(now);
      purr.gain.gain.setValueAtTime(purr.gain.gain.value, now);
      purr.gain.gain.linearRampToValueAtTime(0, now + release);
      purr.osc.stop(now + release + 0.05);
      purr.lfo.stop(now + release + 0.05);
    } catch {
      // Already stopped — nothing to release.
    }
  }, []);

  /**
   * Start (or refresh) the purr loop for a ghost. The purr sustains
   * while calls keep arriving (petting continues) and fades ~2.8 s
   * after the last one. One purr at a time per client — the nearest /
   * most recent ghost wins.
   */
  const startPurr = useCallback(
    (hue: number, voice: GhostVoiceVariant = "standard") => {
      if (!audioEnabled) return;
      const ctx = ensureCtx();
      if (!ctx) return;
      const now = performance.now();

      if (purrRef.current) {
        // Refresh: sustain, and retune if a different ghost took over.
        purrRef.current.stopAt = now + 2_800;
        if (
          Math.abs(purrRef.current.hue - hue) > 1 ||
          purrRef.current.voice !== voice
        ) {
          purrRef.current.hue = hue;
          purrRef.current.voice = voice;
          purrRef.current.osc.frequency.setTargetAtTime(
            ghostBaseFreq(hue) * purrBaseFactor(voice),
            ctx.currentTime,
            0.1
          );
        }
        return;
      }

      const base = ghostBaseFreq(hue) * purrBaseFactor(voice); // purrs sit an octave down
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, ctx.currentTime);
      // Warble: a slow LFO wobbling the pitch a few percent.
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(8.5, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(base * 0.045, ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        MASTER_GAIN * 0.7,
        ctx.currentTime + 0.25
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      lfo.start();
      purrRef.current = { osc, gain, lfo, stopAt: now + 2_800, hue, voice };

      purrSweeperRef.current = setInterval(() => {
        if (purrRef.current && performance.now() > purrRef.current.stopAt) {
          stopPurr();
        }
      }, 400);
    },
    [audioEnabled, ensureCtx, stopPurr]
  );

  // The preference wins mid-purr too; and never leak a voice on unmount.
  useEffect(() => {
    if (!audioEnabled) stopPurr(true);
  }, [audioEnabled, stopPurr]);

  useEffect(
    () => () => {
      stopPurr(true);
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
    },
    [stopPurr]
  );

  return { play, startPurr, stopPurr, playPeer };
}

export type GhostSfxApi = ReturnType<typeof useGhostSfx>;
