/**
 * FabricMenu — the ONE menu system (F doctrine).
 *
 * Everything the legacy left-edge rail used to scatter across ~14
 * pulsing buttons and ~14 drawers now starts here, behind the single
 * "F" anchor:
 *
 *   THIS LAYER — settings for the layer that is loaded, and only that
 *   layer. Stored per layer id (fabric_layer_settings_v1:<layerId>,
 *   see LayerSettingsMirror); no fixed registry of layers exists, so
 *   community / plugin / stock layers all work the same way.
 *
 *   UNIVERSAL — settings that belong to the user and the device, not
 *   to any layer: account, agent model tier (the AI Services panel),
 *   haptics / audio defaults, identity (the device-bound ghost), and
 *   privacy. The two scopes are visually separated and never mixed.
 *
 * The heavy legacy panels (Profile, Locker, Studio, Call, …) are not
 * rewritten here: they open as panels FROM this menu via the existing
 * NewDrawers controller, so nothing that worked becomes unreachable —
 * the rail is gone, the doors remain, there is just one hallway now.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import Icon, { type IconName } from "../../../src/components/ui/Icon";
import { useFabricChrome } from "./FabricChromeContext";
import { useNewDrawers } from "../neo/NewDrawersContext";
import { useExperience } from "../../context/ExperienceContext";
import { usePreferences } from "../../context/PreferencesContext";
import { getJSON } from "../../utils/storage";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";
import BackgroundControls from "../controls/BackgroundControls";
import FluidQualityControls from "../controls/FluidQualityControls";
import ParticleDensityControls from "../controls/ParticleDensityControls";
import AudioVolumeControls from "../controls/AudioVolumeControls";
import AmbienceControls from "../controls/AmbienceControls";
import MusicControls from "../controls/MusicControls";
import LayerControls from "../LayerControls";
import FabricDiagnostics from "../FabricDiagnostics";

type DrawerName =
  | "profile"
  | "neo"
  | "layer"
  | "studio"
  | "plugins"
  | "companion"
  | "shop"
  | "call"
  | "wallet"
  | "friends"
  | "settings"
  | "ai-settings"
  | "ai-chat"
  | "vision-ai";

const PANEL_ROWS: { name: DrawerName; label: string; icon: IconName }[] = [
  { name: "profile", label: "Profile", icon: "user" },
  { name: "neo", label: "Locker — layers, social, swarm", icon: "grid" },
  { name: "layer", label: "Layer library", icon: "layers" },
  { name: "studio", label: "Studio", icon: "spark" },
  { name: "plugins", label: "Plugins & add-ons", icon: "grid" },
  { name: "companion", label: "Companion", icon: "message" },
  { name: "shop", label: "Shop", icon: "bag" },
  { name: "call", label: "Call", icon: "call" },
  { name: "wallet", label: "Wallet", icon: "wallet" },
  { name: "friends", label: "People", icon: "people" },
  { name: "vision-ai", label: "Vision AI", icon: "eye" },
  { name: "ai-chat", label: "AI Chat", icon: "message" },
];

type AiConfigSummary = {
  provider: string;
  model: string;
  enabled: boolean;
} | null;

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.accent,
        fontSize: typeScale.caption,
        fontWeight: "700",
        letterSpacing: 1.5,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

function ToggleRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.accentDim : "transparent",
        marginBottom: spacing.sm,
      })}
    >
      <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
        {label}
      </Text>
      <Text
        style={{
          color: value ? colors.accent : colors.textDim,
          fontSize: typeScale.body,
          fontWeight: "700",
        }}
      >
        {value ? "On" : "Off"}
      </Text>
    </Pressable>
  );
}

export default function FabricMenu() {
  const { menuOpen, setMenuOpen, setHoldVisible, voiceOpen, setVoiceOpen, noteActivity } =
    useFabricChrome();
  const drawers = useNewDrawers();
  const { state, switchExperience } = useExperience();
  const prefs = usePreferences();

  const [ghost, setGhost] = useState<GhostPublicState>(() => getGhostPublicState());
  const [aiSummary, setAiSummary] = useState<AiConfigSummary>(null);
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => subscribeGhostState(setGhost), []);

  // Read the AI Services config summary each time the menu opens, so
  // the agent-tier line never shows stale provider/model text.
  useEffect(() => {
    if (!menuOpen) return;
    let cancelled = false;
    getJSON<any>("fabric_ai_config_v1", null)
      .then((cfg) => {
        if (cancelled || !cfg?.llm) return;
        setAiSummary({
          provider: String(cfg.llm.provider ?? "none"),
          model: String(cfg.llm.model ?? ""),
          enabled: Boolean(cfg.llm.enabled),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [menuOpen]);

  // While a legacy panel is open, hold the chrome fade and keep the
  // menu itself closed — one surface at a time.
  const drawerOpen = drawers.openName !== null;
  useEffect(() => {
    setHoldVisible(drawerOpen);
    if (drawerOpen) setMenuOpen(false);
  }, [drawerOpen, setHoldVisible, setMenuOpen]);

  if (Platform.OS !== "web" && !menuOpen) return null;
  if (!menuOpen) return null;

  const active = state.activeExperience;
  const isFluid = active?.id === "default-fluid";
  const roomId = String(
    ((state.experienceConfig.specific as any)?.roomId as string) || "main"
  );

  const openPanel = (name: DrawerName) => {
    noteActivity();
    drawers.open(name);
    setMenuOpen(false);
  };

  return (
    <Animated.View
      pointerEvents="auto"
      style={{
        position: "absolute",
        top: 76,
        left: 12,
        zIndex: 115,
        width: 348,
        maxWidth: "92%",
        maxHeight: "78%",
        backgroundColor: colors.sheet,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: radius.sheet,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: spacing.xs,
        }}
      >
        <View>
          <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
            Fabric
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            {active ? `${active.name} · room ${roomId}` : "No layer loaded"}
          </Text>
        </View>
        <Pressable
          onPress={() => setMenuOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Collapse menu"
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="close" size={20} color={colors.textDim} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------- THIS LAYER ---------------- */}
        <SectionHeader>{`THIS LAYER${active ? ` · ${active.name.toUpperCase()}` : ""}`}</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Settings below belong to this layer only and are saved under its
          own id — they never leak into other layers.
        </Text>

        {/* Layer switcher: the loaded layer is chosen here, on the canvas. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }}>
          {state.availableExperiences.map((exp) => {
            const selected = exp.id === active?.id;
            return (
              <Pressable
                key={exp.id}
                onPress={() => {
                  noteActivity();
                  void switchExperience(exp.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? colors.accent : colors.line,
                  backgroundColor: selected ? colors.accentDim : "transparent",
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.accent : colors.text,
                    fontSize: typeScale.body,
                    fontWeight: "700",
                  }}
                >
                  {exp.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* The active layer's real settings. Fluid wires its existing
            control set; every other layer uses the generic per-layer
            controls (camera filter, MIDI, AR) — both write through
            updateConfig and are mirrored per layer id. */}
        {isFluid ? (
          <View style={{ gap: spacing.md }}>
            <BackgroundControls />
            <FluidQualityControls />
            <ParticleDensityControls />
            <AudioVolumeControls />
            <AmbienceControls />
            <MusicControls />
          </View>
        ) : active ? (
          <LayerControls />
        ) : null}

        {/* ---------------- STUDIO ---------------- */}
        <SectionHeader>STUDIO — CREATE</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Creation is durable here, not on the canvas. The composer on
          the canvas is a quick action — it fires a pattern once and
          keeps nothing. Anything you make, name, save, edit, or
          preview lives in Studio.
        </Text>
        <View style={{ gap: spacing.xs }}>
          {(
            [
              { label: "Create / record a composition", panel: "studio" as DrawerName },
              { label: "Save & name a pattern (seed)", panel: "studio" as DrawerName },
              { label: "Edit / preview saved compositions", panel: "studio" as DrawerName },
              { label: "Configure the composer model", panel: "ai-settings" as DrawerName },
              { label: "Composer access & permissions", panel: "ai-settings" as DrawerName },
            ]
          ).map((row) => (
            <Pressable
              key={row.label}
              onPress={() => openPanel(row.panel)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: radius.card,
                backgroundColor: pressed ? colors.accentDim : "transparent",
              })}
            >
              <Icon name="spark" size={20} color={colors.text} />
              <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                {row.label}
              </Text>
              <Icon name="chevronRight" size={16} color={colors.textDim} />
            </Pressable>
          ))}
        </View>

        {/* ---------------- UNIVERSAL ---------------- */}
        <SectionHeader>UNIVERSAL</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Yours, on this device — the same on every layer.
        </Text>

        <ToggleRow
          label="Haptics"
          value={prefs.hapticsEnabled}
          onPress={() => prefs.setHapticsEnabled(!prefs.hapticsEnabled)}
        />
        <ToggleRow
          label="Audio cues"
          value={prefs.audioEnabled}
          onPress={() => prefs.setAudioEnabled(!prefs.audioEnabled)}
        />
        <ToggleRow
          label="Voice input panel"
          value={voiceOpen}
          onPress={() => setVoiceOpen(!voiceOpen)}
        />

        {/* Agent model tier — the AI Services panel itself stays the
            editor (keys, endpoints, Meta preset); this is its summary
            and the door to it. */}
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            padding: spacing.md,
            marginBottom: spacing.sm,
            gap: 4,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            Agent model
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            {aiSummary
              ? aiSummary.provider === "none"
                ? "On-device ghost only — no cloud model connected."
                : `${aiSummary.model || aiSummary.provider} · ${aiSummary.enabled ? "connected" : "saved, currently off"}`
              : "On-device ghost by default; cloud models are opt-in."}
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Default is the small on-device model. Larger models (WebGPU /
            native builds, or the cloud Spark tier) are chosen here, per
            your hardware — never silently.
          </Text>
          <Pressable
            onPress={() => openPanel("ai-settings")}
            accessibilityRole="button"
            style={{ paddingVertical: 6 }}
          >
            <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
              AI Services — keys, endpoints, Meta preset ›
            </Text>
          </Pressable>
        </View>

        {/* Identity — the ghost IS the v0 LifePacket: a persistent,
            device-bound identity (name + signature hue + seed). */}
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.ghostLine,
            borderRadius: radius.card,
            padding: spacing.md,
            marginBottom: spacing.sm,
            gap: 4,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            Identity · your ghost
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            {ghost.ghostName
              ? `${ghost.ghostName} · ${ghost.temperament ?? ghost.presence} · bound to this device`
              : "Your ghost's persistent, device-bound identity lives here."}
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Privacy: the ghost is always labeled as an AI agent, never
            appears as a person, and a visiting ghost's sensations can be
            muted from its pill on the canvas.
          </Text>
        </View>

        {/* Panels — everything the rail used to open, from one list. */}
        <SectionHeader>OPEN</SectionHeader>
        <View style={{ gap: spacing.xs }}>
          {PANEL_ROWS.map((row) => (
            <Pressable
              key={row.name}
              onPress={() => openPanel(row.name)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: radius.card,
                backgroundColor: pressed ? colors.accentDim : "transparent",
              })}
            >
              <Icon name={row.icon} size={20} color={colors.text} />
              <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                {row.label}
              </Text>
              <Icon name="chevronRight" size={16} color={colors.textDim} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => openPanel("settings")}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: radius.card,
              backgroundColor: pressed ? colors.accentDim : "transparent",
            })}
          >
            <Icon name="gear" size={20} color={colors.text} />
            <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              Preferences panel
            </Text>
            <Icon name="chevronRight" size={16} color={colors.textDim} />
          </Pressable>
        </View>

        {/* Diagnostics — the panel that used to need a drawer hunt. */}
        <Pressable
          onPress={() => setShowDiag((v) => !v)}
          accessibilityRole="button"
          style={{ paddingVertical: 10 }}
        >
          <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
            {showDiag ? "Hide diagnostics" : "Diagnostics"}
          </Text>
        </Pressable>
        {showDiag ? <FabricDiagnostics /> : null}

        <Text
          style={{
            color: colors.textDim,
            fontSize: typeScale.caption,
            marginTop: spacing.lg,
            textAlign: "center",
          }}
        >
          Powered by Nirvana
        </Text>
      </ScrollView>
    </Animated.View>
  );
}
