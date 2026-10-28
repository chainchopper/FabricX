import { useEffect, useState } from "react";
import { getSharedAudioContext } from "./sharedAudio";

/**
 * soundfontPiano — the piano layer's REAL voice (Slice 11).
 *
 * Until now every piano note on every device was the Tone triangle
 * synth in useToneSynth: serviceable, identical everywhere, and
 * unmistakably a synth. Terrell's call (world model, audio addendum):
 * instruments should sound like themselves on every end, so the layer
 * ships a sampled voice — with the synth kept as the fallback, never
 * removed.
 *
 * The voice: the FluidR3_GM acoustic grand piano (Frank Wen, MIT —
 * see public/soundfonts/fluidr3-piano/NOTICE.md), rendered per note
 * and vendored INTO this repo under public/soundfonts/fluidr3-piano/
 * as base64 data URIs in per-octave JSON packs (the soundfont-player
 * distribution format), served from Fabric's own domain. No CDN is
 * touched at runtime — demo reliability beats catalogue size, and a
 * borrowed CDN is a borrowed failure mode.
 *
 * Why a hand-rolled loader instead of the smplr package: the job is
 * one instrument, one range (MIDI 36–84: the layer's C3–C5 plus an
 * octave of headroom each way), polyphonic attacks with velocity,
 * damper releases, and natural decay. That is ~a screenful of raw
 * WebAudio on the ONE shared context Hotfix 1.8 established — no new
 * dependency, no second context, no new unlock fate. The packs are
 * format-compatible in spirit with smplr/soundfont-player (per-note
 * base64 samples), so a future multi-instrument pantry can adopt
 * that ecosystem without re-recording anything.
 *
 * Loading honesty (the part that must never lie):
 *   - Loading starts ONLY when the piano layer opens with the
 *     Soundfont voice selected (ensureSoundfontPiano, called from
 *     PianoNoteLayer) — app start is never blocked by 1.6 MB of
 *     piano.
 *   - Status is a real state machine — idle → loading → ready /
 *     failed — published to subscribers (useSoundfontPianoStatus)
 *     so the menu can say what's true: while loading or after a
 *     failure, useToneSynth keeps playing the synth; attacks switch
 *     to samples only for notes struck AFTER "ready".
 *   - Any failure (offline, 404, decode error, no WebAudio) lands in
 *     "failed" and the synth simply remains the voice. Calling
 *     ensure again (reopening the layer) retries.
 *
 * Playback: each attack is an AudioBufferSourceNode through its own
 * gain on a shared master gain → the shared context's destination.
 * Velocity maps to gain (v^1.5, the piano-ish curve). Re-striking a
 * ringing note damper-stops the old voice first, like a real string
 * being re-hit. Note-off is a damper: a short 0.18 s ramp down, not
 * a hard cut; a note never released simply decays with the sample
 * (3.1 s) and cleans itself up onended.
 *
 * Powered by Nirvana
 */

export type SoundfontStatus = "idle" | "loading" | "ready" | "failed";
export type PianoVoicePref = "soundfont" | "synth";

export const SOUNDFONT_MIN_MIDI = 36; // C2
export const SOUNDFONT_MAX_MIDI = 84; // C6

const PACKS: { file: string; min: number; max: number }[] = [
  { file: "pack-c2.json", min: 36, max: 47 },
  { file: "pack-c3.json", min: 48, max: 59 },
  { file: "pack-c4.json", min: 60, max: 71 },
  { file: "pack-c5.json", min: 72, max: 84 },
];

let status: SoundfontStatus = "idle";
let loadPromise: Promise<void> | null = null;
const buffers = new Map<number, AudioBuffer>();
const listeners = new Set<() => void>();

function setStatus(next: SoundfontStatus): void {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

export function getSoundfontStatus(): SoundfontStatus {
  return status;
}

export function subscribeSoundfontStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React view of the load state — menu captions read this. */
export function useSoundfontPianoStatus(): SoundfontStatus {
  const [s, setS] = useState<SoundfontStatus>(() => status);
  useEffect(() => {
    setS(status);
    return subscribeSoundfontStatus(() => setS(status));
  }, []);
  return s;
}

/** True when a note name falls inside the sampled range. */
export function soundfontHasNote(midi: number): boolean {
  return midi >= SOUNDFONT_MIN_MIDI && midi <= SOUNDFONT_MAX_MIDI;
}

/**
 * Where the packs live. public/ is Expo web's static folder: its
 * contents are copied to the export root, so the packs serve from
 * /soundfonts/fluidr3-piano/ on Fabric's own origin. Resolved
 * against the document base so a future subpath mount still works.
 */
function packUrl(file: string): string {
  const rel = `soundfonts/fluidr3-piano/${file}`;
  if (typeof document !== "undefined" && document.baseURI) {
    try {
      return new URL(rel, document.baseURI).toString();
    } catch {
      // fall through to the plain path
    }
  }
  return `/${rel}`;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Start loading the sample packs (idempotent; retries after a
 * failure). Resolves when ready; rejects never — failure is a
 * status, not an exception, because the synth fallback means the
 * music never depends on this promise.
 */
export function ensureSoundfontPiano(): Promise<void> {
  if (status === "ready") return Promise.resolve();
  if (loadPromise) return loadPromise;
  const ctx = getSharedAudioContext();
  if (!ctx || typeof fetch === "undefined") {
    setStatus("failed");
    return Promise.resolve();
  }
  setStatus("loading");
  loadPromise = (async () => {
    try {
      await Promise.all(
        PACKS.map(async (pack) => {
          const res = await fetch(packUrl(pack.file));
          if (!res.ok) throw new Error(`pack ${pack.file}: HTTP ${res.status}`);
          const json = (await res.json()) as {
            notes: Record<string, string>;
          };
          const entries = Object.entries(json.notes ?? {});
          if (entries.length === 0) throw new Error(`pack ${pack.file}: empty`);
          for (const [midiStr, uri] of entries) {
            const midi = Number(midiStr);
            if (!Number.isFinite(midi)) continue;
            const comma = uri.indexOf(",");
            const raw = base64ToArrayBuffer(
              comma >= 0 ? uri.slice(comma + 1) : uri
            );
            // decodeAudioData detaches its input — each note gets
            // the fresh buffer produced above, so nothing is shared.
            const audio = await ctx.decodeAudioData(raw);
            buffers.set(midi, audio);
          }
        })
      );
      // Honest readiness: every note in the range must be present,
      // not just "some packs arrived".
      for (let m = SOUNDFONT_MIN_MIDI; m <= SOUNDFONT_MAX_MIDI; m++) {
        if (!buffers.has(m)) throw new Error(`missing sample for midi ${m}`);
      }
      setStatus("ready");
    } catch {
      buffers.clear();
      setStatus("failed");
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

// ---- Playback ------------------------------------------------------

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

const voices = new Map<number, Voice>();
let masterGain: GainNode | null = null;
let masterCtx: AudioContext | null = null;
// Same default the synth path uses (layer audioVolume default 0.7).
let masterLevel = 0.29;

function getMaster(ctx: AudioContext): GainNode {
  if (masterGain && masterCtx === ctx) return masterGain;
  masterGain = ctx.createGain();
  masterGain.gain.value = masterLevel;
  masterGain.connect(ctx.destination);
  masterCtx = ctx;
  return masterGain;
}

/**
 * Mirror the synth's loudness: useToneSynth drives Tone.Destination
 * with volumeToDb(v) = -36..0 dB; the sampled master applies the
 * same dB as linear gain so switching voices doesn't jump volume.
 */
export function setSoundfontMasterVolume(v01: number): void {
  const clamped = Math.max(0, Math.min(1, v01));
  const db = -36 + clamped * 36;
  masterLevel = Math.pow(10, db / 20);
  if (masterGain && masterCtx) {
    try {
      masterGain.gain.setTargetAtTime(
        masterLevel,
        masterCtx.currentTime,
        0.03
      );
    } catch {
      // ignore — next attack re-reads masterLevel
    }
  }
}

function damperStop(midi: number, when: number, rampSeconds: number): void {
  const voice = voices.get(midi);
  if (!voice) return;
  voices.delete(midi);
  try {
    voice.gain.gain.cancelScheduledValues(when);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, when);
    voice.gain.gain.linearRampToValueAtTime(0.0001, when + rampSeconds);
    voice.src.stop(when + rampSeconds + 0.05);
  } catch {
    // already ended — nothing to damp
  }
}

/**
 * Strike a sampled note. Returns false when the sample isn't
 * available (not ready / out of range / no context) so the caller
 * can fall back to the synth for THIS attack — the fallback is
 * per-note, not per-session.
 */
export function soundfontNoteOn(midi: number, velocity: number): boolean {
  if (status !== "ready") return false;
  const buffer = buffers.get(midi);
  if (!buffer) return false;
  const ctx = getSharedAudioContext();
  if (!ctx) return false;
  const now = ctx.currentTime;
  // Re-strike: damp the ringing string before hitting it again.
  if (voices.has(midi)) damperStop(midi, now, 0.03);
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    const v = Math.max(0.02, Math.min(1, velocity || 0.8));
    gain.gain.value = Math.pow(v, 1.5) * 0.9;
    src.connect(gain);
    gain.connect(getMaster(ctx));
    src.onended = () => {
      if (voices.get(midi)?.src === src) voices.delete(midi);
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
    src.start(now);
    voices.set(midi, { src, gain });
    return true;
  } catch {
    return false;
  }
}

/** Damper release — the sample's tail is shortened, never cut hard. */
export function soundfontNoteOff(midi: number): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  damperStop(midi, ctx.currentTime, 0.18);
}

/** Silence every ringing sample (audio toggled off, unmount). */
export function soundfontReleaseAll(): void {
  const ctx = getSharedAudioContext();
  const now = ctx ? ctx.currentTime : 0;
  for (const midi of Array.from(voices.keys())) {
    damperStop(midi, now, 0.05);
  }
}

/** Scientific pitch notation ("C#4") → MIDI number, or -1. */
export function noteNameToMidi(note: string): number {
  const m = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return -1;
  const base = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const idx = base.indexOf(m[1]);
  if (idx < 0) return -1;
  return (parseInt(m[2], 10) + 1) * 12 + idx;
}
