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
  /**
   * Hotfix 1.7: true when the note originated on ANOTHER client and
   * arrived over the room transport (see useFluidMultiUser). Remote
   * notes are for the ears: useRemoteNotes folds only these, and
   * useVirtualNotes ignores them — so a received note sounds on this
   * client but is never re-streamed into the fluid or re-broadcast
   * to the room (no echo, no amplification loop).
   */
  remote?: boolean;
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

  /** A note heard from a peer (Hotfix 1.7) — sounds locally only. */
  emitRemoteNoteOn(note: string, velocity = 0.8) {
    this.emit({ type: "on", note, velocity, t: Date.now(), remote: true });
  }

  emitRemoteNoteOff(note: string) {
    this.emit({ type: "off", note, velocity: 0, t: Date.now(), remote: true });
  }
}

export const noteBus = new NoteBus();
