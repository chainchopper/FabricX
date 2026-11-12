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
 * Slice 47: the voice is GENERATIVE now. The fixed cue map this
 * file used to hold — one tone list per kind, identical forever —
 * is why Terrell heard "two sounds": repetition negates the
 * intelligence the brain behind the sounds actually has. Every
 * play() now ARTICULATES the utterance through ghostVoice.ts:
 * the cue kind selects the act family, and the caller's context
 * (the deciding decision's intensity, the ghost's temperament,
 * its stamina, a heartbeat's live tempo) plus a per-utterance
 * seed vary the chirp count, spacing, pitch contour, waveform
 * and filter — the same decision never sounds byte-identical
 * twice in a row, while the family shapes stay recognizably the
 * ghost's own. cueSpecsFor survives as the fixed-seed snapshot
 * of that articulation, so the Slice 24 second-voice proof keeps
 * its pure surface.
 *
 * Sound map (families, per ghostVoice):
 * - sniff     (greeting)    tiny ascending chirps, never the same twice
 * - purr      (being petted) soft low warbling tone that loops gently
 *                            while petting continues, then fades out —
 *                            its warble rate/depth are articulated too
 * - play      (chase/play)  rising arpeggios of varying length
 * - mirror    (echo)        soft answering blips — the tickle voice
 * - startle   (surprised)   one quick, quiet high squeak, swept
 * - sleep     (sleepy)      slow descending tones
 * - wake      (waking)      ascending version of sleep
 * - heart     (cheer)       warm chimes — hearts and celebrations
 * - heartbeat (the answer)  lub-dub pairs AT the ghost's live tempo
 * - thinking  (deliberating) a soft murmur while the brain consults
 * - composed  (Slice 52)    a sound the brain AUTHORED from raw
 *                            waveforms (sound-craft) — rendered
 *                            from its spec, envelope and all,
 *                            via ghostSound; noise notes ride a
 *                            pitched bandpass over a noise buffer
 *
 * Discipline: a global (per-client) limiter allows at most one cue per
 * 1.5 s — higher-priority cues (heart, startle) may interrupt after
 * 400 ms — and a modest gain ceiling keeps ghosts quieter than UI
 * sounds. Cues for ghosts acting far from view (distance > 0.65) are
 * dropped, except hearts; when several ghosts act at once, the limiter
 * naturally keeps the first (callers pass nearest/most-recent first)
 * and drops the rest. The purr is exempt from the cue limiter because
 * it is one continuous, quiet loop, not a sequence of cues. Slice K:
 * `playSequence` admits a reaction as ONE limiter decision and
 * sounds its voices staggered 500 ms apart — the one caller that
 * speaks in pairs (the checkers referee) no longer has its second
 * voice swallowed by the same-tick rule, and no other caller can
 * ride the sequence past the limiter.
 *
 * Powered by Nirvana
 */

import { useCallback, useEffect, useRef } from "react";
import { usePreferences } from "../../app/context/PreferencesContext";
import { getSharedAudioContext } from "../audio/sharedAudio";
import type { GhostSoundSpec } from "./GhostBrain";
import { ghostEnvCurve, renderGhostSound } from "./ghostSound";
import {
  limiterAdmits,
  SFX_PRIORITY,
} from "./sfxLimiter";
import {
  articulateGhostUtterance,
  ghostFamilyForCue,
  ghostUtteranceSeed,
  type GhostVoiceTemperament,
  type GhostVoiceVariant,
} from "./ghostVoice";

export type GhostSfxKind =
  | "sniff"
  | "play"
  | "mirror"
  | "startle"
  | "sleep"
  | "wake"
  | "heart"
  | "heartbeat"
  | "thinking"
  | "composed";

/**
 * What caused the sound, as far as the caller honestly knows it —
 * the articulation's parameters (Slice 47). Every field is
 * optional: a caller that knows nothing gets the family's plain
 * articulation, still seed-varied; a caller carrying a brain
 * decision passes its intensity, and the ghost's temperament and
 * stamina shape the contour and energy of what is heard.
 */
export interface GhostSfxContext {
  /** The deciding decision's intensity (0.05–0.9). */
  intensity?: number;
  temperament?: GhostVoiceTemperament;
  /** The ghost's stamina reading, 0–100. */
  stamina?: number;
  /** Heartbeat answers: the ghost's live tempo. */
  bpm?: number;
  /**
   * Composed cues (Slice 52): the brain's authored sound_spec —
   * the composition IS the utterance; the hook renders it via
   * ghostSound instead of articulating a family.
   */
  sound?: GhostSoundSpec | null;
}

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
  /** Slice 47: what caused the sound — see GhostSfxContext. */
  articulation?: GhostSfxContext;
  /**
   * Slice 47: an explicit variation seed (tests, deliberate
   * replays). Absent = the hook derives the next seed from its
   * per-ghost utterance counter, so consecutive utterances vary.
   */
  seed?: number;
}

export type { GhostVoiceVariant };

/** The fixed seed cueSpecsFor snapshots the articulation at. */
const CUE_SNAPSHOT_SEED = 7;

/**
 * A cue map in a given voice. Pure, so the check can prove the
 * second voice is a TIMBRE change only: same cue count, same
 * delays, gains untouched — ratios shifted a musical fourth
 * (×4/3) and the two soft waveforms traded places. Slice 47: the
 * map is one fixed-seed articulation of the kind's family (the
 * live path articulates per utterance, with fresh seeds); the
 * second-voice law holds by construction in ghostVoice.
 */
export function cueSpecsFor(
  kind: GhostSfxKind,
  voice: GhostVoiceVariant
): ToneSpec[] {
  return articulateGhostUtterance(
    { family: ghostFamilyForCue(kind), intensity: 0.55, voice },
    CUE_SNAPSHOT_SEED
  ).notes;
}

const MASTER_GAIN = 0.024; // below useAudioCues' levels — ghosts whisper

/**
 * The shared noise buffer (Slice 52): one second of white noise
 * per context, generated from a fixed LCG so every client holds
 * the identical buffer. Composed "noise" notes play it through
 * a bandpass at the note's pitch ratio.
 */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
function noiseBufferFor(ctx: AudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < data.length; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      data[i] = s / 0x40000000 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}
/**
 * One voice of a reaction sequence: a cue kind pitched from a
 * hue, with the caller's play options (Slice K).
 */
export interface GhostSfxCue {
  kind: GhostSfxKind;
  hue: number;
  opts?: GhostSfxPlayOptions;
}

/**
 * The stagger between the voices of a sequence: past the 400 ms
 * priority-interrupt window, and past the longest single cue
 * (a cheer spans at most ~400 ms), so each voice sounds in its
 * own window and never talks over the one before it. A duet
 * lands in ~1 s; a three-voice reaction in ~1.5 s.
 */
export const GHOST_SFX_SEQUENCE_STAGGER_MS = 500;

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

interface PurrVoice {
  osc: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  stopAt: number;
  hue: number;
  voice: GhostVoiceVariant;
}

export function useGhostSfx() {
  const { audioEnabled } = usePreferences();
  const ctxRef = useRef<AudioContext | null>(null);
  const lastCueAtRef = useRef(0);
  const lastPriorityRef = useRef(0);
  const purrRef = useRef<PurrVoice | null>(null);
  const purrSweeperRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Slice 47: the per-ghost utterance counter the variation seeds
  // derive from — it only ever increments, so consecutive
  // utterances from a ghost never share a seed (the streak law).
  const utteranceCounterRef = useRef(0);

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

  /**
   * Renders ONE cue through the shared context. The caller has
   * already been admitted — `play` for a single cue, or
   * `playSequence` for a member of an admitted sequence — so
   * this performs NO limiter check of its own. It DOES honor
   * the preference and the distance gate, so every path through
   * the voice respects them, and it advances the limiter state
   * only for cues that actually sound (a distance-dropped or
   * context-less cue never burns the slot or a variation).
   * Returns true when the cue sounded.
   */
  const soundCue = useCallback(
    (kind: GhostSfxKind, hue: number, opts?: GhostSfxPlayOptions): boolean => {
      if (!audioEnabled) return false;
      if (
        opts?.distance !== undefined &&
        opts.distance > 0.65 &&
        kind !== "heart"
      ) {
        return false; // acting far from view — stay silent
      }
      const ctx = ensureCtx();
      if (!ctx) return false;
      const now = performance.now();
      lastCueAtRef.current = now;
      lastPriorityRef.current = SFX_PRIORITY[kind] ?? 1;

      // Slice 47: articulate THIS utterance — the family from
      // the cue kind, the parameters from the caller's context,
      // the variation from a fresh seed (the counter advances
      // only when a cue actually sounds, so a dropped cue never
      // burns a variation).
      const family = ghostFamilyForCue(kind);
      const seed =
        opts?.seed ??
        ghostUtteranceSeed(hue, family, utteranceCounterRef.current);
      utteranceCounterRef.current += 1;
      const art = articulateGhostUtterance(
        {
          family,
          intensity: opts?.articulation?.intensity,
          temperament: opts?.articulation?.temperament,
          stamina: opts?.articulation?.stamina,
          bpm: opts?.articulation?.bpm,
          voice: opts?.voice ?? "standard",
        },
        seed
      );

      const base = ghostBaseFreq(hue);
      const start = ctx.currentTime;
      // One lowpass per utterance: the timbre's brightness is
      // part of the articulation (it tracks the decision's
      // intensity), not a fixed channel strip.
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(art.filterCutoffHz, start);
      filter.Q.setValueAtTime(art.filterQ, start);
      filter.connect(ctx.destination);

      // Slice 52: a composed cue renders its AUTHORED spec
      // (ghostSound renders it to tones with the same seed);
      // every other cue renders the family articulation. Family
      // tones keep their exact legacy gain curve (env: null);
      // composed tones carry the envelope the brain chose.
      interface SchedTone {
        type: OscillatorType | "noise";
        ratio: number;
        ratioEnd?: number;
        delayMs: number;
        durMs: number;
        gain: number;
        env: "soft" | "pluck" | "swell" | null;
      }
      const composedSpec =
        kind === "composed" ? (opts?.articulation?.sound ?? null) : null;
      const tones: SchedTone[] = composedSpec
        ? renderGhostSound(composedSpec, seed, opts?.voice ?? "standard")
        : art.notes.map((n) => ({
            type: n.type as OscillatorType,
            ratio: n.ratio,
            ratioEnd: n.ratioEnd,
            delayMs: n.delayMs,
            durMs: n.durMs,
            gain: n.gain,
            env: null,
          }));

      tones.forEach((spec) => {
        const t0 = start + (spec.delayMs ?? 0) / 1000;
        const dur = spec.durMs / 1000;
        const gain = ctx.createGain();
        const peak = MASTER_GAIN * (spec.gain ?? 1);
        if (spec.env) {
          // The composed envelope: attack/release fractions of
          // the note's own duration (ghostEnvCurve) — the shape
          // the brain picked is the shape that sounds.
          const curve = ghostEnvCurve(spec.env);
          const tAttack =
            t0 + Math.min(Math.max(dur * curve.attackFrac, 0.003), dur * 0.5);
          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(peak, tAttack);
          if (curve.decay === "exponential") {
            gain.gain.exponentialRampToValueAtTime(
              Math.max(peak * 0.01, 0.0001),
              t0 + dur * curve.releaseFrac
            );
            gain.gain.linearRampToValueAtTime(0, t0 + dur + 0.02);
          } else {
            gain.gain.setValueAtTime(peak, t0 + dur * (1 - curve.releaseFrac));
            gain.gain.linearRampToValueAtTime(0, t0 + dur);
          }
        } else {
          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
          gain.gain.linearRampToValueAtTime(0, t0 + dur);
        }
        gain.connect(filter);
        if (spec.type === "noise") {
          // Noise has no oscillator: a looping buffer source
          // pitched by a bandpass riding the note's ratio (and
          // its sweep), so it sits inside the composition's
          // pitch contour like any other note.
          const src = ctx.createBufferSource();
          src.buffer = noiseBufferFor(ctx);
          src.loop = true;
          const bp = ctx.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.setValueAtTime(base * spec.ratio, t0);
          if (spec.ratioEnd) {
            bp.frequency.exponentialRampToValueAtTime(
              base * spec.ratioEnd,
              t0 + dur
            );
          }
          bp.Q.setValueAtTime(1.1, t0);
          src.connect(bp);
          bp.connect(gain);
          src.start(t0);
          src.stop(t0 + dur + 0.02);
          return;
        }
        const osc = ctx.createOscillator();
        osc.type = spec.type;
        osc.frequency.setValueAtTime(base * spec.ratio, t0);
        if (spec.ratioEnd) {
          osc.frequency.exponentialRampToValueAtTime(
            base * spec.ratioEnd,
            t0 + dur
          );
        }
        osc.connect(gain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      });
      return true;
    },
    [audioEnabled, ensureCtx]
  );

  /**
   * One cue, through the limiter. The law lives in sfxLimiter
   * (one cue per 1.5 s; a higher-priority cue may interrupt
   * after 400 ms); this is the single-cue application of it.
   */
  const play = useCallback(
    (kind: GhostSfxKind, hue: number, opts?: GhostSfxPlayOptions) => {
      if (!audioEnabled) return;
      const now = performance.now();
      const gap = now - lastCueAtRef.current;
      if (
        !limiterAdmits(gap, SFX_PRIORITY[kind] ?? 1, lastPriorityRef.current)
      ) {
        return; // rate-limited; also dedupes brain + render-path triggers
      }
      soundCue(kind, hue, opts);
    },
    [audioEnabled, soundCue]
  );

  // Timers holding the not-yet-sounded members of admitted
  // sequences. Cancelled on unmount and when Audio goes off,
  // so a sequence never outlives the voice that admitted it.
  const sequenceTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const cancelSequences = useCallback(() => {
    for (const t of sequenceTimersRef.current) clearTimeout(t);
    sequenceTimersRef.current.clear();
  }, []);

  /**
   * Slice K — a reaction admitted as ONE unit, sounded as a
   * duet (or trio): the first voice now, each later voice one
   * stagger later, each in its own window.
   *
   * Why the voice owns this, instead of the caller staggering
   * its own calls: a caller staggering `play()` calls still
   * answers to the limiter at every member's fire time, and
   * the law cannot pass the members that matter — a `heart`
   * after a `startle` is the same rank (no interrupt), and a
   * `thinking` after either is a lower rank (never interrupts),
   * so the third voice would need the full 1.5 s and the
   * reaction would stretch into a queue. Worse, any other cue
   * in between (a brain murmur from the peer) could reset the
   * clock and swallow a member. Admitting the sequence once
   * makes the reaction atomic: it either sounds whole or not
   * at all, on the same law as a single cue.
   *
   * The limiter is NOT gutted: admission is one limiter check
   * at call time, on the first cue's priority. Every cue
   * OUTSIDE the sequence still answers to the limiter at its
   * own call time — a third cue in the same tick as the
   * sequence's first cue sees a ~0 ms gap and drops, exactly
   * as before. And each member advances the limiter state as
   * it sounds, so the sequence holds the floor for its span
   * the way one cue holds it for its own.
   *
   * Returns a cancel: the caller (the checkers referee) runs
   * it when the game ends, so a pending voice never sounds
   * over a restored scene.
   */
  const playSequence = useCallback(
    (
      cues: GhostSfxCue[],
      staggerMs: number = GHOST_SFX_SEQUENCE_STAGGER_MS
    ): (() => void) => {
      if (cues.length === 0) return () => {};
      if (!audioEnabled) return () => {};
      const now = performance.now();
      const gap = now - lastCueAtRef.current;
      if (
        !limiterAdmits(
          gap,
          SFX_PRIORITY[cues[0].kind] ?? 1,
          lastPriorityRef.current
        )
      ) {
        return () => {}; // the whole reaction is rate-limited, as one cue would be
      }
      soundCue(cues[0].kind, cues[0].hue, cues[0].opts);
      const pending = new Set<ReturnType<typeof setTimeout>>();
      const cancel = () => {
        for (const t of pending) {
          clearTimeout(t);
          sequenceTimersRef.current.delete(t);
        }
        pending.clear();
      };
      cues.slice(1).forEach((cue, i) => {
        const t = setTimeout(
          () => {
            pending.delete(t);
            sequenceTimersRef.current.delete(t);
            // soundCue re-checks the preference at fire time:
            // Audio going off mid-sequence silences the rest,
            // the way it stops a purr mid-loop.
            soundCue(cue.kind, cue.hue, cue.opts);
          },
          staggerMs * (i + 1)
        );
        pending.add(t);
        sequenceTimersRef.current.add(t);
      });
      return cancel;
    },
    [audioEnabled, soundCue]
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

      // Slice 47: each purr START articulates its own warble —
      // rate, depth and base factor drawn from a fresh seed, so
      // two petting sessions never purr identically. A refresh
      // (petting continues) sustains the SAME purr; a new ghost
      // taking over re-articulates under its own hue.
      const articulate = (h: number, v: GhostVoiceVariant) => {
        const spec = articulateGhostUtterance(
          { family: "purr", voice: v },
          ghostUtteranceSeed(h, "purr", utteranceCounterRef.current)
        ).purr ?? { baseFactor: 0.5, lfoHz: 8.5, lfoDepth: 0.045 };
        utteranceCounterRef.current += 1;
        return spec;
      };

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
            ghostBaseFreq(hue) * articulate(hue, voice).baseFactor,
            ctx.currentTime,
            0.1
          );
        }
        return;
      }

      const purrSpec = articulate(hue, voice);
      const base = ghostBaseFreq(hue) * purrSpec.baseFactor; // purrs sit an octave down
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, ctx.currentTime);
      // Warble: a slow LFO wobbling the pitch a few percent.
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(purrSpec.lfoHz, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(base * purrSpec.lfoDepth, ctx.currentTime);
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

  // The preference wins mid-purr and mid-sequence too; and never
  // leak a voice on unmount.
  useEffect(() => {
    if (!audioEnabled) {
      stopPurr(true);
      cancelSequences();
    }
  }, [audioEnabled, stopPurr, cancelSequences]);

  useEffect(
    () => () => {
      stopPurr(true);
      cancelSequences();
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
    },
    [stopPurr, cancelSequences]
  );

  return { play, playSequence, startPurr, stopPurr, playPeer };
}

export type GhostSfxApi = ReturnType<typeof useGhostSfx>;
