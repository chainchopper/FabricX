import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { noteBus } from "../../shared/utils/noteBus";
import { useRemoteNotes, useVirtualNotes } from "../../src/hooks/useVirtualNotes";
import { unlockAudio } from "../../src/audio/sharedAudio";
import { colors, spacing } from "../../src/theme/tokens";
import { useHaptics } from "../hooks/useHaptics";

/**
 * PianoKeyboard — the AR Piano's playable surface on web.
 *
 * Why this exists (piano-surface hotfix): the piano's only surface was
 * the 3D keybed inside FabricWeb3D's R3F Canvas, and that keybed is
 * geometrically invisible. generateKeys() lays 21 white keys along X
 * at y=0 — 0.05 world units tall, black keys 0.08 — while the Canvas
 * camera sits on the same axis at keybed height looking straight down
 * -Z (the <perspectiveCamera position={[0,0,1.8]}> element carries no
 * makeDefault, so fiber renders with its default camera at [0,0,5],
 * fov 75; either way the viewpoint is edge-on). The whole keyboard
 * projects to a hairline strip — a few px tall on a phone — crossing
 * the opaque LiquidSurface plane. The standalone ARPianoExperience
 * shows the intended framing (camera [0,3,5] looking down at the
 * keys); the in-app scene never had it. Selecting AR Piano therefore
 * "showed nothing": the fluid view was replaced and no piano appeared.
 *
 * This keyboard is the layer's own control surface, mounted by
 * ExperienceHUD inside the bottom chrome cluster — the doctrine's
 * home for layer-appropriate controls — so it inherits the cluster's
 * proven tappable ancestry (ChromeLayer; no pointerEvents="none"
 * ancestor) and its idle fade, and it can never overlap another
 * control because it sits in the cluster's flow.
 *
 * Pressing a key emits on the shared noteBus, which is wired into the
 * same pipeline hardware MIDI uses: useToneSynth plays the note and
 * useMIDIFluid streams it into the fluid and out to the room. Before
 * this, an on-screen press had no path to either — PianoScene's
 * handler fed a private synth and nothing else.
 *
 * Range: C3–C5 (two octaves + top C), matching the 3D scene's
 * START_OCTAVE so on-screen and 3D keys name the same notes.
 *
 * ---- Hotfix 1.8: the input model is a pointer-tracking surface ----
 *
 * Terrell's field report on the merged build: "I can't press multiple
 * keys at once." He was right, structurally: each key was its own
 * Pressable, and a Pressable owns the responder chain for its touch —
 * the first finger down captured the surface's one responder, so a
 * second finger (or a slide) had nothing to land on. Chords were
 * impossible by construction.
 *
 * The keys are paint now. ALL input is handled by ONE surface — the
 * keys container — with DOM pointer listeners attached directly to
 * its element, the same pattern the fluid engine uses for the canvas:
 *
 *   pointerdown  -> hit-test (x, y) to a key, remember pointerId->note
 *   pointermove  -> re-hit-test THAT pointer; a changed key is a
 *                   glissando (off the old, on the new), per pointer
 *   pointerup / pointercancel / lostpointercapture -> release
 *
 * Pointer capture is taken per pointerId, so simultaneous fingers
 * are independent voices: two thumbs play a real chord, and each
 * finger can slide its own line. A note sounds until its LAST holder
 * releases it. Sliding off the surface releases; sliding back on
 * while still down re-presses.
 *
 * Key visuals are driven from the merged active-notes state: this
 * surface's local pointers, plus the noteBus folds (useVirtualNotes
 * for local surfaces like the 3D scene, useRemoteNotes for peers) —
 * so a peer's held chord lights up on your keyboard too.
 *
 * The surface's pointerdown also calls unlockAudio() FIRST,
 * synchronously inside the gesture: iOS only resumes an AudioContext
 * from a real gesture call stack, and a key press must be able to
 * wake the shared context by itself (see src/audio/sharedAudio).
 * And the surface carries the no-callout styles inline (touchAction /
 * userSelect / -webkit-touch-callout) as belt-and-suspenders at the
 * exact touch target, on top of webShell's bundle-injected global
 * rules — PR #21's index.html copy of those rules never shipped.
 *
 * Powered by Nirvana
 */

const WHITE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const BLACK_AFTER: Record<string, string | null> = {
  C: "C#",
  D: "D#",
  E: null,
  F: "F#",
  G: "G#",
  A: "A#",
  B: null,
};
const OCTAVES = [3, 4];
const KEYBOARD_VELOCITY = 0.8;
const WHITE_HEIGHT = 108;
const BLACK_HEIGHT = 64;
const BLACK_WIDTH = 22;
// A held pointer may stray this far past the surface edge (it has
// pointer capture, so it keeps reporting) before it counts as
// "slid off" and releases its note.
const EDGE_SLACK_PX = 10;

// Web-only anti-callout styles, spread into the surface and root.
// (The durable fix is webShell's injected stylesheet — these are
// the suspenders at the exact touch targets.)
const NO_CALLOUT: Record<string, string> = {
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
};

interface WhiteKey {
  note: string;
}
interface BlackKey {
  note: string;
  afterWhiteIndex: number; // boundary sits between this white key and the next
}

function buildKeys(): { whites: WhiteKey[]; blacks: BlackKey[] } {
  const whites: WhiteKey[] = [];
  for (const oct of OCTAVES) {
    for (const n of WHITE_NOTES) whites.push({ note: `${n}${oct}` });
  }
  whites.push({ note: "C5" });

  const blacks: BlackKey[] = [];
  whites.forEach((w, i) => {
    if (i >= whites.length - 1) return;
    const base = w.note.replace(/[0-9]/g, "");
    const oct = w.note.slice(base.length);
    const sharp = BLACK_AFTER[base];
    if (sharp) blacks.push({ note: `${sharp}${oct}`, afterWhiteIndex: i });
  });
  return { whites, blacks };
}

export default function PianoKeyboard() {
  const [localPressed, setLocalPressed] = useState<Set<string>>(new Set());
  const haptics = useHaptics();
  const { whites, blacks } = useMemo(buildKeys, []);
  const whiteCount = whites.length;
  // NoteBus folds for the visuals: local surfaces (this keyboard's
  // own notes come back through here too, alongside the 3D scene)
  // and remote peers' held notes.
  const virtual = useVirtualNotes();
  const remote = useRemoteNotes();

  const surfaceRef = useRef<View | null>(null);
  // pointerId -> note for every finger/mouse currently down.
  const pointersRef = useRef<Map<number, string>>(new Map());
  // useHaptics returns a fresh object every render; the input effect
  // must not depend on it (a re-run would tear down the listeners
  // AND release held notes mid-chord). Read it through a ref.
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;

  const syncLocal = useCallback(() => {
    setLocalPressed(new Set(pointersRef.current.values()));
  }, []);

  const holdersOf = useCallback((note: string): number => {
    let n = 0;
    pointersRef.current.forEach((v) => {
      if (v === note) n += 1;
    });
    return n;
  }, []);

  // Hit-test a client point against the keybed geometry. Black keys
  // win the strip they occupy (y <= BLACK_HEIGHT); everything else
  // is the white key under x. Returns null off the surface.
  const noteAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const el = surfaceRef.current as unknown as HTMLElement | null;
      if (!el || typeof el.getBoundingClientRect !== "function") return null;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < -EDGE_SLACK_PX || x > rect.width + EDGE_SLACK_PX) return null;
      if (y < -EDGE_SLACK_PX || y > rect.height + EDGE_SLACK_PX) return null;
      const whiteW = rect.width / whiteCount;
      if (y <= BLACK_HEIGHT) {
        for (const b of blacks) {
          const cx = (b.afterWhiteIndex + 1) * whiteW;
          if (Math.abs(x - cx) <= BLACK_WIDTH / 2) return b.note;
        }
      }
      const idx = Math.max(
        0,
        Math.min(whiteCount - 1, Math.floor(x / whiteW))
      );
      return whites[idx].note;
    },
    [blacks, whites, whiteCount]
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = surfaceRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== "function") return;

    const releasePointer = (pointerId: number) => {
      const cur = pointersRef.current.get(pointerId);
      if (cur === undefined) return;
      pointersRef.current.delete(pointerId);
      if (holdersOf(cur) === 0) noteBus.emitNoteOff(cur);
      syncLocal();
    };

    const onDown = (e: PointerEvent) => {
      // Primary mouse button / touch / pen contact only.
      if (typeof e.button === "number" && e.button > 0) return;
      // Hotfix 1.8: wake the shared audio context FIRST, inside this
      // gesture's own call stack — iOS grants the resume only here.
      unlockAudio();
      const note = noteAt(e.clientX, e.clientY);
      if (!note) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is an enhancement; tracking still works without it.
      }
      const alreadyHeld = holdersOf(note) > 0;
      pointersRef.current.set(e.pointerId, note);
      if (!alreadyHeld) {
        noteBus.emitNoteOn(note, KEYBOARD_VELOCITY);
        hapticsRef.current.impactLight();
      }
      syncLocal();
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      const cur = pointersRef.current.get(e.pointerId);
      if (cur === undefined) return;
      const note = noteAt(e.clientX, e.clientY);
      if (note === cur) return;
      // Glissando (or slide off the edge): release the old key if
      // this was its last holder, then press the new one.
      pointersRef.current.delete(e.pointerId);
      if (holdersOf(cur) === 0) noteBus.emitNoteOff(cur);
      if (note) {
        const alreadyHeld = holdersOf(note) > 0;
        pointersRef.current.set(e.pointerId, note);
        if (!alreadyHeld) {
          noteBus.emitNoteOn(note, KEYBOARD_VELOCITY);
          hapticsRef.current.impactLight();
        }
      }
      syncLocal();
    };

    const onUp = (e: PointerEvent) => releasePointer(e.pointerId);
    const onBlur = () => {
      // Never leave a note hanging because the window lost focus.
      const held = Array.from(new Set(pointersRef.current.values()));
      pointersRef.current.clear();
      held.forEach((n) => noteBus.emitNoteOff(n));
      syncLocal();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("lostpointercapture", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("lostpointercapture", onUp);
      window.removeEventListener("blur", onBlur);
      onBlur();
    };
  }, [noteAt, holdersOf, syncLocal]);

  if (Platform.OS !== "web") return null;

  const pressed = new Set<string>([
    ...localPressed,
    ...virtual.activeNotes,
    ...remote.activeNotes,
  ]);

  return (
    <View
      pointerEvents="box-none"
      style={{
        width: 560,
        maxWidth: "100%",
        marginTop: spacing.sm,
        ...NO_CALLOUT,
      }}
    >
      <Text
        style={{
          color: colors.textDim,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.5,
          marginBottom: spacing.xs,
        }}
      >
        PIANO — NOTES STREAM INTO THE FABRIC
      </Text>
      {/* THE input surface (Hotfix 1.8): one pointer-tracking element
          owns every touch; the keys below are pointerEvents="none"
          paint, lit from the merged active-notes state. */}
      <View
        ref={surfaceRef}
        style={{
          position: "relative",
          flexDirection: "row",
          height: WHITE_HEIGHT,
          width: "100%",
          ...NO_CALLOUT,
        }}
      >
        {whites.map((k) => {
          const isPressed = pressed.has(k.note);
          return (
            <View
              key={k.note}
              pointerEvents="none"
              style={{
                flex: 1,
                marginHorizontal: 1,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: isPressed ? colors.accent : "rgba(248,249,250,0.92)",
                justifyContent: "flex-end",
                alignItems: "center",
                paddingBottom: 4,
                ...NO_CALLOUT,
              }}
            >
              <Text style={{ fontSize: 9, color: isPressed ? "#06202b" : "#5b6b7a" }}>{k.note}</Text>
            </View>
          );
        })}
        {blacks.map((k) => {
          const isPressed = pressed.has(k.note);
          return (
            <View
              key={k.note}
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                height: BLACK_HEIGHT,
                width: BLACK_WIDTH,
                left: `${((k.afterWhiteIndex + 1) / whiteCount) * 100}%`,
                marginLeft: -BLACK_WIDTH / 2,
                zIndex: 2,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: isPressed ? colors.accent : "#141824",
                ...NO_CALLOUT,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
