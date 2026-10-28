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

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import Icon, { type IconName } from "../../../src/components/ui/Icon";
import { useFabricChrome } from "./FabricChromeContext";
import { useNewDrawers } from "../neo/NewDrawersContext";
import { useExperience } from "../../context/ExperienceContext";
import { usePreferences } from "../../context/PreferencesContext";
import { getJSON } from "../../utils/storage";
import { buildInviteUrl } from "../../utils/invite";
import * as Clipboard from "expo-clipboard";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";
import {
  FABRIC_SHARE_LIVE_EVENT,
  SESSION_MODES,
  SESSION_MODE_BLURB,
  SESSION_MODE_LABEL,
  getSessionPublicState,
  mintRoomId,
  parseInviteHint,
  requestHostSession,
  requestPassControl,
  requestStopHosting,
  subscribeSessionState,
  type SessionMode,
  type SessionPublicState,
} from "../../../src/session/sessionStore";
import {
  displayNameFor,
  hueCss,
} from "../../../src/identity/identityStore";
import {
  useIdentitySnapshot,
  useLocalIdentity,
} from "../../../src/identity/useIdentity";
import LifePacketCard from "./LifePacketCard";
import { requestFirstBreath } from "../../../src/onboarding/onboardingStore";
import { patternPlayer } from "../../../src/ai/PatternPlayer";
import { FABRIC_PLAY_PATTERN_EVENT } from "../../../src/ai/PatternComposer";
import {
  getCompositionById,
  type SavedComposition,
} from "../../../src/ai/compositionsStore";
import { useCompositions } from "../../../src/ai/useCompositions";
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
  const { state, switchExperience, updateConfig } = useExperience();
  const prefs = usePreferences();

  const [ghost, setGhost] = useState<GhostPublicState>(() => getGhostPublicState());
  const [aiSummary, setAiSummary] = useState<AiConfigSummary>(null);
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => subscribeGhostState(setGhost), []);

  // ---- Share & Session (Slice 5) -----------------------------------
  // The session truth (mode / host / driver / enforcement results) is
  // published by the canvas's transport hook into the session store;
  // this menu only reads it and records host intent. It never guesses
  // presence and never enforces anything itself — enforcement lives
  // in useFluidMultiUser.sendInteraction and the fluid engine.
  const [session, setSession] = useState<SessionPublicState>(() =>
    getSessionPublicState()
  );
  const [pickedMode, setPickedMode] = useState<SessionMode>("collab");
  const [mintedRoom, setMintedRoom] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => subscribeSessionState(setSession), []);

  // ---- Who's Who (Slice 6) ---------------------------------------
  // Participant identity: the snapshot carries my own face (once the
  // store has loaded/generated it) and every peer face learned from
  // announces and interaction stamps. The roster and every peer
  // label below read names/colors from here — the session store
  // still owns roles and enforcement; identity owns who's who.
  const identity = useIdentitySnapshot();
  const localIdentity = useLocalIdentity();
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  // ---- Studio compositions (Slice 8) ------------------------------
  // The real saved-compositions store: the share-live rows in the
  // STUDIO section below read the same list Studio shows.
  const compositions = useCompositions();

  const pickedModeRef = useRef(pickedMode);
  pickedModeRef.current = pickedMode;

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

  // Move this client to a room: experience config (the transport
  // rebinds to it) + the URL, the same way ExperienceControls has
  // always switched rooms, so a reload keeps the room.
  const moveRoom = (id: string) => {
    updateConfig({
      specific: { ...(state.experienceConfig.specific as any), roomId: id },
    });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const loc = new URL(window.location.href);
      loc.searchParams.set("room", id);
      if (state.activeExperience?.id) {
        loc.searchParams.set("exp", state.activeExperience.id);
      }
      window.history.replaceState({}, "", loc.toString());
    }
  };

  // Mint a fresh room, claim hosting of it in the picked mode, and
  // move into it. The intent is recorded BEFORE the move: the
  // transport hook for the new room reads it on bind (sessionStore).
  const startHosting = (mode: SessionMode) => {
    noteActivity();
    const id = mintRoomId();
    requestHostSession(id, mode);
    setMintedRoom(id);
    setShareNotice(null);
    moveRoom(id);
  };
  const startHostingRef = useRef(startHosting);
  startHostingRef.current = startHosting;

  // Studio's "Share live" (FABRIC_SHARE_LIVE_EVENT): make sure a
  // hosted session exists, close the drawer, and open this menu on
  // the SHARE section with the link ready. Since Slice 8 the event
  // carries the saved composition's id; its real pattern is looked
  // up in the compositions store and played into the room through
  // the same playback path as everything else.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onShareLive = (ev: Event) => {
      const detail = (ev as CustomEvent<{ name?: string; id?: string }>)
        .detail;
      const name = detail?.name ?? "Composition";
      drawers.closeAll();
      if (getSessionPublicState().role !== "host") {
        startHostingRef.current(pickedModeRef.current);
      }
      const comp = getCompositionById(detail?.id);
      if (comp) {
        window.dispatchEvent(
          new CustomEvent(FABRIC_PLAY_PATTERN_EVENT, { detail: comp.pattern })
        );
        setShareNotice(
          `“${name}” is playing live in this room — send the invite link under SHARE and guests feel it as they land.`
        );
      } else {
        setShareNotice(
          `“${name}” is live — send the invite link under SHARE and guests land in this room.`
        );
      }
      setMenuOpen(true);
    };
    window.addEventListener(FABRIC_SHARE_LIVE_EVENT, onShareLive as EventListener);
    return () => {
      window.removeEventListener(FABRIC_SHARE_LIVE_EVENT, onShareLive as EventListener);
    };
  }, [drawers, setMenuOpen]);

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
  // The last pattern composed this session (Slice 4/5): the one real
  // artifact "Share live" can replay into the room right now. Read at
  // render — the menu re-renders on open, so this is never stale.
  const lastPattern = patternPlayer.lastPattern;

  // "Ghost in this layer" — the ghost is a feature OF the layer, so
  // its toggle lives in this layer's own config (specific.ghostEnabled),
  // persisted per layer id by the settings mirror and restored when
  // the layer is activated again. Absent means on. LegacyFluid reads
  // the same field to gate the local ghost brain, and the ghost pill
  // leaves the canvas cluster while a layer has it off. Distinct from
  // the per-user ghost preference (fabric_ghost_v1, UNIVERSAL): the
  // ghost runs only when both are on.
  const ghostInLayer =
    (state.experienceConfig.specific as any)?.ghostEnabled !== false;
  const setGhostInLayer = (next: boolean) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        ghostEnabled: next,
      },
    });
  };

  // "Ambient life" — Slice 7. The idle contract (src/types/
  // experience.ts) requires every layer to declare what it does
  // when nobody is touching it; the base fluid declares `ambient`:
  // left alone, it breathes, wanders, and blooms a little instead of
  // dying (Terrell: "it should breathe and play a little and just be
  // alone on its own"). Like the ghost toggle, the value lives in
  // this layer's own config (specific.ambientEnabled), persisted per
  // layer id by the settings mirror. Absent means on. LegacyFluid's
  // ambient driver reads the same field; the life it makes is local
  // to each device and never enters the room's send path.
  const ambientInLayer =
    (state.experienceConfig.specific as any)?.ambientEnabled !== false;
  const setAmbientInLayer = (next: boolean) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        ambientEnabled: next,
      },
    });
  };

  const openPanel = (name: DrawerName) => {
    noteActivity();
    drawers.open(name);
    setMenuOpen(false);
  };

  // ---- Slice 5 handlers -------------------------------------------
  const copyInvite = async (url: string) => {
    noteActivity();
    try {
      if (
        typeof navigator !== "undefined" &&
        (navigator as any).clipboard?.writeText
      ) {
        await (navigator as any).clipboard.writeText(url);
      } else {
        await Clipboard.setStringAsync(url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the link stays visible as text,
      // which is the designed last-resort copy path.
    }
  };

  const shareInvite = async (url: string) => {
    noteActivity();
    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: "Fabric", text: "Join my Fabric canvas", url });
      } catch {
        // Share sheet dismissed — nothing to do, the link is below.
      }
      return;
    }
    void copyInvite(url);
  };

  const leaveSession = () => {
    noteActivity();
    setMintedRoom(null);
    setShareNotice(null);
    moveRoom("main");
  };

  // Replay a pattern into the room so guests feel it — hosting first
  // if needed. Playback rides FABRIC_PLAY_PATTERN_EVENT into
  // LegacyFluid's pattern dispatch, which broadcasts through
  // sendInteraction like live input.
  const sharePatternLive = (p: typeof patternPlayer.lastPattern) => {
    if (!p || typeof window === "undefined") return;
    noteActivity();
    if (getSessionPublicState().role !== "host") {
      startHosting(pickedMode);
    }
    window.dispatchEvent(
      new CustomEvent(FABRIC_PLAY_PATTERN_EVENT, { detail: p })
    );
    setShareNotice(
      `Playing “${p.name}” into the room now — everyone here feels it. Send the invite link under SHARE so others can join live.`
    );
  };

  // Slice 8: a saved composition shares live exactly the same way —
  // the store is the data source, the playback path is unchanged.
  const shareCompositionLive = (comp: SavedComposition) => {
    sharePatternLive(comp.pattern);
  };

  const renderModeRows = (
    current: SessionMode,
    onPick: (m: SessionMode) => void
  ) => (
    <View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
      {SESSION_MODES.map((m) => {
        const selected = m === current;
        return (
          <Pressable
            key={m}
            pointerEvents="auto"
            onPress={() => {
              noteActivity();
              onPick(m);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: selected ? colors.accent : colors.line,
              backgroundColor: selected || pressed ? colors.accentDim : "transparent",
            })}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: selected ? colors.accent : "transparent",
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                {SESSION_MODE_LABEL[m]}
              </Text>
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                {SESSION_MODE_BLURB[m]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

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

        {/* Ghost in this layer — a per-layer feature toggle, shown for
            every layer and stored under that layer's own id like the
            settings above. Off: the local ghost does not run in this
            layer and its pill leaves the canvas cluster. */}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            Ghost in this layer
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {([true, false] as const).map((val) => {
              const selected = ghostInLayer === val;
              return (
                <Pressable
                  key={String(val)}
                  pointerEvents="auto"
                  onPress={() => setGhostInLayer(val)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Ghost in this layer ${val ? "on" : "off"}`}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
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
                    {val ? "On" : "Off"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Your ghost lives in this layer and plays along with the room.
            Off applies to this layer only — other layers keep their own
            setting, and your ghost preference in Universal still applies.
          </Text>
        </View>

        {/* Ambient life in this layer — the idle contract's setting.
            Same per-layer storage as the ghost toggle above. On: when
            everyone goes quiet, this layer breathes and plays a
            little on its own (locally only — nothing is sent to the
            room, and any real touch takes over instantly). Off: the
            layer is allowed to rest completely still. */}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            Ambient life
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {([true, false] as const).map((val) => {
              const selected = ambientInLayer === val;
              return (
                <Pressable
                  key={String(val)}
                  pointerEvents="auto"
                  onPress={() => setAmbientInLayer(val)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Ambient life ${val ? "on" : "off"}`}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
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
                    {val ? "On" : "Off"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            When everyone goes quiet, this layer breathes, drifts, and
            blooms a little on its own — each device in its own rhythm,
            nothing sent to the room. Any touch, note, or ghost gesture
            takes over instantly. Off lets this layer rest still.
          </Text>
        </View>

        {/* ---------------- SHARE ---------------- */}
        <SectionHeader>SHARE — SESSION</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Room {roomId} ·{" "}
          {session.online === "online"
            ? "Online"
            : session.online === "connecting"
              ? "Connecting…"
              : "Local"}{" "}
          · {session.peers} {session.peers === 1 ? "peer" : "peers"} here
          {session.hostId ? ` · ${SESSION_MODE_LABEL[session.mode]} session` : " · open room"}
        </Text>

        {/* Who's Who roster (Slice 6): everyone in the room by name
            and signature color — you first, then each known guest.
            Roles ride the session state; faces ride the identity
            store. A peer whose card hasn't landed yet keeps their
            short id and a grey dot — a person is never a blank row. */}
        {session.guestIds.length > 0 ? (
          <View style={{ marginBottom: spacing.sm, gap: 4 }}>
            {[session.selfId, ...session.guestIds.filter((g) => g !== session.selfId)].map(
              (pid) => {
                const isSelf = pid === session.selfId;
                const hue = isSelf
                  ? identity.self?.hue
                  : identity.peers[pid]?.hue;
                const tag = isSelf
                  ? session.role === "host"
                    ? "you · host"
                    : session.driverId === pid
                      ? "you · driving"
                      : "you"
                  : pid === session.hostId
                    ? "host"
                    : pid === session.driverId
                      ? "driving"
                      : session.hostId
                        ? "guest"
                        : "here";
                return (
                  <View
                    key={pid}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor:
                          typeof hue === "number" ? hueCss(hue) : colors.textDim,
                      }}
                    />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: typeScale.body,
                        fontWeight: isSelf ? "700" : "400",
                      }}
                    >
                      {isSelf
                        ? (identity.self?.name ?? "you")
                        : displayNameFor(pid, session.selfId)}
                    </Text>
                    <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                      {tag}
                    </Text>
                  </View>
                );
              }
            )}
          </View>
        ) : null}

        {shareNotice ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.accentLine,
              borderRadius: radius.card,
              padding: spacing.md,
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.caption }}>
              {shareNotice}
            </Text>
          </View>
        ) : null}

        {(() => {
          const isHost =
            session.role === "host" ||
            (mintedRoom !== null && mintedRoom === roomId && session.role !== "guest");
          const hostMode = session.role === "host" ? session.mode : pickedMode;
          const inviteUrl = buildInviteUrl(roomId, active?.id, hostMode);

          if (isHost) {
            return (
              <View>
                <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginBottom: spacing.xs }}>
                  You're hosting this room
                </Text>
                <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
                  The mode is the room's live law — enforced on every
                  guest's device, not just displayed. Change it any time.
                </Text>
                {renderModeRows(hostMode, (m) => {
                  setPickedMode(m);
                  requestHostSession(roomId, m);
                })}

                {session.mode === "control" || (session.role !== "host" && pickedMode === "control") ? (
                  <View style={{ marginBottom: spacing.sm }}>
                    <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.xs }}>
                      Driver:{" "}
                      {session.driverId === session.selfId || session.role !== "host"
                        ? "you"
                        : displayNameFor(session.driverId, session.selfId)}
                    </Text>
                    {session.guestIds.length === 0 ? (
                      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                        No guests yet — send the invite link, then pass
                        the brush from here.
                      </Text>
                    ) : (
                      session.guestIds.map((gid) => {
                        const driving = session.driverId === gid;
                        return (
                          <View
                            key={gid}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              paddingVertical: 6,
                            }}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                              <View
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 5,
                                  backgroundColor: identity.peers[gid]
                                    ? hueCss(identity.peers[gid].hue)
                                    : colors.textDim,
                                }}
                              />
                              <Text style={{ color: colors.text, fontSize: typeScale.body }}>
                                {displayNameFor(gid, session.selfId)}
                              </Text>
                            </View>
                            {driving ? (
                              <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                                Driving
                              </Text>
                            ) : (
                              <Pressable
                                pointerEvents="auto"
                                onPress={() => {
                                  noteActivity();
                                  requestPassControl(gid);
                                }}
                                accessibilityRole="button"
                                style={{ paddingVertical: 4, paddingHorizontal: 8 }}
                              >
                                <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                                  Give control
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })
                    )}
                    {session.role === "host" &&
                    session.driverId &&
                    session.driverId !== session.selfId ? (
                      <Pressable
                        pointerEvents="auto"
                        onPress={() => {
                          noteActivity();
                          requestPassControl(null);
                        }}
                        accessibilityRole="button"
                        style={{ paddingVertical: 6 }}
                      >
                        <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                          Take back control
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <Text
                  selectable
                  style={{
                    color: colors.text,
                    fontSize: typeScale.caption,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.card,
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                  }}
                >
                  {inviteUrl}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Pressable
                    pointerEvents="auto"
                    onPress={() => void shareInvite(inviteUrl)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: radius.card,
                      backgroundColor: pressed ? colors.accentDim : colors.accent,
                    })}
                  >
                    <Text style={{ color: "#06202a", fontSize: typeScale.body, fontWeight: "800" }}>
                      Share link
                    </Text>
                  </Pressable>
                  <Pressable
                    pointerEvents="auto"
                    onPress={() => void copyInvite(inviteUrl)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 10,
                      borderRadius: radius.card,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: pressed ? colors.accentDim : "transparent",
                    })}
                  >
                    <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                      {copied ? "Copied" : "Copy link"}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  pointerEvents="auto"
                  onPress={() => {
                    noteActivity();
                    setMintedRoom(null);
                    requestStopHosting();
                  }}
                  accessibilityRole="button"
                  style={{ paddingVertical: 6 }}
                >
                  <Text style={{ color: colors.textDim, fontSize: typeScale.body, fontWeight: "600" }}>
                    Stop hosting — room becomes open collab
                  </Text>
                </Pressable>
              </View>
            );
          }

          if (session.role === "guest") {
            const driving = session.mode === "control" && session.driverId === session.selfId;
            const guestLine =
              session.mode === "mirror"
                ? "You see the host's canvas live. Your touches paint only your own screen — the host never sees them."
                : session.mode === "view"
                  ? "Audience mode: your canvas input is off. What the host makes is what you feel."
                  : session.mode === "control"
                    ? driving
                      ? "You're driving — the whole room feels your touches."
                      : `${displayNameFor(session.driverId, session.selfId)} is driving. Your touches stay on your screen until the brush comes to you.`
                    : "Everyone draws on the shared canvas here.";
            return (
              <View>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.accentLine,
                    borderRadius: radius.card,
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                    {SESSION_MODE_LABEL[session.mode]} · hosted by {displayNameFor(session.hostId, session.selfId)}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                    {guestLine}
                  </Text>
                </View>
                <Pressable
                  pointerEvents="auto"
                  onPress={leaveSession}
                  accessibilityRole="button"
                  style={{ paddingVertical: 6 }}
                >
                  <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                    Leave — back to the main room
                  </Text>
                </Pressable>
              </View>
            );
          }

          // Open room: nobody hosts. Offer the mint-and-host flow.
          const hint = parseInviteHint();
          return (
            <View>
              {hint && hint.roomId === roomId && hint.mode ? (
                <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
                  You arrived with a {SESSION_MODE_LABEL[hint.mode]} invite —
                  your host hasn't opened this room yet. When they do, the
                  mode applies automatically; until then this room is open.
                </Text>
              ) : null}
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
                Invite people to this canvas. Hosting mints a fresh room
                and moves you into it — your canvas comes with you, and
                guests land beside you through the link.
              </Text>
              {renderModeRows(pickedMode, setPickedMode)}
              <Pressable
                pointerEvents="auto"
                onPress={() => startHosting(pickedMode)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  alignItems: "center",
                  paddingVertical: 12,
                  borderRadius: radius.card,
                  backgroundColor: pressed ? colors.accentDim : colors.accent,
                  marginBottom: spacing.sm,
                })}
              >
                <Text style={{ color: "#06202a", fontSize: typeScale.body, fontWeight: "800" }}>
                  Invite to this canvas
                </Text>
              </Pressable>
            </View>
          );
        })()}

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

        {/* Share live (Slice 5 + 8): replay a pattern into the room —
            hosting first if nobody does, so guests actually feel it.
            Two data sources, one playback path: the pattern composed
            this session, and the saved compositions store (the same
            real list Studio shows). */}
        {lastPattern ? (
          <Pressable
            pointerEvents="auto"
            onPress={() => sharePatternLive(lastPattern)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.accentLine,
              backgroundColor: pressed ? colors.accentDim : "transparent",
              marginTop: spacing.sm,
            })}
          >
            <Icon name="people" size={20} color={colors.accent} />
            <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              Share live — play “{lastPattern.name}” to the room
            </Text>
            <Icon name="chevronRight" size={16} color={colors.textDim} />
          </Pressable>
        ) : null}
        {/* Saved compositions (Slice 8): share-live rows read the
            same store Studio persists to — most recent first. */}
        {compositions.items.slice(0, 8).map((comp) => (
          <Pressable
            key={comp.id}
            pointerEvents="auto"
            onPress={() => shareCompositionLive(comp)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.accentLine,
              backgroundColor: pressed ? colors.accentDim : "transparent",
              marginTop: spacing.sm,
            })}
          >
            <Icon name="people" size={20} color={colors.accent} />
            <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              Share live — play “{comp.name}” to the room
            </Text>
            <Icon name="chevronRight" size={16} color={colors.textDim} />
          </Pressable>
        ))}
        {compositions.items.length > 8 ? (
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: spacing.sm }}>
            {`+${compositions.items.length - 8} more saved in Studio`}
          </Text>
        ) : null}

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

        {/* You (Slice 6) — the human LifePacket v0: the name and
            signature hue the room sees and hears. Your color tints
            your strokes on every screen; your stroke sound is
            pitched by it. Editing announces the new face to the
            room immediately. Only name + color ever leave this
            device — the seed stays home. */}
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.accentLine,
            borderRadius: radius.card,
            padding: spacing.md,
            marginBottom: spacing.sm,
            gap: 4,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            You are {identity.self ? identity.self.name : "…"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: identity.self
                  ? hueCss(identity.self.hue)
                  : colors.textDim,
              }}
            />
            <Text style={{ flex: 1, color: colors.textDim, fontSize: typeScale.caption }}>
              {identity.self
                ? `Signature color · hue ${identity.self.hue}° — your strokes and your sound`
                : "Generating your identity…"}
            </Text>
            <Pressable
              pointerEvents="auto"
              onPress={() => {
                noteActivity();
                localIdentity.shuffleHue();
              }}
              accessibilityRole="button"
              style={{ paddingVertical: 4, paddingHorizontal: 8 }}
            >
              <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                Shuffle
              </Text>
            </Pressable>
          </View>
          <TextInput
            pointerEvents="auto"
            value={nameDraft ?? identity.self?.name ?? ""}
            onChangeText={setNameDraft}
            onEndEditing={() => {
              if (nameDraft !== null) localIdentity.setName(nameDraft);
              setNameDraft(null);
            }}
            onSubmitEditing={() => {
              if (nameDraft !== null) localIdentity.setName(nameDraft);
              setNameDraft(null);
            }}
            placeholder="Your name in the room"
            placeholderTextColor={colors.textDim}
            maxLength={40}
            style={{
              color: colors.text,
              fontSize: typeScale.body,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.card,
              paddingVertical: 8,
              paddingHorizontal: 12,
              marginTop: spacing.xs,
            }}
          />
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Shown in the room roster and carried on your strokes.
            Renaming or re-coloring updates the room live.
          </Text>
        </View>

        <LifePacketCard />

        {/* First Breath replay (Slice 10) — the palette step from
            the first run, reopened on purpose: the packet deals
            your cards again and a tap re-wears a signature hue
            through the same identity setter. Palette only — no
            name step, no flag changes; the full flow belongs to a
            device's actual first breath and never repeats. */}
        <Pressable
          pointerEvents="auto"
          onPress={() => {
            noteActivity();
            requestFirstBreath("palette");
            setMenuOpen(false);
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: colors.accentLine,
            borderRadius: radius.card,
            padding: spacing.md,
            marginBottom: spacing.sm,
            gap: 4,
            backgroundColor: pressed ? colors.accentDim : "transparent",
          })}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            First Breath — revisit your colors ›
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            The palette step from your first run: three cards dealt
            from your LifePacket seed, shuffle for three more. Your
            ghost keeps you company while you choose.
          </Text>
        </Pressable>

        {/* Identity — the ghost keeps its OWN persistent, device-bound
            identity (name + signature hue + seed, fabric_ghost_v1).
            Deriving the ghost from the human packet above is the
            designed LifePacket step; until then the two faces are
            parallel, and the ghost is always labeled an agent. */}
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
