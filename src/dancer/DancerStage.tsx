/**
 * DancerStage — the Dancer Stage experience (canvas: "stage3d").
 *
 * Realignment (Terrell, Oct 28): the dancer is not an overlay on
 * the fluid — it is a whole fabric of its own. This component IS
 * the canvas of the dancer-stage experience: a full
 * react-three-fiber stage (its own camera, lights, GPU shader
 * floor) mounted by ExperienceRenderer in place of the fluid.
 *
 * DOM side (this file):
 *  - owns the DancerDriver and the shared stage fx object;
 *  - feeds the driver from the note bus — local key-strip notes
 *    AND remote room notes arrive already merged there
 *    (subscribe-only: the driver never sees the transport);
 *  - every note-on also becomes a stage effect (floor ripple,
 *    accent flash, mote tint) via the fx queue;
 *  - useStageNotes runs the room transport: local notes out,
 *    verbs out + in (choreographed by the rig), Slice 5 gating
 *    inside the send funnel, exactly as the piano layer;
 *  - ToneEngine sounds the notes (shared synth + sampled piano
 *    voice, packs ensured on mount like the piano layer does).
 *
 * THIS LAYER settings (specific.*): stageDancerEnabled (figure
 * dances vs stands at rest), stageCameraDrift, stageTheme.
 * Idle contract: `breathe` — driver breath phase sways the figure,
 * the camera drifts, motes float.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Canvas } from "@react-three/fiber";
import { useExperience } from "../contexts/ExperienceContext";
import { noteBus } from "../../shared/utils/noteBus";
import ToneEngine from "../components/audio/ToneEngine";
import { ensureSoundfontPiano } from "../audio/soundfontPiano";
import { DancerDriver, noteHue, noteNameToMidi } from "./DancerDriver";
import StageScene from "./StageScene";
import { useStageNotes } from "./useStageNotes";
import { createStageFx, stageThemeHue } from "./stageFx";

export default function DancerStage({
  onReady,
}: {
  onReady?: () => void;
}) {
  const { state } = useExperience();
  const specific = (state.experienceConfig.specific ?? {}) as Record<
    string,
    unknown
  >;
  const roomId =
    typeof specific.roomId === "string" && specific.roomId
      ? specific.roomId
      : "stage";
  const figureEnabled = specific.stageDancerEnabled !== false;
  const drift = specific.stageCameraDrift !== false;
  const themeHue = stageThemeHue(specific.stageTheme);

  const driver = useMemo(() => new DancerDriver(), []);
  const fx = useMemo(createStageFx, []);
  const fxRef = useRef(fx);

  // Note bus -> driver + stage effects. The bus already merges
  // local surfaces (key strip, hardware MIDI) and remote peers;
  // the driver is subscribe-only by design.
  useEffect(() => {
    const off = noteBus.on((e) => {
      driver.handleNoteEvent(e);
      if (e.type === "on") {
        fxRef.current.pendingNotes.push({
          hue: noteHue(noteNameToMidi(e.note)),
          strength: e.velocity ?? 0.7,
        });
      }
    });
    return off;
  }, [driver]);

  // Room transport (notes out, verbs both ways), session-gated.
  useStageNotes(roomId, true, (verbId) => {
    fxRef.current.pendingGestures.push(verbId);
  });

  // Sampled piano voice, same lazy pack load as the piano layer.
  useEffect(() => {
    void ensureSoundfontPiano();
  }, []);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.fill}>
        <Text style={styles.note}>Dancer Stage is a web stage for now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        camera={{ fov: 40, near: 0.1, far: 60, position: [0, 1.7, 4.6] }}
        onCreated={() => onReady?.()}
      >
        <StageScene
          driver={driver}
          fx={fx}
          figureEnabled={figureEnabled}
          drift={drift}
          themeHue={themeHue}
        />
      </Canvas>
      <ToneEngine />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#070a12",
  },
  note: { color: "#8fa3b8", fontSize: 13, margin: 24 },
});
