/**
 * Lint protocol v0 — the wire contract for Fabric OBJECTS.
 *
 * In the world model (docs/LINT.md), "lint" are the devices and items
 * attached to the fabric: phones, ESP32s, lights, projectors, haptics.
 * A lint device is a room OBJECT, not a participant: it has no canvas,
 * no WebRTC, no fluid engine. It joins the room over the existing
 * signaling WebSocket and trades in SMALL SUMMARIES of room life —
 * never raw stroke streams:
 *
 *   lint -> room   lint-hello   who I am (name, kind, capabilities, hue)
 *   bridge -> room lint-frame   a summarized room event (verb / note /
 *                               stroke-energy / session)
 *   lint -> room   lint-touch   the one thing hardware sends back: a
 *                               touch, which becomes a splat at the
 *                               lint's declared canvas position
 *
 * Transport: every lint payload rides INSIDE the signaling socket's
 * opaque `relay` message (Hotfix 2.0, see SignalingService) —
 *   { type: "relay", roomId, from, payload: { fabric: "lint", … } }
 * The worker forwards relay frames to the other joined members of the
 * room (or only to `to` when set), stamps `from` from the sender's
 * join attachment, caps frames at 8KB and ~600/10s per connection,
 * and never echoes the sender. All lint types are additive: clients
 * that don't know them ignore them.
 *
 * DEPENDENCY, stated plainly: full lint relay needs the Hotfix 2.0
 * worker extension DEPLOYED. Against the pre-2.0 worker, relay frames
 * go nowhere (the worker ignores the unknown type by design) — the
 * in-app simulator still demonstrates the whole loop through the
 * same-tab local preview path in lintStore, running the exact same
 * gating code. See docs/LINT.md.
 *
 * Powered by Nirvana
 */

/** Peer ids of lint devices carry this prefix (mirrors "ghost:"). */
export const LINT_ID_PREFIX = "lint:";

export function isLintId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(LINT_ID_PREFIX);
}

export type LintDeviceKind = "light" | "haptic" | "display" | "other";

export const LINT_DEVICE_KINDS: readonly LintDeviceKind[] = [
  "light",
  "haptic",
  "display",
  "other",
];

/** lint -> room: a device announcing itself after joining. */
export interface LintHello {
  fabric: "lint";
  v: 0;
  kind: "lint-hello";
  /** Human label, e.g. "Desk Lamp". Free text, <= 40 chars by convention. */
  name: string;
  deviceKind: LintDeviceKind;
  /** Capability verbs the device can render, e.g. ["glow","pulse","buzz"]. */
  caps: string[];
  /** The device's own signature hue (degrees, 0..359) — its touch color. */
  hue: number;
}

export type LintFrameKind = "verb" | "note" | "stroke-energy" | "session";

/**
 * One summarized room event, small enough for a microcontroller:
 * - verb:          a sensory verb landed (heart/cheer/tickle).
 *                  `verb` names it; intensity is the verb's pressure (1).
 * - note:          a piano/MIDI note. `note` is the pitch name ("C#4"),
 *                  `midi` its number when parseable. Note-on carries
 *                  intensity = velocity; note-off is intensity 0.
 *                  `hue` is the PLAYER's signature hue — devices that
 *                  prefer pitch color can derive it from `midi`
 *                  (see pitchHue); the protocol stays identity-true.
 * - stroke-energy: a throttled aggregate of drawing (<= 10 Hz):
 *                  `intensity` is the room's current stroke energy
 *                  0..1 and `hue` its energy-weighted dominant hue.
 *                  Never raw points. A trailing intensity-0 frame
 *                  says the room went quiet.
 * - session:       the room's shape changed (mode, host, occupancy).
 *                  `mode` is the Slice 5 session mode; intensity is
 *                  occupancy scaled (human peers / 4, capped at 1).
 */
export interface LintFrame {
  kind: LintFrameKind;
  hue: number;
  intensity: number;
  verb?: string;
  note?: string;
  midi?: number;
  mode?: string;
}

/** bridge -> room: a LintFrame with its dedupe id. */
export interface LintFrameMessage {
  fabric: "lint";
  v: 0;
  kind: "lint-frame";
  /** "<bridgePeerId>:<counter>" — receivers dedupe on this. */
  id: string;
  frame: LintFrame;
}

/** lint -> room: the device's one send — a touch at a declared spot. */
export interface LintTouch {
  fabric: "lint";
  v: 0;
  kind: "lint-touch";
  /** "<lintPeerId>:<counter>" — receivers dedupe on this. */
  id: string;
  /** Normalized canvas coordinates, 0..1. */
  x: number;
  y: number;
  /** The device's signature hue (degrees, 0..359). */
  hue: number;
}

export type LintPayload = LintHello | LintFrameMessage | LintTouch;

// ------------------------------------------------------------------
// Builders
// ------------------------------------------------------------------

export function makeLintHello(init: {
  name: string;
  deviceKind: LintDeviceKind;
  caps: string[];
  hue: number;
}): LintHello {
  return {
    fabric: "lint",
    v: 0,
    kind: "lint-hello",
    name: init.name.slice(0, 40),
    deviceKind: init.deviceKind,
    caps: init.caps.slice(0, 8),
    hue: normHue(init.hue),
  };
}

export function makeLintFrameMessage(id: string, frame: LintFrame): LintFrameMessage {
  return { fabric: "lint", v: 0, kind: "lint-frame", id, frame };
}

export function makeLintTouch(init: {
  id: string;
  x: number;
  y: number;
  hue: number;
}): LintTouch {
  return {
    fabric: "lint",
    v: 0,
    kind: "lint-touch",
    id: init.id,
    x: clamp01(init.x),
    y: clamp01(init.y),
    hue: normHue(init.hue),
  };
}

// ------------------------------------------------------------------
// Validation (everything off the wire is untrusted)
// ------------------------------------------------------------------

export function isLintPayload(x: unknown): x is LintPayload {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  if (p.fabric !== "lint" || p.v !== 0) return false;
  return (
    p.kind === "lint-hello" || p.kind === "lint-frame" || p.kind === "lint-touch"
  );
}

export function asLintHello(x: unknown): LintHello | null {
  if (!isLintPayload(x) || x.kind !== "lint-hello") return null;
  if (typeof x.name !== "string" || typeof x.hue !== "number") return null;
  if (!(LINT_DEVICE_KINDS as readonly string[]).includes(x.deviceKind)) {
    return null;
  }
  return {
    fabric: "lint",
    v: 0,
    kind: "lint-hello",
    name: x.name.slice(0, 40),
    deviceKind: x.deviceKind,
    caps: Array.isArray(x.caps)
      ? x.caps.filter((c): c is string => typeof c === "string").slice(0, 8)
      : [],
    hue: normHue(x.hue),
  };
}

export function asLintFrameMessage(x: unknown): LintFrameMessage | null {
  if (!isLintPayload(x) || x.kind !== "lint-frame") return null;
  if (typeof x.id !== "string" || !x.id) return null;
  const f = x.frame as Record<string, unknown> | null;
  if (!f || typeof f !== "object") return null;
  if (
    f.kind !== "verb" &&
    f.kind !== "note" &&
    f.kind !== "stroke-energy" &&
    f.kind !== "session"
  ) {
    return null;
  }
  if (typeof f.hue !== "number" || typeof f.intensity !== "number") {
    return null;
  }
  const frame: LintFrame = {
    kind: f.kind,
    hue: normHue(f.hue),
    intensity: clamp01(f.intensity),
  };
  if (typeof f.verb === "string") frame.verb = f.verb;
  if (typeof f.note === "string") frame.note = f.note;
  if (typeof f.midi === "number") frame.midi = Math.round(f.midi);
  if (typeof f.mode === "string") frame.mode = f.mode;
  return { fabric: "lint", v: 0, kind: "lint-frame", id: x.id, frame };
}

export function asLintTouch(x: unknown): LintTouch | null {
  if (!isLintPayload(x) || x.kind !== "lint-touch") return null;
  if (typeof x.id !== "string" || !x.id) return null;
  if (typeof x.x !== "number" || typeof x.y !== "number") return null;
  return {
    fabric: "lint",
    v: 0,
    kind: "lint-touch",
    id: x.id,
    x: clamp01(x.x),
    y: clamp01(x.y),
    hue: typeof x.hue === "number" ? normHue(x.hue) : 200,
  };
}

// ------------------------------------------------------------------
// Color + pitch helpers (shared by bridge, simulator, and docs)
// ------------------------------------------------------------------

export function normHue(h: number): number {
  const n = Math.round(h) % 360;
  return n < 0 ? n + 360 : n;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Hue (degrees) -> RGB floats 0..1, the FluidInteraction.color shape. */
export function hueToRgb(hue: number): { r: number; g: number; b: number } {
  const h = normHue(hue) / 60;
  const c = 1;
  const x = c * (1 - Math.abs((h % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  // Lift toward the fluid dye range (dyes render additively; a little
  // floor keeps dark hues visible on a lamp and on the canvas alike).
  const lift = 0.15;
  return { r: lift + r * (1 - lift), g: lift + g * (1 - lift), b: lift + b * (1 - lift) };
}

/** RGB floats 0..1 -> hue degrees (for strokes that carry dye, not hue). */
export function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return normHue(h * 60);
}

/** Pitch color: the chromatic circle mapped onto the hue wheel. */
export function pitchHue(midi: number): number {
  const cls = ((midi % 12) + 12) % 12; // pitch class 0..11
  return normHue(cls * 30 + 15);
}

const SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** "C#4" -> 61. Returns null for anything unparseable. */
export function noteNameToMidi(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) return null;
  let semi = SEMITONES[m[1]];
  if (m[2] === "#") semi += 1;
  if (m[2] === "b") semi -= 1;
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + semi;
}
