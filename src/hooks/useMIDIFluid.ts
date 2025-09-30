import { useEffect, useMemo, useRef } from "react";
import { useMIDI, type NoteName } from "./useMIDI";
import { useFluidMultiUser } from "./useFluidMultiUser";
import { eventBus } from "../../shared/utils/eventBus";

type RGB = { r: number; g: number; b: number };

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

function noteNameToNumber(note: string): number {
  const m = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return 60;
  const base = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const idx = base.indexOf(m[1]);
  const octave = parseInt(m[2], 10);
  return (octave + 1) * 12 + idx;
}

/**
 * useMIDIFluid
 * Always call this hook; pass enabled=false to disable processing without changing hook order.
 */
export function useMIDIFluid(roomId: string = "default", enabled: boolean = true) {
  const { activeNotes, noteVelocities } = useMIDI();
  const { sendInteraction } = useFluidMultiUser(roomId);
  const streamsRef = useRef<Map<NoteName, number>>(new Map());

  const currentNotes = useMemo(() => new Set<NoteName>(activeNotes), [activeNotes]);

  useEffect(() => {
    // If disabled, cancel any running streams and bail
    if (!enabled) {
      for (const id of streamsRef.current.values()) {
        window.cancelAnimationFrame(id);
      }
      streamsRef.current.clear();
      return;
    }

    const running = streamsRef.current;

    // Start streams for new notes
    for (const note of currentNotes) {
      if (!running.has(note)) {
        const start = performance.now();
        const duration = 420; // ms
        const noteNum = noteNameToNumber(note);
        const x = (noteNum % 12) / 12;
        const vel = noteVelocities[note] ?? 0.5;
        const hue = ((noteNum * 30) % 360) / 360;
        const color = hsvToRgb(hue, 0.85, Math.max(0.4, vel));
        const id = window.requestAnimationFrame(function loop(ts) {
          const t = Math.min(1, (ts - start) / duration);
          const y = 0.15 + t * 0.7; // stream upward
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

    // Stop streams for released notes
    for (const [note, rafId] of Array.from(streamsRef.current.entries())) {
      if (!currentNotes.has(note)) {
        window.cancelAnimationFrame(rafId);
        streamsRef.current.delete(note);
      }
    }

    return () => {
      // Cleanup when deps change or unmount
      for (const id of streamsRef.current.values()) window.cancelAnimationFrame(id);
      streamsRef.current.clear();
    };
  }, [currentNotes, noteVelocities, sendInteraction, enabled]);

  return { activeNotes, noteVelocities };
}