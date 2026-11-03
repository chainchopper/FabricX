/**
 * GhostieHome — "Your Ghostie" (Slice 20).
 *
 * The ghostie's HOME: one surface that gathers what used to be
 * scattered — the LifePacket fDNA (a small card in UNIVERSAL), the
 * brain tier switch (a row inside AI Services), and the ghost's
 * manners (nowhere at all) — into a single place a primary can
 * actually find, reached from the door card at the top of the
 * F-menu's UNIVERSAL section. It renders inside the menu sheet,
 * under the menu's FabricErrorBoundary (Hotfix 2.3).
 *
 * What's here, top to bottom:
 *
 * 1. THE fDNA, ALIVE AND LARGE. The LifePacket Game-of-Life grid —
 *    the same toroidal B3/S23 life, seeded from the identity seed,
 *    that Slice 9's card ran — now at full card width, stepping
 *    every 300ms. Around it: the ghostie's name, its binding to
 *    this device, and its SECURE TAG: a short one-way fingerprint
 *    derived from the ghost's seed (src/identity/fdna). The seed
 *    itself is never displayed and never transmitted; the tag is
 *    a name-tag, not a key.
 *
 * 2. STATUS + BRAIN. Name, temperament, live presence from the
 *    ghost store, the brain tier switch (moved here from AI
 *    Services — ghostBrainPref is unchanged underneath), and the
 *    LIVE brain line: the last deliberation and its age. Cleanup 2
 *    also moved the ghost's CONTROLS here — the per-device on/off
 *    and Summon/Dismiss — when the resident canvas chip was
 *    retired; they dispatch the same window events the chip did.
 *
 * 3. PERSONALITY. The primary's own words for their ghostie
 *    (fabric_ghost_personality_v1, 280 chars). The words steer
 *    deliberation for real — context in the Spark-tier consult,
 *    legible keyword biases over the on-device table (GhostBrain)
 *    — within the hard invariants, never around them. The
 *    "Reading:" line shows exactly which words the on-device
 *    brain can act on; the rest still ride to the Spark tier as
 *    context. Nothing here pretends to steer what it cannot.
 *
 * 4. HOW {NAME} IS WITH OTHERS. Three switches, each wired to a
 *    real gate (ghostShared.ts): socializing in GhostPeer,
 *    remote pets in GhostPeer, host-fabric following at the
 *    canvas's layer gate. Persisted in fabric_ghost_shared_v1;
 *    defaults are all on, so an untouched ghostie behaves exactly
 *    as it always has.
 *
 * Slice 22 extends the Home: its header IS the ghostie's ID
 * card (tap → the full card overlay in IdCards.tsx: portrait,
 * VITALS with their one-line WHYs, published permissions), the
 * Personality panel gains the PUBLIC switch for the words, and
 * a "{NAME}'S ID CARD" section carries Shareable / Tradeable.
 * Those three live in fabric_ghost_permissions_v1 and default
 * OFF — publication is opt-in, the opposite posture from the
 * shared settings above, because they govern what leaves the
 * device.
 *
 * Slice 47 adds the fabric toolbox section (under Brain): the
 * tools the CURRENTLY LOADED fabric offers the ghost, read-only —
 * the same manifest its brain is gated to (GhostBrain's fabric
 * tool manifest), so the awareness Terrell asked for is visible,
 * not just enforced.
 *
 * Terminology: the human is the ghostie's PRIMARY. Never "owner".
 * The Personality field is never called anything else.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import { useIdentitySnapshot } from "../../../src/identity/useIdentity";
import { hueCss } from "../../../src/identity/identityStore";
import {
  FDNA_COLS,
  createFdnaLineage,
  deriveFdnaTag,
  type FdnaLineage,
} from "../../../src/identity/fdna";
import {
  FABRIC_GHOST_RENAME_EVENT,
  FABRIC_GHOST_SESSION_EVENT,
  FABRIC_GHOST_TOGGLE_EVENT,
  GHOST_NAME_MAX_CHARS,
  getGhostPublicState,
  sanitizeGhostName,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";
import { subscribeRealtimeStatus } from "../../../src/shared/utils/realtimeStatus";
import { MAX_GHOSTS_PER_ROOM } from "../../../src/ghost/GhostPeer";
import { hasBuiltinCloud } from "../../../src/ai/PatternComposer";
import {
  getGhostBrainTier,
  setGhostBrainTier,
  type GhostBrainTier,
} from "../../../src/ghost/ghostBrainPref";
import {
  fabricManifestFor,
  PERSONALITY_MAX_CHARS,
  parseGhostPersonality,
} from "../../../src/ghost/GhostBrain";
import { useExperience } from "../../context/ExperienceContext";

/**
 * Slice 47: plain-words labels for the tool manifest — what each
 * tool the loaded fabric offers reads as, on the Home's surface.
 */
const GHOST_TOOL_LABELS: Record<string, { label: string; caption: string }> = {
  "splat-play": {
    label: "Everyday splats",
    caption: "Greeting, mirroring, play, drifting, naps, and hearts in light.",
  },
  draw: {
    label: "Drawing",
    caption: "Drawing shapes — rings, spirals, hearts — at its body.",
  },
  "play-note": {
    label: "Playing notes",
    caption: "Answering on the piano with a note of its own.",
  },
  "note-perform": {
    label: "Answering notes",
    caption: "Echoing and performing to notes it hears.",
  },
  "verb-perform": {
    label: "Asked-for acts",
    caption: "Performing a verb you name — tickle, cheer, heart.",
  },
  "heartbeat-answer": {
    label: "Its heartbeat",
    caption: "Answering “show me your heartbeat” with its real pulse.",
  },
  "sound-craft": {
    label: "Composing sounds",
    caption:
      "Building little sounds from raw waveforms — sine, square, sawtooth, noise — when you ask it to make some sounds.",
  },
};
import {
  getGhostPersonality,
  setGhostPersonality,
} from "../../../src/ghost/ghostPersonalityPref";
import {
  updateGhostSharedSettings,
  useGhostSharedSettings,
} from "../../../src/ghost/ghostSharedPref";
import {
  updateGhostPermissions,
  useGhostPermissions,
} from "../../../src/ghost/ghostPermissionsPref";
import { GHOST_PREF_KEY } from "../../../src/ghost/useGhostPeer";
import {
  ensureLocalProfileExtras,
  refreshLocalGhostCardInputs,
  subscribeLocalProfileExtras,
} from "../../../src/identity/profileStore";
import { badgeInfo, trailLabel } from "../../../src/identity/profile";
import {
  TRAIL_STYLES,
  badgeProgress,
  hasBadge,
  powerUpUnlocked,
  trailStyleUnlocked,
} from "../../../src/rewards/rewardsCore";
import {
  equipRewards,
  useRewards,
} from "../../../src/rewards/rewardsStore";
import { BadgeGlyphMark } from "./ProfileCard";
import { GhostiePortrait } from "./IdCards";
import OnDeviceBrainCard from "./OnDeviceBrainCard";
import { getJSON } from "../../utils/storage";

const GRID_STEP_MS = 300;
const GRID_GAP = 2;

const PRESENCE_LINES: Record<GhostPublicState["presence"], string> = {
  present: "on the canvas with you",
  summoned: "summoned into the room",
  sleeping: "sleeping",
  away: "away for now",
  off: "off",
};

function HomeToggleRow({
  label,
  caption,
  value,
  onPress,
}: {
  label: string;
  caption: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => ({
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.ghostDim : "transparent",
        marginBottom: spacing.sm,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
          {label}
        </Text>
        <Text
          style={{
            color: value ? colors.ghost : colors.textDim,
            fontSize: typeScale.body,
            fontWeight: "700",
          }}
        >
          {value ? "On" : "Off"}
        </Text>
      </View>
      <Text
        style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}
      >
        {caption}
      </Text>
    </Pressable>
  );
}

function brainAge(lastAt: number | null, now: number): string {
  if (!lastAt) return "";
  const s = Math.max(0, Math.round((now - lastAt) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function GhostieHome({
  onBack,
  onOpenGhostieCard,
}: {
  onBack: () => void;
  /**
   * Slice 22: the Home's header IS the ghostie's ID card — tapping
   * it opens the full card overlay (portrait, permissions, vitals).
   */
  onOpenGhostieCard?: () => void;
}) {
  const identity = useIdentitySnapshot();
  const self = identity.self;
  const shared = useGhostSharedSettings();
  const permissions = useGhostPermissions();
  // Slice 47: the loaded fabric — its tool manifest is what the
  // ghost may reach for here (the section below Brain, read-only).
  const { state: experienceState } = useExperience();
  const loadedFabricId = experienceState.activeExperience?.id ?? "default-fluid";
  const loadedFabricName = experienceState.activeExperience?.name ?? "Fluid";
  const fabricTools = fabricManifestFor(loadedFabricId);
  // Slice 24: the rewards record — badges + equipped power-ups.
  const rewards = useRewards();

  // The ghostie's equipped trail (rewards state, local extras).
  const [trail, setTrail] = useState<string | null>(null);
  useEffect(() => {
    ensureLocalProfileExtras();
    return subscribeLocalProfileExtras((extras) => setTrail(extras.trail));
  }, []);

  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  useEffect(() => subscribeGhostState(setGhost), []);

  // Cleanup 2: the canvas ghost chip is retired — its controls
  // (on/off, Summon/Dismiss) live here and in THIS LAYER now. They
  // dispatch the same window events the chip used; the canvas
  // (useGhostPeer) listens exactly as before. Peer count comes from
  // the same realtime status source the chip read.
  const [peers, setPeers] = useState(0);
  useEffect(
    () => subscribeRealtimeStatus((s) => setPeers(s.peers)),
    []
  );
  const dispatchGhost = (type: string, detail: unknown) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }
  };

  const ghostName = ghost.ghostName ?? "your ghostie";

  /* ---------------- fDNA: the living grid ---------------- */
  // The card's exact life, at Home scale, performed by the
  // module's lineage (src/identity/fdna): generation counts steps
  // across derivations, and when a lineage burns out — extinct OR
  // settled into a repeating loop — the module renews it from the
  // identity's next derivation, so the grid never freezes into a
  // GIF. (Renewal used to live here and fired only on extinction;
  // most lineages never go extinct — they freeze or blink first.)
  const seed = self?.seed;
  const lineageRef = useRef<FdnaLineage | null>(null);
  const [grid, setGrid] = useState<Uint8Array | null>(null);
  const [generation, setGeneration] = useState(0);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    if (seed == null) return;
    const lineage = createFdnaLineage(seed);
    lineageRef.current = lineage;
    setGeneration(0);
    setGrid(lineage.grid);
    const id = setInterval(() => {
      // A hidden tab's DNA holds still — no churn nobody can see.
      if (typeof document !== "undefined" && document.hidden) return;
      const r = lineage.step();
      setGeneration(r.generation);
      setGrid(r.grid);
    }, GRID_STEP_MS);
    return () => clearInterval(id);
  }, [seed]);

  const cell =
    gridWidth > 0
      ? Math.max(
          9,
          Math.floor((gridWidth - (FDNA_COLS - 1) * GRID_GAP) / FDNA_COLS)
        )
      : 14;
  const aliveTint = self ? hueCss(self.hue) : colors.ghost;

  /* ---------------- the secure tag ---------------- */
  // Derived from the GHOST's seed (Slice 9 binding), falling back
  // to the identity seed before the ghost record loads. One-way:
  // the tag names the ghostie; it cannot be turned back into a seed.
  const [ghostSeed, setGhostSeed] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getJSON<{ identity?: { seed?: unknown } } | null>(GHOST_PREF_KEY, null)
      .then((pref) => {
        if (cancelled) return;
        const s = pref?.identity?.seed;
        if (typeof s === "number") setGhostSeed(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const tag = useMemo(() => {
    const s = ghostSeed ?? seed;
    return typeof s === "number" ? deriveFdnaTag(s) : null;
  }, [ghostSeed, seed]);

  /* ---------------- brain tier + live line ---------------- */
  const [tier, setTier] = useState<GhostBrainTier>("on-device");
  useEffect(() => {
    let cancelled = false;
    getGhostBrainTier()
      .then((t) => {
        if (!cancelled) setTier(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const pickTier = (next: GhostBrainTier) => {
    setTier(next);
    void setGhostBrainTier(next);
  };
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const brain = ghost.brain;

  /* ---------------- personality ---------------- */
  const [personalityDraft, setPersonalityDraft] = useState("");
  const [personalityLoaded, setPersonalityLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getGhostPersonality()
      .then((text) => {
        if (cancelled) return;
        setPersonalityDraft(text);
        setPersonalityLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setPersonalityLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const savePersonality = () => {
    if (!personalityLoaded) return;
    void setGhostPersonality(personalityDraft).then(() => {
      // Slice 22: a public personality reaches the room's cards
      // with the next announce, not the next app load.
      refreshLocalGhostCardInputs();
    });
  };

  /* ---------------- name (Slice 50) ---------------- */
  // THE rename door — the only place in the app where the
  // ghostie's name can change (the name law: ghostStore's
  // sanitizeGhostName). The draft mirrors the published name
  // until the primary types; saving dispatches the rename event
  // and the canvas (useGhostPeer, the record's owner) sanitizes
  // again, persists, and renames the live ghost. Nothing else
  // in the app writes the name — everywhere else it is display.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const nameValue = nameDraft ?? ghost.ghostName ?? "";
  const nameClean = sanitizeGhostName(nameValue);
  const nameDirty =
    nameClean !== null && ghost.ghostName !== null && nameClean !== ghost.ghostName;
  const saveName = () => {
    if (!nameDirty || !nameClean) return;
    dispatchGhost(FABRIC_GHOST_RENAME_EVENT, nameClean);
    setNameDraft(null);
  };
  const reading = useMemo(
    () => parseGhostPersonality(personalityDraft),
    [personalityDraft]
  );

  return (
    <View>
      {/* Back + title */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: spacing.sm,
          marginBottom: spacing.sm,
        }}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to menu"
          style={({ pressed }) => ({
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: pressed ? colors.ghostDim : "transparent",
            marginRight: spacing.sm,
          })}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
            ← Menu
          </Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "700" }}>
          Your Ghostie
        </Text>
      </View>

      {!self ? (
        <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
          Waking your ghostie…
        </Text>
      ) : (
        <>
          {/* ---------- Slice 22: the header IS the ID card ---------- */}
          <Pressable
            pointerEvents="auto"
            onPress={onOpenGhostieCard}
            disabled={!onOpenGhostieCard}
            accessibilityRole={onOpenGhostieCard ? "button" : undefined}
            accessibilityLabel={
              onOpenGhostieCard
                ? `Open ${ghostName}'s ID card`
                : undefined
            }
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: colors.ghostLine,
              borderRadius: radius.card,
              padding: spacing.sm,
              marginBottom: spacing.md,
              backgroundColor: pressed ? colors.ghostDim : "transparent",
            })}
          >
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ width: 112 }}>
                <GhostiePortrait
                  compact
                  hue={ghost.ghostHue}
                  temperament={ghost.temperament}
                  presence={ghost.presence}
                  trail={trail}
                />
              </View>
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Text style={{ color: colors.text, fontSize: typeScale.label, fontWeight: "700" }}>
                  {ghostName}
                  {ghost.temperament ? (
                    <Text style={{ color: colors.ghost, fontSize: typeScale.body }}>
                      {"  ·  "}
                      {ghost.temperament}
                    </Text>
                  ) : null}
                </Text>
                <Text style={{ color: colors.ghost, fontSize: typeScale.caption, marginTop: 2 }}>
                  {tag ?? "…"}
                </Text>
                <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
                  {ghost.vitals
                    ? `Health ${ghost.vitals.health} · Stamina ${ghost.vitals.stamina} · Vigor ${ghost.vitals.vigor}`
                    : `Vitals wake with ${ghostName}`}
                </Text>
                {trail ? (
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
                    Wearing: {trailLabel(trail)}
                  </Text>
                ) : null}
                {onOpenGhostieCard ? (
                  <Text
                    style={{
                      color: colors.ghost,
                      fontSize: typeScale.caption,
                      fontWeight: "700",
                      marginTop: 6,
                    }}
                  >
                    ID card ›
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>

          {/* ---------- name: the one door (Slice 50) ---------- */}
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.card,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              Name
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
              {ghostName}&rsquo;s name is permanent — it sticks across
              sessions and it is the name its brain arrives under. This
              is the only place it can change.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm, alignItems: "center" }}>
              <TextInput
                value={nameValue}
                onChangeText={setNameDraft}
                onEndEditing={saveName}
                onSubmitEditing={saveName}
                placeholder="Name your ghostie"
                placeholderTextColor="rgba(242,247,249,0.35)"
                maxLength={GHOST_NAME_MAX_CHARS}
                accessibilityLabel="Ghostie name"
                style={{
                  // 16px floor: below it, iOS Safari auto-zooms on
                  // focus and wrecks the sheet (Hotfix 2.3).
                  fontSize: 16,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.card,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  flex: 1,
                }}
              />
              <Pressable
                pointerEvents="auto"
                onPress={saveName}
                disabled={!nameDirty}
                accessibilityRole="button"
                accessibilityLabel={`Rename your ghostie to ${nameClean ?? ""}`}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: nameDirty ? colors.ghostLine : colors.line,
                  opacity: nameDirty ? 1 : 0.5,
                }}
              >
                <Text style={{ color: colors.text, fontSize: typeScale.caption, fontWeight: "700" }}>
                  Save name
                </Text>
              </Pressable>
            </View>
            {nameDraft !== null && nameClean === null ? (
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
                A name needs 1–{GHOST_NAME_MAX_CHARS} characters — the old
                name stands until one fits.
              </Text>
            ) : null}
          </View>

          {/* ---------- fDNA, alive and large ---------- */}
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.ghostLine,
              borderRadius: radius.card,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: spacing.sm,
              }}
            >
              <Text
                style={{
                  color: colors.ghost,
                  fontSize: typeScale.caption,
                  fontWeight: "700",
                  letterSpacing: 1.5,
                }}
              >
                fDNA · LIFEPACKET
              </Text>
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                generation {generation}
              </Text>
            </View>

            <View
              onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
              style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}
            >
              {grid
                ? Array.from(grid).map((alive, idx) => (
                    <View
                      key={idx}
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: 2,
                        backgroundColor: alive
                          ? aliveTint
                          : "rgba(167,139,250,0.07)",
                      }}
                    />
                  ))
                : null}
            </View>

            <Text
              style={{
                color: colors.text,
                fontSize: typeScale.body,
                fontWeight: "600",
                marginTop: spacing.md,
              }}
            >
              {ghostName} · bound to this device
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: spacing.xs,
              }}
            >
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                Secure tag
              </Text>
              <Text
                style={{
                  color: colors.ghost,
                  fontSize: typeScale.body,
                  fontWeight: "700",
                  letterSpacing: 1,
                }}
              >
                {tag ?? "…"}
              </Text>
            </View>
            <Text
              style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: spacing.sm }}
            >
              The tag is a one-way fingerprint of the seed — it names your
              ghostie without ever showing the seed.
            </Text>
            <Text
              style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}
            >
              On this device only — your seed never leaves this device.
            </Text>
          </View>

          {/* ---------- status + brain ---------- */}
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.card,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.label, fontWeight: "700" }}>
              {ghostName}
            </Text>
            <Text style={{ color: colors.ghost, fontSize: typeScale.body, marginTop: 2 }}>
              You’re {ghostName}’s primary.
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.body, marginTop: spacing.sm }}>
              {ghost.temperament
                ? `${ghost.temperament} · `
                : ""}
              {PRESENCE_LINES[ghost.presence]}
              {ghost.otherGhostCount > 0
                ? ` · ${ghost.otherGhostCount} other ghostie${ghost.otherGhostCount === 1 ? "" : "s"} in the room`
                : ""}
            </Text>
            {!ghost.enabled ? (
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
                Resting — {ghostName} is off on this device (the switch just below).
              </Text>
            ) : !ghost.layerEnabled ? (
              <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
                Off on this layer — {ghostName} joins on layers that allow it,
                and on fabrics you open yourself when host-following is off.
              </Text>
            ) : null}

            {/* Cleanup 2: the retired canvas chip's controls, at
                home. On/off is the per-user preference itself
                (fabric_ghost_v1 via the canvas listener); Summon /
                Dismiss mirror the chip's exact visibility rules —
                summon only while people are here, you're not already
                hosting your ghost, and the room isn't full. */}
            <View style={{ marginTop: spacing.md }}>
              <HomeToggleRow
                label={`${ghostName} on this device`}
                caption={`Off rests ${ghostName} everywhere on this device — no visits, no deliberation. Your settings here stay saved.`}
                value={ghost.enabled}
                onPress={() =>
                  dispatchGhost(FABRIC_GHOST_TOGGLE_EVENT, !ghost.enabled)
                }
              />
              {ghost.sessionRole === "host" ? (
                <Pressable
                  onPress={() => dispatchGhost(FABRIC_GHOST_SESSION_EVENT, "dismiss")}
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss your ghost ${ghostName} from the session`}
                  style={({ pressed }) => ({
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: pressed ? colors.ghostDim : "transparent",
                  })}
                >
                  <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                    Dismiss {ghostName}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
                    {ghostName} leaves the shared session and comes back to your canvas alone.
                  </Text>
                </Pressable>
              ) : peers > 0 && ghost.enabled ? (
                ghost.otherGhostCount >= MAX_GHOSTS_PER_ROOM ? (
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
                    Too many ghosts in the room ({MAX_GHOSTS_PER_ROOM} max) — {ghostName} waits here with you.
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => dispatchGhost(FABRIC_GHOST_SESSION_EVENT, "summon")}
                    accessibilityRole="button"
                    accessibilityLabel={`Summon your ghost ${ghostName} into the session`}
                    style={({ pressed }) => ({
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: radius.card,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: pressed ? colors.ghostDim : "transparent",
                    })}
                  >
                    <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                      Summon {ghostName}
                    </Text>
                    <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
                      People are here — send {ghostName} into the shared session to play with the room.
                    </Text>
                  </Pressable>
                )
              ) : null}
            </View>

            <Text
              style={{
                color: colors.text,
                fontSize: typeScale.body,
                fontWeight: "600",
                marginTop: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              {ghostName}’s brain
            </Text>
            {(
              [
                {
                  value: "on-device" as GhostBrainTier,
                  title: "On-device",
                  sub: "This device's own brain: its downloaded model deliberates when it's ready; the decision table distilled from curated ghost scenarios answers instantly underneath. Offline, private.",
                },
                {
                  value: "spark-cloud" as GhostBrainTier,
                  title: "Muse Spark — cloud",
                  sub: hasBuiltinCloud()
                    ? "Muse Spark deliberates with the same scenario — Fanalogy cloud is built into this build, no key needed. A model you save yourself in AI Services takes over instead."
                    : "Muse Spark deliberates with the same scenario when a cloud model is connected (your own, in AI Services). None is connected in this build, so the on-device brain decides.",
                },
              ]
            ).map((opt) => {
              const selected = tier === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => pickTier(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? colors.ghostLine : colors.line,
                    backgroundColor: selected ? colors.ghostDim : "transparent",
                    borderRadius: radius.card,
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
                    {opt.title}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
                    {opt.sub}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              {brain
                ? `Live: ${brain.tierLabel} · ${brain.lastText}${brain.lastAt ? ` · ${brainAge(brain.lastAt, nowMs)}` : ""}`
                : "Live: no deliberation yet — the brain speaks up when something changes (a pet, a visitor, a long quiet)."}
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
              Either way, the emit budgets and the petting rules stay
              hard-coded — a decision steers the ghost, it never commands it.
            </Text>
            {/* Slice 27: the on-device tier's model itself — its
                download state, the model picker, and the one
                explicit Download press. The same card lives in AI
                Services; the brain is one, so its surface is one. */}
            <View style={{ marginTop: spacing.md }}>
              <OnDeviceBrainCard />
            </View>
          </View>

          {/* ---------- Slice 47: the loaded fabric's toolbox ---------- */}
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.card,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              What {ghostName} can do on {loadedFabricName}
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
              The loaded fabric sets the toolbox: {ghostName} only reaches
              for what this fabric offers, and its brain sees this same
              list when it decides. In a hosted session, the host’s rules
              can still switch individual tools off. Read-only — the list
              changes when the fabric does.
            </Text>
            {fabricTools.map((toolId) => {
              const entry = GHOST_TOOL_LABELS[toolId];
              if (!entry) return null;
              return (
                <View key={toolId} style={{ marginTop: spacing.sm }}>
                  <Text style={{ color: colors.text, fontSize: typeScale.body }}>
                    {entry.label}
                  </Text>
                  <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 1 }}>
                    {entry.caption}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* ---------- personality ---------- */}
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.card,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <Text style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "600" }}>
              Personality
            </Text>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 2 }}>
              Describe {ghostName} in your own words. The words genuinely
              steer it: on-device they bias its decisions (see what’s read,
              below); on the Spark tier they’re part of every deliberation.
              They never override the budgets or the petting rules.
            </Text>
            <TextInput
              value={personalityDraft}
              onChangeText={setPersonalityDraft}
              onEndEditing={savePersonality}
              onSubmitEditing={savePersonality}
              placeholder="Shy at first, bold with friends, loves rain sounds…"
              placeholderTextColor="rgba(242,247,249,0.35)"
              multiline
              maxLength={PERSONALITY_MAX_CHARS}
              accessibilityLabel="Personality"
              style={{
                // 16px floor: below it, iOS Safari auto-zooms on focus
                // and wrecks the sheet (Hotfix 2.3). Do not lower.
                fontSize: 16,
                color: colors.text,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.card,
                paddingHorizontal: 10,
                paddingVertical: 8,
                marginTop: spacing.sm,
                minHeight: 64,
                textAlignVertical: "top",
              }}
            />
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption, marginTop: 4 }}>
              {reading.labels.length > 0
                ? `Reading: ${reading.labels.join(", ")}`
                : personalityDraft.trim()
                  ? "Reading: nothing the on-device brain can act on yet — words like shy, bold, playful, calm or cuddly steer it here. (The Spark tier still hears all of it.)"
                  : "Reading: nothing yet."}
            </Text>
            <Text
              style={{
                color: colors.textDim,
                fontSize: typeScale.caption,
                textAlign: "right",
              }}
            >
              {personalityDraft.length}/{PERSONALITY_MAX_CHARS}
            </Text>
            {/* Slice 22: the personality's PUBLIC switch lives beside
                the words it governs. Off (the default) the text never
                leaves this device and cards say "Personality:
                private". On, the words ride the announce and appear
                on {ghostName}'s ID card. */}
            <View style={{ marginTop: spacing.sm, marginBottom: -spacing.sm }}>
              <HomeToggleRow
                label="Personality on the ID card"
                caption={`On: these words show on ${ghostName}'s card and ride its announce for the room to read. Off: they stay on this device and steer silently — cards say "Personality: private".`}
                value={permissions.personalityPublic}
                onPress={() =>
                  updateGhostPermissions({
                    personalityPublic: !permissions.personalityPublic,
                  })
                }
              />
            </View>
          </View>

          {/* ---------- Slice 22: the ID card's permissions ---------- */}
          <Text
            style={{
              color: colors.ghost,
              fontSize: typeScale.caption,
              fontWeight: "700",
              letterSpacing: 1.5,
              marginBottom: spacing.sm,
            }}
          >
            {ghostName.toUpperCase()}’S ID CARD
          </Text>
          <HomeToggleRow
            label="Shareable"
            caption={`On: others may feature ${ghostName}'s full card — portrait, vitals, the works. Off: the room sees the name-tag card only.`}
            value={permissions.shareable}
            onPress={() =>
              updateGhostPermissions({ shareable: !permissions.shareable })
            }
          />
          <HomeToggleRow
            label="Tradeable"
            caption={`Flags ${ghostName} as tradeable on its card. Trading opens with the marketplace — this flag is real today; moving a ghostie between primaries is not built yet.`}
            value={permissions.tradeable}
            onPress={() =>
              updateGhostPermissions({ tradeable: !permissions.tradeable })
            }
          />
          <Text
            style={{
              color: colors.textDim,
              fontSize: typeScale.caption,
              marginBottom: spacing.md,
            }}
          >
            These ride {ghostName}'s announce the moment you flip them —
            the room's view of the card updates live.
          </Text>

          {/* ---------- how {name} is with others ---------- */}
          <Text
            style={{
              color: colors.ghost,
              fontSize: typeScale.caption,
              fontWeight: "700",
              letterSpacing: 1.5,
              marginBottom: spacing.sm,
            }}
          >
            HOW {ghostName.toUpperCase()} IS WITH OTHERS
          </Text>
          <HomeToggleRow
            label="Socialize with other ghosties"
            caption={`Greets, approaches, and plays with other ghosties in the room. Off: ${ghostName} still sees them, but never goes to them.`}
            value={shared.socialize}
            onPress={() =>
              updateGhostSharedSettings({ socialize: !shared.socialize })
            }
          />
          <HomeToggleRow
            label="Accept pets from others"
            caption={`Other people's strokes on ${ghostName} land as pets. Off: they don't land at all. Your own pets always land.`}
            value={shared.acceptRemotePets}
            onPress={() =>
              updateGhostSharedSettings({
                acceptRemotePets: !shared.acceptRemotePets,
              })
            }
          />
          <HomeToggleRow
            label="Follow the host’s fabric"
            caption={`When your host moves the room to a new fabric, ${ghostName} comes along. Off: ${ghostName} only joins fabrics you open yourself. Your own view follows the host either way.`}
            value={shared.followHostFabric}
            onPress={() =>
              updateGhostSharedSettings({
                followHostFabric: !shared.followHostFabric,
              })
            }
          />

          <Text
            style={{
              color: hueCss(hue),
              fontSize: typeScale.caption,
              fontWeight: "700",
              letterSpacing: 2,
              marginTop: spacing.lg,
              marginBottom: spacing.sm,
            }}
          >
            POWER-UPS
          </Text>
          <Text
            style={{
              color: colors.textDim,
              fontSize: typeScale.caption,
              marginBottom: spacing.sm,
            }}
          >
            Earned by living in the fabric, never bought with taps.
            Badges so far: {rewards.earned.length} of 9.
          </Text>
          {rewards.earned.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: spacing.sm,
              }}
            >
              {rewards.earned.map((e) => {
                const info = badgeInfo(e.id);
                if (!info) return null;
                return (
                  <View
                    key={e.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginRight: spacing.md,
                      marginBottom: 4,
                    }}
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
          ) : null}

          <Text
            style={{
              color: colors.text,
              fontSize: typeScale.body,
              fontWeight: "600",
              marginBottom: 4,
            }}
          >
            Movement trail
          </Text>
          <Text
            style={{
              color: colors.textDim,
              fontSize: typeScale.caption,
              marginBottom: spacing.sm,
            }}
          >
            {ghostName} leaves this behind as it moves — here, and on
            every screen it visits.
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: spacing.sm,
            }}
          >
            {TRAIL_STYLES.map((styleId) => {
              const unlocked = trailStyleUnlocked(rewards, styleId);
              const active = rewards.equipped.trail === styleId;
              return (
                <Pressable
                  key={styleId}
                  disabled={!unlocked}
                  onPress={() =>
                    equipRewards({ trail: active ? null : styleId })
                  }
                  style={({ pressed }) => ({
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: active ? hueCss(hue) : colors.line,
                    backgroundColor: active
                      ? colors.ghostDim
                      : pressed
                        ? colors.ghostDim
                        : "transparent",
                    marginRight: spacing.sm,
                    marginBottom: spacing.sm,
                    opacity: unlocked ? 1 : 0.45,
                  })}
                >
                  <Text
                    style={{
                      color: active ? hueCss(hue) : colors.text,
                      fontSize: typeScale.caption,
                      fontWeight: "600",
                    }}
                  >
                    {trailLabel(styleId)}
                    {active ? " · on" : ""}
                  </Text>
                  {!unlocked ? (
                    <Text
                      style={{ color: colors.textDim, fontSize: 10, marginTop: 2 }}
                    >
                      {styleId === "ribbon"
                        ? "Earn First Thread"
                        : `Any ${
                            styleId === "sparkle"
                              ? 3
                              : styleId === "petals"
                                ? 5
                                : 7
                          } badges (${rewards.earned.length} so far)`}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <HomeToggleRow
            label="Second voice"
            caption={
              powerUpUnlocked(rewards, "second-voice")
                ? `${ghostName}’s chirps and purrs sit a fourth higher, in a rounder tone — the same voice, a second register.`
                : `Locked — earn Pattern Mind (${badgeProgress(rewards, "pattern-mind")}) by having the agent answer your asks.`
            }
            value={
              powerUpUnlocked(rewards, "second-voice") && rewards.equipped.voice
            }
            onPress={() =>
              powerUpUnlocked(rewards, "second-voice") &&
              equipRewards({ voice: !rewards.equipped.voice })
            }
          />
          <HomeToggleRow
            label="Signature heart"
            caption={
              powerUpUnlocked(rewards, "signature-heart")
                ? "Your hearts land with a double ring around them, on your screen and everyone else’s."
                : `Locked — earn Heartfelt (${badgeProgress(rewards, "heartfelt")}) by sending hearts to people.`
            }
            value={
              powerUpUnlocked(rewards, "signature-heart") &&
              rewards.equipped.heartMotif === "double-ring"
            }
            onPress={() =>
              powerUpUnlocked(rewards, "signature-heart") &&
              equipRewards({
                heartMotif:
                  rewards.equipped.heartMotif === "double-ring"
                    ? null
                    : "double-ring",
              })
            }
          />
          <HomeToggleRow
            label="Stage aura"
            caption={
              powerUpUnlocked(rewards, "stage-aura")
                ? "A ring of your color on the floor under your dancer on the Stage."
                : `Locked — earn Stage Presence (${badgeProgress(rewards, "stage-presence")}) by dancing with a crowd.`
            }
            value={
              powerUpUnlocked(rewards, "stage-aura") && rewards.equipped.aura
            }
            onPress={() =>
              powerUpUnlocked(rewards, "stage-aura") &&
              equipRewards({ aura: !rewards.equipped.aura })
            }
          />

          <Text
            style={{
              color: colors.text,
              fontSize: typeScale.body,
              fontWeight: "600",
              marginBottom: 4,
            }}
          >
            Warm welcome
          </Text>
          <Text
            style={{
              color: colors.textDim,
              fontSize: typeScale.caption,
              marginBottom: spacing.sm,
            }}
          >
            {powerUpUnlocked(rewards, "warm-welcome")
              ? `When someone joins a session you’re hosting, ${ghostName} greets them with this — from its own budget, like any act. If the budget is spent, it simply doesn’t.`
              : `Locked — earn Good Host (${badgeProgress(rewards, "good-host")}) by hosting a full room. Then, when someone joins your session, ${ghostName} greets them from its own budget.`}
          </Text>
          {powerUpUnlocked(rewards, "warm-welcome") ? (
            <View style={{ flexDirection: "row", marginBottom: spacing.sm }}>
              {(["heart", "cheer", "tickle"] as const).map((verbId) => {
                const active = rewards.equipped.welcomeVerb === verbId;
                return (
                  <Pressable
                    key={verbId}
                    onPress={() => equipRewards({ welcomeVerb: verbId })}
                    style={({ pressed }) => ({
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: active ? hueCss(hue) : colors.line,
                      backgroundColor: active
                        ? colors.ghostDim
                        : pressed
                          ? colors.ghostDim
                          : "transparent",
                      marginRight: spacing.sm,
                    })}
                  >
                    <Text
                      style={{
                        color: active ? hueCss(hue) : colors.text,
                        fontSize: typeScale.caption,
                        fontWeight: "600",
                        textTransform: "capitalize",
                      }}
                    >
                      {verbId}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
