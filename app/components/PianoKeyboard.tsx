import React, { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { noteBus } from "../../shared/utils/noteBus";
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
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const haptics = useHaptics();
  const { whites, blacks } = useMemo(buildKeys, []);
  const whiteCount = whites.length;

  const press = useCallback(
    (note: string) => {
      setPressed((prev) => {
        if (prev.has(note)) return prev;
        const next = new Set(prev);
        next.add(note);
        return next;
      });
      noteBus.emitNoteOn(note, KEYBOARD_VELOCITY);
      haptics.impactLight();
    },
    [haptics]
  );

  const release = useCallback((note: string) => {
    setPressed((prev) => {
      if (!prev.has(note)) return prev;
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
    noteBus.emitNoteOff(note);
  }, []);

  if (Platform.OS !== "web") return null;

  return (
    <View pointerEvents="box-none" style={{ width: 560, maxWidth: "100%", marginTop: spacing.sm }}>
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
      <View style={{ position: "relative", flexDirection: "row", height: WHITE_HEIGHT, width: "100%" }}>
        {whites.map((k) => {
          const isPressed = pressed.has(k.note);
          return (
            <Pressable
              key={k.note}
              pointerEvents="auto"
              accessibilityRole="button"
              accessibilityLabel={`Piano key ${k.note}`}
              onPressIn={() => press(k.note)}
              onPressOut={() => release(k.note)}
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
              }}
            >
              <Text style={{ fontSize: 9, color: isPressed ? "#06202b" : "#5b6b7a" }}>{k.note}</Text>
            </Pressable>
          );
        })}
        {blacks.map((k) => {
          const isPressed = pressed.has(k.note);
          return (
            <Pressable
              key={k.note}
              pointerEvents="auto"
              accessibilityRole="button"
              accessibilityLabel={`Piano key ${k.note}`}
              onPressIn={() => press(k.note)}
              onPressOut={() => release(k.note)}
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
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
