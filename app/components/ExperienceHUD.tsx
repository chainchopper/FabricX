import React, { useEffect, useState } from "react";
import { Animated, Platform, Pressable, View, Text } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useAR } from "../context/ARContext";
import { useMIDI } from "../../src/hooks/useMIDI";
import { getAudioReactive } from "../../src/shared/utils/audioReactive";
import VerbBar from "../../src/components/sensory/VerbBar";
import ComposeBar from "../../src/components/sensory/ComposeBar";
import GhostIndicator from "../../src/ghost/GhostIndicator";
import { useFabricChrome } from "./fabric/FabricChromeContext";
import PianoKeyboard from "./PianoKeyboard";
import FrequencyDancer from "../../src/components/piano/FrequencyDancer";
import { colors, radius, spacing } from "../../src/theme/tokens";
import {
  SESSION_MODE_LABEL,
  getSessionPublicState,
  subscribeSessionState,
  type SessionPublicState,
} from "../../src/session/sessionStore";
import { displayNameFor } from "../../src/identity/identityStore";
import { useIdentitySnapshot } from "../../src/identity/useIdentity";
import {
  audioGestureSeen,
  subscribeAudioState,
  unlockAudio,
  useAudioContextState,
} from "../../src/audio/sharedAudio";

/**
 * ExperienceHUD — the collapsed state of the F doctrine.
 *
 * Before the rebuild this was a top-left panel that collided with the
 * rail's 96px logo button (which covered its Heart button), the
 * connection badge, and the FPS chip — five surfaces fighting for the
 * same corner. Now the collapsed state is exactly ONE cluster, bottom
 * center, holding only the loaded layer's own controls:
 *
 *   layer label + live status · Heart / Cheer / Tickle · Compose ·
 *   ghost pill
 *
 * in separate rows that can never overlap. Heart is always fully
 * visible. The whole cluster fades with the chrome after ~4s idle
 * (FabricChromeContext) and stops receiving touches while faded, so
 * the canvas is the only thing on screen — touch anywhere restores.
 *
 * All wiring is unchanged: VerbBar / ComposeBar / GhostIndicator still
 * talk to the single persistent canvas through their window events.
 *
 * Mount point (the tappability fix): this cluster is rendered by
 * _layout's ChromeLayer as a direct child of the root view — NOT from
 * GlobalFabricBackground, whose old root for this panel was
 * pointerEvents="none". react-native-web compiles a "none" ancestor
 * into a CSS descendant rule stripping hit-testing from every
 * descendant without its own explicit value, which is why the old
 * panel's buttons rendered but never took a tap. Here the ancestry
 * contains no "none" at all, the wrapper uses box-none (descendants
 * auto), and each interactive child carries its own
 * pointerEvents="auto" besides. Width: the cluster is capped at 96%
 * of the viewport and every row wraps, so nothing is cut off at
 * phone widths.
 *
 * Powered by Nirvana
 */
export default function ExperienceHUD() {
  const { state } = useExperience();
  const { isARCameraActive } = useAR();
  const midi = useMIDI();
  const { idle, chromeOpacity } = useFabricChrome();
  // Slice 5: the session chip lives in this status row precisely
  // because the row already obeys the idle fade — a guest's mode
  // badge must melt away with the rest of the chrome.
  const [session, setSession] = useState<SessionPublicState>(() =>
    getSessionPublicState()
  );
  useEffect(() => subscribeSessionState(setSession), []);
  // Slice 6: subscribing to identity changes is what lets the driver
  // line below swap a peer's short id for their name the moment
  // their card lands — the snapshot itself is read via the resolver.
  useIdentitySnapshot();
  // Hotfix 1.8: shared-audio state for the "Sound on" chip below.
  const audioState = useAudioContextState();
  const [gestured, setGestured] = useState<boolean>(() => audioGestureSeen());
  useEffect(
    () => subscribeAudioState(() => setGestured(audioGestureSeen())),
    []
  );

  // Platform const guard is safe; never changes across renders.
  if (Platform.OS !== "web") return null;

  const activeExperience = state.activeExperience;
  const experienceConfig = state.experienceConfig;

  const isARPiano = activeExperience?.id === "ar-piano";
  const midiEnabled = Boolean((experienceConfig.specific as any)?.midiEnabled ?? true);
  // Frequency Dancer (spike v0): a per-layer feature of the piano
  // layer, stored like the ghost/ambient toggles (specific.
  // dancerEnabled, mirrored per layer id). Absent means ON — the
  // dancer is the piano layer's showpiece.
  const dancerEnabled = Boolean((experienceConfig.specific as any)?.dancerEnabled ?? true);
  const activeNotes = isARPiano && midiEnabled ? midi.activeNotes : [];

  const audioReactiveEnabled = Boolean((experienceConfig.specific as any)?.audioReactiveEnabled ?? false);
  const audio = getAudioReactive();

  return (
    <Animated.View
      pointerEvents={idle ? "none" : "box-none"}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 14,
        zIndex: 60,
        alignItems: "center",
        opacity: chromeOpacity,
      }}
    >
      {/* Frequency Dancer (spike v0): stands on top of the cluster,
          dancing to the note bus — local and remote notes alike.
          Pure overlay: pointerEvents="none" throughout, so it can
          never eat a touch meant for the keys or the canvas. */}
      {isARPiano && midiEnabled && dancerEnabled ? <FrequencyDancer /> : null}
      <View
        pointerEvents="box-none"
        style={{
          backgroundColor: colors.panel,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: radius.sheet,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          maxWidth: "96%",
          flexShrink: 1,
          alignItems: "center",
        }}
      >
        {/* Layer label + live status, one quiet line. */}
        <View
          pointerEvents="none"
          style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
            {activeExperience?.name ?? "—"}
          </Text>
          <Text style={{ color: colors.textDim, fontSize: 11 }}>
            {activeExperience?.type ?? "no-experience"}
          </Text>
          {session.hostId ? (
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>
              {SESSION_MODE_LABEL[session.mode]}
              {session.role === "host"
                ? " · hosting"
                : session.role === "guest"
                  ? " · guest"
                  : ""}
            </Text>
          ) : null}
          {session.hostId && session.mode === "control" && session.driverId ? (
            <Text style={{ color: colors.textDim, fontSize: 11 }}>
              {session.driverId === session.selfId
                ? "you're driving"
                : `${displayNameFor(session.driverId, session.selfId)} driving`}
            </Text>
          ) : null}
          {isARCameraActive ? (
            <Text style={{ color: "#34d399", fontSize: 11 }}>AR On</Text>
          ) : null}
          {isARPiano ? (
            <Text style={{ color: midiEnabled ? "#34d399" : "#9ca3af", fontSize: 11 }}>
              MIDI {midiEnabled ? `On · ${activeNotes.length} notes` : "Off"}
            </Text>
          ) : null}
          {audioReactiveEnabled ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: colors.accent, fontSize: 11 }}>Mic</Text>
              <View style={{ width: 44, height: 5, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.35)", overflow: "hidden" }}>
                <View style={{ width: `${Math.round(Math.min(1, Math.max(0, audio.energy)) * 100)}%`, height: "100%", backgroundColor: colors.accent }} />
              </View>
            </View>
          ) : null}
        </View>

        {/* AR Piano's playable surface (piano-surface hotfix): the 3D
            keybed renders edge-on and invisible from the scene camera,
            so the layer's real keys live here in the cluster — the
            doctrine's home for layer controls. Notes ride the noteBus
            into the same sound + fluid pipeline hardware MIDI uses. */}
        {isARPiano && midiEnabled ? <PianoKeyboard /> : null}

        {/* Hotfix 1.8 "Sound on" chip: shown only when gestures have
            happened but the shared audio context is STILL suspended
            (e.g. a synth created its context after the last gesture)
            — a real button, carrying its own pointerEvents="auto"
            per the PR #16 rule, whose tap resumes the context inside
            the tap's own call stack. When the context runs, the chip
            is gone; if notes then sound on a peer's device but not
            this one, the remaining suspect is the device channel
            (iOS hardware mute / ringer routing), not the app — the
            ?diag=1 panel's `audio` line states the same verdict. */}
        {gestured && audioState === "suspended" ? (
          <Pressable
            pointerEvents="auto"
            onPress={() => unlockAudio()}
            accessibilityRole="button"
            accessibilityLabel="Turn sound on"
            style={{
              alignSelf: "center",
              marginTop: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: "#06202b", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
              🔊 SOUND ON
            </Text>
          </Pressable>
        ) : null}

        {/* Sensory verbs: send a Heart / Cheer / Tickle peers can feel. */}
        <VerbBar />
        {/* Pattern composer (Slice 4): describe a feeling, Spark composes
            a pattern the whole session plays. */}
        <ComposeBar />
        {/* Ghost AI presence + controls (Slice 2): honest agent indicator
            with on/off toggle and Summon/Dismiss for shared sessions. */}
        <GhostIndicator />
      </View>
    </Animated.View>
  );
}
