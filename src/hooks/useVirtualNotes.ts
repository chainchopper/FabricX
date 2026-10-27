import { useEffect, useMemo, useRef, useState } from "react";
import { noteBus } from "../../shared/utils/noteBus";

/**
 * The noteBus fold shared by the local and remote note hooks: track
 * the set of currently-held notes (with velocities) from bus events
 * of ONE origin. Local and remote notes are folded separately so a
 * note heard from a peer can be sounded without ever being treated
 * as this client's own playing (Hotfix 1.7).
 */
function useNotesFromBus(remote: boolean) {
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
      if (!!e.remote !== remote) return;
      if (e.type === "on") {
        activeRef.current.set(e.note, Math.max(0.05, Math.min(1, e.velocity || 0.8)));
      } else {
        activeRef.current.delete(e.note);
      }
      sync();
    });
    return off;
  }, [remote]);

  return useMemo(() => ({ activeNotes, noteVelocities }), [activeNotes, noteVelocities]);
}

/**
 * useVirtualNotes — the on-screen half of the note pipeline.
 *
 * useMIDI() hears only Web MIDI hardware, and its state is private to
 * each hook instance. Notes played on Fabric's own surfaces (the 2D
 * piano keyboard, the 3D PianoScene keys) travel the noteBus instead;
 * this hook folds them into the same shape useMIDI returns, so
 * consumers (useToneSynth, useMIDIFluid) can merge the two sources and
 * treat a tapped key exactly like a hardware key.
 *
 * Local origin only: notes a peer played (remote bus events) are NOT
 * folded here — useMIDIFluid streams what this hook returns into the
 * fluid and out to the room, and a received note must never be
 * re-streamed or re-broadcast (Hotfix 1.7).
 */
export function useVirtualNotes() {
  return useNotesFromBus(false);
}

/**
 * useRemoteNotes — the room's half of the note pipeline (Hotfix 1.7).
 *
 * Folds note on/off events that arrived over the transport from
 * other clients (emitted onto the bus by useFluidMultiUser) into the
 * same shape as useVirtualNotes. Its only consumer is useToneSynth:
 * hearing a peer's piano is a receive-path concern, ungated by
 * session mode — sending is what modes gate.
 */
export function useRemoteNotes() {
  return useNotesFromBus(true);
}
