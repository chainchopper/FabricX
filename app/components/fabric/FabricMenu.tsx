/**
 * FabricMenu — the ONE menu system (F doctrine).
 *
 * Everything the legacy left-edge rail used to scatter across ~14
 * pulsing buttons and ~14 drawers now starts here, behind the single
 * "F" anchor:
 *
 *   FABRICS — the drawer (Slice 19): every fabric as a card. In a
 *   hosted session the fabric is host-led — the host picks and
 *   edits (settings + guest rules) from the cards, guests follow
 *   and are told, and a guest picking a different card is warned
 *   they will leave the session.
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
import { getJSON, setJSON } from "../../utils/storage";
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
import GhostieHome from "./GhostieHome";
import { layerSettingsKey } from "./LayerSettingsMirror";
import { carrySessionRoom } from "./FabricSessionFollower";
import {
  DEFAULT_FABRIC_RULES,
  FABRIC_HOST_RULES_KEY,
  FABRIC_RULE_KEYS,
  FABRIC_RULE_LABEL,
  getSessionFabricState,
  noteFabricDivergence,
  noteHostArrivedFabric,
  sanitizeHostRulesMap,
  setHostFabric,
  subscribeSessionFabric,
  type FabricRuleKey,
  type FabricRules,
  type HostRulesMap,
  type SessionFabricState,
} from "../../../src/session/fabricStore";
import type {
  ExperienceConfig,
  ExperienceLayer,
} from "../../../src/types/experience";
import { useSoundfontPianoStatus } from "../../../src/audio/soundfontPiano";
import LintSimulatorCard from "./LintSimulatorCard";
import {
  clearStageCharacter,
  getStageCharacterState,
  requestCharacterPick,
  subscribeStageCharacter,
  type StageCharacterState,
} from "../../../src/dancer/stageCharacter";
import {
  getMotionPublicState,
  requestMotionPermission,
  subscribeMotionState,
  type MotionPublicState,
} from "../../../src/sensors/motionState";
import { requestFirstBreath } from "../../../src/onboarding/onboardingStore";
import { patternPlayer } from "../../../src/ai/PatternPlayer";
import { FABRIC_PLAY_PATTERN_EVENT } from "../../../src/ai/PatternComposer";
import { FABRIC_PLAY_RECIPE_EVENT } from "../../../src/ai/RecipeComposer";
import type { Recipe } from "../../../src/ai/RecipeCore";
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
}) {  return (
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

// ---- Fabrics drawer (Slice 19) -----------------------------------
// The drawer leads the menu: every registered fabric as a card
// (name, one-line blurb, canvas badge, live state). Fabric choice
// in a hosted session is HOST-LED — the host's pick is the room's
// fabric and guests follow it; a guest who picks a different card
// is warned they will leave the session. The host (or a solo user,
// who is their own host) can EDIT a fabric from its card: the
// session guest rules for it (draw / verbs / notes) plus a curated
// set of its own per-layer settings — the very same specific.* keys
// THIS LAYER's own toggles write, persisted through the same
// per-layer store (fabric_layer_settings_v1:<layerId>), so the
// editor and the layer never disagree. Curated, not generated: a
// field appears here only if the layer really honors the key.

type LayerEditField =
  | { key: string; label: string; kind: "bool"; defaultValue: boolean }
  | {
      key: string;
      label: string;
      kind: "choice";
      options: { value: string; label: string }[];
      defaultValue: string;
    };

const LAYER_EDIT_FIELDS: Record<string, LayerEditField[]> = {
  "default-fluid": [
    { key: "ghostEnabled", label: "Ghost in this layer", kind: "bool", defaultValue: true },
    { key: "ambientEnabled", label: "Ambient life", kind: "bool", defaultValue: true },
    { key: "motionEnabled", label: "Motion — tilt & shake", kind: "bool", defaultValue: false },
  ],
  "ar-piano": [
    {
      key: "pianoVoice",
      label: "Piano voice",
      kind: "choice",
      options: [
        { value: "soundfont", label: "Soundfont" },
        { value: "synth", label: "Synth" },
      ],
      defaultValue: "soundfont",
    },
    { key: "ghostEnabled", label: "Ghost in this layer", kind: "bool", defaultValue: true },
    { key: "motionEnabled", label: "Motion — tilt & shake", kind: "bool", defaultValue: false },
  ],
  "dancer-stage": [
    { key: "stageDancerEnabled", label: "Dancer figure dances", kind: "bool", defaultValue: true },
    { key: "stageCameraDrift", label: "Camera drift", kind: "bool", defaultValue: true },
    {
      key: "stageTheme",
      label: "Stage theme",
      kind: "choice",
      options: [
        { value: "cyan", label: "Cyan" },
        { value: "violet", label: "Violet" },
        { value: "magenta", label: "Magenta" },
        { value: "amber", label: "Amber" },
      ],
      defaultValue: "cyan",
    },
  ],
  "sam-see": [
    { key: "ghostEnabled", label: "Ghost in this layer", kind: "bool", defaultValue: true },
  ],
  "camera-effects": [],
};

/** The canvas a fabric stands on — the badge on its card. */
function canvasBadge(exp: ExperienceLayer): string {
  if (exp.canvas === "stage3d") return "3D STAGE";
  if (exp.id === "camera-effects") return "CAMERA";
  return "FLUID";
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

  // ---- Fabrics drawer (Slice 19) -----------------------------------
  // The session fabric (published by the canvas hook into the
  // fabric store): which fabric leads this room, whose it is, and
  // the guest rules in force. The drawer renders card state from
  // it; enforcement never lives here — it is in the send funnel.
  const [fabric, setFabric] = useState<SessionFabricState>(() =>
    getSessionFabricState()
  );
  useEffect(() => subscribeSessionFabric(setFabric), []);

  // The host's per-fabric guest rules, persisted on this device
  // (fabric_host_rules_v1). Loaded once; edits write through.
  // Guests never read this map — their rules arrive by wire.
  const [hostRules, setHostRules] = useState<HostRulesMap>({});
  const hostRulesRef = useRef<HostRulesMap>({});
  hostRulesRef.current = hostRules;
  const [rulesLoaded, setRulesLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getJSON<unknown>(FABRIC_HOST_RULES_KEY, null)
      .then((raw) => {
        if (cancelled) return;
        const map = sanitizeHostRulesMap(raw);
        hostRulesRef.current = map;
        setHostRules(map);
        setRulesLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setRulesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const rulesFor = (layerId: string): FabricRules =>
    hostRulesRef.current[layerId] ?? DEFAULT_FABRIC_RULES;

  // Drawer interaction state: which card's editor is open, the
  // editor's working values for a non-active fabric (the active
  // fabric's editor reads/writes the live config instead), and
  // the guest leave-warning's target fabric.
  const [editLayerId, setEditLayerId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [leaveWarn, setLeaveWarn] = useState<ExperienceLayer | null>(null);

  // Your Ghostie (Slice 20): the Home replaces the section list
  // inside this same sheet while open — the F-menu stays the one
  // anchor, and the Hotfix 2.3 boundary around the menu covers it.
  // Closing the menu always lands back on the list next open.
  const [ghostHomeOpen, setGhostHomeOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) setGhostHomeOpen(false);
  }, [menuOpen]);

  // While I host, my recorded host fabric IS my current layer +
  // its rules — keep the store (and therefore the room) in sync
  // across layer changes and rule edits. setHostFabric dedupes,
  // so this only broadcasts on a real change.
  const activeLayerId = state.activeExperience?.id ?? null;
  useEffect(() => {
    if (session.role !== "host" || !activeLayerId || !rulesLoaded) return;
    setHostFabric(activeLayerId, rulesFor(activeLayerId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.role, activeLayerId, rulesLoaded, hostRules]);

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

  // ---- Piano voice (Slice 11) ------------------------------------
  // Live load state of the sampled grand, for the THIS LAYER voice
  // row's caption — the caption must say what's TRUE (loading /
  // ready / fell back), never a hoped-for state.
  const soundfontStatus = useSoundfontPianoStatus();

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
        // Slice 15: a saved recipe plays through its own event —
        // the canvas renders it and ships the one compact recipe
        // message, exactly like a pattern replay ships its steps.
        window.dispatchEvent(
          comp.kind === "recipe"
            ? new CustomEvent(FABRIC_PLAY_RECIPE_EVENT, {
                detail: comp.recipe,
              })
            : new CustomEvent(FABRIC_PLAY_PATTERN_EVENT, {
                detail: comp.pattern,
              })
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

  // "Piano voice" — Slice 11, shown only while the piano layer is
  // the loaded one. Stored in the layer's own config
  // (specific.pianoVoice) and persisted per layer id like the
  // toggles above; useToneSynth reads the same field to route each
  // attack. Absent means Soundfont (the sampled grand is the
  // default voice; the synth is the fallback and the alternative).
  const isPiano = active?.id === "ar-piano";
  const pianoVoice: "soundfont" | "synth" =
    (state.experienceConfig.specific as any)?.pianoVoice === "synth"
      ? "synth"
      : "soundfont";
  const setPianoVoice = (next: "soundfont" | "synth") => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        pianoVoice: next,
      },
    });
  };

  // Dancer Stage settings — the realignment (Oct 28) moved the
  // Frequency Dancer OUT of the piano layer: it is its own fabric
  // now (the "dancer-stage" experience, a full 3D stage canvas),
  // so the old per-layer dancerEnabled toggle is gone and the
  // stage's own rules live here instead, stored per layer id like
  // every THIS LAYER setting (specific.stage*):
  //   stageDancerEnabled — the whole cast of ghostie dancers
  //                        dances vs stands at rest (Stage v2)
  //   stageCameraDrift   — the camera's slow cinematic sway
  //   stageTheme         — cyan | violet | magenta | amber
  // The character slot itself is device-local state, not layer
  // config: the stageCharacter store holds the loaded glTF's object
  // URL + load status, and the local rig reports back through it.
  // The character is the user's OWN ghostie's body — it binds to
  // the local rig only and never leaves this device.
  const isPianoLayer = active?.id === "ar-piano";
  const isStageLayer = active?.id === "dancer-stage";
  const stageDancer =
    (state.experienceConfig.specific as any)?.stageDancerEnabled !== false;
  const setStageDancer = (next: boolean) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        stageDancerEnabled: next,
      },
    });
  };
  const stageDrift =
    (state.experienceConfig.specific as any)?.stageCameraDrift !== false;
  const setStageDrift = (next: boolean) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        stageCameraDrift: next,
      },
    });
  };
  const stageTheme: string =
    (state.experienceConfig.specific as any)?.stageTheme ?? "cyan";
  const setStageTheme = (next: string) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        stageTheme: next,
      },
    });
  };
  const [charUi, setCharUi] = useState<StageCharacterState>(() =>
    getStageCharacterState()
  );
  useEffect(() => subscribeStageCharacter(setCharUi), []);

  // "Motion" — Slice 12 ("The Body's Sensors"). The layer's gyro/
  // tilt + shake input, stored per layer id like the toggles above
  // but with the opposite default: absent means OFF. Sensors are
  // personal — a layer's owner opts their body in deliberately.
  // The permission state is published by the canvas's sensor hook
  // (motionState): on iOS the browser will only grant motion access
  // from inside a real tap, so when a request is needed, THIS
  // section renders the "Enable tilt" affordance and its onPress
  // makes the call — never a cold prompt on layer load.
  const [motionUi, setMotionUi] = useState<MotionPublicState>(() =>
    getMotionPublicState()
  );
  useEffect(() => subscribeMotionState(setMotionUi), []);
  const motionInLayer =
    (state.experienceConfig.specific as any)?.motionEnabled === true;
  const setMotionInLayer = (next: boolean) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        motionEnabled: next,
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

  // ---- Fabrics drawer handlers (Slice 19) --------------------------
  // Card tap = "open this fabric", under the session's authority:
  // - the fabric already loaded: nothing to do.
  // - a guest tapping the SESSION fabric: following, never leaving.
  // - a guest in a hosted session tapping any other fabric: the
  //   leave warning — fabric choice is host-led per session.
  // - the host: record the pick (the room follows by broadcast),
  //   then switch. Solo: just switch — you are your own host.
  const onFabricCard = (exp: ExperienceLayer) => {
    noteActivity();
    if (exp.id === active?.id) return;
    if (session.role === "guest") {
      if (fabric.layerId && exp.id === fabric.layerId) {
        // Following, not leaving — and the session room carries,
        // exactly as the automatic follow carries it. A manual
        // open is the primary's own choice, so it is NOT a host
        // arrival for the ghostie's follow setting (Slice 20).
        noteHostArrivedFabric(null);
        void switchExperience(exp.id);
        if (session.roomId) {
          carrySessionRoom(updateConfig, session.roomId, exp.id);
        }
        return;
      }
      if (session.hostId) {
        setLeaveWarn(exp);
        return;
      }
    }
    if (session.role === "host") {
      // Record the pick first (the room follows by broadcast),
      // then switch — carrying the session room so the claim,
      // the mode, and the rules all survive the move.
      noteHostArrivedFabric(null);
      setHostFabric(exp.id, rulesFor(exp.id));
      const room = session.roomId;
      void switchExperience(exp.id);
      if (room) carrySessionRoom(updateConfig, room, exp.id);
      return;
    }
    // Solo open: my own pick, never a host arrival (Slice 20).
    noteHostArrivedFabric(null);
    void switchExperience(exp.id);
  };

  // The leave warning, confirmed: note the divergence so the
  // follower never yanks the guest back onto the fabric they
  // chose to leave, then open the picked fabric solo.
  const confirmLeaveTo = (exp: ExperienceLayer) => {
    noteActivity();
    if (fabric.layerId) noteFabricDivergence(fabric.layerId);
    // Leaving to a fabric I picked myself: not a host arrival.
    noteHostArrivedFabric(null);
    setLeaveWarn(null);
    setMenuOpen(false);
    void switchExperience(exp.id);
  };

  // Open a card's editor (host / solo only — the render gates it).
  // The active fabric's editor works on the live config; any other
  // fabric's editor works on its stored per-layer settings, seeded
  // over its defaults, and writes the same mirror key the layer
  // itself will read on activation.
  const openEditor = (exp: ExperienceLayer) => {
    noteActivity();
    if (editLayerId === exp.id) {
      setEditLayerId(null);
      return;
    }
    setEditLayerId(exp.id);
    if (exp.id === active?.id) {
      setEditValues({ ...(state.experienceConfig.specific as any) });
      return;
    }
    setEditValues({ ...(exp.configDefaults.specific as any) });
    void getJSON<ExperienceConfig | null>(layerSettingsKey(exp.id), null)
      .then((stored) => {
        if (!stored) return;
        setEditValues({
          ...(exp.configDefaults.specific as any),
          ...((stored.specific as any) ?? {}),
        });
      })
      .catch(() => {});
  };

  const applyEditField = (exp: ExperienceLayer, field: LayerEditField, value: unknown) => {
    noteActivity();
    setEditValues((prev) => ({ ...prev, [field.key]: value }));
    if (exp.id === active?.id) {
      // Live: updateConfig applies it now, and LayerSettingsMirror
      // persists it under this layer's key, as with any THIS LAYER
      // toggle.
      updateConfig({
        specific: {
          ...(state.experienceConfig.specific as any),
          [field.key]: value,
        },
      });
      return;
    }
    void (async () => {
      const stored = await getJSON<ExperienceConfig | null>(
        layerSettingsKey(exp.id),
        null
      ).catch(() => null);
      const base: ExperienceConfig = stored ?? exp.configDefaults;
      await setJSON(layerSettingsKey(exp.id), {
        common: base.common,
        specific: { ...((base.specific as any) ?? {}), [field.key]: value },
      }).catch(() => {});
    })();
  };

  // A guest-rule edit on a card: persist the map, and if this
  // fabric is the one I am currently hosting, the new rules go
  // out with the next fabric broadcast (setHostFabric + the
  // sync effect above both fire; the store dedupes).
  const setRule = (layerId: string, key: FabricRuleKey, value: boolean) => {
    noteActivity();
    const next: HostRulesMap = {
      ...hostRulesRef.current,
      [layerId]: { ...rulesFor(layerId), [key]: value },
    };
    hostRulesRef.current = next;
    setHostRules(next);
    void setJSON(FABRIC_HOST_RULES_KEY, next).catch(() => {});
    if (session.role === "host" && layerId === active?.id) {
      setHostFabric(layerId, next[layerId]);
    }
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

  // Slice 15: a recipe shares live the same way a pattern does —
  // hosting first if needed, then the play event; the canvas ships
  // the one compact recipe message under the session gate.
  const shareRecipeLive = (r: Recipe) => {
    noteActivity();
    if (getSessionPublicState().role !== "host") {
      startHosting(pickedMode);
    }
    window.dispatchEvent(
      new CustomEvent(FABRIC_PLAY_RECIPE_EVENT, { detail: r })
    );
    setShareNotice(
      `Playing “${r.name}” into the room now — everyone here sees it draw itself. Send the invite link under SHARE so others can join live.`
    );
  };

  // Slice 8: a saved composition shares live exactly the same way —
  // the store is the data source, the playback path is unchanged.
  // Slice 15: recipe entries take the recipe path above.
  const shareCompositionLive = (comp: SavedComposition) => {
    if (comp.kind === "recipe") {
      shareRecipeLive(comp.recipe);
    } else {
      sharePatternLive(comp.pattern);
    }
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
        {ghostHomeOpen ? (
          <GhostieHome
            onBack={() => {
              noteActivity();
              setGhostHomeOpen(false);
            }}
          />
        ) : (
          <>
        {/* ---------------- FABRICS (Slice 19) ---------------- */}
        <SectionHeader>FABRICS</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          {session.role === "host"
            ? "You lead this room: pick the fabric and everyone follows it. Edit a fabric's settings and guest rules from its card."
            : session.role === "guest"
              ? `${displayNameFor(session.hostId, session.selfId)} leads this room's fabric — you follow automatically. Picking a different fabric leaves the session; your own layer tools (THIS LAYER, below) stay yours.`
              : "Every fabric is a canvas with its own rules. Open one — or host a room below and lead everyone to it."}
        </Text>

        {/* The guest leave-warning: a guest picked a different
            fabric mid-session. Nothing has switched yet — leaving
            is a decision, stated before it happens. */}
        {leaveWarn ? (
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
              Leave this session?
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {`This room's fabric is set by ${displayNameFor(session.hostId, session.selfId)}. Opening ${leaveWarn.name} means leaving the session and opening it on your own.`}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
              <Pressable
                pointerEvents="auto"
                onPress={() => confirmLeaveTo(leaveWarn)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: radius.card,
                  backgroundColor: pressed ? colors.accentDim : colors.accent,
                })}
              >
                <Text style={{ color: "#06202a", fontSize: typeScale.body, fontWeight: "800" }}>
                  {`Leave & open ${leaveWarn.name}`}
                </Text>
              </Pressable>
              <Pressable
                pointerEvents="auto"
                onPress={() => {
                  noteActivity();
                  setLeaveWarn(null);
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.accentDim : "transparent",
                })}
              >
                <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                  Stay
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
          {state.availableExperiences.map((exp) => {
            const isActive = exp.id === active?.id;
            const isSessionFabric =
              fabric.layerId === exp.id && session.role !== "open";
            const cardState = isActive
              ? isSessionFabric
                ? "Live here · session fabric"
                : "Live here"
              : isSessionFabric
                ? session.role === "guest"
                  ? `Session fabric — set by ${displayNameFor(session.hostId, session.selfId)}`
                  : "Session fabric"
                : "Yours to open";
            const canEdit = session.role !== "guest";
            const editing = editLayerId === exp.id;
            const fields = LAYER_EDIT_FIELDS[exp.id] ?? [];
            return (
              <View
                key={exp.id}
                style={{
                  borderWidth: 1,
                  borderColor: isActive || isSessionFabric ? colors.accent : colors.line,
                  borderRadius: radius.card,
                  padding: spacing.md,
                  backgroundColor: isActive ? colors.accentDim : "transparent",
                }}
              >
                <Pressable
                  pointerEvents="auto"
                  onPress={() => onFabricCard(exp)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Open ${exp.name}`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                      {exp.name}
                    </Text>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: colors.line,
                        borderRadius: radius.pill,
                        paddingVertical: 2,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text style={{ color: colors.textDim, fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1 }}>
                        {canvasBadge(exp)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
                    {exp.blurb ?? exp.description}
                  </Text>
                  <Text
                    style={{
                      color: isActive || isSessionFabric ? colors.accent : colors.textDim,
                      fontSize: typeScale.caption,
                      fontWeight: "700",
                      marginTop: spacing.xs,
                    }}
                  >
                    {cardState}
                  </Text>
                </Pressable>

                {/* Guests see the rules that bind them on the
                    session fabric — law you can read, not a
                    surprise. Editing is the host's surface. */}
                {session.role === "guest" && isSessionFabric ? (
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: spacing.xs }}>
                    {`Here, guests can: ${FABRIC_RULE_KEYS.filter((k) => fabric.rules[k]).map((k) => (k === "draw" ? "draw" : k === "verbs" ? "send verbs" : "play notes")).join(" · ") || "watch and listen"}. Fabric settings are set by your host.`}
                  </Text>
                ) : null}

                {canEdit ? (
                  <Pressable
                    pointerEvents="auto"
                    onPress={() => openEditor(exp)}
                    accessibilityRole="button"
                    accessibilityLabel={`${editing ? "Close" : "Edit"} ${exp.name} settings`}
                    style={{ paddingVertical: 6, alignSelf: "flex-start" }}
                  >
                    <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                      {editing ? "Close editor" : "Edit fabric ›"}
                    </Text>
                  </Pressable>
                ) : null}

                {canEdit && editing ? (
                  <View style={{ marginTop: spacing.xs }}>
                    {fields.length === 0 ? (
                      <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
                        No quick settings for this fabric — its controls
                        live in THIS LAYER while it is loaded.
                      </Text>
                    ) : (
                      fields.map((field) => {
                        if (field.kind === "bool") {
                          const raw = editValues[field.key];
                          const value =
                            typeof raw === "boolean" ? raw : field.defaultValue;
                          return (
                            <ToggleRow
                              key={field.key}
                              label={field.label}
                              value={value}
                              onPress={() => applyEditField(exp, field, !value)}
                            />
                          );
                        }
                        const raw = editValues[field.key];
                        const value =
                          typeof raw === "string" ? raw : field.defaultValue;
                        return (
                          <View key={field.key} style={{ marginBottom: spacing.sm }}>
                            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600", marginBottom: spacing.xs }}>
                              {field.label}
                            </Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                              {field.options.map((opt) => {
                                const selected = value === opt.value;
                                return (
                                  <Pressable
                                    key={opt.value}
                                    pointerEvents="auto"
                                    onPress={() => applyEditField(exp, field, opt.value)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    style={{
                                      paddingVertical: 7,
                                      paddingHorizontal: 12,
                                      borderRadius: radius.pill,
                                      borderWidth: 1,
                                      borderColor: selected ? colors.accent : colors.line,
                                      backgroundColor: selected ? colors.accentDim : "transparent",
                                    }}
                                  >
                                    <Text style={{ color: selected ? colors.accent : colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                                      {opt.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })
                    )}

                    {/* Session guest rules for this fabric. For
                        the host they go live with the next fabric
                        broadcast; solo, they are saved for when
                        you host. Rules only ever restrict guests —
                        the session mode still applies first. */}
                    <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginTop: spacing.xs, marginBottom: spacing.xs }}>
                      Guest rules {session.role === "host" ? "— live for this room" : "— apply when you host"}
                    </Text>
                    {FABRIC_RULE_KEYS.map((key) => (
                      <ToggleRow
                        key={key}
                        label={FABRIC_RULE_LABEL[key]}
                        value={rulesFor(exp.id)[key]}
                        onPress={() => setRule(exp.id, key, !rulesFor(exp.id)[key])}
                      />
                    ))}
                    <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                      Rules only ever restrict guests. The session mode
                      (SHARE, below) applies first and cannot be widened
                      from here.
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* ---------------- THIS LAYER ---------------- */}
        <SectionHeader>{`THIS LAYER${active ? ` · ${active.name.toUpperCase()}` : ""}`}</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Settings below belong to this layer only and are saved under its
          own id — they never leak into other layers.
        </Text>

        {/* Slice 19: the layer switcher used to be a chip row here.
            It moved UP into the Fabrics drawer (cards, above) —
            one switching surface, and the only one that knows the
            session's authority rules (host-led picks, the guest
            leave-warning). THIS LAYER is settings only now. */}
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Switch fabrics from the drawer above — each fabric is a card
          with its own settings and rules.
        </Text>

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

        {/* Piano voice — Slice 11, piano layer only. Soundfont is
            the sampled FluidR3 grand shipped with the app (loaded
            lazily when the layer opens; the synth covers every note
            until the packs are ready, and forever if they fail).
            The caption reports the loader's real state. */}
        {isPiano ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              Piano voice
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {(["soundfont", "synth"] as const).map((val) => {
                const selected = pianoVoice === val;
                return (
                  <Pressable
                    key={val}
                    pointerEvents="auto"
                    onPress={() => setPianoVoice(val)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Piano voice ${val === "soundfont" ? "Soundfont — sampled grand" : "Synth"}`}
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
                      {val === "soundfont" ? "Soundfont" : "Synth"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {pianoVoice === "synth"
                ? "The classic synth voice. The sampled grand stays unloaded."
                : soundfontStatus === "ready"
                  ? "Sampled grand is live — a real FluidR3 piano, shipped with the app and served from Fabric's own domain. Every device in the room hears this same voice."
                  : soundfontStatus === "loading"
                    ? "Loading the sampled grand… the synth plays until it's ready, then new notes switch over."
                    : soundfontStatus === "failed"
                      ? "The samples couldn't load on this device, so the synth is playing — that's the automatic fallback, and reopening the layer retries."
                      : "The sampled grand loads the first time this layer opens; the synth plays until it's ready."}
            </Text>
          </View>
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

        {/* The Frequency Dancer no longer lives on the piano layer
            (realignment, Oct 28): it is its own fabric, the Dancer
            Stage. This note points there; the stage's settings
            render below when the stage is the loaded layer. */}
        {isPianoLayer ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              Dancer
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              The Frequency Dancer has its own fabric now — open the
              Dancer Stage layer: a full 3D stage with its own camera,
              lights, and character slot. Its dancers, camera drift,
              and theme live in that layer's settings.
            </Text>
          </View>
        ) : null}

        {/* Dancer Stage — THIS LAYER settings (stage layer only):
            cast on/off, camera drift on/off, hue theme, and the
            character slot. Stored per layer id (specific.stage*);
            the character file itself is device-local (see the
            stageCharacter store) and never leaves this device. */}
        {isStageLayer ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              Dancers
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {([true, false] as const).map((val) => {
                const selected = stageDancer === val;
                return (
                  <Pressable
                    key={String(val)}
                    pointerEvents="auto"
                    onPress={() => setStageDancer(val)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Dancers ${val ? "on" : "off"}`}
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
              Every participant's ghostie is on stage, and each one
              dances to its own player's notes and verbs — yours to
              your playing, theirs to theirs. Off: the whole cast
              stands at rest while the floor and lights keep
              answering the music.
            </Text>

            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginTop: spacing.sm }}>
              Camera drift
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {([true, false] as const).map((val) => {
                const selected = stageDrift === val;
                return (
                  <Pressable
                    key={String(val)}
                    pointerEvents="auto"
                    onPress={() => setStageDrift(val)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Camera drift ${val ? "on" : "off"}`}
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
              The camera's slow cinematic sway when the stage is idle.
              Either way, dragging the stage orbits the camera within
              its limits.
            </Text>

            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginTop: spacing.sm }}>
              Stage theme
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              {(["cyan", "violet", "magenta", "amber"] as const).map((val) => {
                const selected = stageTheme === val;
                return (
                  <Pressable
                    key={val}
                    pointerEvents="auto"
                    onPress={() => setStageTheme(val)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Stage theme ${val}`}
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
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              The rim light and floor glow take this hue; notes still
              flash their own colors through it.
            </Text>

            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginTop: spacing.sm }}>
              Character
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {charUi.status === "ready"
                ? `${charUi.name ?? "Character"} is your ghostie's body on stage.`
                : charUi.status === "loading"
                  ? `Loading ${charUi.name ?? "character"}…`
                  : charUi.status === "failed"
                    ? `Couldn't load ${charUi.name ?? "that file"} — the mannequin kept the stage.`
                    : "Your ghostie wears the procedural mannequin, tinted with its hue."}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              <Pressable
                pointerEvents="auto"
                onPress={() => {
                  noteActivity();
                  requestCharacterPick();
                }}
                accessibilityRole="button"
                accessibilityLabel="Load character (glTF)"
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.accent,
                  backgroundColor: colors.accentDim,
                }}
              >
                <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                  Load character (glTF)
                </Text>
              </Pressable>
              {charUi.url ? (
                <Pressable
                  pointerEvents="auto"
                  onPress={() => {
                    noteActivity();
                    clearStageCharacter();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Restore mannequin"
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: "transparent",
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                    Restore mannequin
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              A .glb or .gltf whose skeleton uses the UE5 Mannequin
              bone names (pelvis, spine_01, upperarm_l, …) takes the
              stage and dances with the same driver — this is the
              door for Unreal exports. Missing bones are skipped; a
              file that fails to load leaves the mannequin standing.
              The character is YOUR ghostie's body: it binds to your
              dancer only. Other participants keep their own
              ghosties, and models never travel over the wire — the
              file is read locally and stays on this device.
            </Text>
          </View>
        ) : null}

        {/* Motion in this layer — Slice 12. Per-layer like the
            toggles above, default OFF. On: tilting this phone leans
            this device's pool, and a sharp shake blooms on every
            screen in the room. The tilt itself is private — raw
            motion readings never leave this phone; only the shake
            travels, as a single event. iOS needs a one-time tap to
            grant motion access; that ask lives here, in the tap,
            never as a cold prompt. */}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            Motion
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {([true, false] as const).map((val) => {
              const selected = motionInLayer === val;
              return (
                <Pressable
                  key={String(val)}
                  pointerEvents="auto"
                  onPress={() => setMotionInLayer(val)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Motion ${val ? "on" : "off"}`}
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
          {motionInLayer && motionUi.permission === "needs-request" ? (
            <Pressable
              pointerEvents="auto"
              onPress={() => {
                noteActivity();
                void requestMotionPermission();
              }}
              accessibilityRole="button"
              accessibilityLabel="Enable tilt"
              style={{
                alignSelf: "flex-start",
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: colors.accentDim,
              }}
            >
              <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                Enable tilt
              </Text>
            </Pressable>
          ) : null}
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            {motionInLayer && motionUi.permission === "denied"
              ? "Motion access was denied — this phone's browser is keeping its sensors private, and Fabric respects that. The layer still works by touch."
              : motionInLayer && motionUi.permission === "unavailable"
                ? "This device doesn't expose motion sensors to the browser, so this layer stays touch-driven here."
                : "Tilting leans the pool on this device only. A sharp shake sends one bloom to the room in your color. Your motion readings themselves never leave this phone."}
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

        {/* Lint (Slice 13): the room's objects. The simulator is a
            real protocol client (its own socket, its own lint:
            peer id) rendered as a menu card — hardware speaks the
            same protocol; see docs/LINT.md. */}
        <SectionHeader>LINT — OBJECTS</SectionHeader>
        <LintSimulatorCard />

        {/* ---------------- UNIVERSAL ---------------- */}
        <SectionHeader>UNIVERSAL</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Yours, on this device — the same on every layer.
        </Text>

        {/* Your Ghostie (Slice 20) — the ghostie's HOME leads this
            section: its living fDNA and secure tag, its brain, its
            Personality, and how it is with others, in one place
            instead of scattered across the menu and AI Services. */}
        <Pressable
          onPress={() => {
            noteActivity();
            setGhostHomeOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Your Ghostie"
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: colors.ghostLine,
            borderRadius: radius.card,
            padding: spacing.md,
            marginBottom: spacing.sm,
            backgroundColor: pressed ? colors.ghostDim : "transparent",
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.ghost,
              }}
            />
            <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.label, fontWeight: "700" }}>
              Your Ghostie{ghost.ghostName ? ` — ${ghost.ghostName}` : ""}
            </Text>
            <Icon name="chevronRight" size={16} color={colors.textDim} />
          </View>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
            {ghost.temperament
              ? `${ghost.temperament} · ${ghost.presence} · `
              : ""}
            its living fDNA and secure tag, its brain, its Personality,
            and how it is with others.
          </Text>
        </Pressable>

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
              // 16px floor (Hotfix 2.3): iOS Safari auto-zooms any
              // focused field under 16px and can leave the page
              // scrolled/zoomed after the keyboard closes — the
              // stuck half-blank layout Terrell keeps hitting.
              fontSize: 16,
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

        {/* Your ghost & privacy — the ghost's identity, status, and
            settings live in Your Ghostie (top of this section) since
            Slice 20; what stays here is the standing privacy
            statement, which belongs next to the identity it covers. */}
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
            Your ghost & privacy
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            The ghost is always labeled as an AI agent, never appears
            as a person, and a visiting ghost's sensations can be
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
          </>
        )}
      </ScrollView>
    </Animated.View>
  );
}
