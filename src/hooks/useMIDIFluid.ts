import { useEffect, useMemo, useRef } from "react";
import { useMIDI, type NoteName } from "./useMIDI";
import { useVirtualNotes } from "./useVirtualNotes";
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
  // On-screen notes (2D keyboard / 3D PianoScene) ride the noteBus and
  // merge with hardware notes — a tapped key streams into the fluid
  // exactly like a hardware key. Before the piano-surface hotfix this
  // hook heard only Web MIDI hardware, so in-app playing could never
  // reach the fluid at all.
  const virtual = useVirtualNotes();
  const mergedActiveNotes = useMemo(
    () => Array.from(new Set<string>([...activeNotes, ...virtual.activeNotes])),
    [activeNotes, virtual.activeNotes]
  );
  const mergedVelocities = useMemo(
    () => ({ ...noteVelocities, ...virtual.noteVelocities }),
    [noteVelocities, virtual.noteVelocities]
  );
  const { sendInteraction, sendNote } = useFluidMultiUser(roomId);
  const streamsRef = useRef<Map<NoteName, number>>(new Map());
  // Hotfix 1.7: notes also travel as discrete note-on/note-off
  // messages, diffed against the previously-held set below. The
  // splat stream alone could never make a peer's browser SING —
  // interactions carry color and force, not pitch — so receivers
  // rendered the streams in silence. sendNote is session-gated in
  // the hook, exactly like sendInteraction.
  const prevNotesRef = useRef<Set<string>>(new Set());
  const sendNoteRef = useRef(sendNote);
  sendNoteRef.current = sendNote;

  const currentNotes = useMemo(
    () => new Set<NoteName>(mergedActiveNotes as NoteName[]),
    [mergedActiveNotes]
  );

  // Hotfix 1.7: broadcast note transitions. A note that starts here
  // starts (audibly) on every client in the room; a note released
  // here releases there. While the layer is disabled, held notes
  // are flushed off once so peers never ring forever.
  useEffect(() => {
    const prev = prevNotesRef.current;
    if (!enabled) {
      for (const note of Array.from(prev)) sendNote(note, 0, "off");
      prevNotesRef.current = new Set();
      return;
    }
    for (const note of Array.from(currentNotes)) {
      if (!prev.has(note)) {
        sendNote(note, mergedVelocities[note] ?? 0.5, "on");
      }
    }
    for (const note of Array.from(prev)) {
      if (!currentNotes.has(note)) sendNote(note, 0, "off");
    }
    prevNotesRef.current = new Set(currentNotes);
  }, [currentNotes, mergedVelocities, sendNote, enabled]);

  // Unmount (experience switch away from piano): release whatever
  // this client still holds on its peers — a vanished pianist must
  // not leave notes hanging in the room.
  useEffect(() => {
    return () => {
      for (const note of Array.from(prevNotesRef.current)) {
        sendNoteRef.current(note, 0, "off");
      }
      prevNotesRef.current = new Set();
    };
  }, []);

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

        const vRaw = mergedVelocities[note] ?? 0.5;
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
  }, [currentNotes, mergedVelocities, sendInteraction, enabled, intensityScale, curve, opts?.transpose, opts?.hueMap]);

  return { activeNotes, noteVelocities };
}