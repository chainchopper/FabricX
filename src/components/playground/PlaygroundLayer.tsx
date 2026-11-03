/**
 * PlaygroundLayer — the Ghostie Playground's own layer (Slice 53).
 *
 * Terrell's model, restated Nov 3, 2026: a fabric is the canvas;
 * LAYERS bring the interface and tools; LINT are the objects
 * that interact with the fabric; and the GHOSTIE is an
 * intelligent I/O component that possesses the loaded fabric
 * through its layers — it can do anything the compatible loaded
 * layer lets a human do, with the layer's tools and objects plus
 * its own global tools, no human needed.
 *
 * This fabric is the ghostie's own: a room of its own
 * ("playground") where its person can exercise it directly. The
 * layer brings exactly three things, all real:
 *
 *   1. THE TOOL TRAY — one docked cluster whose every button is
 *      a REAL ask on the peer's own ask surface (the callbacks
 *      LegacyFluid passes are the same methods its compose route
 *      calls for a spoken ask). A press runs the identical
 *      gates, budgets and cooldowns as a voice asking; the
 *      status line reports what actually came back — performed,
 *      refused by the room's rules, or unavailable (cooling
 *      down / budget spent / ghost off) — never a canned success.
 *      Deliberation tools (splat-play) are NOT buttons: the
 *      ghost decides those itself, and the tray says so — talk
 *      to it, pet it, play with it, and watch it think.
 *
 *   2. THE KEY STRIP — this layer's lint: eight keys on the
 *      shared note bus, pressed exactly the way the Piano's
 *      keyboard presses (noteBus on/off at keyboard velocity).
 *      The layer mounts the note pipeline (ToneEngine +
 *      useMIDIFluid) so notes here SOUND, stream into the
 *      fluid and broadcast like Piano notes — that is what
 *      makes the ghost's note tools honest in this room: it
 *      hears your notes (the canvas's forwarder feeds them to
 *      it on any note layer) and can answer with its own.
 *
 *   3. WAYS TO TALK — chips that speak the ask out loud through
 *      the compose event, the very path the compose bar's voice
 *      and typing take. Free-form talk stays where it lives:
 *      the compose bar at the bottom.
 *
 * Petting is not a button: stroke the ghostie on the canvas,
 * like everywhere — the touch IS the sense.
 *
 * Chrome: one cluster, docked bottom-left above the HUD band,
 * clear of the info icon (bottom-right, same baseline, opposite
 * corner). The tray parks behind one surviving pill, Fold-style
 * (Slice 46): closed means unmounted — 0px, no text, no touch.
 * The layer itself mounts only while the Playground is the
 * loaded fabric, and enters/leaves through ChromeMount with it.
 *
 * Powered by Nirvana
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useMIDIFluid } from "../../hooks/useMIDIFluid";
import ToneEngine from "../audio/ToneEngine";
import { noteBus } from "../../../shared/utils/noteBus";
import { FABRIC_COMPOSE_EVENT } from "../../ai/PatternComposer";
import { ChromeMount } from "../ui/ChromeMount";
import { colors, radius, spacing } from "../../theme/tokens";
import type {
  GhostActResult,
  GhostVerbAskId,
} from "../../ghost/GhostPeer";

export interface PlaygroundLayerProps {
  /** The local ghostie's name, or null before its identity loads. */
  ghostName: string | null;
  /** heartbeat-answer tool: returns its live BPM, or null. */
  askHeartbeat: () => number | null;
  /** verb-perform tool: returns the performed verb, or null. */
  askVerb: (verb: GhostVerbAskId) => GhostVerbAskId | null;
  /** draw tool: a ring drawn around the ghost's own body. */
  askDraw: () => GhostActResult;
  /** note-perform tool: play one note (null = the ghost's choice). */
  askNote: (note: string | null) => GhostActResult;
  /** note-perform tool: replay the last note it heard/played. */
  askNoteAgain: () => GhostActResult;
  /** note-perform tool: play an arpeggio. */
  askArpeggio: () => GhostActResult;
}

/** The strip's notes — one octave, C4 to C5, the keyboard's range start. */
const STRIP_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
/** The Piano keyboard's own press velocity (PianoKeyboard.tsx). */
const STRIP_VELOCITY = 0.8;

export default function PlaygroundLayer(props: PlaygroundLayerProps) {
  const { state } = useExperience();
  const specific = (state.experienceConfig?.specific ?? {}) as Record<
    string,
    unknown
  >;
  const roomId =
    typeof specific.roomId === "string" && specific.roomId
      ? specific.roomId
      : "playground";

  // The note pipeline — the same wiring the Piano layer mounts
  // (PianoNoteLayer): hardware/virtual notes merge on the bus,
  // notes stream into the fluid and ride the note transport,
  // and ToneEngine (rendered below) sounds them. Without this,
  // a "note" in this room would be a silent pretense.
  useMIDIFluid(roomId, true, 1, "linear");

  const name = props.ghostName ?? "Ghostie";
  const address = props.ghostName ?? "ghostie";

  const [panelOpen, setPanelOpen] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
  const heldRef = useRef<ReadonlySet<string>>(new Set());
  heldRef.current = held;

  // A held key must never ring past the layer's life.
  useEffect(() => {
    const heldNow = heldRef;
    return () => {
      heldNow.current.forEach((n) => noteBus.emitNoteOff(n));
    };
  }, []);

  const actLine = useCallback(
    (res: GhostActResult, done: string): string => {
      if (res === "performed") return done;
      if (res === "refused") return `${name} wanted to — the room's rules refused it`;
      return `${name} needs a moment — cooling down, or the ghost is off`;
    },
    [name]
  );

  const onHeartbeat = useCallback(() => {
    const bpm = props.askHeartbeat();
    setStatus(
      bpm !== null
        ? `${name}'s heartbeat · ${bpm} BPM`
        : `${name} can't answer right now — cooling down, or the ghost is off`
    );
  }, [props, name]);

  const onVerb = useCallback(
    (verb: GhostVerbAskId) => {
      const performed = props.askVerb(verb);
      setStatus(
        performed
          ? `${name} · ${performed} on request`
          : `${name} can't do that right now — cooling down, or the ghost is off`
      );
    },
    [props, name]
  );

  const sayAloud = useCallback(
    (text: string) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent(FABRIC_COMPOSE_EVENT, { detail: text })
      );
      setStatus(`You said it out loud — ${name} answers the way it answers your voice`);
    },
    [name]
  );

  const keyDown = useCallback((note: string) => {
    setHeld((prev) => {
      if (prev.has(note)) return prev;
      const next = new Set(prev);
      next.add(note);
      return next;
    });
    noteBus.emitNoteOn(note, STRIP_VELOCITY);
  }, []);

  const keyUp = useCallback((note: string) => {
    setHeld((prev) => {
      if (!prev.has(note)) return prev;
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
    noteBus.emitNoteOff(note);
  }, []);

  const pill = (label: string, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        borderWidth: 1,
        borderColor: "rgba(242,192,99,0.45)",
        backgroundColor: "rgba(242,192,99,0.1)",
        borderRadius: 999,
        paddingVertical: 5,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <>
      <ToneEngine />
      {/* The surviving pill: the tray's whole standing footprint
          while parked (Slice 46's Fold discipline). */}
      <ChromeMount
        visible={!panelOpen}
        pointerEvents="box-none"
        style={{ position: "absolute", left: 12, bottom: 110 }}
      >
        <Pressable
          onPress={() => setPanelOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${name}'s tools`}
          style={{
            borderWidth: 1,
            borderColor: "rgba(242,192,99,0.45)",
            backgroundColor: "rgba(2,8,23,0.82)",
            borderRadius: 999,
            paddingVertical: 5,
            paddingHorizontal: 10,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
            Show tools
          </Text>
        </Pressable>
      </ChromeMount>
      {/* The tray: ONE cluster, docked bottom-left above the HUD
          band, its right edge clear of the info icon's corner. */}
      <ChromeMount
        visible={panelOpen}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 12,
          bottom: 110,
          width: 302,
          maxWidth: "76%",
        }}
      >
        <View
          style={{
            backgroundColor: "rgba(2,8,23,0.82)",
            borderWidth: 1,
            borderColor: "rgba(242,192,99,0.4)",
            borderRadius: radius.card,
            padding: spacing.sm + 2,
            gap: 6,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
              {name.toUpperCase()}&rsquo;S PLAYGROUND{" "}
              <Text style={{ color: colors.textDim, fontWeight: "400" }}>
                · every tool it has
              </Text>
            </Text>
            <Pressable
              onPress={() => setPanelOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={`Hide ${name}'s tools`}
            >
              <Text style={{ color: colors.textDim, fontSize: 12 }}>Hide</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textDim, fontSize: 11, lineHeight: 15 }}>
            These buttons ask {name} the way your voice does — same brain,
            same gates. Some of what it does, it decides on its own: talk
            to it, stroke it on the canvas to pet it, and watch it think.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {pill("Heartbeat", onHeartbeat, "hb")}
            {pill("Heart", () => onVerb("heart"), "heart")}
            {pill("Cheer", () => onVerb("cheer"), "cheer")}
            {pill("Tickle", () => onVerb("tickle"), "tickle")}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {pill("Draw a ring", () => setStatus(actLine(props.askDraw(), `${name} drew a ring around itself`)), "draw")}
            {pill("Play a note", () => setStatus(actLine(props.askNote(null), `${name} played a note`)), "note")}
            {pill("Play it again", () => setStatus(actLine(props.askNoteAgain(), `${name} played it again`)), "again")}
            {pill("Arpeggio", () => setStatus(actLine(props.askArpeggio(), `${name} played an arpeggio`)), "arp")}
          </View>
          <Text style={{ color: colors.textDim, fontSize: 11 }}>
            Play with it — it hears these notes, and may answer:
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {STRIP_NOTES.map((note) => (
              <Pressable
                key={note}
                onPressIn={() => keyDown(note)}
                onPressOut={() => keyUp(note)}
                accessibilityRole="button"
                accessibilityLabel={`Play ${note}`}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: "rgba(242,247,249,0.35)",
                  backgroundColor: held.has(note)
                    ? "rgba(242,192,99,0.55)"
                    : "rgba(242,247,249,0.92)",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingBottom: 3,
                }}
              >
                <Text style={{ color: "#131A20", fontSize: 9, fontWeight: "700" }}>
                  {note}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: colors.textDim, fontSize: 11 }}>
            Ways to talk to it (or just use the bar below):
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {pill(`“tickle, ${address}”`, () => sayAloud(`tickle, ${address}`), "say1")}
            {pill(`“${address}, play a note”`, () => sayAloud(`${address}, play a note`), "say2")}
            {pill("“it’s cold in here”", () => sayAloud("it's cold in here"), "say3")}
          </View>
          {status ? (
            <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>
              {status}
            </Text>
          ) : null}
        </View>
      </ChromeMount>
    </>
  );
}
