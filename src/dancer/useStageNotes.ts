/**
 * useStageNotes — the Dancer Stage's transport bridge.
 *
 * The stage plays by the piano layer's exact rules, minus the
 * fluid: notes and verbs travel the room through the same
 * useFluidMultiUser funnel, and Slice 5 session modes gate every
 * send inside that funnel (sendNote / sendInteraction consult
 * computeCanSend before any transport is chosen — view-only and
 * mirror guests transmit nothing, exactly as on the piano layer).
 *
 * What this hook does:
 *
 *  1. NOTES OUT: diffs the merged held-notes set (hardware MIDI via
 *     useMIDI + on-screen notes via useVirtualNotes, i.e. the
 *     stage's key strip) against the previous set and broadcasts
 *     note-on / note-off — the same diff useMIDIFluid runs for the
 *     piano, WITHOUT its fluid nozzle streams (the stage has no
 *     fluid to stream into; notes here move a body, not dye).
 *     Held notes flush off on disable and on unmount.
 *
 *  2. NOTES IN: nothing to do here — useFluidMultiUser already
 *     folds incoming room notes onto the note bus
 *     (emitRemoteNoteOn/Off), and the stage's driver subscribes to
 *     the bus, so remote notes dance the rig on every client.
 *
 *  3. VERBS OUT: the shared VerbBar dispatches FABRIC_VERB_EVENT on
 *     window; when the session allows input, the verb is sent to
 *     the room via sendInteraction(verbInteraction(verb)) AND fired
 *     locally (onVerb) so the sender's own dancer performs it —
 *     the same send + local-effect pairing LegacyFluid uses.
 *
 *  4. VERBS IN: remote interactions carrying a verb id fire onVerb
 *     once each (deduped on the sender's (userId, seq ?? timestamp)
 *     key, the Hotfix 1.9 convention), so a peer's HEART lifts the
 *     arms of every dancer in the room.
 *
 * The driver itself stays subscribe-only on the note bus — it
 * never learns the transport exists.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFluidMultiUser } from "../hooks/useFluidMultiUser";
import { useMIDI, type NoteName } from "../hooks/useMIDI";
import { useVirtualNotes } from "../hooks/useVirtualNotes";
import { FABRIC_VERB_EVENT, getVerbById, verbInteraction } from "../sensory/verbs";
import {
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../session/sessionStore";

export function useStageNotes(
  roomId: string,
  enabled: boolean,
  onVerb: (verbId: string) => void
) {
  const { activeNotes, noteVelocities } = useMIDI();
  const virtual = useVirtualNotes();
  const mergedActiveNotes = useMemo(
    () => Array.from(new Set<string>([...activeNotes, ...virtual.activeNotes])),
    [activeNotes, virtual.activeNotes]
  );
  const mergedVelocities = useMemo(
    () => ({ ...noteVelocities, ...virtual.noteVelocities }),
    [noteVelocities, virtual.noteVelocities]
  );
  const { userId, remoteInteractions, sendInteraction, sendNote } =
    useFluidMultiUser(roomId);

  const onVerbRef = useRef(onVerb);
  onVerbRef.current = onVerb;

  // ---- Notes out (diff + flush, the piano's contract) -----------
  const prevNotesRef = useRef<Set<string>>(new Set());
  const sendNoteRef = useRef(sendNote);
  sendNoteRef.current = sendNote;
  const currentNotes = useMemo(
    () => new Set<NoteName>(mergedActiveNotes as NoteName[]),
    [mergedActiveNotes]
  );

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

  useEffect(() => {
    return () => {
      for (const note of Array.from(prevNotesRef.current)) {
        sendNoteRef.current(note, 0, "off");
      }
      prevNotesRef.current = new Set();
    };
  }, []);

  // ---- Session state (verb gate, LegacyFluid's pattern) ---------
  const sessionRef = useRef<SessionPublicState>(getSessionPublicState());
  useEffect(
    () =>
      subscribeSessionState((s) => {
        sessionRef.current = s;
      }),
    []
  );

  // ---- Verbs out: FABRIC_VERB_EVENT -> room + local choreo ------
  const sendInteractionRef = useRef(sendInteraction);
  sendInteractionRef.current = sendInteraction;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVerbEvent = (e: Event) => {
      const verbId = (e as CustomEvent<string>).detail;
      const verb = getVerbById(verbId);
      if (!verb) return;
      // Slice 5: view-only / mirror guests send nothing — and their
      // own dancer stays out of it too (mirroring is one-way).
      if (!sessionRef.current.inputEnabled) return;
      sendInteractionRef.current(verbInteraction(verb));
      onVerbRef.current(verb.id);
    };
    window.addEventListener(FABRIC_VERB_EVENT, onVerbEvent as EventListener);
    return () => {
      window.removeEventListener(FABRIC_VERB_EVENT, onVerbEvent as EventListener);
    };
  }, []);

  // ---- Verbs in: remote verb interactions -> choreo -------------
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!enabled) return;
    for (const i of remoteInteractions) {
      const key = `${i.userId}:${i.seq ?? i.timestamp}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      if (seenRef.current.size > 4096) seenRef.current.clear();
      if (!i.verb || i.userId === userId) continue;
      if (getVerbById(i.verb)) onVerbRef.current(i.verb);
    }
  }, [remoteInteractions, enabled, userId]);
}
