import { useEffect, useMemo, useRef } from "react";
import { useMIDI, type NoteName } from "./useMIDI";
import { useFluidMultiUser } from "./useFluidMultiUser";
import { eventBus } from "../../shared/utils/eventBus";

type RGB = { r: number; g: number; b: number };
type MidiCurve = "soft" | "linear" | "hard";
type HueMap = "chromatic" | "fifths";

function hsvToRgb(h: number, s: number, v: number): RGB {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;
  const map: RGB[] = [
    { r: v, g: t, b: p },
    { r: q, g: v, b: p },
    { r: p, g: v, b: t },
    { r: p, g: q, b: v },
    { r: t, g: p, b: v },
    { r: v, g: p, b: q },
  ];
  return map[mod];
}

function chromaticIndex(noteNum: number) {
  return noteNum % 12;
}
function fifthsIndex(noteNum: number) {
  // circle of fifths: +7 mod 12 mapping
  return (noteNum * 7) % 12;
}

function noteNameToNumber(note: string): number {
  const m = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return 60;
  const base = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const idx = base.indexOf(m[1]);
  const octave = parseInt(m[2], 10);
  return (octave + 1) * 12 + idx;
}

function applyCurve(v: number, curve: MidiCurve): number {
  const x = Math.max(0, Math.min(1, v));
  if (curve === "soft") return Math.sqrt(x);
  if (curve === "hard") return x * x;
  return x;
}

export function useMIDIFluid(
  roomId: string = "default",
  enabled: boolean = true,
  intensityScale: number = 1,
  curve: MidiCurve = "linear",
  opts?: { transpose?: number; hueMap?: HueMap }
) {
  const { activeNotes, noteVelocities } = useMIDI();
  const { sendInteraction } = useFluidMultiUser(roomId);
  const streamsRef = useRef<Map<NoteName, number>>(new Map());

  const currentNotes = useMemo(() => new Set<NoteName>(activeNotes), [activeNotes]);

  useEffect(() => {
    if (!enabled) {
      for (const id of streamsRef.current.values()) window.cancelAnimationFrame(id);
      streamsRef.current.clear();
      return;
    }

    const running = streamsRef.current;
    const transpose = Math.max(-24, Math.min(24, opts?.transpose ?? 0));
    const hueMap = (opts?.hueMap ?? "chromatic") as HueMap;

    for (const note of currentNotes) {
      if (!running.has(note)) {
        const start = performance.now();
        const duration = 420;

        let noteNum = noteNameToNumber(note);
        noteNum += transpose;

        const idx = hueMap === "fifths" ? fifthsIndex(noteNum) : chromaticIndex(noteNum);
        const x = idx / 12;

        const vRaw = noteVelocities[note] ?? 0.5;
        const vCurved = applyCurve(vRaw, curve);
        const vel = Math.max(0.05, Math.min(1, vCurved * Math.max(0.25, Math.min(1.6, intensityScale))));
        const hue = ((idx * 30) % 360) / 360;
        const color = hsvToRgb(hue, 0.85, Math.max(0.4, vel));

        const id = window.requestAnimationFrame(function loop(ts) {
          const t = Math.min(1, (ts - start) / duration);
          const y = 0.15 + t * 0.7;
          eventBus.emitDrag(x, y);
          sendInteraction({
            position: { x, y },
            force: { x: 0, y: vel * 1000 },
            pressure: Math.min(1, Math.max(0.1, vel)),
            color,
          });
          if (t < 1 && currentNotes.has(note) && enabled) {
            const nextId = window.requestAnimationFrame(loop);
            running.set(note, nextId);
          } else {
            running.delete(note);
          }
        });
        running.set(note, id);
      }
    }

    for (const [n, rafId] of Array.from(streamsRef.current.entries())) {
      if (!currentNotes.has(n)) {
        window.cancelAnimationFrame(rafId);
        streamsRef.current.delete(n);
      }
    }

    return () => {
      for (const id of streamsRef.current.values()) window.cancelAnimationFrame(id);
      streamsRef.current.clear();
    };
  }, [currentNotes, noteVelocities, sendInteraction, enabled, intensityScale, curve, opts?.transpose, opts?.hueMap]);

  return { activeNotes, noteVelocities };
}