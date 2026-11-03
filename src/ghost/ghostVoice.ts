/**
 * Ghost Voice — generative articulation (Slice 47, Part A).
 *
 * Terrell's device verdict (Nov 3): "The sounds the ghost makes
 * are limited it seems to two sounds... even if it's smart the
 * repetition negates the intelligence aspect." He was right about
 * the mechanism: the old SFX layer (useGhostSfx) held ONE fixed
 * tone list per cue kind — a "sniff" was the same two chirps at
 * the same ratios forever, so the ghost's whole audible life
 * collapsed into a couple of recognizable loops. A soundboard,
 * however polished, reads as a soundboard.
 *
 * This module replaces the fixed cue map with GENERATIVE
 * articulation, modeled on expressive little-robot vocalization
 * (varied chirps and blips with pitch contour — never speech,
 * never words; the ghost still never talks):
 *
 *   utterance = articulateGhostUtterance(input, seed)
 *
 * where the input carries WHAT CAUSED the sound — its family
 * (the act family: greeting, cheer, heartbeat, echo, thinking,
 * surprised, sleepy, waking, play), the deciding decision's
 * intensity, the ghost's temperament, its stamina reading, and
 * (for a heartbeat answer) its live tempo — and the seed is the
 * per-utterance variation seed. The articulation varies, per
 * utterance: the chirp COUNT and spacing, the pitch CONTOUR
 * (skeleton choice + per-note wobble + a temperament tilt on the
 * tail), the TIMBRE (waveform per note + a lowpass cutoff that
 * tracks intensity), and the RHYTHM (spacing/duration jitter).
 *
 * Determinism law: the function is pure — same input + same seed
 * renders the identical parameter set, byte for byte; a different
 * seed renders a different set (the discrete skeleton index is
 * seed-derived, so even adjacent seeds land on different
 * skeletons). The hook (useGhostSfx) owns seed DERIVATION — an
 * ever-incrementing per-ghost counter folded with the ghost's hue
 * and the family (ghostUtteranceSeed) — so two consecutive
 * utterances from the same ghost can never share a seed, and the
 * streak property is provable headlessly (ghostvoice-check §A).
 *
 * The family skeletons grow out of the old cue map's ratios, so
 * the ghost keeps its recognizable voice — a sniff still rises,
 * a sleep still descends — it just never says it the same way
 * twice. The Second Voice power-up (Slice 24) keeps its exact
 * meaning here: ratios a musical fourth up (x4/3), sine and
 * triangle traded — the same transform cueSpecsFor always made,
 * now applied to the articulated utterance.
 *
 * Pure module: no imports, no storage, no timers, no audio —
 * the renderer lives in useGhostSfx. The vocabulary mirrors
 * (temperaments, cue kinds) are kept in step by hand, the
 * GhostBrain discipline; ghostvoice-check asserts the mirrors
 * never drift from their sources.
 *
 * Powered by Nirvana
 */

/** Temperaments the ghost's machine can hold (mirrors GhostBrain). */
export type GhostVoiceTemperament =
  | "curious"
  | "playful"
  | "sleepy"
  | "sassy"
  | "affectionate";

/**
 * The act families the voice articulates. Every family is
 * reachable from a live trigger in the app (see the cue/intent
 * maps below): the deliberation murmur is "thinking", the
 * heartbeat answer is "heartbeat" (its rhythm is the ghost's
 * live BPM, not a fixed chime), being petted is "purr".
 */
export type GhostVoiceFamily =
  | "greeting"
  | "play"
  | "cheer"
  | "heartbeat"
  | "echo"
  | "thinking"
  | "surprised"
  | "sleepy"
  | "waking"
  | "purr";

export const GHOST_VOICE_FAMILIES: readonly GhostVoiceFamily[] = [
  "greeting",
  "play",
  "cheer",
  "heartbeat",
  "echo",
  "thinking",
  "surprised",
  "sleepy",
  "waking",
  "purr",
];

/** The timbre variant (Slice 24's Second Voice power-up). */
export type GhostVoiceVariant = "standard" | "second";

export interface GhostUtteranceInput {
  family: GhostVoiceFamily;
  /** The deciding decision's intensity (validator range 0.05–0.9). */
  intensity?: number;
  temperament?: GhostVoiceTemperament;
  /** The ghost's stamina reading, 0–100 (ghostVitals). */
  stamina?: number;
  /** Heartbeat family only: the ghost's live tempo (heartbeatBpm). */
  bpm?: number;
  voice?: GhostVoiceVariant;
}

/** One rendered tone of an utterance (the renderer's ToneSpec). */
export interface GhostTone {
  ratio: number;
  ratioEnd?: number;
  delayMs: number;
  durMs: number;
  type: OscillatorType;
  gain: number;
}

/** The purr's articulated parameters (the purr is a loop, not tones). */
export interface GhostPurrSpec {
  /** Base pitch factor under the ghost's base frequency. */
  baseFactor: number;
  /** Warble LFO rate, Hz. */
  lfoHz: number;
  /** Warble depth, as a fraction of the base frequency. */
  lfoDepth: number;
}

export interface GhostArticulation {
  family: GhostVoiceFamily;
  seed: number;
  /** The discrete skeleton this seed landed on (seed % skeletons). */
  variant: number;
  notes: GhostTone[];
  /** Per-utterance lowpass the renderer puts the voice through. */
  filterCutoffHz: number;
  filterQ: number;
  /** Present only for the purr family. */
  purr: GhostPurrSpec | null;
}

/* ------------------------------------------------------------------ */
/* The seeded random stream                                            */
/* ------------------------------------------------------------------ */

/** mulberry32 — a small, exact, seedable PRNG (integer-stable). */
export function ghostVoiceRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The per-utterance seed the hook derives: the ghost's hue folded
 * with the family and an ever-incrementing utterance counter, so
 * consecutive utterances from one ghost never share a seed — the
 * streak property (no two identical in a row) starts here.
 */
export function ghostUtteranceSeed(
  hue: number,
  family: GhostVoiceFamily,
  counter: number
): number {
  let h = 2166136261 >>> 0; // FNV-1a over the family name
  for (let i = 0; i < family.length; i++) {
    h ^= family.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const huePart = Math.round(((hue % 360) + 360) % 360) * 2654435761;
  return (h ^ huePart ^ Math.imul(counter + 1, 0x9e3779b9)) >>> 0;
}

/* ------------------------------------------------------------------ */
/* Family skeletons                                                    */
/* ------------------------------------------------------------------ */
/*
 * Each family's skeletons are its recognizable shapes — lists of
 * notes as (ratio, optional sweep target, duration, waveform,
 * gain), spaced by the family's gap. They grow out of the old
 * fixed cue map (noted per family), so the voice stays the
 * ghost's own; articulation then varies count (skeleton choice),
 * contour (wobble + temperament tilt), spacing, duration, and
 * waveform voicing around them. At least three skeletons per
 * family: the variant is seed % skeletons, so adjacent seeds
 * always change the discrete shape, not just the jitter.
 */
interface SkeletonNote {
  ratio: number;
  ratioEnd?: number;
  durMs: number;
  type: OscillatorType;
  gain: number;
}

interface FamilyDef {
  /** Base gap between note onsets, ms (jittered per utterance). */
  gapMs: number;
  skeletons: readonly (readonly SkeletonNote[])[];
}

const N = (
  ratio: number,
  durMs: number,
  type: OscillatorType = "triangle",
  gain = 1,
  ratioEnd?: number
): SkeletonNote => ({ ratio, durMs, type, gain, ratioEnd });

const FAMILIES: Record<Exclude<GhostVoiceFamily, "heartbeat" | "purr">, FamilyDef> = {
  // Was "sniff": two tiny ascending chirps (1.5, 1.85).
  greeting: {
    gapMs: 70,
    skeletons: [
      [N(1.5, 50), N(1.85, 45)],
      [N(1.4, 45), N(1.62, 45), N(1.9, 55)],
      [N(1.6, 55), N(1.8, 50)],
      [N(1.33, 45), N(1.78, 45), N(2.0, 60)],
    ],
  },
  // Was "play": a rising 3-note arpeggio (1.0, 1.25, 1.5).
  play: {
    gapMs: 58,
    skeletons: [
      [N(1.0, 65), N(1.25, 65), N(1.5, 80)],
      [N(1.0, 60), N(1.25, 60), N(1.5, 70), N(2.0, 90)],
      [N(1.25, 60), N(1.5, 60), N(1.25, 75)],
      [N(1.0, 55), N(1.33, 60), N(1.78, 85)],
    ],
  },
  // Was "heart": a warm two-note chime (1.0, 1.5) — the cheer
  // family: hearts, celebrations, the answered verb.
  cheer: {
    gapMs: 95,
    skeletons: [
      [N(1.0, 150, "sine"), N(1.5, 180, "sine", 0.9)],
      [N(1.0, 120, "sine"), N(1.25, 120, "sine"), N(1.5, 190, "sine", 0.95)],
      [N(1.5, 140, "sine", 0.9), N(2.0, 200, "sine", 0.85)],
      [N(1.0, 130, "sine"), N(1.33, 150, "sine"), N(1.6, 210, "sine", 0.9)],
    ],
  },
  // Was "mirror": one soft blip (1.2) — the echo family: tickle
  // answers and mirrored strokes, a voice answering a touch.
  echo: {
    gapMs: 80,
    skeletons: [
      [N(1.2, 60, "sine")],
      [N(1.2, 55, "sine"), N(1.2, 60, "sine", 0.6)],
      [N(1.33, 70, "sine")],
      [N(1.1, 50, "sine"), N(1.3, 65, "sine", 0.8)],
    ],
  },
  // New: the deliberation murmur — the ghost audibly pondering
  // while its brain consults. Soft, low, never an interruption.
  thinking: {
    gapMs: 85,
    skeletons: [
      [N(1.1, 70, "sine", 0.55), N(1.28, 80, "sine", 0.5)],
      [N(1.2, 90, "sine", 0.5)],
      [N(1.05, 60, "sine", 0.55), N(1.2, 60, "sine", 0.5), N(1.15, 80, "sine", 0.45)],
      [N(1.3, 75, "sine", 0.5), N(1.15, 85, "sine", 0.5)],
    ],
  },
  // Was "startle": one quick high squeak sweeping down (2.3->1.9).
  surprised: {
    gapMs: 70,
    skeletons: [
      [N(2.3, 90, "sine", 0.45, 1.9)],
      [N(2.5, 85, "sine", 0.45, 2.0)],
      [N(2.1, 80, "sine", 0.5, 2.4)],
      [N(2.4, 80, "sine", 0.45, 1.8), N(1.9, 60, "sine", 0.4)],
    ],
  },
  // Was "sleep": slow descending tones (1.2, 1.0, 0.8).
  sleepy: {
    gapMs: 128,
    skeletons: [
      [N(1.2, 140, "sine", 0.8), N(1.0, 140, "sine", 0.8), N(0.8, 170, "sine", 0.8)],
      [N(1.1, 150, "sine", 0.8), N(0.9, 180, "sine", 0.75)],
      [N(1.25, 130, "sine", 0.8), N(1.05, 140, "sine", 0.8), N(0.85, 160, "sine", 0.75), N(0.7, 200, "sine", 0.7)],
      [N(1.0, 160, "sine", 0.8), N(0.82, 190, "sine", 0.75)],
    ],
  },
  // Was "wake": the ascending version of sleep (0.8, 1.0, 1.2).
  waking: {
    gapMs: 102,
    skeletons: [
      [N(0.8, 110, "sine", 0.8), N(1.0, 110, "sine", 0.8), N(1.2, 130, "sine", 0.8)],
      [N(0.85, 120, "sine", 0.8), N(1.1, 140, "sine", 0.8)],
      [N(0.75, 100, "sine", 0.8), N(0.95, 110, "sine", 0.8), N(1.15, 120, "sine", 0.8), N(1.35, 150, "sine", 0.85)],
      [N(0.9, 120, "sine", 0.8), N(1.2, 150, "sine", 0.85)],
    ],
  },
};

/* ------------------------------------------------------------------ */
/* The variation law                                                   */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/** The tail tilt a temperament lays on an utterance's contour. */
function temperamentTilt(t: GhostVoiceTemperament | undefined): {
  tailRatio: number;
  durScale: number;
  flatten: number;
} {
  switch (t) {
    case "playful":
      return { tailRatio: 1.045, durScale: 0.94, flatten: 0 };
    case "curious":
      return { tailRatio: 1.025, durScale: 1, flatten: 0 };
    case "affectionate":
      return { tailRatio: 1.018, durScale: 1.08, flatten: 0 };
    case "sassy":
      return { tailRatio: 0.995, durScale: 0.96, flatten: 0.18 };
    case "sleepy":
      return { tailRatio: 0.955, durScale: 1.28, flatten: 0 };
    default:
      return { tailRatio: 1, durScale: 1, flatten: 0 };
  }
}

/** The Second Voice transform (Slice 24): a fourth up, sine<->triangle. */
function applyVoiceVariant(
  notes: GhostTone[],
  voice: GhostVoiceVariant
): GhostTone[] {
  if (voice !== "second") return notes;
  return notes.map((n) => ({
    ...n,
    ratio: n.ratio * (4 / 3),
    ratioEnd: n.ratioEnd ? n.ratioEnd * (4 / 3) : undefined,
    type:
      n.type === "triangle"
        ? "sine"
        : n.type === "sine"
          ? "triangle"
          : n.type,
  }));
}

/**
 * The heartbeat's articulation: lub-dub pairs AT the ghost's
 * live tempo — the same unequal strikes the heartbeat answer
 * splats (lub, a softer dub at +0.38 of a beat), given a voice.
 * The pair count and the dub's weight vary by seed; the spacing
 * never does — a heartbeat's honesty is its tempo.
 */
function articulateHeartbeat(
  input: GhostUtteranceInput,
  seed: number
): GhostArticulation {
  const rng = ghostVoiceRng(seed);
  const bpm = clamp(
    typeof input.bpm === "number" && Number.isFinite(input.bpm)
      ? input.bpm
      : 72,
    42,
    132
  );
  const beatMs = 60_000 / bpm;
  // 2 or 3 audible pairs — but a slow heart stays short: under
  // ~55bpm only 2 pairs render, so the answer never sprawls.
  const pairs = bpm < 55 ? 2 : 2 + (seed % 2);
  const dubGain = 0.68 + rng() * 0.12;
  const wobble = 1 + (rng() - 0.5) * 0.03;
  const notes: GhostTone[] = [];
  for (let p = 0; p < pairs; p++) {
    const start = p * beatMs * 1.76; // lub + dub + a full rest beat
    notes.push({
      ratio: 0.5 * wobble,
      delayMs: Math.round(start),
      durMs: Math.round(beatMs * 0.3),
      type: "sine",
      gain: 1,
    });
    notes.push({
      ratio: 0.5 * wobble,
      delayMs: Math.round(start + 0.38 * beatMs),
      durMs: Math.round(beatMs * 0.26),
      type: "sine",
      gain: dubGain,
    });
  }
  return {
    family: "heartbeat",
    seed,
    variant: seed % 2,
    notes: applyVoiceVariant(notes, input.voice ?? "standard"),
    filterCutoffHz: 900,
    filterQ: 0.7,
    purr: null,
  };
}

/** The purr's articulation: a warble with a seed's own character. */
function articulatePurr(
  input: GhostUtteranceInput,
  seed: number
): GhostArticulation {
  const rng = ghostVoiceRng(seed);
  const tired =
    typeof input.stamina === "number" && input.stamina < 40 ? 0.9 : 1;
  const purr: GhostPurrSpec = {
    baseFactor:
      0.5 * (0.96 + rng() * 0.08) * (input.voice === "second" ? 4 / 3 : 1),
    lfoHz: (7.5 + rng() * 3) * tired,
    lfoDepth: 0.035 + rng() * 0.025,
  };
  return {
    family: "purr",
    seed,
    variant: seed % 4,
    notes: [],
    filterCutoffHz: 1200,
    filterQ: 0.7,
    purr,
  };
}

/**
 * Articulate one utterance. Pure and total: any input yields a
 * renderable spec; the same (input, seed) yields the identical
 * spec; a different seed yields a different one.
 */
export function articulateGhostUtterance(
  input: GhostUtteranceInput,
  seed: number
): GhostArticulation {
  const s = seed >>> 0;
  if (input.family === "heartbeat") return articulateHeartbeat(input, s);
  if (input.family === "purr") return articulatePurr(input, s);

  const def = FAMILIES[input.family];
  const rng = ghostVoiceRng(s);
  const variant = s % def.skeletons.length;
  const skeleton = def.skeletons[variant];
  const intensity = clamp(
    typeof input.intensity === "number" && Number.isFinite(input.intensity)
      ? input.intensity
      : 0.5,
    0.05,
    0.9
  );
  const stamina =
    typeof input.stamina === "number" && Number.isFinite(input.stamina)
      ? clamp(input.stamina, 0, 100)
      : 100;
  const tilt = temperamentTilt(input.temperament);

  // Rhythm: one gap scale per utterance + a per-gap jitter, so
  // the phrase breathes as a phrase, not as independent blips.
  const gapScale = 0.85 + rng() * 0.4;
  let gainScale = 0.6 + 0.65 * intensity;
  let durScale = tilt.durScale;
  if (stamina < 40) {
    gainScale *= 0.8;
    durScale *= 1.15;
  }
  if (stamina <= 20) gainScale *= 0.75;

  const notes: GhostTone[] = [];
  let at = 0;
  skeleton.forEach((note, i) => {
    if (i > 0) at += def.gapMs * gapScale * (0.8 + rng() * 0.45);
    const wobble = 1 + (rng() - 0.5) * 0.05;
    let ratio = note.ratio * wobble;
    let ratioEnd = note.ratioEnd
      ? note.ratioEnd * (1 + (rng() - 0.5) * 0.05)
      : undefined;
    if (tilt.flatten > 0) {
      ratio = 1 + (ratio - 1) * (1 - tilt.flatten);
      if (ratioEnd) ratioEnd = 1 + (ratioEnd - 1) * (1 - tilt.flatten);
    }
    if (i === skeleton.length - 1) {
      ratio *= tilt.tailRatio;
      if (ratioEnd) ratioEnd *= tilt.tailRatio;
    }
    notes.push({
      ratio,
      ratioEnd,
      delayMs: Math.round(at),
      durMs: Math.max(30, Math.round(note.durMs * durScale * (0.85 + rng() * 0.35))),
      type: note.type,
      gain: note.gain * gainScale * (0.9 + rng() * 0.2),
    });
  });

  // A big moment earns one more chirp on the voice-led families:
  // high intensity appends a top note a fourth above the last.
  if (
    intensity >= 0.7 &&
    (input.family === "play" || input.family === "cheer") &&
    notes.length > 0 &&
    notes.length < 5
  ) {
    const last = notes[notes.length - 1];
    notes.push({
      ratio: last.ratio * 1.25,
      delayMs: Math.round(last.delayMs + def.gapMs * gapScale),
      durMs: last.durMs,
      type: last.type,
      gain: last.gain * 0.85,
    });
  }

  // A tired ghost trails off: below the tired line the last
  // chirp may drop away entirely (the seed decides, so the same
  // tired moment always trails the same way).
  if (stamina < 40 && notes.length > 2 && rng() < 0.7) {
    notes.pop();
  }

  return {
    family: input.family,
    seed: s,
    variant,
    notes: applyVoiceVariant(notes, input.voice ?? "standard"),
    filterCutoffHz: Math.round(
      (750 + 3900 * intensity) * (0.8 + rng() * 0.45)
    ),
    filterQ: 0.8,
    purr: null,
  };
}

/* ------------------------------------------------------------------ */
/* The reachability maps                                               */
/* ------------------------------------------------------------------ */
/*
 * Which family each live trigger speaks in. The cue map covers
 * every GhostSfxKind the hook can be asked to play (mirrored
 * from useGhostSfx by hand; the check asserts the two lists
 * agree). The intent map covers the deliberation vocabulary:
 * draw is visual and a played note IS its sound, so those two
 * are honestly silent here; drift and idle are presence, not
 * utterance — the ghost moves, it does not announce drifting.
 */

export const GHOST_CUE_FAMILIES: Record<string, GhostVoiceFamily> = {
  sniff: "greeting",
  play: "play",
  heart: "cheer",
  heartbeat: "heartbeat",
  mirror: "echo",
  startle: "surprised",
  sleep: "sleepy",
  wake: "waking",
  thinking: "thinking",
};

export function ghostFamilyForCue(kind: string): GhostVoiceFamily {
  return GHOST_CUE_FAMILIES[kind] ?? "echo";
}

export const GHOST_INTENT_FAMILIES: Record<string, GhostVoiceFamily | null> = {
  sniff: "greeting",
  play: "play",
  heart: "cheer",
  mirror: "echo",
  startle: "surprised",
  nap: "sleepy",
  drift: null,
  idle: null,
  draw: null,
  "play-note": null,
};
