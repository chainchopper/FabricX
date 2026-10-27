/**
 * noteBus — the shared note pipeline for Fabric.
 *
 * Before the piano-surface hotfix, note data lived in exactly one
 * place: useMIDI's per-instance React state, fed only by Web MIDI
 * hardware. Every consumer (PianoScene key lighting, useToneSynth
 * sound, useMIDIFluid fluid streams) instantiated its own copy, so a
 * hardware keyboard reached all of them — but a note played on one of
 * Fabric's own surfaces had nowhere to go: PianoScene's key handler
 * played a private synth and the note died there.
 *
 * This bus is the missing seam. Any input surface (the 2D piano
 * keyboard, the 3D PianoScene keys, future bridges) emits note on/off
 * here; consumers merge bus notes with hardware notes via
 * useVirtualNotes and treat a tapped key exactly like a hardware key.
 *
 * Note names are scientific pitch notation ("C#4") — the same strings
 * useMIDI produces and useMIDIFluid's noteNameToNumber parses.
 *
 * Powered by Nirvana
 */

export interface NoteEvent {
  type: "on" | "off";
  note: string; // e.g. "C#4"
  velocity: number; // 0..1 (meaningful on note-on)
  t: number; // timestamp (ms)
}

type NoteListener = (e: NoteEvent) => void;

class NoteBus {
  private listeners: Set<NoteListener> = new Set();

  emit(e: NoteEvent) {
    this.listeners.forEach((l) => l(e));
  }

  on(listener: NoteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitNoteOn(note: string, velocity = 0.8) {
    this.emit({ type: "on", note, velocity, t: Date.now() });
  }

  emitNoteOff(note: string) {
    this.emit({ type: "off", note, velocity: 0, t: Date.now() });
  }
}

export const noteBus = new NoteBus();
