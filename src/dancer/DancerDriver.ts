/**
 * DancerDriver — the Frequency Dancer's brain (spike v0).
 *
 * Terrell's challenge (fabric-world-model.md): a swappable character
 * whose body is PLAYED by the music. Note range maps down the body —
 * high notes to the head, low notes to the feet; velocity sets how
 * big the movement is; every movement starts from the note's
 * direction and then slowly reverses back to rest. This driver is
 * that mapping, as pure framework-free logic: it consumes note events
 * and produces a per-band pose. It knows nothing about React, DOM, or
 * rigs — which is the point (see THE GLTF SEAM below).
 *
 * ---- The band map ------------------------------------------------
 *
 * The piano layer's range is C3 (MIDI 48) – C5 (72); the map covers
 * it in six bands and clamps outside it, so hardware notes beyond
 * the on-screen keys still land somewhere sensible:
 *
 *   band    MIDI     body              glTF bone group (contract)
 *   ------  -------  ----------------  --------------------------
 *   head    68–127   head + neck       neck_01, head
 *   chest   64–67    chest             spine_02
 *   arms    60–63    arms              upperarm_l/r, lowerarm_l/r
 *   torso   56–59    torso / waist     spine_01
 *   hips    52–55    hips              pelvis
 *   legs    0–51     legs + feet       thigh_l/r, calf_l/r, foot_l/r
 *
 * ---- Motion model --------------------------------------------------
 *
 * Impulse + spring, per band. A note-on KICKS the band's spring:
 * amplitude from velocity, direction from the melody (below). The
 * spring is slightly underdamped, so the band swings out, eases
 * back THROUGH rest with a small overshoot, and settles — Terrell's
 * "moves, then slowly reverses back to its starting position," with
 * no lingering poses. Note-off does not cut motion off (a struck
 * limb finishes its swing); it only lets the band's glow fade.
 * Bands are independent: a chord kicks several bands in the same
 * instant and the whole body dances at once.
 *
 * Direction rule: if the previous note-on (any band, within 1.5 s)
 * was a different pitch, the kick follows the melodic direction —
 * ascending line leans +, descending leans −. Otherwise (repeated
 * note, or a cold start) the direction alternates per band on each
 * hit, so a vamp on one note grooves side to side instead of
 * twitching the same way forever.
 *
 * ---- Idle ----------------------------------------------------------
 *
 * Slice 7's idle contract: a layer component must declare what it
 * does when nobody is playing. The dancer's answer is `breathe` —
 * tick() always advances a slow breath phase (~4.5 s period) that
 * the renderer maps to a barely-there sway and scale, so at rest
 * the figure is alive, not frozen. It reacts to events instantly
 * because a kick lands on the same springs the breath rides.
 *
 * ---- THE GLTF SEAM (asset contract) --------------------------------
 *
 * Terrell's real characters arrive as glTF (Unreal exports). A rig
 * adapter consumes EXACTLY what this driver already exposes:
 *
 *   driver.getBandState(): BandState[] — per band:
 *     id      the band key above
 *     bones   the bone-group names from the table (the adapter maps
 *             these onto the rig's actual bone names — Mixamo,
 *             Unreal mannequin, custom — in ONE place)
 *     offset  signed swing, roughly -1..1 (0 = rest pose). The
 *             adapter turns this into rotation around the band's
 *             primary axis (its choice per band: head yaw, arm
 *             swing, hip sway, leg bounce…)
 *     energy  0..1 — how hard the band is firing right now; the
 *             adapter may use it for secondary motion / emissive.
 *     hue     0..360 chromatic hue of the last note in the band.
 *     held    notes currently held in the band.
 *
 * The placeholder puppet in FrequencyDancer.tsx is one consumer of
 * that state; a GlTFDancer driven by R3F useFrame calling
 * driver.tick() is the next one, with zero driver changes.
 *
 * Powered by Nirvana
 */

export type DancerBandId = "head" | "chest" | "arms" | "torso" | "hips" | "legs";

export interface DancerBandDef {
  id: DancerBandId;
  label: string;
  /** Inclusive MIDI range for this band. */
  min: number;
  max: number;
  /** glTF bone-group contract — see the seam note above. */
  bones: string[];
}

export const DANCER_BANDS: DancerBandDef[] = [
  { id: "head", label: "Head · neck", min: 68, max: 127, bones: ["neck_01", "head"] },
  { id: "chest", label: "Chest", min: 64, max: 67, bones: ["spine_02"] },
  {
    id: "arms",
    label: "Arms",
    min: 60,
    max: 63,
    bones: ["upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"],
  },
  { id: "torso", label: "Torso · waist", min: 56, max: 59, bones: ["spine_01"] },
  { id: "hips", label: "Hips", min: 52, max: 55, bones: ["pelvis"] },
  {
    id: "legs",
    label: "Legs · feet",
    min: 0,
    max: 51,
    bones: ["thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r"],
  },
];

export function bandForNote(midi: number): DancerBandDef {
  for (const b of DANCER_BANDS) {
    if (midi >= b.min && midi <= b.max) return b;
  }
  return midi < 48 ? DANCER_BANDS[DANCER_BANDS.length - 1] : DANCER_BANDS[0];
}

/**
 * Scientific pitch name ("C#4") -> MIDI number. Same parsing the
 * piano pipeline uses (useMIDIFluid's noteNameToNumber): noteBus
 * names are sharps-only, produced by useMIDI / the on-screen keys.
 */
export function noteNameToMidi(note: string): number {
  const m = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return 60;
  const base = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const idx = base.indexOf(m[1]);
  const octave = parseInt(m[2], 10);
  return (octave + 1) * 12 + idx;
}

/** Chromatic hue (0..360), matching useMIDIFluid's chromatic map. */
export function noteHue(midi: number): number {
  return ((midi % 12) + 12) % 12 * 30;
}

export interface BandState {
  id: DancerBandId;
  bones: string[];
  /** Signed swing, ~-1..1. 0 = rest. */
  offset: number;
  /** 0..1 — how hard the band is firing (glow / secondary motion). */
  energy: number;
  /** Chromatic hue of the last note that hit this band. */
  hue: number;
  /** Notes currently held in this band. */
  held: number;
}

export interface DancerPose {
  bands: BandState[];
  /** -1..1 slow idle sway phase (the `breathe` idle behavior). */
  breath: number;
}

interface BandRuntime {
  def: DancerBandDef;
  x: number; // spring position (the offset)
  v: number; // spring velocity
  energy: number;
  hue: number;
  held: Set<number>;
  hits: number;
  lastDir: number;
}

// Spring tuning: stiffness 55 / damping 7.5 is underdamped
// (zeta ~0.5) — a kick swings out in ~150 ms, overshoots slightly
// on the way back, and is settled within ~1.2 s. Slow enough to
// read as "reversing back to start," fast enough to dance at tempo.
const SPRING_K = 55;
const SPRING_C = 7.5;
// Kick scale: a full-velocity note peaks near offset ±1.
const KICK = 10.5;
// Glow decay time constant once a band stops being fed.
const ENERGY_TAU_MS = 450;
// Melodic direction only counts if the last note is this fresh.
const MELODY_WINDOW_MS = 1500;
// Breath: one slow cycle ≈ 4.5 s.
const BREATH_HZ = 0.22;

export class DancerDriver {
  private bands: BandRuntime[];
  private lastMidi: number | null = null;
  private lastNoteAt = -Infinity;
  private lastTickAt: number | null = null;
  private breathPhase = 0;

  constructor() {
    this.bands = DANCER_BANDS.map((def) => ({
      def,
      x: 0,
      v: 0,
      energy: 0,
      hue: 190,
      held: new Set<number>(),
      hits: 0,
      lastDir: 1,
    }));
  }

  private runtime(midi: number): BandRuntime {
    const def = bandForNote(midi);
    return this.bands.find((b) => b.def.id === def.id)!;
  }

  /** A note strikes. `now` is ms (Date.now-style); injectable for tests. */
  noteOn(midi: number, velocity = 0.8, now: number = Date.now()): BandState {
    const band = this.runtime(midi);
    const amp = Math.max(0.05, Math.min(1, velocity));

    // Direction: melodic contour first, per-band alternation second.
    let dir: number;
    if (
      this.lastMidi !== null &&
      midi !== this.lastMidi &&
      now - this.lastNoteAt <= MELODY_WINDOW_MS
    ) {
      dir = midi > this.lastMidi ? 1 : -1;
    } else {
      dir = band.hits % 2 === 0 ? 1 : -1;
    }
    band.hits += 1;
    band.lastDir = dir;
    band.v += dir * amp * KICK;
    band.energy = Math.max(band.energy, amp);
    band.hue = noteHue(midi);
    band.held.add(midi);
    this.lastMidi = midi;
    this.lastNoteAt = now;
    return this.snapshotBand(band);
  }

  /** Release: the swing finishes on its spring; only glow/held change. */
  noteOff(midi: number): void {
    this.runtime(midi).held.delete(midi);
  }

  /**
   * Feed one noteBus-shaped event ({type, note(name), velocity}).
   * The component glue is exactly this call — local and remote bus
   * events alike, since both are already on the bus.
   */
  handleNoteEvent(e: { type: "on" | "off"; note: string; velocity?: number }, now?: number): void {
    const midi = noteNameToMidi(e.note);
    if (e.type === "on") this.noteOn(midi, e.velocity ?? 0.8, now);
    else this.noteOff(midi);
  }

  /** Advance springs + breath to `now`; returns the current pose. */
  tick(now: number = Date.now()): DancerPose {
    if (this.lastTickAt === null) this.lastTickAt = now;
    const dtMs = Math.max(0, Math.min(50, now - this.lastTickAt));
    this.lastTickAt = now;
    const dt = dtMs / 1000;

    if (dt > 0) {
      for (const b of this.bands) {
        const acc = -SPRING_K * b.x - SPRING_C * b.v;
        b.v += acc * dt;
        b.x += b.v * dt;
        const decay = Math.exp(-dtMs / ENERGY_TAU_MS);
        b.energy *= decay;
        if (b.held.size > 0) b.energy = Math.max(b.energy, 0.35);
        if (Math.abs(b.x) < 0.0005 && Math.abs(b.v) < 0.0005) {
          b.x = 0;
          b.v = 0;
        }
      }
      this.breathPhase += dt * BREATH_HZ * Math.PI * 2;
    }

    return {
      bands: this.bands.map((b) => this.snapshotBand(b)),
      breath: Math.sin(this.breathPhase),
    };
  }

  /** The glTF adapter contract — see the header's seam note. */
  getBandState(): BandState[] {
    return this.bands.map((b) => this.snapshotBand(b));
  }

  private snapshotBand(b: BandRuntime): BandState {
    return {
      id: b.def.id,
      bones: b.def.bones,
      offset: Math.max(-1.4, Math.min(1.4, b.x)),
      energy: Math.max(0, Math.min(1, b.energy)),
      hue: b.hue,
      held: b.held.size,
    };
  }
}
