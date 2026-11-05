/**
 * The Chorale (Slice 70) — ghosties that hear each other sing.
 *
 * A near-verbatim TypeScript port of Pollen Robotics' MicroDuck
 * chorale (github.com/pollen-robotics/microduck — sounds/src/
 * chorale/{mod,beat}.rs, robotd/src/chorale.rs, and the
 * ChoraleBeacon wire contract in duck-ipc-proto), adapted to
 * Fabric's rail per SLICE-70-PLAN.md:
 *
 *   - The TRANSPORT is rewritten: the ducks ride BLE
 *     advertisements (browsers cannot advertise); Fabric rides
 *     a `chorale` frame kind on the existing session socket.
 *     The frame keeps the beacon's minimalism by discipline —
 *     no timestamps, no seed — and adds only what generative
 *     parts require and a byte budget forbade the ducks: the
 *     conductor's musical framing (scale / tonic / tempo),
 *     which followers adopt while following (plan §3).
 *   - The PIECE byte becomes a performance EPOCH: Fabric has
 *     no fixed scores (Slice 68's phrases are authored, not
 *     written), so `piece` increments on each new performance
 *     the conductor starts; 0 still means "willing, idle."
 *     Restart detection (piece change / backwards beat) is the
 *     ducks' own, unchanged.
 *   - The SYNC BUDGET is honest web math, not the ducks' BLE
 *     number: phrase-START agreement within ±½ beat after
 *     lock. The ±20 ms note-level budget is a native-shell
 *     refinement and is claimed nowhere here.
 *
 * Everything in this module is pure and clock-injected — no
 * React, no socket, no timers — so the check harness drives it
 * headlessly exactly the way beat.rs's own tests drive the
 * Rust. The one impure seam is the heard-frame bus at the
 * bottom (the genxStore pattern): the session hook deposits
 * sanitized inbound frames; the ghost hook forwards them to
 * its peer, which feeds them here as a sense.
 *
 * Peer identity law (the ducks' scar, ported verbatim in
 * spirit): peers are keyed by BEACON ID — derived from the
 * seed by a multiplicative mix, the seed itself never on the
 * wire — never by socket or connection id.
 *
 * Powered by Nirvana
 */

/* ------------------------------------------------------------------ */
/* Constants — the ducks' numbers, kept                            */
/* ------------------------------------------------------------------ */

/** Phase-average window: the last N heard beats (beat.rs). */
export const CHORALE_WINDOW = 24;
/** Observations further than this from the fit are dropped. */
export const CHORALE_OUTLIER_S = 0.2;
/** A follower sings only after hearing at least this many beats. */
export const CHORALE_LOCK_BEATS = 4;
/** Listening this long before concluding you may conduct. */
export const CHORALE_SETTLE_S = 1.5;
/** A peer (or a conductor) unheard this long is gone. */
export const CHORALE_PEER_STALE_S = 3;
/** The IDLE beacon's beat byte turns over on this cadence, so
 *  a payload that never changed still gets noticed. */
export const CHORALE_HEARTBEAT_S = 1.5;
/** Seated singers, the ducks' number. A 5th ghostie listens. */
export const CHORALE_MAX_ROSTER = 4;
/** Register byte range: pitch centre 100–625 Hz in 255 steps. */
export const CHORALE_REGISTER_MIN_HZ = 100;
export const CHORALE_REGISTER_MAX_HZ = 625;
/** Default self-delay the conductor applies to its own position
 *  (the relay-slot mean estimate; beat.rs's SLOT_MEAN_S role).
 *  Configurable — a later slice can make it adaptive from
 *  measured relay round-trips. */
export const CHORALE_DEFAULT_SELF_DELAY_S = 0.15;

/* ------------------------------------------------------------------ */
/* Identity derivations — the seed stays home                      */
/* ------------------------------------------------------------------ */

/**
 * The beacon id: the seed multiplicatively mixed (Knuth) and
 * read from the top bits, exactly robotd's derivation. The
 * seed itself is never transmitted; this u16 is the peer-merge
 * key and the own-reflection filter.
 */
export function choraleIdForSeed(seed: number): number {
  return (Math.imul(seed | 0, 2654435761) >>> 16) & 0xffff;
}

/** Deterministic PRNG (mulberry32 — the ghost module family's). */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The register byte: the ghost's pitch centre, derived from
 * its seed (Slice 71 makes this the same derivation the voice
 * uses; until then the chorale owns it) and quantised to a
 * byte over 100–625 Hz, the beacon's contract.
 */
export function choraleRegisterByteForSeed(seed: number): number {
  const rand = mulberry32((seed | 0) ^ 0xbee5);
  const hz = 110 + rand() * (620 - 110);
  return Math.min(
    255,
    Math.max(
      0,
      Math.round(
        ((hz - CHORALE_REGISTER_MIN_HZ) /
          (CHORALE_REGISTER_MAX_HZ - CHORALE_REGISTER_MIN_HZ)) *
          255
      )
    )
  );
}

/** A register byte read back as Hz (the value casting consumes). */
export function choraleRegisterHz(byte: number): number {
  return (
    CHORALE_REGISTER_MIN_HZ +
    (Math.min(255, Math.max(0, Math.round(byte))) / 255) *
      (CHORALE_REGISTER_MAX_HZ - CHORALE_REGISTER_MIN_HZ)
  );
}

/* ------------------------------------------------------------------ */
/* Parts and seating — sounds/src/chorale/mod.rs, as shipped       */
/* ------------------------------------------------------------------ */

export type ChoralePart = "bass" | "tenor" | "alto" | "soprano";

/** Reference registers (MIDI) — casting measures distance here. */
export const CHORALE_PART_REF_MIDI: Record<ChoralePart, number> = {
  bass: 51,
  tenor: 58,
  alto: 63,
  soprano: 68,
};

const PARTS_BY_REF: readonly ChoralePart[] = [
  "bass",
  "tenor",
  "alto",
  "soprano",
];

/**
 * The ensemble for n singers — NESTED sets, as shipped:
 * {S} ⊂ {B,S} ⊂ {B,A,S} ⊂ {B,T,A,S}. A duet is melody over a
 * bass line, not two voices in one octave; nesting is what
 * guarantees exactly one free part for a joiner.
 */
export function choraleEnsembleParts(n: number): ChoralePart[] {
  if (n <= 1) return ["soprano"];
  if (n === 2) return ["bass", "soprano"];
  if (n === 3) return ["bass", "alto", "soprano"];
  return ["bass", "tenor", "alto", "soprano"];
}

/**
 * seat_all — THE derivation every ghostie replays over the
 * conductor's roster: sort roster positions by register (ties
 * keep roster order), hand out the ensemble's parts in
 * register order (lowest voice → lowest part), return parts
 * in roster order.
 *
 * Ported as shipped, including its wrinkle (the mod.rs
 * postmortem): a joiner arriving BELOW the current bass shifts
 * one part — the accepted price of everybody on the right
 * line. The radio path uses seat_all; so does Fabric.
 */
export function seatAll(registers: readonly number[]): ChoralePart[] {
  const n = registers.length;
  if (n === 0) return [];
  const parts = choraleEnsembleParts(n)
    .slice()
    .sort(
      (a, b) => CHORALE_PART_REF_MIDI[a] - CHORALE_PART_REF_MIDI[b]
    );
  const order = registers
    .map((register, index) => ({ register, index }))
    .sort((a, b) => a.register - b.register || a.index - b.index);
  const out = new Array<ChoralePart>(n);
  order.forEach((entry, k) => {
    out[entry.index] = parts[Math.min(k, parts.length - 1)];
  });
  return out;
}

/* CRC-32 (IEEE) — variant_rng's sub-seed hash. CRC specifically:
 * std hashers are per-process salted and would re-roll every
 * variant on every regeneration; a CRC is the same everywhere. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

export function choraleCrc32(text: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) {
    crc = CRC_TABLE[(crc ^ text.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A singer's spread for its seat: detune (±5 cents) and onset
 * offset (±15 ms), derived from a CRC32-tagged sub-RNG of the
 * ghost's seed — the same duck brings the same spread to the
 * same line every time, and the ensemble sounds like a choir
 * rather than one thick organ stop.
 */
export function choraleSeatSpread(
  seed: number,
  part: ChoralePart
): { detuneCents: number; onsetMs: number } {
  const rand = mulberry32(choraleCrc32(`chorale-seat:${seed | 0}:${part}`));
  return {
    detuneCents: Math.round((rand() * 10 - 5) * 10) / 10,
    onsetMs: Math.round(rand() * 30 - 15),
  };
}

/* ------------------------------------------------------------------ */
/* The frame — ChoraleBeacon's shape, JSON on the relay            */
/* ------------------------------------------------------------------ */

export interface ChoraleRosterEntry {
  /** Register byte (pitch centre, quantised). */
  register: number;
  /** Beacon id (mixed seed — never the seed). */
  id: number;
}

/**
 * One chorale frame. `piece` is the performance epoch
 * (0 = willing, idle; >0 = a performance the sender conducts).
 * `beat` is the conductor's beat counter, wrapping u8 — there
 * is deliberately NO timestamp: the arrival of a new counter
 * value is the downbeat. `roster` is the conductor's seating,
 * in roster order (empty on IDLE frames). The framing fields
 * ride only on a conductor's singing frames.
 */
export interface ChoraleFrame {
  piece: number;
  beat: number;
  register: number;
  id: number;
  roster: ChoraleRosterEntry[];
  scale?: string;
  tonic_midi?: number;
  tempo_bpm?: number;
}

const KNOWN_SCALES = new Set(["ionian", "dorian", "mixolydian", "minor"]);

const byteOr = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(255, Math.max(0, Math.round(v)))
    : null;

/**
 * Clamp an unknown wire value to a ChoraleFrame, or null when
 * it is not one — frames are untrusted wire data like every
 * other session payload, and a malformed one is dropped, never
 * guessed at (btd's beacon_in discipline).
 */
export function sanitizeChoraleFrame(raw: unknown): ChoraleFrame | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const piece = byteOr(rec.piece);
  const beat = byteOr(rec.beat);
  const register = byteOr(rec.register);
  const id =
    typeof rec.id === "number" && Number.isFinite(rec.id)
      ? Math.min(0xffff, Math.max(0, Math.round(rec.id)))
      : null;
  if (piece === null || beat === null || register === null || id === null) {
    return null;
  }
  const roster: ChoraleRosterEntry[] = [];
  if (rec.roster !== undefined) {
    if (!Array.isArray(rec.roster)) return null;
    for (const item of rec.roster.slice(0, CHORALE_MAX_ROSTER)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const e = item as Record<string, unknown>;
      const r = byteOr(e.register);
      const i =
        typeof e.id === "number" && Number.isFinite(e.id)
          ? Math.min(0xffff, Math.max(0, Math.round(e.id)))
          : null;
      if (r === null || i === null) return null;
      roster.push({ register: r, id: i });
    }
  }
  const frame: ChoraleFrame = { piece, beat, register, id, roster };
  if (typeof rec.scale === "string" && KNOWN_SCALES.has(rec.scale)) {
    frame.scale = rec.scale;
  }
  if (
    typeof rec.tonic_midi === "number" &&
    Number.isFinite(rec.tonic_midi)
  ) {
    frame.tonic_midi = Math.min(127, Math.max(0, Math.round(rec.tonic_midi)));
  }
  if (typeof rec.tempo_bpm === "number" && Number.isFinite(rec.tempo_bpm)) {
    frame.tempo_bpm = Math.min(180, Math.max(40, Math.round(rec.tempo_bpm)));
  }
  return frame;
}

/* ------------------------------------------------------------------ */
/* Beat lock — sounds/src/chorale/beat.rs, near-verbatim           */
/* ------------------------------------------------------------------ */

/**
 * The conductor's clock. Pure functions of time; the beat is
 * counted, never polled into existence.
 */
export class ChoraleConductor {
  private emitted: number | null = null;

  constructor(
    readonly beatSec: number,
    readonly startedAtSec: number,
    readonly slotMeanSec: number = CHORALE_DEFAULT_SELF_DELAY_S
  ) {}

  /** The current beat number, once it has actually turned over. */
  due(nowSec: number): number | null {
    const n = Math.floor((nowSec - this.startedAtSec) / this.beatSec);
    if (this.emitted === null || n !== this.emitted) {
      this.emitted = n;
      return n;
    }
    return null;
  }

  /** The counter as a wire byte. The state machine calls
   *  due() before reading this on every tick, so the emitted
   *  count is always current. */
  wireBeat(): number {
    return ((this.emitted ?? 0) & 0xff) >>> 0;
  }

  /**
   * Where the room HEARS the performance: deliberately behind
   * the counter by the slot mean — the conductor sings what
   * the room is hearing, so its error is common-mode with the
   * followers' rather than early by default.
   */
  positionBeats(nowSec: number): number {
    return (nowSec - this.startedAtSec - this.slotMeanSec) / this.beatSec;
  }
}

/**
 * The follower's lock: exactly one measured number — where
 * the conductor's beat 0 landed, averaged over the last
 * WINDOW heard beats. The tempo is NEVER estimated (the first
 * Rust version fitted a line through (beat, arrival) and was
 * measurably ~4× worse at the window's edge); it comes from
 * the shared framing both sides read.
 *
 * Silence is not silence: a follower that hears nothing holds
 * its phase and free-runs at the framing tempo, and re-locks
 * on the conductor's return without a jump.
 */
export class ChoraleFollower {
  private heard: { beat: number; at: number }[] = [];
  private lastByte: number | null = null;
  private lastCount = 0;

  constructor(readonly beatSec: number) {}

  /**
   * The signed step from the last heard byte to this one
   * (the ±128 unwrap), or null when nothing has been heard —
   * the state machine reads restarts off this before feeding.
   */
  peekDelta(byte: number): number | null {
    if (this.lastByte === null) return null;
    const raw = (((byte - this.lastByte) % 256) + 256) % 256;
    return raw > 128 ? raw - 256 : raw;
  }

  /** Feed one NEW counter value (re-reads are filtered above). */
  hear(byte: number, atSec: number): void {
    let count: number;
    if (this.lastByte === null) {
      count = byte;
    } else {
      const delta = this.peekDelta(byte) ?? 0;
      count = this.lastCount + delta;
    }
    this.lastByte = byte;
    this.lastCount = count;
    // Outlier guard: an observation far from the current fit
    // is dropped, not averaged — a queued read would otherwise
    // drag the fit further than good beats pull it back. The
    // guard arms once a fit exists worth defending.
    if (this.heard.length >= CHORALE_LOCK_BEATS) {
      const predicted = this.phase() + count * this.beatSec;
      if (Math.abs(atSec - predicted) > CHORALE_OUTLIER_S) return;
    }
    this.heard.push({ beat: count, at: atSec });
    if (this.heard.length > CHORALE_WINDOW) this.heard.shift();
  }

  /** Where beat 0 landed, averaged over the window. */
  private phase(): number {
    if (this.heard.length === 0) return 0;
    let sum = 0;
    for (const h of this.heard) sum += h.at - h.beat * this.beatSec;
    return sum / this.heard.length;
  }

  /** Locked = heard at least a bar's worth of beats. */
  locked(): boolean {
    return this.heard.length >= CHORALE_LOCK_BEATS;
  }

  /** The fit's σ — the diagnostic that separates a lock from
   *  hearing a second conductor. */
  spreadS(): number {
    if (this.heard.length === 0) return 0;
    const phase = this.phase();
    let sum = 0;
    for (const h of this.heard) {
      const r = h.at - (phase + h.beat * this.beatSec);
      sum += r * r;
    }
    return Math.sqrt(sum / this.heard.length);
  }

  /** Shared position, in beats (fractional). Free-runs on
   *  silence from the held phase. */
  positionBeats(nowSec: number): number {
    if (this.heard.length === 0) return 0;
    return (nowSec - this.phase()) / this.beatSec;
  }
}

/* ------------------------------------------------------------------ */
/* The state machine — robotd/src/chorale.rs, near-verbatim        */
/* ------------------------------------------------------------------ */

/** The conductor's musical framing, shared by the performance. */
export interface ChoraleFraming {
  scale: string;
  tempoBpm: number;
  tonicMidi: number | null;
}

export type ChoraleStateName = "off" | "listening" | "conducting" | "following";

/** A performance this ghostie is part of, read at tick time. */
export interface ChoraleSinging {
  /** This ghostie's derived part. */
  part: ChoralePart;
  /** Singers actually heard (a departed seat goes unsung). */
  voices: number;
  /** Shared position in beats (fractional), on the room's clock. */
  positionBeats: number;
  /** True when THIS ghostie conducts. */
  conducting: boolean;
  /** Seconds per beat under the performance's framing. */
  beatSec: number;
  /** The performance's framing (the conductor's, adopted). */
  framing: ChoraleFraming;
}

export interface ChoraleTickResult {
  state: ChoraleStateName;
  /** A frame to put on the air — non-null ONLY when it changed
   *  (publish-on-change; robotd resends the beacon only when it
   *  changes, and so do we). */
  advertise: ChoraleFrame | null;
  /** The live performance, when this ghostie is seated in one
   *  and (as a follower) locked. Null = not singing. */
  singing: ChoraleSinging | null;
}

interface PeerSighting {
  register: number;
  lastSeenSec: number;
  lastFrame: ChoraleFrame;
  firstHeardAtSec: number;
  /** When this peer was first seen SINGING (piece != 0). */
  firstSingingAtSec: number | null;
}

type ChoraleState =
  | { name: "off" }
  | { name: "listening"; sinceSec: number }
  | {
      name: "conducting";
      conductor: ChoraleConductor;
      roster: ChoraleRosterEntry[];
      framing: ChoraleFraming;
      piece: number;
    }
  | {
      name: "following";
      follower: ChoraleFollower;
      conductorId: number;
      piece: number;
      roster: ChoraleRosterEntry[];
      framing: ChoraleFraming;
      lastConductorAtSec: number;
      sinceSec: number;
    };

const DEFAULT_FRAMING: ChoraleFraming = {
  scale: "ionian",
  tempoBpm: 100,
  tonicMidi: null,
};

export class Chorale {
  readonly id: number;
  readonly registerByte: number;
  private readonly seed: number;
  private readonly selfDelaySec: number;
  private state: ChoraleState = { name: "off" };
  private peers = new Map<number, PeerSighting>();
  /** The local ghost's standing framing (the host's music
   *  request), used when this ghostie conducts. */
  private framingIn: ChoraleFraming | null = null;
  /** Performance epoch counter — increments per performance
   *  this ghostie starts; never 0 (0 is IDLE). */
  private epoch = 0;
  private lastPublishedJson: string | null = null;

  constructor(options: { seed: number; selfDelaySec?: number }) {
    this.seed = options.seed | 0;
    this.id = choraleIdForSeed(this.seed);
    this.registerByte = choraleRegisterByteForSeed(this.seed);
    this.selfDelaySec =
      options.selfDelaySec ?? CHORALE_DEFAULT_SELF_DELAY_S;
  }

  get stateName(): ChoraleStateName {
    return this.state.name;
  }

  /** This ghostie's own seat entry. */
  private selfEntry(): ChoraleRosterEntry {
    return { register: this.registerByte, id: this.id };
  }

  /**
   * The opt-in gate (chorale.accept's two faces): active =
   * willing. In Off a ghostie is silent AND invisible — it
   * advertises nothing and heard frames are ignored on the
   * floor. Presence is consensual or it is silent.
   */
  setActive(active: boolean, nowSec: number): void {
    if (active) {
      if (this.state.name === "off") {
        this.state = { name: "listening", sinceSec: nowSec };
        this.lastPublishedJson = null;
      }
    } else {
      this.state = { name: "off" };
      this.peers.clear();
      this.lastPublishedJson = null;
    }
  }

  /**
   * The host's standing music framing (scale / tempo / tonic
   * from the layer's Generative-music request). Read when a
   * performance STARTS under this ghostie's conduction; a
   * running performance keeps the framing it began with.
   */
  setFraming(framing: ChoraleFraming | null): void {
    this.framingIn = framing
      ? {
          scale: KNOWN_SCALES.has(framing.scale) ? framing.scale : "ionian",
          tempoBpm: Math.min(180, Math.max(40, Math.round(framing.tempoBpm || 100))),
          tonicMidi:
            framing.tonicMidi === null || framing.tonicMidi === undefined
              ? null
              : Math.min(127, Math.max(0, Math.round(framing.tonicMidi))),
        }
      : null;
  }

  /**
   * A frame was heard. Peers merge BY BEACON ID, never by
   * transport address (the ducks' rotating-address scar —
   * Fabric's analog: never the socket id). Arrival is stamped
   * by the caller at receipt; the frame carries no timestamp.
   */
  heard(frame: ChoraleFrame, atSec: number): void {
    if (this.state.name === "off") return;
    // Own reflection: a duck drops beacons matching its own
    // register+id — and so do we.
    if (frame.id === this.id && frame.register === this.registerByte) {
      return;
    }
    const prev = this.peers.get(frame.id);
    this.peers.set(frame.id, {
      register: frame.register,
      lastSeenSec: atSec,
      lastFrame: frame,
      firstHeardAtSec: prev?.firstHeardAtSec ?? atSec,
      firstSingingAtSec:
        frame.piece !== 0
          ? prev?.firstSingingAtSec ?? atSec
          : prev?.firstSingingAtSec ?? null,
    });

    if (this.state.name === "following" && frame.id === this.state.conductorId) {
      this.heardFromConductor(frame, atSec);
    }
  }

  /** A frame from the conductor we follow: restart law, roster
   *  adoption, and beat feeding (only on counter CHANGE — a
   *  beacon repeats; re-reading a value is the same beat, later,
   *  and would drag the phase late). */
  private heardFromConductor(frame: ChoraleFrame, atSec: number): void {
    const st = this.state;
    if (st.name !== "following") return;
    if (frame.piece === 0) {
      // The conductor stopped singing — willing, like us. The
      // performance is over; go back to listening.
      this.state = { name: "listening", sinceSec: atSec };
      this.lastPublishedJson = null;
      return;
    }
    const adopt = () => {
      st.roster = frame.roster.map((e) => ({ ...e }));
      st.framing = {
        scale: frame.scale ?? st.framing.scale,
        tempoBpm: frame.tempo_bpm ?? st.framing.tempoBpm,
        tonicMidi:
          frame.tonic_midi !== undefined ? frame.tonic_midi : st.framing.tonicMidi,
      };
      st.lastConductorAtSec = atSec;
    };
    if (frame.piece !== st.piece) {
      // A new performance (new epoch): re-lock on it.
      st.piece = frame.piece;
      st.follower = new ChoraleFollower(
        60 / (frame.tempo_bpm ?? st.framing.tempoBpm)
      );
      adopt();
      st.follower.hear(frame.beat, atSec);
      return;
    }
    const delta = st.follower.peekDelta(frame.beat);
    if (delta === null) {
      adopt();
      st.follower.hear(frame.beat, atSec);
      return;
    }
    if (delta <= -4) {
      // The counter stepped backwards 4..128 — the conductor
      // restarted this piece: re-lock.
      st.follower = new ChoraleFollower(st.follower.beatSec);
      adopt();
      st.follower.hear(frame.beat, atSec);
      return;
    }
    adopt();
    if (delta > 0) st.follower.hear(frame.beat, atSec);
    // delta in {-3..0}: a repeat or reorder noise — the same
    // beat, later. Never fed.
  }

  /** Derive this ghostie's part from a roster, or null when it
   *  is not seated (not an error — it keeps listening; the
   *  conductor seats it on a coming beat, or it stays a
   *  listener for this performance). */
  private partFor(roster: ChoraleRosterEntry[]): ChoralePart | null {
    const idx = roster.findIndex(
      (e) => e.id === this.id && e.register === this.registerByte
    );
    if (idx < 0) return null;
    return seatAll(roster.map((e) => choraleRegisterHz(e.register)))[idx];
  }

  /** Singers actually heard: roster entries still present in
   *  the peer map, plus self. A departed ghostie's seat is
   *  KEPT (pruning it would reseat everyone below it) — its
   *  line simply goes unsung, and this count says so. */
  private voicesFor(roster: ChoraleRosterEntry[]): number {
    let n = 0;
    for (const e of roster) {
      if (e.id === this.id || this.peers.has(e.id)) n += 1;
    }
    return n;
  }

  /** The IDLE frame: willing and findable, never a beat source.
   *  Its beat byte is a slow heartbeat — a payload that never
   *  changed would never be re-noticed. */
  private idleFrame(sinceSec: number, nowSec: number): ChoraleFrame {
    return {
      piece: 0,
      beat:
        Math.floor((nowSec - sinceSec) / CHORALE_HEARTBEAT_S) & 0xff,
      register: this.registerByte,
      id: this.id,
      roster: [],
    };
  }

  /** Publish-on-change: hand the frame out only when it differs
   *  from the last one handed out. */
  private publish(frame: ChoraleFrame): ChoraleFrame | null {
    const json = JSON.stringify(frame);
    if (json === this.lastPublishedJson) return null;
    this.lastPublishedJson = json;
    return frame;
  }

  /**
   * Advance the machine. The host (GhostPeer) calls this on
   * its tick with a monotonic clock in seconds; everything the
   * machine wants the world to know comes back in the result.
   */
  tick(nowSec: number): ChoraleTickResult {
    if (this.state.name === "off") {
      return { state: "off", advertise: null, singing: null };
    }
    // Prune stale peers (a conductor's own liveness is tracked
    // separately, in its follower state).
    for (const [id, p] of this.peers) {
      if (nowSec - p.lastSeenSec > CHORALE_PEER_STALE_S) {
        this.peers.delete(id);
      }
    }

    if (this.state.name === "listening") return this.tickListening(nowSec);
    if (this.state.name === "conducting") return this.tickConducting(nowSec);
    return this.tickFollowing(nowSec);
  }

  private tickListening(nowSec: number): ChoraleTickResult {
    const st = this.state;
    if (st.name !== "listening") {
      return { state: this.state.name, advertise: null, singing: null };
    }
    // Join first: any peer already singing names a performance.
    // The FIRST singing beacon names the conductor.
    let singer: PeerSighting | null = null;
    for (const p of this.peers.values()) {
      if (p.lastFrame.piece === 0 || p.firstSingingAtSec === null) continue;
      if (
        !singer ||
        p.firstSingingAtSec < (singer.firstSingingAtSec ?? Infinity) ||
        (p.firstSingingAtSec === singer.firstSingingAtSec &&
          p.lastFrame.id < singer.lastFrame.id)
      ) {
        singer = p;
      }
    }
    if (singer) {
      const frame = singer.lastFrame;
      const framing: ChoraleFraming = {
        scale: frame.scale ?? "ionian",
        tempoBpm: frame.tempo_bpm ?? 100,
        tonicMidi: frame.tonic_midi ?? null,
      };
      const follower = new ChoraleFollower(60 / framing.tempoBpm);
      // Feed the beat that named the performance.
      follower.hear(frame.beat, singer.lastSeenSec);
      this.state = {
        name: "following",
        follower,
        conductorId: frame.id,
        piece: frame.piece,
        roster: frame.roster.map((e) => ({ ...e })),
        framing,
        lastConductorAtSec: singer.lastSeenSec,
        sinceSec: nowSec,
      };
      this.lastPublishedJson = null;
      return this.tickFollowing(nowSec);
    }
    // Nobody singing: the lowest id conducts — no election, no
    // messages; every duck computes the same answer from the
    // same sightings, once SETTLE has elapsed (long enough that
    // both sides have certainly heard each other).
    if (
      this.peers.size > 0 &&
      nowSec - st.sinceSec >= CHORALE_SETTLE_S &&
      [...this.peers.keys()].every((id) => this.id < id)
    ) {
      const framing = this.framingIn ?? { ...DEFAULT_FRAMING };
      const roster: ChoraleRosterEntry[] = [this.selfEntry()];
      const heardOrder = [...this.peers.values()].sort(
        (a, b) => a.firstHeardAtSec - b.firstHeardAtSec
      );
      for (const p of heardOrder) {
        if (roster.length >= CHORALE_MAX_ROSTER) break;
        roster.push({ register: p.register, id: p.lastFrame.id });
      }
      this.epoch = (this.epoch % 255) + 1;
      this.state = {
        name: "conducting",
        conductor: new ChoraleConductor(
          60 / framing.tempoBpm,
          nowSec,
          this.selfDelaySec
        ),
        roster,
        framing,
        piece: this.epoch,
      };
      this.lastPublishedJson = null;
      return this.tickConducting(nowSec);
    }
    return {
      state: "listening",
      advertise: this.publish(this.idleFrame(st.sinceSec, nowSec)),
      singing: null,
    };
  }

  private tickConducting(nowSec: number): ChoraleTickResult {
    const st = this.state;
    if (st.name !== "conducting") {
      return { state: this.state.name, advertise: null, singing: null };
    }
    // The roster grows by append only, never reorders — a
    // joiner is seated on a coming beat; seats are never taken
    // away under a singer.
    if (st.roster.length < CHORALE_MAX_ROSTER) {
      const heardOrder = [...this.peers.values()].sort(
        (a, b) => a.firstHeardAtSec - b.firstHeardAtSec
      );
      for (const p of heardOrder) {
        if (st.roster.length >= CHORALE_MAX_ROSTER) break;
        if (!st.roster.some((e) => e.id === p.lastFrame.id)) {
          st.roster.push({ register: p.register, id: p.lastFrame.id });
        }
      }
    }
    st.conductor.due(nowSec);
    const frame: ChoraleFrame = {
      piece: st.piece,
      beat: st.conductor.wireBeat(),
      register: this.registerByte,
      id: this.id,
      roster: st.roster.map((e) => ({ ...e })),
      scale: st.framing.scale,
      tonic_midi: st.framing.tonicMidi ?? undefined,
      tempo_bpm: st.framing.tempoBpm,
    };
    const part = this.partFor(st.roster);
    return {
      state: "conducting",
      advertise: this.publish(frame),
      singing: part
        ? {
            part,
            voices: this.voicesFor(st.roster),
            positionBeats: st.conductor.positionBeats(nowSec),
            conducting: true,
            beatSec: st.conductor.beatSec,
            framing: st.framing,
          }
        : null,
    };
  }

  private tickFollowing(nowSec: number): ChoraleTickResult {
    const st = this.state;
    if (st.name !== "following") {
      return { state: this.state.name, advertise: null, singing: null };
    }
    // A conductor unheard past the stale window has left (or
    // slept): followers free-run while it is gone, and the
    // performance dissolves back to listening.
    if (nowSec - st.lastConductorAtSec > CHORALE_PEER_STALE_S) {
      this.state = { name: "listening", sinceSec: nowSec };
      this.lastPublishedJson = null;
      return this.tickListening(nowSec);
    }
    const part = this.partFor(st.roster);
    const singing: ChoraleSinging | null =
      part && st.follower.locked()
        ? {
            part,
            voices: this.voicesFor(st.roster),
            positionBeats: st.follower.positionBeats(nowSec),
            conducting: false,
            beatSec: st.follower.beatSec,
            framing: st.framing,
          }
        : null;
    return {
      state: "following",
      advertise: this.publish(this.idleFrame(st.sinceSec, nowSec)),
      singing,
    };
  }
}

/* ------------------------------------------------------------------ */
/* The heard-frame bus — the transport seam (genxStore pattern)    */
/* ------------------------------------------------------------------ */

type HeardChoraleListener = (frame: ChoraleFrame, atSec: number) => void;

const heardListeners = new Set<HeardChoraleListener>();

/**
 * The session hook deposits a SANITIZED inbound frame here,
 * stamped at receipt. Ghost hooks subscribe and forward to
 * their peer's sense. Module-level on purpose (like the genx
 * store): the transport hook and the ghost hook are separate
 * subtrees of the canvas, and this is their one meeting point.
 */
export function emitHeardChoraleFrame(
  frame: ChoraleFrame,
  atSec: number
): void {
  heardListeners.forEach((fn) => {
    try {
      fn(frame, atSec);
    } catch {
      // A listener failure must never reach the transport.
    }
  });
}

/** Subscribe to heard frames; returns the unsubscribe. */
export function subscribeHeardChoraleFrames(
  fn: HeardChoraleListener
): () => void {
  heardListeners.add(fn);
  return () => {
    heardListeners.delete(fn);
  };
}
