import { useEffect, useMemo, useRef, useState } from "react";
import { noteBus } from "../../shared/utils/noteBus";

/**
 * useVirtualNotes — the on-screen half of the note pipeline.
 *
 * useMIDI() hears only Web MIDI hardware, and its state is private to
 * each hook instance. Notes played on Fabric's own surfaces (the 2D
 * piano keyboard, the 3D PianoScene keys) travel the noteBus instead;
 * this hook folds them into the same shape useMIDI returns, so
 * consumers (useToneSynth, useMIDIFluid) can merge the two sources and
 * treat a tapped key exactly like a hardware key.
 */
export function useVirtualNotes() {
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [noteVelocities, setNoteVelocities] = useState<Record<string, number>>({});
  const activeRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const sync = () => {
      const vels: Record<string, number> = {};
      activeRef.current.forEach((v, k) => {
        vels[k] = v;
      });
      setNoteVelocities(vels);
      setActiveNotes(Object.keys(vels));
    };
    const off = noteBus.on((e) => {
      if (e.type === "on") {
        activeRef.current.set(e.note, Math.max(0.05, Math.min(1, e.velocity || 0.8)));
      } else {
        activeRef.current.delete(e.note);
      }
      sync();
    });
    return off;
  }, []);

  return useMemo(() => ({ activeNotes, noteVelocities }), [activeNotes, noteVelocities]);
}
