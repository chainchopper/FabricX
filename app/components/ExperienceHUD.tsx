import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View, Text } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useAR } from "../context/ARContext";
import { useMIDI } from "../../src/hooks/useMIDI";
import { getAudioReactive } from "../../src/shared/utils/audioReactive";
import {
  getRealtimeStatus,
  subscribeRealtimeStatus,
  type RealtimeStatus,
} from "../../shared/utils/realtimeStatus";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../src/ghost/ghostStore";
import { getJSON } from "../utils/storage";
import VerbBar from "../../src/components/sensory/VerbBar";
import ComposeBar from "../../src/components/sensory/ComposeBar";
import GhostIndicator from "../../src/ghost/GhostIndicator";
import Icon from "../../src/components/ui/Icon";
import { FABRIC_MENU_EVENT } from "./neo/MenuSheet";
import { colors, hit, motion, radius, spacing, type } from "../../src/theme/tokens";

/**
 * ExperienceHUD — Fabric's at-rest chrome (Slice 3 rebuild; layout only,
 * the data hooks and readout logic are the ones Slice 1/2 shipped).
 *
 * Canvas first: at rest there are four quiet clusters and nothing else —
 *   top-left   wordmark + presence dot + active experience
 *   top-right  ONE menu button (opens the MenuSheet home)
 *   bottom     the verb pill (VerbBar + ghost controls at its right end)
 *   (the connection chip lives under the menu button; the FPS meter is
 *    diagnostics-only since Slice 3)
 * Chrome fades in once on mount, after the canvas; it never remounts the
 * canvas and never competes with it. Presence dot: grey = solo, cyan =
 * peers here, ghost hue = a ghost is present; it pulses once on change,
 * then sits still.
 *
 * Slice 4 note: ComposeBar mounts in the bottom pill between VerbBar
 * and GhostIndicator — marked below — with zero redesign.
 *
 * Powered by Nirvana
 */

const VISITING_FRESH_MS = 15_000;

export default function ExperienceHUD() {
  // Platform const guard is safe; never changes across renders
  if (Platform.OS !== "web") return null;

  // Call hooks unconditionally and in stable order
  const { state } = useExperience();
  const { isARCameraActive } = useAR();
  const midi = useMIDI();
  const [rt, setRt] = useState<RealtimeStatus>(() => getRealtimeStatus());
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  const [, setTick] = useState(0);
  const [hue, setHue] = useState<number | null>(null);

  const chromeOpacity = useRef(new Animated.Value(0)).current;
  const dotScale = useRef(new Animated.Value(1)).current;

  useEffect(() => subscribeRealtimeStatus(setRt), []);
  useEffect(() => subscribeGhostState(setGhost), []);
  // Re-check periodically so a "visiting" ghost ages out of the dot.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);
  // Best-effort read of the ghost's signature hue (fabric_ghost_v1).
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const pref = await getJSON<{ identity?: { hue?: unknown } } | null>(
          "fabric_ghost_v1",
          null
        );
        const h = pref?.identity?.hue;
        if (live && typeof h === "number" && Number.isFinite(h)) setHue(h);
      } catch {
        // storage unavailable — fallback tint stays
      }
    })();
    return () => {
      live = false;
    };
  }, [ghost.ghostName]);
  // Chrome fades in once, after first paint.
  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [chromeOpacity]);

  const activeExperience = state.activeExperience;
  const experienceConfig = state.experienceConfig;

  const isARPiano = activeExperience?.id === "ar-piano";
  const midiEnabled = Boolean((experienceConfig.specific as any)?.midiEnabled ?? true);
  const activeNotes = isARPiano && midiEnabled ? midi.activeNotes : [];

  const audioReactiveEnabled = Boolean((experienceConfig.specific as any)?.audioReactiveEnabled ?? false);
  const audio = getAudioReactive();

  // Presence: ghost present > peers here > solo.
  const peers = rt.peers ?? 0;
  const visiting =
    peers > 0 &&
    ghost.sessionRole !== "host" &&
    Date.now() - ghost.sessionGhostLastSeenAt < VISITING_FRESH_MS;
  const ghostPresent =
    visiting ||
    ghost.sessionRole === "host" ||
    (ghost.enabled &&
      (ghost.presence === "present" ||
        ghost.presence === "sleeping" ||
        ghost.presence === "summoned"));
  const presenceKey = ghostPresent ? "ghost" : peers > 0 ? `peers-${peers}` : "solo";
  const dotColor = ghostPresent
    ? hue !== null
      ? `hsl(${hue}, 85%, 72%)`
      : colors.ghost
    : peers > 0
      ? colors.accent
      : "rgba(242,247,249,0.35)";
  const presenceLabel = ghostPresent
    ? (ghost.ghostName ?? "Ghost here")
    : peers > 0
      ? `${peers} here`
      : "Solo";

  // Pulse the dot once when presence changes; never loop.
  const prevPresenceKey = useRef(presenceKey);
  useEffect(() => {
    if (prevPresenceKey.current === presenceKey) return;
    prevPresenceKey.current = presenceKey;
    Animated.sequence([
      Animated.timing(dotScale, {
        toValue: 1.45,
        duration: 130,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(dotScale, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [presenceKey, dotScale]);

  const openMenu = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FABRIC_MENU_EVENT, { detail: "toggle" }));
    }
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        opacity: chromeOpacity,
      }}
    >
      {/* Top-left: wordmark + presence + active experience */}
      <View
        style={{
          position: "absolute",
          top: spacing.md,
          left: spacing.md,
          backgroundColor: colors.panel,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: radius.card,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minWidth: 168,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text
            style={{
              color: colors.text,
              fontSize: type.label,
              fontWeight: type.semibold,
              letterSpacing: 0.4,
            }}
          >
            Fabric
          </Text>
          <Animated.View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: dotColor,
              transform: [{ scale: dotScale }],
            }}
          />
          <Text style={{ color: colors.textDim, fontSize: type.caption }}>
            {presenceLabel}
          </Text>
        </View>
        <Text
          style={{
            color: colors.textDim,
            fontSize: type.caption,
            marginTop: spacing.xs,
          }}
        >
          {activeExperience
            ? `${activeExperience.name} · ${activeExperience.type}`
            : "No experience"}
        </Text>
        {isARCameraActive ? (
          <Text style={{ color: colors.accent, fontSize: type.caption, marginTop: spacing.xs }}>
            AR On
          </Text>
        ) : null}
        {isARPiano ? (
          <Text
            style={{
              color: midiEnabled ? colors.accent : colors.textDim,
              fontSize: type.caption,
              marginTop: spacing.xs,
            }}
          >
            MIDI {midiEnabled ? "On" : "Off"}{midiEnabled ? ` • ${activeNotes.length} notes` : ""}
          </Text>
        ) : null}
        {audioReactiveEnabled ? (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={{ color: colors.accent, fontSize: type.caption, marginBottom: spacing.xs }}>
              Mic Reactive
            </Text>
            <View
              style={{
                width: 140,
                height: 6,
                borderRadius: 6,
                backgroundColor: "rgba(242,247,249,0.18)",
                overflow: "hidden",
                marginBottom: spacing.sm,
              }}
            >
              <View
                style={{
                  width: `${Math.round(Math.min(1, Math.max(0, audio.energy)) * 100)}%`,
                  height: "100%",
                  backgroundColor: colors.accent,
                }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[
                { label: "B", value: audio.bass, color: colors.text },
                { label: "M", value: audio.mid, color: colors.textDim },
                { label: "T", value: audio.treble, color: colors.accent },
              ].map((b) => (
                <View key={b.label} style={{ alignItems: "center" }}>
                  <View
                    style={{
                      width: 36,
                      height: 6,
                      borderRadius: 6,
                      backgroundColor: "rgba(242,247,249,0.18)",
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round(Math.min(1, Math.max(0, b.value)) * 100)}%`,
                        height: "100%",
                        backgroundColor: b.color as string,
                      }}
                    />
                  </View>
                  <Text style={{ color: colors.textDim, fontSize: 10, marginTop: 2 }}>
                    {b.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Top-right: the one menu button */}
      <Pressable
        onPress={openMenu}
        pointerEvents="auto"
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        style={({ pressed }) => ({
          position: "absolute",
          top: spacing.md,
          right: spacing.md,
          width: hit,
          height: hit,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? colors.accentDim : colors.panel,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: radius.card,
        })}
      >
        <Icon name="menu" size={22} color={colors.text} />
      </Pressable>

      {/* Bottom-center: the verb pill (thumb bar) */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: spacing.lg,
          alignItems: "center",
        }}
      >
        <View
          pointerEvents="auto"
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: spacing.sm,
            maxWidth: "94%",
            backgroundColor: colors.panel,
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: radius.pill,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.sm,
            shadowColor: "#000000",
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          {/* Sensory verbs: send a Heart / Cheer / Tickle peers can feel. */}
          <VerbBar />
          {/* Pattern composer (Slice 4, PR #11): describe a feeling,
              Spark composes a pattern the whole session plays. Mounted
              in the pill slot Slice 3 left marked for it. */}
          <ComposeBar />
          <View
            style={{ width: 1, height: 24, backgroundColor: colors.line }}
          />
          {/* Ghost AI presence + controls (Slice 2): honest agent
              indicator with on/off toggle and Summon/Dismiss. */}
          <GhostIndicator />
        </View>
      </View>
    </Animated.View>
  );
}
