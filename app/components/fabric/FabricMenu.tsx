/**
 * FabricMenu — the ONE menu system (F doctrine).
 *
 * Everything the legacy left-edge rail used to scatter across ~14
 * pulsing buttons and ~14 drawers now starts here, behind the single
 * "F" anchor. Seven sections, in this order, and every control in
 * the menu lives in exactly one of them:
 *
 *   FABRICS — the drawer (Slice 19): every fabric as a card in a
 *   horizontal thumbnail gallery (Slice 32 — one rail, however
 *   many fabrics exist; the editor renders below the rail). In a
 *   hosted session the fabric is host-led — the host picks and
 *   edits (settings + guest rules) from the cards, guests follow
 *   and are told, and a guest picking a different card is warned
 *   they will leave the session.
 *
 *   PEOPLE — the session's humans (Slices 5 + 6): room, mode and
 *   invite, the Who's Who roster, driver passing, and the guest
 *   rules that bind a guest on the session fabric. Since Slice 21
 *   a roster row is a door: it opens that person's profile card
 *   (their tag, ghostie, fabric, and badges) as a sub-view here.
 *   Since Slice 59 PEOPLE also reaches OUT of the room: the Find
 *   fabrics door opens the lobby gallery (listed hosts, follows,
 *   friends, ask-to-join), and the host's side carries the
 *   opt-in "List my fabric" toggle and the join requests.
 *
 *   YOU — the user's own face and ghost: your profile card first
 *   (Slice 21 — what the room sees, built from the broadcast
 *   announce itself), then the identity card and LifePacket
 *   summary, the Your Ghostie door (Slice 20), the First Breath
 *   palette replay, and the standing privacy note.
 *
 *   THIS LAYER — settings for the layer that is loaded, and only
 *   that layer. Stored per layer id (fabric_layer_settings_v1:
 *   <layerId>, see LayerSettingsMirror); no fixed registry of
 *   layers exists, so community / plugin / stock layers all work
 *   the same way. Nothing universal renders here.
 *
 *   STUDIO — creation (Slice 8 + 13): composer doors, share-live
 *   playback of patterns and saved compositions, and the Lint
 *   simulator — the room's objects.
 *
 *   AI SERVICES — the agent model card: provider summary and the
 *   door to the AI Services panel (keys, endpoints, Meta preset).
 *   The ghost's own brain lives in Your Ghostie, under YOU.
 *
 *   SETTINGS & HELP — app-wide leftovers that fit nowhere above:
 *   the universal device toggles (haptics, audio cues, voice
 *   panel), diagnostics, and the door to the Preferences panel.
 *   Nothing per-layer may live here, and no other section's
 *   panels are listed here (Slice 57 dissolved the "Panels"
 *   catch-all that once tailed this section).
 *
 * The two scopes — universal and per-layer — are never conflated:
 * universal things live in YOU / AI SERVICES / SETTINGS & HELP,
 * per-layer things live in THIS LAYER, and a fabric's own quick
 * settings live on its card in FABRICS (the same stored keys).
 *
 * The heavy legacy panels (Profile, Locker, Studio, Call, …) are
 * not rewritten here: they open as panels FROM this menu via the
 * existing NewDrawers controller, each from the section it
 * belongs to — Profile, Wallet and Shop from YOU; Friends and
 * Call from PEOPLE; the Layer library and the Locker from
 * FABRICS; Plugins from STUDIO; AI Chat, Vision AI and the
 * Companion from AI SERVICES (Slice 57) — so nothing that worked
 * becomes unreachable: the rail is gone, the doors remain, there
 * is just one hallway now, with signs, and every door hangs on
 * the wall it belongs to.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
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
import FindFabricsView, { useLobbySnapshot } from "./FindFabrics";
import { lobbyService } from "../../../src/discovery/lobbyService";
import { useSocial } from "../../../src/discovery/socialStore";
import { vibrate } from "../../../src/sensory/vibration";
import { useToast } from "../Toast";
import {
  FABRIC_GHOST_ENCOUNTER_EVENT,
  FABRIC_GHOST_SESSION_EVENT,
  FABRIC_PET_GHOST_EVENT,
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";
import {
  nextVoiceInputMode,
  voiceInputModeLabel,
} from "../../../src/sensory/voiceMode";
import { MAX_GHOSTS_PER_ROOM } from "../../../src/ghost/GhostPeer";
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
import ProfileCard, { BadgeGlyphMark } from "./ProfileCard";
import { badgeInfo } from "../../../src/identity/profile";
import { useRewards } from "../../../src/rewards/rewardsStore";
import {
  FabricCardOverlay,
  GhostieCardOverlay,
  LayerCardOverlay,
  type FabricCardOverlayData,
  type GhostieCardOverlayData,
} from "./IdCards";
import { vitalsWire } from "../../../src/ghost/ghostVitals";
import {
  buildAnnounceExtras,
  buildProfileCardData,
  type ProfileCardData,
} from "../../../src/identity/profile";
import {
  useLocalProfileExtras,
  usePeerProfiles,
} from "../../../src/identity/profileStore";
import { FABRIC_VERB_EVENT } from "../../../src/sensory/verbs";
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
import FabricThumb, { THUMB_W } from "./FabricThumb";
import {
  clearStageCharacter,
  getStageCharacterState,
  requestCharacterPick,
  setStageCharacterRemote,
  subscribeStageCharacter,
  type StageCharacterState,
} from "../../../src/dancer/stageCharacter";
import {
  TRAUMA_IDLES,
  TRAUMA_IDLE_NONE,
  resolveBuiltinBind,
  traumaIdleDef,
  type TraumaIdleId,
} from "../../../src/dancer/traumaCharacter";
import {
  getMotionPublicState,
  requestMotionPermission,
  subscribeMotionState,
  type MotionPublicState,
} from "../../../src/sensors/motionState";
import {
  ensureControllerLoaded,
  getControllerSnapshot,
  requestControllerCalibration,
  setControllerRole,
  subscribeController,
  type ControllerSnapshot,
} from "../../../src/sensors/controllerStore";
import {
  getHandsSnapshot,
  subscribeHands,
  type HandsSnapshot,
} from "../../../src/hands/handsStore";
import {
  ensureGenxPrefsLoaded,
  getGenxSnapshot,
  subscribeGenx,
  type GenxSnapshot,
} from "../../../src/genx/genxStore";
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

/** Slice 57: there is deliberately NO panel-row registry here any
 *  more. The old PANEL_ROWS list fed a "Panels" catch-all at the
 *  menu's tail; every door now renders as a DoorRow inside the
 *  section it belongs to (FABRICS, PEOPLE, YOU, STUDIO, AI
 *  SERVICES, SETTINGS & HELP), next to the controls it relates
 *  to. scripts/menu-check.mjs pins the homes. */

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

/** Slice 58: a settings row whose value is a WORD, not a switch —
 *  same card geometry as ToggleRow; tapping cycles the value. */
function ModeRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
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
          color: colors.accent,
          fontSize: typeScale.body,
          fontWeight: "700",
        }}
      >
        {value}
      </Text>
    </Pressable>
  );
}

// ---- One card grammar (Cleanup 1) --------------------------------
// Every bordered card in this menu shares one geometry: 1px border,
// card radius, md padding, sm bottom margin. Cards keep only what
// carries meaning — their border color (line = neutral, accentLine
// = live/session, ghostLine = the ghost's) and any pressed fill.
// The fabric cards and the Ghostie door already had this shape;
// the rest of the menu converged onto it in the doctrine pass.
// Slice 37: the menu sheet's height cap, in device pixels —
// 78% of the real window height (see the sheet style for why a
// percentage string is not trusted with this job).
const menuMaxHeight = Math.round(Dimensions.get("window").height * 0.78);

const cardStyle = {
  borderWidth: 1,
  borderRadius: radius.card,
  padding: spacing.md,
  marginBottom: spacing.sm,
} as const;

/** A plain door row: icon, label, chevron. Used by the door
 *  lists inside FABRICS, PEOPLE, YOU, STUDIO and AI SERVICES and
 *  by the Preferences door in SETTINGS & HELP — one row grammar
 *  for every panel this menu opens. */
function DoorRow({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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
      <Icon name={icon} size={20} color={colors.text} />
      <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
        {label}
      </Text>
      <Icon name="chevronRight" size={16} color={colors.textDim} />
    </Pressable>
  );
}

/** A sub-header inside a section — smaller than a SectionHeader,
 *  for a named group within a section (Lint inside STUDIO). */
function SubHeader({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.text,
        fontSize: typeScale.body,
        fontWeight: "700",
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

/** The On/Off pill pair every boolean layer setting uses (ghost,
 *  ambient life, dancers, camera drift, motion in THIS LAYER) —
 *  one component instead of five hand-copied blocks. The setter
 *  it calls still owns noteActivity + persistence, exactly as
 *  the copied blocks did. */
function BoolPillRow({
  value,
  onPick,
  labelPrefix,
}: {
  value: boolean;
  onPick: (next: boolean) => void;
  labelPrefix: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {([true, false] as const).map((val) => {
        const selected = value === val;
        return (
          <Pressable
            key={String(val)}
            pointerEvents="auto"
            onPress={() => onPick(val)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${labelPrefix} ${val ? "on" : "off"}`}
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
    { key: "handsEnabled", label: "Hands — gesture input", kind: "bool", defaultValue: false },
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
    {
      key: "stageTraumaIdle",
      label: "Trauma idle (built-in character)",
      kind: "choice",
      options: [
        // The field presents the EFFECTIVE bind: nothing
        // stored means the stage binds the MMA default (the
        // final Nov 2 rule — on the stage, Trauma is the
        // figure), so "mma" is the honest unstored value.
        // "none" is a real option: the explicit bare-figure
        // choice, the only way the bare figure stands.
        { value: "mma", label: "MMA idle" },
        { value: "bouncing", label: "Bouncing fight" },
        { value: "none", label: "No built-in (bare figure)" },
      ],
      defaultValue: "mma",
    },
  ],
  "sam-see": [
    { key: "ghostEnabled", label: "Ghost in this layer", kind: "bool", defaultValue: true },
    { key: "handsEnabled", label: "Hands — gesture input", kind: "bool", defaultValue: false },
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

  // The gallery's one open editor (Slice 32): the fabric whose
  // editor renders below the rail, resolved from the registry.
  // Null when no card is being edited (or it left the registry).
  const editExp =
    editLayerId != null
      ? state.availableExperiences.find((e) => e.id === editLayerId) ?? null
      : null;

  // Your Ghostie (Slice 20): the Home replaces the section list
  // inside this same sheet while open — the F-menu stays the one
  // anchor, and the Hotfix 2.3 boundary around the menu covers it.
  // Closing the menu always lands back on the list next open.
  const [ghostHomeOpen, setGhostHomeOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) setGhostHomeOpen(false);
  }, [menuOpen]);

  // Profile cards (Slice 21): tapping a person in PEOPLE opens
  // their card as a sub-view in this same sheet (same pattern as
  // the Ghostie Home) — who they are, their ghostie and its tag,
  // the fabric they're on, their badges, and the two touches a
  // card may send (a heart, a pet), both through the standing
  // gates. Closing the menu lands back on the list next open.
  const [profilePeerId, setProfilePeerId] = useState<string | null>(null);
  useEffect(() => {
    if (!menuOpen) setProfilePeerId(null);
  }, [menuOpen]);

  // ID cards (Slice 22): the other three card kinds — ghostie,
  // fabric, layer — open as sub-views in this same sheet. Back
  // lands where you came from: the section list, the Ghostie
  // Home, or a person's card (returnTo).
  type CardOverlayState =
    | { kind: "ghost"; peerId: string }
    | { kind: "fabric"; layerId: string }
    | { kind: "layer" }
    | null;
  const [cardOverlay, setCardOverlay] = useState<CardOverlayState>(null);
  const [cardReturnTo, setCardReturnTo] = useState<
    "list" | "home" | string
  >("list");
  useEffect(() => {
    if (!menuOpen) setCardOverlay(null);
  }, [menuOpen]);
  // Slice 29: the Essence's "ID card ›" door. The Essence lives
  // outside this sheet (Slice 60: inside the fabric info panel),
  // so it asks by window event (fabric:open-own-ghost-card,
  // dispatched by Essence.openGhostCard); the menu opens and
  // lands on the same Slice 22 overlay the Ghostie Home's door
  // opens — the Essence wires the door, this sheet remains the
  // card's only home.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onEssenceDoor = () => {
      setMenuOpen(true);
      openCardOverlay({ kind: "ghost", peerId: session.selfId }, "list");
    };
    window.addEventListener("fabric:open-own-ghost-card", onEssenceDoor);
    return () =>
      window.removeEventListener("fabric:open-own-ghost-card", onEssenceDoor);
  }, [session.selfId]);
  // Slice 60: the Essence block's "Ghostie Home ›" door, the same
  // pattern — the block links the Home, this sheet remains its
  // only home: the menu opens straight onto the Home sub-view
  // (and opening the menu closes the info panel it was tapped in).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onGhostieHomeDoor = () => {
      setMenuOpen(true);
      setGhostHomeOpen(true);
    };
    window.addEventListener("fabric:open-ghostie-home", onGhostieHomeDoor);
    return () =>
      window.removeEventListener("fabric:open-ghostie-home", onGhostieHomeDoor);
  }, []);
  const openCardOverlay = (
    next: NonNullable<CardOverlayState>,
    from: "list" | "home" | string
  ) => {
    noteActivity();
    setCardReturnTo(from);
    setCardOverlay(next);
  };
  const closeCardOverlay = () => {
    noteActivity();
    setCardOverlay(null);
    if (cardReturnTo === "home") {
      setGhostHomeOpen(true);
    } else if (cardReturnTo !== "list") {
      setProfilePeerId(cardReturnTo);
    }
    setCardReturnTo("list");
  };

  // The profile extras (Slice 21): this device's announce inputs
  // (tag seed, badges, trail) and every peer's learned extras.
  const localExtras = useLocalProfileExtras();
  const peerProfiles = usePeerProfiles();

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
  // Slice 24: the rewards record (YOU section's Badges row).
  const rewards = useRewards();
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  // ---- Profile cards (Slice 21) ----------------------------------
  // The fabric line on a card is THIS client's session knowledge,
  // never a wire claim: in a hosted session everyone present is
  // on the room's fabric; in an open room a peer's own fabric is
  // theirs (stated honestly), while your own card can name the
  // fabric you are actually standing on.
  const fabricNameFor = (layerId: string | null): string | null =>
    layerId
      ? (state.availableExperiences.find((e) => e.id === layerId)?.name ??
        null)
      : null;
  const fabricLineFor = (pid: string): string => {
    if (session.role !== "open" && fabric.layerId) {
      const name = fabricNameFor(fabric.layerId);
      return name
        ? `On ${name} — this room's fabric`
        : "On this room's fabric";
    }
    if (pid === session.selfId) {
      return state.activeExperience
        ? `On ${state.activeExperience.name} — the fabric you're standing on`
        : "On your own fabric";
    }
    return "On their own fabric";
  };
  const roleLineFor = (pid: string): string | null => {
    if (pid === session.selfId) {
      return session.role === "host"
        ? "You · host of this room"
        : session.driverId === pid
          ? "You · driving"
          : "You";
    }
    if (pid === session.hostId) return "Host of this room";
    if (pid === session.driverId) return "Driving";
    return session.hostId ? "Guest" : "Here";
  };

  // Your own card, built from the EXACT announce payload this
  // device broadcasts: the transport builds its peer-announce
  // from buildAnnounceExtras over these same sources (identity,
  // ghost public state, local profile extras), and this card is
  // parsed back out of that payload — so the face in YOU is the
  // face the room receives, field for field.
  const ownAnnounce = identity.self
    ? {
        type: "peer-announce" as const,
        from: session.selfId,
        name: identity.self.name,
        hue: identity.self.hue,
        ...buildAnnounceExtras({
          ghostSeed: localExtras.ghostSeed,
          identitySeed: identity.self.seed,
          ghostName: ghost.ghostName,
          temperament: ghost.temperament,
          ghostHue: ghost.ghostHue,
          badges: localExtras.badges,
          trail: localExtras.trail,
          // Slice 22: the ghostie's card facts — the same inputs
          // the transport announces (profileStore + ghost store),
          // so the YOU mirror shows the published card exactly.
          ghostCard: {
            permissions: localExtras.permissions,
            personality: localExtras.personality,
            vitals: ghost.vitals ? vitalsWire(ghost.vitals) : null,
          },
        }),
      }
    : null;
  const ownCardData: ProfileCardData | null = ownAnnounce
    ? buildProfileCardData({
        peerId: session.selfId,
        isSelf: true,
        name: ownAnnounce.name,
        hue: ownAnnounce.hue,
        extras: ownAnnounce,
        fabricLine: fabricLineFor(session.selfId),
        roleLine: roleLineFor(session.selfId),
      })
    : null;

  // The open peer's card, from the stores' current truth (so it
  // stays live while open — a temperament drift or a badge
  // landing re-renders it, like everything else in this menu).
  const openPeerCardData: ProfileCardData | null =
    profilePeerId && profilePeerId !== session.selfId
      ? buildProfileCardData({
          peerId: profilePeerId,
          isSelf: false,
          name: identity.peers[profilePeerId]?.name ?? "",
          hue: identity.peers[profilePeerId]?.hue ?? null,
          extras: peerProfiles[profilePeerId] ?? null,
          fabricLine: fabricLineFor(profilePeerId),
          roleLine: roleLineFor(profilePeerId),
        })
      : profilePeerId
        ? ownCardData
        : null;

  // ---- Discovery (Slice 59): the lobby seat --------------------
  // The Find fabrics sub-view (PEOPLE), the host's opt-in listing,
  // and everything the lobby service asks of the menu because the
  // menu is where the session, the identity and the Experience
  // context all live:
  //   - this device's public face (name, hue, secure tag) is the
  //     voice beacons and asks speak in;
  //   - while I host, the host fields follow the session (fabric,
  //     room, mode, my ghostie's name, my badges); hosting ending
  //     unlists — there is nothing left to list;
  //   - holding any follow or friend keeps a silent watch seat,
  //     so arrivals of people I care about reach my ghostie even
  //     with the gallery shut (the encounter rider);
  //   - a granted ask lands me in the room through the same
  //     transition an invite link performs;
  //   - a new ask while I host surfaces as a toast pointing at
  //     PEOPLE, where the answer buttons live.
  const lobby = useLobbySnapshot();
  const social = useSocial();
  const toast = useToast();
  const [findOpen, setFindOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) setFindOpen(false);
  }, [menuOpen]);

  const ownLobbyTag = ownCardData?.tag ?? null;
  useEffect(() => {
    if (!identity.self || !ownLobbyTag) return;
    lobbyService.setIdentity({
      name: identity.self.name,
      hue: identity.self.hue,
      tag: ownLobbyTag,
    });
  }, [identity.self, ownLobbyTag]);

  const iAmHostForLobby = session.role === "host";
  useEffect(() => {
    if (!iAmHostForLobby) {
      lobbyService.setHostFields(null);
      if (lobbyService.getSnapshot().listed) lobbyService.setListed(false);
      return;
    }
    const fabricId = fabric.layerId ?? active?.id ?? "default-fluid";
    lobbyService.setHostFields({
      fabricId,
      fabricName:
        state.availableExperiences.find((e) => e.id === fabricId)?.name ?? "Fabric",
      roomId: session.roomId,
      mode: session.mode,
      ghostName: ghost.ghostName ?? null,
      badges: localExtras.badges,
    });
  }, [
    iAmHostForLobby,
    fabric.layerId,
    active?.id,
    session.roomId,
    session.mode,
    ghost.ghostName,
    localExtras.badges,
    state.availableExperiences,
  ]);

  useEffect(() => {
    if (social.followTags.size + social.friendTags.size > 0) {
      lobbyService.startWatching();
    } else {
      lobbyService.stopWatching();
    }
  }, [social.followTags, social.friendTags]);

  // Encounters: the ghostie reacts on the canvas (its chirp is
  // the fluid's business, through the ghost-encounter event) and
  // the pulse goes through the app's ONE vibration gate — if the
  // Vibration switch is off the gate holds it, like every other.
  useEffect(
    () =>
      lobbyService.onEncounter(({ name }) => {
        vibrate([0, 35, 50, 35]);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(FABRIC_GHOST_ENCOUNTER_EVENT, { detail: name })
          );
        }
      }),
    []
  );

  const seenLobbyAskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const known = seenLobbyAskIdsRef.current;
    for (const r of lobby.requests) {
      if (!known.has(r.requestId)) {
        known.add(r.requestId);
        toast.show(`${r.from.name} wants to join your fabric — answer in PEOPLE`);
      }
    }
    const liveIds = new Set(lobby.requests.map((r) => r.requestId));
    known.forEach((id) => {
      if (!liveIds.has(id)) known.delete(id);
    });
  }, [lobby.requests, toast]);

  // A granted ask: the invite transition, applied in-app. The
  // boot path (ExperienceProvider) reads ?room= into this same
  // config; here the URL is updated for fidelity (a refresh
  // keeps the room) and the config moves directly. Once per
  // request — the ref outlives the outgoing state it consumed.
  const appliedLobbyGrantRef = useRef<string | null>(null);
  const expStateRef = useRef(state);
  expStateRef.current = state;
  useEffect(() => {
    const o = lobby.outgoing;
    if (o.phase !== "granted" || appliedLobbyGrantRef.current === o.requestId) return;
    appliedLobbyGrantRef.current = o.requestId;
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("room", o.roomId);
        url.searchParams.set("mode", o.mode);
        if (o.fabricId) url.searchParams.set("exp", o.fabricId);
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* the config below is the join; the URL is only fidelity */
      }
    }
    updateConfig({
      specific: {
        ...((expStateRef.current.experienceConfig?.specific as
          | Record<string, unknown>
          | undefined) ?? {}),
        roomId: o.roomId,
      },
    });
    lobbyService.resetOutgoing();
    setFindOpen(false);
    setMenuOpen(false);
    const fabricName = o.fabricId
      ? expStateRef.current.availableExperiences.find((e) => e.id === o.fabricId)?.name
      : null;
    toast.show(`You're in — ${o.hostName} opened ${fabricName ?? "their fabric"} to you`);
  }, [lobby.outgoing, toast, updateConfig]);

  // ---- ID cards (Slice 22) --------------------------------------
  const PRESENCE_WORDS: Record<string, string> = {
    present: "on the canvas with you",
    summoned: "summoned into the room",
    sleeping: "sleeping",
    away: "away for now",
    off: "off",
  };
  // The ghostie overlay's data: own ghost from the ghost store +
  // the published extras (the same fields the announce carries);
  // a remote ghost from ITS published extras alone — vitals and
  // permissions are never invented for someone else's ghostie.
  const ghostOverlayData = (
    peerId: string
  ): GhostieCardOverlayData | null => {
    if (peerId === session.selfId) {
      const card = ownCardData;
      return {
        name: ghost.ghostName ?? card?.ghost?.name ?? "Your ghostie",
        hue: ghost.ghostHue ?? card?.ghost?.hue ?? null,
        temperament: ghost.temperament ?? card?.ghost?.temperament ?? null,
        presence: ghost.presence,
        presenceLine: ghost.ghostName
          ? `${ghost.presence} — ${PRESENCE_WORDS[ghost.presence] ?? ghost.presence}`
          : null,
        brainLine: ghost.brain
          ? ghost.brain.tierLabel
          : "On-device brain",
        tag: card?.tag ?? null,
        trail: card?.trail ?? localExtras.trail,
        shareable: card?.ghostCard?.shareable ?? localExtras.permissions.shareable,
        tradeable: card?.ghostCard?.tradeable ?? localExtras.permissions.tradeable,
        personalityPublic:
          card?.ghostCard?.personalityPublic ??
          localExtras.permissions.personalityPublic,
        personality: card?.ghostCard?.personality ?? null,
        cardFactsKnown: true,
        vitals: ghost.vitals
          ? {
              health: ghost.vitals.health,
              stamina: ghost.vitals.stamina,
              vigor: ghost.vitals.vigor,
            }
          : null,
        vitalsWhy: ghost.vitals ? ghost.vitals.why : null,
        isSelf: true,
      };
    }
    const extras = peerProfiles[peerId] ?? null;
    const gc = extras?.ghostCard ?? null;
    return {
      name: extras?.ghost?.name ?? "Their ghostie",
      hue: extras?.ghost?.hue ?? null,
      temperament: extras?.ghost?.temperament ?? null,
      presence: null,
      presenceLine: null,
      brainLine: null,
      tag: extras?.tag ?? null,
      trail: extras?.trail ?? null,
      shareable: gc?.shareable === true,
      tradeable: gc?.tradeable === true,
      personalityPublic: gc?.personalityPublic === true,
      personality:
        gc && gc.personalityPublic === true ? (gc.personality ?? null) : null,
      cardFactsKnown: gc !== null,
      vitals: gc?.vitals
        ? { health: gc.vitals.h, stamina: gc.vitals.s, vigor: gc.vitals.v }
        : null,
      vitalsWhy: null,
      isSelf: false,
    };
  };

  // The fabric overlay's data for a registry entry: registry
  // truth + session truth (host, who's here, rules in force).
  const fabricOverlayData = (
    exp: ExperienceLayer
  ): FabricCardOverlayData => {
    const isSessionFabric =
      fabric.layerId === exp.id && session.role !== "open";
    const peopleIds = [
      session.selfId,
      ...session.guestIds.filter((g) => g !== session.selfId),
    ];
    const inForce = isSessionFabric ? fabric.rules : rulesFor(exp.id);
    return {
      exp,
      canvasBadge: canvasBadge(exp),
      stateLine:
        exp.id === active?.id
          ? isSessionFabric
            ? "Live here · session fabric"
            : "Live here"
          : isSessionFabric
            ? "Session fabric"
            : "Yours to open",
      hostLine: isSessionFabric
        ? fabric.byName ??
          (fabric.hostId ? displayNameFor(fabric.hostId, session.selfId) : null)
        : null,
      rulesCaption: isSessionFabric
        ? "In force in this room right now — set by the host, enforced on guest devices."
        : "The host's saved rules for this fabric — they bind guests when the host leads a room here.",
      rules: FABRIC_RULE_KEYS.map((key) => ({
        label: FABRIC_RULE_LABEL[key],
        allowed: inForce[key],
      })),
      people: peopleIds.map((pid) => ({
        id: pid,
        label:
          pid === session.selfId
            ? (identity.self?.name ?? "you")
            : displayNameFor(pid, session.selfId),
        isSelf: pid === session.selfId,
      })),
      canEdit: session.role !== "guest",
    };
  };

  // The layer card's settings summary: the active layer's own
  // per-layer values, read from the same config THIS LAYER edits.
  // Curated labels for the keys the menu knows; an unset key is
  // simply absent (defaults rule, and the card says so).
  const LAYER_TOGGLE_LABELS: Record<string, string> = {
    ghostEnabled: "Ghostie on this layer",
    ambientEnabled: "Ambient life",
    motionEnabled: "Motion (tilt & shake)",
    handsEnabled: "Hands (gesture input)",
    pianoVoice: "Piano voice",
    stageDancerEnabled: "Dancers",
    stageCameraDrift: "Camera drift",
    stageTheme: "Stage theme",
    stageTraumaIdle: "Trauma idle",
  };
  const layerToggleSummary = (
    exp: ExperienceLayer
  ): { label: string; value: string }[] => {
    if (exp.id !== active?.id) return [];
    const specific = (state.experienceConfig.specific ?? {}) as Record<
      string,
      unknown
    >;
    const out: { label: string; value: string }[] = [];
    for (const [key, label] of Object.entries(LAYER_TOGGLE_LABELS)) {
      const v = specific[key];
      if (v === undefined) continue;
      out.push({
        label,
        value: typeof v === "boolean" ? (v ? "On" : "Off") : String(v),
      });
    }
    return out;
  };

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
  // the PEOPLE section with the link ready. Since Slice 8 the event
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
          `“${name}” is playing live in this room — send the invite link under PEOPLE and guests feel it as they land.`
        );
      } else {
        setShareNotice(
          `“${name}” is live — send the invite link under PEOPLE and guests land in this room.`
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
  // the same field to gate the local ghost brain, and (Cleanup 2)
  // the menu's own Summon/Dismiss row reads it too — the retired
  // canvas ghost pill used to leave the cluster while a layer had
  // it off. Distinct from the per-user ghost preference
  // (fabric_ghost_v1, YOU): the ghost runs only when both are on.
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
  // Hotfix 2.4: the See layer's one factual line in THIS LAYER
  // (below) — how segmentation resolves + the frame promise, in
  // Cleanup 2's posture: stated once, no demands.
  const isSamSee = active?.id === "sam-see";
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
  //   stageTraumaIdle    — the built-in character's idle pick
  //                        (Slice 25): "mma" | "bouncing". The pick
  //                        is the layer's memory of its ghostie's
  //                        built-in body — DancerStage rebinds the
  //                        same-origin GLB on mount; picking an
  //                        idle here binds it immediately. Loading
  //                        your own file or restoring the mannequin
  //                        clears the pick.
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
  // The built-in character (Trauma, Slice 25): the layer setting
  // holds the idle pick; the slot store holds the live binding.
  // Semantics (traumaCharacter.resolveBuiltinBind — THE RULE,
  // FINAL, Terrell Nov 2, two messages read together): on the
  // stage Trauma is the figure — an UNSET pick binds the MMA
  // default, so the MMA pill below is lit on an untouched layer
  // and that is the truth (it is what the stage binds); a
  // stored catalog pick wins. Restore mannequin stores the
  // explicit "none" instead of clearing to undefined (Slice
  // 37's representability fix, kept: "wants the bare figure"
  // stays a recorded choice — the ONLY standing bare figure,
  // distinct from "never picked", which binds him).
  const stageTraumaIdleRaw = (state.experienceConfig.specific as any)
    ?.stageTraumaIdle;
  const stageBuiltinBind = resolveBuiltinBind(stageTraumaIdleRaw);
  const stageTraumaIdle = traumaIdleDef(stageTraumaIdleRaw).id;
  const bindTraumaIdle = (next: TraumaIdleId) => {
    noteActivity();
    const def = traumaIdleDef(next);
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        stageTraumaIdle: def.id,
      },
    });
    setStageCharacterRemote(def.url, def.characterName);
  };
  const clearStageTraumaIdle = () => {
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        stageTraumaIdle: undefined,
      },
    });
  };
  // Restore mannequin (Slice 37): store the EXPLICIT bare-figure
  // pick so the stage keeps the mannequin on purpose — clearing
  // to undefined would rebind the Trauma default on the next
  // mount (the final Nov 2 rule), so "none" is how the bare
  // figure is chosen, never an accident of an empty setting.
  const restoreMannequin = () => {
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        stageTraumaIdle: TRAUMA_IDLE_NONE,
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

  // "Hands" — Slice 28. The layer's camera-gesture input, stored
  // per layer id like Motion, with the same deliberate default:
  // absent means OFF — a camera is even more personal than a gyro,
  // and a layer's owner opts their hand in on purpose. The feature
  // state (starting / live / blocked / not-on-this-device) is
  // published by the hands store from the live layer, so this
  // section can say plainly what state it is in. Ships on See and
  // the Fluid Fabric in v1 — the toggle renders only there.
  const [handsUi, setHandsUi] = useState<HandsSnapshot>(() =>
    getHandsSnapshot()
  );
  useEffect(() => subscribeHands(setHandsUi), []);
  const handsInLayer =
    (state.experienceConfig.specific as any)?.handsEnabled === true;
  const setHandsInLayer = (next: boolean) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        handsEnabled: next,
      },
    });
  };
  const handsAppliesHere =
    state.activeExperience?.id === "sam-see" ||
    state.activeExperience?.id === "default-fluid";

  // "Controller" — Slice 34 (Layer B3). NOT a per-layer setting:
  // the role is this DEVICE's stance toward the room (stored in
  // controllerStore, persisted on the device), so it renders in
  // this section — beside the senses it redirects — but writes to
  // the controller store, never to the layer config. It applies on
  // the Fluid Fabric, where this device's tilt/shake/hands have a
  // room to drive.
  const [controllerUi, setControllerUi] = useState<ControllerSnapshot>(() =>
    getControllerSnapshot()
  );
  useEffect(() => {
    ensureControllerLoaded();
    return subscribeController(setControllerUi);
  }, []);
  const controllerAppliesHere =
    state.activeExperience?.id === "default-fluid";

  // "The Fold" — Slice 36. THIS LAYER's own settings, in the
  // layer config like every other layer's truths: lending is this
  // device's opt-in to compute (default OFF — Slice 12's law),
  // and the node address is where this device's bridge polls a
  // real GenX node-controller. The probe verdict + lifetime Juice
  // are read from the genx store (the layer's engine writes the
  // probe; the store settles Juice from verified room ledgers) —
  // the menu renders them, it does not compute them.
  const [genxUi, setGenxUi] = useState<GenxSnapshot>(() => getGenxSnapshot());
  useEffect(() => {
    void ensureGenxPrefsLoaded();
    return subscribeGenx(setGenxUi);
  }, []);
  const genxAppliesHere = state.activeExperience?.id === "genx-fold";
  const lendInLayer =
    (state.experienceConfig.specific as any)?.lendDevice === true;
  const setLendInLayer = (next: boolean) => {
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        lendDevice: next,
      },
    });
  };
  const nodeUrlInLayer = String(
    ((state.experienceConfig.specific as any)?.genxNodeUrl as string) ?? ""
  );
  const [nodeUrlDraft, setNodeUrlDraft] = useState<string | null>(null);
  const commitNodeUrl = () => {
    if (nodeUrlDraft === null) return;
    noteActivity();
    updateConfig({
      specific: {
        ...(state.experienceConfig.specific as any),
        genxNodeUrl: nodeUrlDraft.trim().slice(0, 200),
      },
    });
    setNodeUrlDraft(null);
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
      `Playing “${p.name}” into the room now — everyone here feels it. Send the invite link under PEOPLE so others can join live.`
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
      `Playing “${r.name}” into the room now — everyone here sees it draw itself. Send the invite link under PEOPLE so others can join live.`
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
        // Slice 37: a NUMBER, not "78%". The percentage resolved
        // against the sheet's containing block — a box the
        // in-app webview misreports while its chrome animates —
        // so the cap silently failed on device and the sheet ran
        // past the screen's bottom edge, its one internal scroll
        // reading as an endless list poured over the stage
        // (Terrell's Nov 1 panel shot). A pixel cap computed from
        // the window always caps.
        maxHeight: menuMaxHeight,
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
            onOpenGhostieCard={() =>
              openCardOverlay({ kind: "ghost", peerId: session.selfId }, "home")
            }
          />
        ) : cardOverlay ? (
          cardOverlay.kind === "ghost" ? (
            (() => {
              const data = ghostOverlayData(cardOverlay.peerId);
              return data ? (
                <GhostieCardOverlay data={data} onBack={closeCardOverlay} />
              ) : (
                <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
                  That ghostie's card hasn't landed yet.
                </Text>
              );
            })()
          ) : cardOverlay.kind === "fabric" ? (
            (() => {
              const exp = state.availableExperiences.find(
                (e) => e.id === cardOverlay.layerId
              );
              return exp ? (
                <FabricCardOverlay
                  data={fabricOverlayData(exp)}
                  onBack={closeCardOverlay}
                  onOpenPerson={(pid) => {
                    noteActivity();
                    setCardOverlay(null);
                    setProfilePeerId(pid);
                  }}
                  onEditFabric={() => {
                    noteActivity();
                    setCardOverlay(null);
                    openEditor(exp);
                  }}
                />
              ) : (
                <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
                  That fabric isn't in the registry anymore.
                </Text>
              );
            })()
          ) : active ? (
            <LayerCardOverlay
              data={{
                exp: active,
                canvasBadge: canvasBadge(active),
                toggles: layerToggleSummary(active),
              }}
              onBack={closeCardOverlay}
            />
          ) : (
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              No layer is loaded right now.
            </Text>
          )
        ) : profilePeerId ? (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <Pressable
                pointerEvents="auto"
                onPress={() => {
                  noteActivity();
                  setProfilePeerId(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to menu"
                style={({ pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: pressed ? colors.accentDim : "transparent",
                  marginRight: spacing.sm,
                })}
              >
                <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                  ← Menu
                </Text>
              </Pressable>
              <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
                {profilePeerId === session.selfId
                  ? "Your card"
                  : "Profile card"}
              </Text>
            </View>
            {openPeerCardData ? (
              <ProfileCard
                data={openPeerCardData}
                onOpenGhostie={
                  openPeerCardData.ghost
                    ? () =>
                        openCardOverlay(
                          { kind: "ghost", peerId: profilePeerId },
                          profilePeerId
                        )
                    : undefined
                }
                ghostPresenceLine={
                  profilePeerId === session.selfId
                    ? ghost.ghostName
                      ? `${ghost.temperament ? `${ghost.temperament} · ` : ""}${ghost.presence}${ghost.otherGhostCount > 0 ? ` · ${ghost.otherGhostCount} other ghostie${ghost.otherGhostCount === 1 ? "" : "s"} in the room` : ""}`
                      : null
                    : null
                }
                actions={
                  profilePeerId === session.selfId || !session.inputEnabled
                    ? // Own card needs no buttons; an audience
                      // member's buttons would be dead ones, so
                      // they don't render — the note below the
                      // card says why instead.
                      null
                    : {
                          onSendHeart: () => {
                            noteActivity();
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent(FABRIC_VERB_EVENT, {
                                  detail: "heart",
                                })
                              );
                            }
                          },
                          onPetGhost: openPeerCardData.ghost
                            ? () => {
                                noteActivity();
                                if (typeof window !== "undefined") {
                                  window.dispatchEvent(
                                    new CustomEvent(FABRIC_PET_GHOST_EVENT, {
                                      detail: profilePeerId,
                                    })
                                  );
                                }
                              }
                            : null,
                          note: "Hearts and pets travel like touches — this room's mode, the fabric's rules, and their own settings decide what lands. A pet lands on the fluid canvas, where their ghostie roams.",
                        }
                }
              />
            ) : (
              <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
                Their card hasn't landed yet.
              </Text>
            )}
            {profilePeerId !== session.selfId && !session.inputEnabled ? (
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                No actions on this card while you're audience in this
                room — your hearts and pets stay home, like every
                touch, until the room's mode lets you send.
              </Text>
            ) : null}
          </View>
        ) : findOpen ? (
          <FindFabricsView
            onBack={() => {
              noteActivity();
              setFindOpen(false);
            }}
          />
        ) : (
          <>
        {/* ----------- FABRICS (Slice 19 · gallery Slice 32) ----------- */}
        <SectionHeader>FABRICS</SectionHeader>
        {/* Hotfix 2.6: the role, in plain words, where he looks —
            the resolved session role (roleResolution via the
            session store), never guessed here. */}
        <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginBottom: spacing.xs }}>
          {session.role === "host"
            ? session.peers === 0
              ? "Just you here — you’re hosting"
              : "You’re hosting this session"
            : session.role === "guest"
              ? `Guest · ${displayNameFor(session.hostId, session.selfId)} is hosting`
              : session.peers === 0
                ? "Just you here — you’re hosting"
                : "This room has no host yet"}
        </Text>
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
              ...cardStyle, borderColor: colors.accentLine,
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

        {/* Slice 32 — THE GALLERY. The fabrics are one horizontal
            rail of thumbnail cards (FabricThumb draws each
            fabric's own scene), however many fabrics exist — the
            section is one rail tall and the menu no longer swells
            with the registry. The card body keeps Slice 19's
            meaning exactly (onFabricCard: host-led picks, guest
            leave-warning, follower toasts on host change); the
            doors keep theirs (ID card for everyone, editor for
            the host side). The one open editor renders BELOW the
            rail at full width instead of inflating its card. */}
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={THUMB_W + spacing.md}
          snapToAlignment="start"
          style={{ marginBottom: spacing.sm }}
          contentContainerStyle={{
            gap: spacing.md,
            paddingVertical: spacing.xs,
            paddingRight: spacing.lg,
          }}
        >
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
            return (
              <View
                key={exp.id}
                style={{
                  width: THUMB_W,
                  borderWidth: 1,
                  borderColor: isActive || isSessionFabric ? colors.accent : colors.line,
                  borderRadius: radius.card,
                  overflow: "hidden",
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
                  <View style={{ position: "relative" }}>
                    <FabricThumb layerId={exp.id} />
                    <View
                      style={{
                        position: "absolute",
                        top: spacing.sm,
                        left: spacing.sm,
                        borderWidth: 1,
                        borderColor: colors.line,
                        borderRadius: radius.pill,
                        paddingVertical: 2,
                        paddingHorizontal: 8,
                        backgroundColor: "rgba(8,12,15,0.72)",
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1 }}>
                        {canvasBadge(exp)}
                      </Text>
                    </View>
                    {isSessionFabric && !isActive ? (
                      <View
                        style={{
                          position: "absolute",
                          top: spacing.sm,
                          right: spacing.sm,
                          borderRadius: radius.pill,
                          paddingVertical: 2,
                          paddingHorizontal: 8,
                          backgroundColor: colors.accent,
                        }}
                      >
                        <Text style={{ color: "#06202a", fontSize: typeScale.caption, fontWeight: "800", letterSpacing: 1 }}>
                          SESSION
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ padding: spacing.md, paddingBottom: spacing.sm }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}
                    >
                      {exp.name}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2, height: 32 }}
                    >
                      {exp.blurb ?? exp.description}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: isActive || isSessionFabric ? colors.accent : colors.textDim,
                        fontSize: typeScale.caption,
                        fontWeight: "700",
                        marginTop: spacing.xs,
                      }}
                    >
                      {cardState}
                    </Text>
                  </View>
                </Pressable>

                {/* Slice 22: the card's doors — Edit (host-side)
                    and the fabric's ID card (everyone). Separate
                    targets from the card body; no ambiguous pixels. */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing.lg,
                    paddingHorizontal: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                  }}
                >
                  <Pressable
                    pointerEvents="auto"
                    onPress={() =>
                      openCardOverlay(
                        { kind: "fabric", layerId: exp.id },
                        "list"
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${exp.name}'s ID card`}
                    style={{ paddingVertical: 10 }}
                  >
                    <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                      ID card ›
                    </Text>
                  </Pressable>
                  {canEdit ? (
                    <Pressable
                      pointerEvents="auto"
                      onPress={() => openEditor(exp)}
                      accessibilityRole="button"
                      accessibilityLabel={`${editing ? "Close" : "Edit"} ${exp.name} settings`}
                      style={{ paddingVertical: 10 }}
                    >
                      <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                        {editing ? "Close editor" : "Edit fabric ›"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* The one open editor, below the rail (Slice 32): the
            same Slice 19 editor — the fabric's curated per-layer
            quick settings plus its session guest rules — at full
            menu width for the one fabric being edited, instead of
            swelling whichever card it belonged to. */}
        {session.role !== "guest" && editExp ? (
          <View
            style={{
              ...cardStyle,
              borderColor: colors.accentLine,
              marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                {`Editing ${editExp.name}`}
              </Text>
              <Pressable
                pointerEvents="auto"
                onPress={() => openEditor(editExp)}
                accessibilityRole="button"
                accessibilityLabel={`Close ${editExp.name} settings`}
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
              >
                <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
                  Close
                </Text>
              </Pressable>
            </View>
            {(LAYER_EDIT_FIELDS[editExp.id] ?? []).length === 0 ? (
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
                No quick settings for this fabric — its controls
                live in THIS LAYER while it is loaded.
              </Text>
            ) : (
              (LAYER_EDIT_FIELDS[editExp.id] ?? []).map((field) => {
                if (field.kind === "bool") {
                  const raw = editValues[field.key];
                  const value =
                    typeof raw === "boolean" ? raw : field.defaultValue;
                  return (
                    <ToggleRow
                      key={field.key}
                      label={field.label}
                      value={value}
                      onPress={() => applyEditField(editExp, field, !value)}
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
                            onPress={() => applyEditField(editExp, field, opt.value)}
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

            {/* Session guest rules for this fabric. For the host
                they go live with the next fabric broadcast; solo,
                they are saved for when you host. Rules only ever
                restrict guests — the session mode still applies
                first. */}
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginTop: spacing.xs, marginBottom: spacing.xs }}>
              Guest rules {session.role === "host" ? "— live for this room" : "— apply when you host"}
            </Text>
            {FABRIC_RULE_KEYS.map((key) => (
              <ToggleRow
                key={key}
                label={FABRIC_RULE_LABEL[key]}
                value={rulesFor(editExp.id)[key]}
                onPress={() => setRule(editExp.id, key, !rulesFor(editExp.id)[key])}
              />
            ))}
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Rules only ever restrict guests. The session mode
              (PEOPLE, below) applies first and cannot be widened
              from here.
            </Text>
          </View>
        ) : null}

        {/* Slice 57: the fabric-scoped panels live here, with the
            fabrics — the Layer library and the Locker hub. They
            used to sit in a "Panels" catch-all at the menu's
            tail, under SETTINGS & HELP. */}
        <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
          <DoorRow
            icon="layers"
            label="Layer library"
            onPress={() => openPanel("layer")}
          />
          <DoorRow
            icon="grid"
            label="Locker — layers, social, swarm"
            onPress={() => openPanel("neo")}
          />
        </View>

        {/* ---------------- PEOPLE ---------------- */}
        <SectionHeader>PEOPLE</SectionHeader>
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
                // Slice 21: a roster row is a door — tap a person
                // (or their ghostie's line) and their profile card
                // opens. The ghostie sub-line rides the announce
                // extras; a peer whose extras haven't landed shows
                // the name row alone, exactly as before.
                const peerGhost = isSelf
                  ? ghost.ghostName
                    ? {
                        name: ghost.ghostName,
                        temperament: ghost.temperament,
                      }
                    : null
                  : (peerProfiles[pid]?.ghost ?? null);
                return (
                  <View
                    key={pid}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      paddingVertical: 3,
                    }}
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
                    <View style={{ flex: 1 }}>
                      {/* The person is one door (their user card);
                          the ghostie sub-line is its OWN door
                          (Slice 22: the ghostie's ID card) —
                          stacked targets, never nested. */}
                      <Pressable
                        pointerEvents="auto"
                        onPress={() => {
                          noteActivity();
                          setProfilePeerId(pid);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${isSelf ? "your" : `${displayNameFor(pid, session.selfId)}'s`} profile card`}
                        style={({ pressed }) => ({
                          borderRadius: radius.card,
                          backgroundColor: pressed ? colors.accentDim : "transparent",
                        })}
                      >
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
                      </Pressable>
                      {peerGhost ? (
                        <Pressable
                          pointerEvents="auto"
                          onPress={() =>
                            openCardOverlay({ kind: "ghost", peerId: pid }, "list")
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${peerGhost.name}'s ID card`}
                          style={({ pressed }) => ({
                            borderRadius: radius.card,
                            backgroundColor: pressed ? colors.ghostDim : "transparent",
                            alignSelf: "flex-start",
                          })}
                        >
                          <Text style={{ color: colors.ghost, fontSize: typeScale.caption }}>
                            👻 {peerGhost.name}
                            {peerGhost.temperament
                              ? ` · ${peerGhost.temperament}`
                              : ""}{" "}
                            — tap for its ID card
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
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
              ...cardStyle, borderColor: colors.accentLine,
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
                {/* Discovery (Slice 59): people asking in from the
                    lobby gallery. The host's word is the door —
                    Let in grants the room through the ordinary
                    session path (the asker's client lands exactly
                    like an invite landing); Not now is a plain no.
                    Unanswered asks fade on their own. */}
                {lobby.requests.length > 0 ? (
                  <View
                    style={{
                      ...cardStyle,
                      borderColor: colors.accentLine,
                      gap: spacing.xs,
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                      Requests to join
                    </Text>
                    {lobby.requests.map((r) => (
                      <View
                        key={r.requestId}
                        style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                      >
                        <View
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 6,
                            backgroundColor: hueCss(r.from.hue),
                          }}
                        />
                        <Text style={{ flex: 1, color: colors.text, fontSize: typeScale.body }}>
                          {r.from.name} wants to join
                        </Text>
                        <Pressable
                          pointerEvents="auto"
                          onPress={() => {
                            noteActivity();
                            lobbyService.respondToRequest(r.requestId, true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Let ${r.from.name} in`}
                          style={({ pressed }) => ({
                            paddingVertical: 6,
                            paddingHorizontal: 12,
                            borderRadius: radius.pill,
                            backgroundColor: pressed ? colors.accentDim : colors.accent,
                          })}
                        >
                          <Text style={{ color: "#06202a", fontSize: typeScale.body, fontWeight: "800" }}>
                            Let in
                          </Text>
                        </Pressable>
                        <Pressable
                          pointerEvents="auto"
                          onPress={() => {
                            noteActivity();
                            lobbyService.respondToRequest(r.requestId, false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Not now for ${r.from.name}`}
                          style={({ pressed }) => ({
                            paddingVertical: 6,
                            paddingHorizontal: 12,
                            borderRadius: radius.pill,
                            borderWidth: 1,
                            borderColor: colors.line,
                            backgroundColor: pressed ? colors.accentDim : "transparent",
                          })}
                        >
                          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
                            Not now
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
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

                {/* Discovery (Slice 59): listing is opt-in, per
                    hosting session — the MicroDuck rule. Off (the
                    default, and the state every hosting starts
                    in) this room puts nothing on the air and is
                    invisible, exactly as before discovery existed;
                    on, the room beacons to the lobby and people
                    can ask in, each approved here. */}
                <ToggleRow
                  label="List my fabric"
                  value={lobby.listed}
                  onPress={() => {
                    noteActivity();
                    lobbyService.setListed(!lobby.listed);
                  }}
                />
                <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
                  {lobby.listed
                    ? "Listed — people can find this fabric in PEOPLE → Find fabrics and ask to join. You approve each one."
                    : "Unlisted — nobody can discover this room. The invite link is the only door, as always."}
                </Text>

                <Text
                  selectable
                  style={{
                    color: colors.text,
                    fontSize: typeScale.caption,
                    ...cardStyle, borderColor: colors.line,
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
                    ...cardStyle, borderColor: colors.accentLine,
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

        {/* The session fabric's guest rules (Slice 19) — the law
            that binds a guest in this room, stated where the
            people are. The same fabric-store state the drawer
            reads; the host's editor for these rules lives on the
            fabric's card in FABRICS, above. */}
        {session.role === "guest" && fabric.layerId ? (
          <View style={{ ...cardStyle, borderColor: colors.line, gap: 4 }}>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              {`Guest rules on ${state.availableExperiences.find((e) => e.id === fabric.layerId)?.name ?? "this fabric"}`}
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {`Here, guests can: ${FABRIC_RULE_KEYS.filter((k) => fabric.rules[k]).map((k) => (k === "draw" ? "draw" : k === "verbs" ? "send verbs" : "play notes")).join(" · ") || "watch and listen"}. Fabric settings are set by your host.`}
            </Text>
          </View>
        ) : null}
        {/* Slice 57: the people panels live here, with the
            people — Friends & chat, and Call. They used to sit
            in the "Panels" catch-all at the menu's tail.
            Slice 59 adds the Find door above them: the discovery
            gallery, a sub-view of this sheet like the cards. */}
        <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
          <DoorRow
            icon="eye"
            label="Find fabrics"
            onPress={() => {
              noteActivity();
              setFindOpen(true);
            }}
          />
          <DoorRow
            icon="people"
            label="Friends"
            onPress={() => openPanel("friends")}
          />
          <DoorRow
            icon="call"
            label="Call"
            onPress={() => openPanel("call")}
          />
        </View>

        {/* ---------------- YOU ---------------- */}
        <SectionHeader>YOU</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Yours, on this device — the same on every layer.
        </Text>

        {/* Your profile card (Slice 21) — what the room sees when
            it looks at you: built from the exact announce payload
            this device broadcasts, so the face here IS the face
            out there. The editing surface stays the card below;
            this one is the mirror. */}
        {ownCardData ? (
          <>
            <Text
              style={{
                color: colors.accent,
                fontSize: typeScale.caption,
                fontWeight: "700",
                letterSpacing: 1,
                marginBottom: spacing.xs,
              }}
            >
              THIS IS WHAT THE ROOM SEES
            </Text>
            <ProfileCard
              data={ownCardData}
              onOpenGhostie={
                ownCardData.ghost
                  ? () =>
                      openCardOverlay(
                        { kind: "ghost", peerId: session.selfId },
                        "list"
                      )
                  : undefined
              }
              ghostPresenceLine={
                ghost.ghostName
                  ? `${ghost.temperament ? `${ghost.temperament} · ` : ""}${ghost.presence}${ghost.otherGhostCount > 0 ? ` · ${ghost.otherGhostCount} other ghostie${ghost.otherGhostCount === 1 ? "" : "s"} in the room` : ""}`
                  : null
              }
            />
          </>
        ) : null}

        {/* Badges (Slice 24) — earned by living in the fabric.
            The same earned ids ride your announce, so this row and
            your card in the room always agree. Power-ups are
            equipped in Your Ghostie. */}
        <View style={{ ...cardStyle, gap: 6 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              Badges
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {rewards.earned.length} of 9 earned
            </Text>
          </View>
          {rewards.earned.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
              {rewards.earned.map((e) => {
                const info = badgeInfo(e.id);
                if (!info) return null;
                return (
                  <View
                    key={e.id}
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <BadgeGlyphMark glyph={info.glyph} color={hueCss(info.hue)} />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: typeScale.caption,
                        marginLeft: 6,
                      }}
                    >
                      {info.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              None yet — they come from sharing a fabric, hosting,
              composing, and being kind to ghosties. Power-ups live in
              Your Ghostie.
            </Text>
          )}
        </View>

        {/* You (Slice 6) — the human LifePacket v0: the name and
            signature hue the room sees and hears. Your color tints
            your strokes on every screen; your stroke sound is
            pitched by it. Editing announces the new face to the
            room immediately. Only name + color ever leave this
            device — the seed stays home. */}
        <View
          style={{
            ...cardStyle, borderColor: colors.accentLine,
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

        {/* Your Ghostie (Slice 20) — the ghostie's HOME: its living fDNA and secure tag, its brain, its
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
            ...cardStyle, borderColor: colors.ghostLine,
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
            ...cardStyle, borderColor: colors.accentLine,
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
            ...cardStyle, borderColor: colors.ghostLine,
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

        {/* Slice 57: your own panels live here, with the rest of
            YOU — your Profile, your Wallet, your Shop. They used
            to sit in the "Panels" catch-all at the menu's tail. */}
        <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
          <DoorRow
            icon="user"
            label="Profile"
            onPress={() => openPanel("profile")}
          />
          <DoorRow
            icon="wallet"
            label="Wallet"
            onPress={() => openPanel("wallet")}
          />
          <DoorRow
            icon="bag"
            label="Shop"
            onPress={() => openPanel("shop")}
          />
        </View>

        {/* ---------------- THIS LAYER ---------------- */}
        <SectionHeader>{`THIS LAYER${active ? ` · ${active.name.toUpperCase()}` : ""}`}</SectionHeader>
        {/* Slice 22: the active layer has an ID card too — what
            it is, its tools, its caps, its settings summary, and
            the lint attached. The settings below stay the working
            surface; the card is the layer's public face. */}
        {active ? (
          <Pressable
            pointerEvents="auto"
            onPress={() => openCardOverlay({ kind: "layer" }, "list")}
            accessibilityRole="button"
            accessibilityLabel={`Open ${active.name}'s layer ID card`}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              paddingVertical: 4,
              marginBottom: spacing.xs,
              borderRadius: radius.card,
              backgroundColor: pressed ? colors.accentDim : "transparent",
            })}
          >
            <Text style={{ color: colors.accent, fontSize: typeScale.body, fontWeight: "700" }}>
              {active.name} — ID card ›
            </Text>
          </Pressable>
        ) : null}
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

        {/* See layer (Hotfix 2.4): the mechanism + privacy lines
            moved off the camera into reference copy — one factual
            line here, the fuller version on the layer's ID card. */}
        {isSamSee ? (
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: spacing.sm }}>
            See names what the camera sees with SAM 3.1, through the
            model resolved for this device. A frame is sent only when
            you tap Segment, and dropped right after.
          </Text>
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
            layer. (Cleanup 2 retired the resident canvas chip — the
            ghost's Summon/Dismiss live here and in Your Ghostie.) */}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
            Ghost in this layer
          </Text>
          <BoolPillRow
            value={ghostInLayer}
            onPick={setGhostInLayer}
            labelPrefix="Ghost in this layer"
          />
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Your ghost lives in this layer and plays along with the room.
            Off applies to this layer only — other layers keep their own
            setting, and your ghost preference in YOU still applies.
          </Text>
          {/* Summon / Dismiss — the retired chip's session controls,
              dispatching the same window event the canvas has always
              listened to. Same visibility rules the chip used:
              dismiss while hosting your ghost; summon while people
              are here, your ghost is on, this layer allows it, and
              the room isn't full. */}
          {ghost.sessionRole === "host" ? (
            <Pressable
              pointerEvents="auto"
              onPress={() => {
                noteActivity();
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent(FABRIC_GHOST_SESSION_EVENT, {
                      detail: "dismiss",
                    })
                  );
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss your ghost ${ghost.ghostName ?? ""} from the session`}
              style={({ pressed }) => ({
                alignSelf: "flex-start",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.ghostLine,
                backgroundColor: pressed ? colors.ghostDim : "transparent",
              })}
            >
              <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                Dismiss {ghost.ghostName ?? "your ghost"}
              </Text>
            </Pressable>
          ) : session.peers > 0 && ghost.enabled && ghostInLayer ? (
            ghost.otherGhostCount >= MAX_GHOSTS_PER_ROOM ? (
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                Too many ghosts in the room ({MAX_GHOSTS_PER_ROOM} max) — yours waits with you.
              </Text>
            ) : (
              <Pressable
                pointerEvents="auto"
                onPress={() => {
                  noteActivity();
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent(FABRIC_GHOST_SESSION_EVENT, {
                        detail: "summon",
                      })
                    );
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Summon your ghost ${ghost.ghostName ?? ""} into the session`}
                style={({ pressed }) => ({
                  alignSelf: "flex-start",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.ghostLine,
                  backgroundColor: pressed ? colors.ghostDim : "transparent",
                })}
              >
                <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                  Summon {ghost.ghostName ?? "your ghost"}
                </Text>
              </Pressable>
            )
          ) : null}
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
          <BoolPillRow
            value={ambientInLayer}
            onPick={setAmbientInLayer}
            labelPrefix="Ambient life"
          />
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
            <BoolPillRow
              value={stageDancer}
              onPick={setStageDancer}
              labelPrefix="Dancers"
            />
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
            <BoolPillRow
              value={stageDrift}
              onPick={setStageDrift}
              labelPrefix="Camera drift"
            />
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
                  // Your own file retires the layer's built-in
                  // pick — the stage won't rebind Trauma over it.
                  clearStageTraumaIdle();
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
                    // Restore stores the explicit "none" pick
                    // (restoreMannequin, Slice 37 — kept by
                    // Slice 38): the bare figure is a recorded
                    // choice, not the accident of an empty
                    // setting, and the pills/status can say so.
                    restoreMannequin();
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
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700", marginTop: spacing.sm }}>
              Built-in character — Trauma
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              {TRAUMA_IDLES.map((def) => {
                // Lit when this idle is bound right now — or when
                // it's what the stage will bind on mount (the
                // stored pick, or the default on an untouched
                // layer) and the slot is still empty.
                // stageBuiltinBind resolves through the final
                // Nov 2 rule, so an untouched layer lights the
                // MMA pill — and the display and the stage agree,
                // because that IS what binds. (Slice 38 briefly
                // lit nothing here under its choice-only rule;
                // Terrell's second message restored the default.)
                const selected =
                  charUi.url === def.url ||
                  (charUi.url === null && stageBuiltinBind?.id === def.id);
                return (
                  <Pressable
                    key={def.id}
                    pointerEvents="auto"
                    onPress={() => bindTraumaIdle(def.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Trauma idle ${def.label}`}
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
                      {def.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Trauma is the stage's figure — he ships with it and
              stands by default, in the idle picked here (MMA
              until you choose the other). Your ghostie wears him,
              washed in its hue with its name tag flying. The idle
              loops on its own (it IS how he rests), and your
              notes still move his body over it, band by band. The
              layer remembers the pick. Restore the mannequin only
              if you want the bare figure — choosing it is the one
              way the bare figure stands on purpose.
            </Text>

            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              A .glb or .gltf whose skeleton uses the UE5 Mannequin
              bone names (pelvis, spine_01, upperarm_l, …) takes the
              stage and dances with the same driver — this is the
              door for Unreal exports. A Mixamo skeleton
              (mixamorig:Hips, mixamorig:LeftArm, …) binds too —
              Fabric maps it onto the same contract. Missing bones
              are skipped; a file that fails to load leaves the
              mannequin standing.
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
          <BoolPillRow
            value={motionInLayer}
            onPick={setMotionInLayer}
            labelPrefix="Motion"
          />
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

        {/* Hands in this layer — Slice 28. Per-layer like Motion,
            default OFF: the camera opens only while this is on,
            and only on the layers where a hand over the fluid
            means something (See, the Fluid Fabric). Point to draw
            in the air, pinch to press, shove with an open palm;
            hold a sign — ✋ stills, ✌ cheers, 👍 hearts, ✊ clears.
            The reading happens on this device: no frame, landmark
            or image is sent or stored, ever. On See, Hands reads
            the camera See already runs; here on the fluid it opens
            the camera as the background, under the dye. */}
        {handsAppliesHere ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              Hands
            </Text>
            <BoolPillRow
              value={handsInLayer}
              onPick={setHandsInLayer}
              labelPrefix="Hands"
            />
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {handsInLayer && handsUi.phase === "blocked"
                ? "Camera access was denied — this browser is keeping its camera private, and Fabric respects that. The layer still works by touch."
                : handsInLayer && handsUi.phase === "unsupported"
                  ? "Hand tracking couldn't start on this device, so this layer stays touch-driven here. Nothing else changes."
                  : "Point to draw in the air. Pinch to press. ✋ hold stills the room, ✌ peace cheers, 👍 sends a heart, ✊ clears a ripple — and your ghostie sees the signs too. Your camera is read on this device only: nothing is sent or stored."}
            </Text>
          </View>
        ) : null}

        {/* The Fold — Slice 36. This device's stance toward the
            room's compute field: lending is opt-in and off by
            default (a device computes only when its owner says
            so), and the node address points this device's bridge
            at a real GenX node-controller — polled read-only,
            its reports labelled node-reported, its FAH status
            stated exactly as the node reports it. The probe line
            is the bridge's own verdict (reachable / blocked /
            offline): a browser that cannot read a LAN node says
            so here instead of pretending the node is down. */}
        {genxAppliesHere ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              The Fold — this device
            </Text>
            <BoolPillRow
              value={lendInLayer}
              onPick={(next: boolean) => setLendInLayer(next)}
              labelPrefix="Lend this device"
            />
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {lendInLayer
                ? "Lending: when you join a bounty, this device benchmarks itself on the real shard workload, computes the shards it is assigned, and earns Juice only for shards the host verifies by recomputing them."
                : "Not lending. This device can watch the fold, follow bounties and spectate — it computes nothing and earns nothing. Battery and heat are yours; nothing runs here until you turn this on."}
            </Text>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              GenX node address
            </Text>
            <TextInput
              pointerEvents="auto"
              value={nodeUrlDraft ?? nodeUrlInLayer}
              onChangeText={setNodeUrlDraft}
              onEndEditing={commitNodeUrl}
              onSubmitEditing={commitNodeUrl}
              placeholder="192.168.1.20:3005 or http://node.local:3005"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={200}
              style={{
                color: colors.text,
                fontSize: 16,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.card,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            />
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {nodeUrlInLayer
                ? genxUi.probe.state === "reachable"
                  ? `Probe: reachable — the node at ${genxUi.probe.url} answers and this browser may read it. Its status rides into the field on the node card.`
                  : genxUi.probe.state === "blocked"
                    ? `Probe: blocked — ${genxUi.probe.detail}`
                    : genxUi.probe.state === "offline"
                      ? `Probe: offline — ${genxUi.probe.detail}`
                      : "Probe: checking the address…"
                : "No node set. The room fold runs without one; a node adds its Folding@home status and its provider jobs (the board's node cards) to the same field."}
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Your Juice — {genxUi.juiceLifetime.toFixed(1)} earned from verified
              shards across every room this device has folded in. Juice is the
              fold's own record: it settles only when a host's recompute
              verifies your work.
            </Text>
          </View>
        ) : null}

        {/* Controller — Slice 34 (Layer B3). This device joins the
            room as a senses-only controller: its tilt, shake and
            hand gestures are delivered to the room as events while
            the experience renders on the OTHER screens, and this
            screen becomes a dark control surface. The role is the
            device's own stance (controllerStore), not a layer
            setting and not a session power — it binds nobody else
            and one tap stands it down. Calibration registers this
            phone's natural grip as the shared space's neutral: the
            captured angles stay on this device like all raw motion;
            only the lean's events ever travel. */}
        {controllerAppliesHere ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}>
              Controller
            </Text>
            <BoolPillRow
              value={controllerUi.role === "controller"}
              onPick={(next: boolean) => {
                noteActivity();
                setControllerRole(next ? "controller" : "screen");
              }}
              labelPrefix="Controller"
            />
            {controllerUi.role === "controller" ? (
              <Pressable
                pointerEvents="auto"
                onPress={() => {
                  noteActivity();
                  requestControllerCalibration();
                }}
                accessibilityRole="button"
                accessibilityLabel="Calibrate my grip"
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
                  Calibrate my grip
                </Text>
              </Pressable>
            ) : null}
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {controllerUi.role === "controller"
                ? controllerUi.calibration
                  ? `Driving the room. Your grip (β ${controllerUi.calibration.beta0.toFixed(0)}° / γ ${controllerUi.calibration.gamma0.toFixed(0)}°) is the shared space's neutral — recalibrate any time from the control surface. Stand down here or there whenever you want this screen back.`
                  : "Driving the room — this screen goes dark as a control surface, and your tilt, shake and gestures land on the other screens. Calibrate from the control surface so your natural grip becomes the room's neutral."
                : "Join as a controller and this phone becomes the room's senses: tilt to stir the big screen, shake to bloom it, gesture at it — while this screen rests. Why look at your screen when the fabric is on five others?"}
            </Text>
          </View>
        ) : null}

        {/* ---------------- STUDIO ---------------- */}
        <SectionHeader>STUDIO</SectionHeader>
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
              { label: "Plugins & add-ons", panel: "plugins" as DrawerName },
            ]
          ).map((row) => (
            <DoorRow
              key={row.label}
              icon="spark"
              label={row.label}
              onPress={() => openPanel(row.panel)}
            />
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
        <SubHeader>Lint — objects</SubHeader>
        <LintSimulatorCard />

        {/* ---------------- AI SERVICES ---------------- */}
        <SectionHeader>AI SERVICES</SectionHeader>
        {/* Agent model tier — the AI Services panel itself stays the
            editor (keys, endpoints, Meta preset); this is its summary
            and the door to it. */}
        <View
          style={{
            ...cardStyle, borderColor: colors.line,
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
              Brain settings — keys, endpoints, Meta preset ›
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          The ghost's own brain — its tier, its decisions, its
          Personality — lives in Your Ghostie (YOU, above).
        </Text>
        {/* Slice 57: the AI panels live here, with the model
            they belong to — AI Chat, Vision AI, and the
            Companion. They used to sit in the "Panels"
            catch-all at the menu's tail. */}
        <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
          <DoorRow
            icon="message"
            label="AI Chat"
            onPress={() => openPanel("ai-chat")}
          />
          <DoorRow
            icon="eye"
            label="Vision AI"
            onPress={() => openPanel("vision-ai")}
          />
          <DoorRow
            icon="message"
            label="Companion"
            onPress={() => openPanel("companion")}
          />
        </View>

        {/* ---------------- SETTINGS & HELP ---------------- */}
        <SectionHeader>SETTINGS & HELP</SectionHeader>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Device-wide defaults and the toolbox — nothing here
          belongs to a single layer.
        </Text>

        <ToggleRow
          label="Vibration"
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
        {/* Slice 58: how talking to the ghostie starts. The
            preference lives in fabric_prefs_v1 with the other
            universal switches (PreferencesContext owns it);
            the wake phrase is the ghostie's own name, and the
            ghostie shows that it hears with its own body —
            there is no conversation window to open. */}
        <ModeRow
          label="Voice input"
          value={voiceInputModeLabel(prefs.voiceInputMode)}
          onPress={() =>
            prefs.setVoiceInputMode(nextVoiceInputMode(prefs.voiceInputMode))
          }
        />
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          {prefs.voiceInputMode === "tap"
            ? "Tap the mic to talk to your ghostie."
            : prefs.voiceInputMode === "natural"
              ? `Say “${ghost.ghostName ?? "your ghostie's name"}” to talk to your ghostie — it perks up when it hears its name, and answers in its own way.`
              : `Tap the mic, or say “${ghost.ghostName ?? "your ghostie's name"}” to talk to your ghostie.`}
        </Text>

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
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginBottom: spacing.sm }}>
          Same convention as the canvas: ?diag=1 in the address wakes
          Fabric's diagnostic surfaces.
        </Text>
        {showDiag ? <FabricDiagnostics /> : null}

        {/* Slice 57: the "Panels" catch-all that used to tail
            this section is dissolved — every panel it listed
            now opens from the section it belongs to, above.
            What stays here is the one door that is genuinely a
            settings surface: the Preferences panel itself. */}
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          <DoorRow
            icon="gear"
            label="Preferences panel"
            onPress={() => openPanel("settings")}
          />
        </View>
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
