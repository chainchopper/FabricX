import { useEffect, useMemo, useRef, useState } from "react";

export type NoteName = `${"C"|"C#"|"D"|"D#"|"E"|"F"|"F#"|"G"|"G#"|"A"|"A#"|"B"}${number}`;

function midiNumberToNoteName(num: number): NoteName {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const note = names[num % 12] as NoteName extends `${infer N}${number}` ? N : never;
  const octave = Math.floor(num / 12) - 1;
  return `${note}${octave}` as NoteName;
}

export function useMIDI() {
  const [activeNotes, setActiveNotes] = useState<NoteName[]>([]);
  const [noteVelocities, setNoteVelocities] = useState<Record<string, number>>({});
  const accessRef = useRef<MIDIAccess | null>(null);

  // Sustain handling
  const sustainOnRef = useRef<boolean>(false);
  const activeSetRef = useRef<Set<NoteName>>(new Set());
  const pendingReleaseRef = useRef<Set<NoteName>>(new Set());

  useEffect(() => {
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) return;

    let mounted = true;

    navigator
      .requestMIDIAccess({ sysex: false })
      .then((access) => {
        if (!mounted) return;
        accessRef.current = access;

        const handleMessage = (ev: MIDIMessageEvent) => {
          const raw = (ev as any).data as Uint8Array | null | undefined;
          if (!raw) return;
          const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as any);
          const status = bytes[0];
          const data1 = bytes[1];
          const data2 = bytes[2];

          const cmd = status & 0xf0;

          if (cmd === 0x90) {
            const noteNum = data1;
            const velocity = data2;
            const note = midiNumberToNoteName(noteNum);
            if (velocity > 0) {
              // Note on
              activeSetRef.current.add(note);
              pendingReleaseRef.current.delete(note);
              setNoteVelocities((m) => ({ ...m, [note]: velocity / 127 }));
              setActiveNotes(Array.from(activeSetRef.current));
            } else {
              // Velocity 0 note-on == note-off
              const noteOff = midiNumberToNoteName(noteNum);
              if (sustainOnRef.current) {
                pendingReleaseRef.current.add(noteOff);
              } else {
                activeSetRef.current.delete(noteOff);
                pendingReleaseRef.current.delete(noteOff);
                setActiveNotes(Array.from(activeSetRef.current));
              }
            }
          } else if (cmd === 0x80) {
            // Note off
            const noteNum = data1;
            const note = midiNumberToNoteName(noteNum);
            if (sustainOnRef.current) {
              pendingReleaseRef.current.add(note);
            } else {
              activeSetRef.current.delete(note);
              pendingReleaseRef.current.delete(note);
              setActiveNotes(Array.from(activeSetRef.current));
            }
          } else if (cmd === 0xB0) {
            // Control Change
            const controller = data1;
            const value = data2;
            if (controller === 64) {
              // Sustain pedal
              const on = value >= 64;
              const prev = sustainOnRef.current;
              sustainOnRef.current = on;

              if (!on && prev) {
                // Pedal released: flush pending releases
                if (pendingReleaseRef.current.size > 0) {
                  pendingReleaseRef.current.forEach((n) => {
                    activeSetRef.current.delete(n);
                  });
                  pendingReleaseRef.current.clear();
                  setActiveNotes(Array.from(activeSetRef.current));
                }
              }
            }
          }
        };

        const attachInput = (input: MIDIInput) => {
          input.onmidimessage = handleMessage;
        };

        access.inputs.forEach((input) => attachInput(input));

        const onStateChange = (ev: MIDIConnectionEvent) => {
          const acc = accessRef.current;
          if (!acc) return;
          const port = ev.port;
          if (!port) return;
          if (port.type === "input" && port.state === "connected") {
            let found: MIDIInput | undefined;
            acc.inputs.forEach((value, key) => {
              if (key === port.id) found = value;
            });
            if (found) attachInput(found);
          }
        };
        access.onstatechange = onStateChange;
      })
      .catch(() => {
        // WebMIDI unsupported or permission denied; ignore
      });

    return () => {
      mounted = false;
      const access = accessRef.current;
      if (access) {
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
      }
    };
  }, []);

  return useMemo(() => ({ activeNotes, noteVelocities }), [activeNotes, noteVelocities]);
}