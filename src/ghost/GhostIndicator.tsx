/**
 * GhostIndicator — the ghost's honest HUD presence, next to the VerbBar.
 *
 * Shows YOUR ghost's state (its persistent name + temperament, or
 * asleep/away/off), whether a ghost is visiting your session, and the
 * controls: tap the pill to turn your ghost off/on (persisted as
 * fabric_ghost_v1; while a session ghost visits, "off" also mutes its
 * effects for you — you still see it, you just don't feel/hear it), and
 * Summon/Dismiss for your own ghost while connected with people.
 *
 * It only dispatches window events (the VerbBar pattern); the canvas
 * owns the brain. The ghost is always labeled as what it is — an AI
 * agent peer — and never appears in any people/peer list.
 *
 * Slice 3: presentation only — drawn ghost icon tinted with the ghost's
 * own signature hue (violet fallback), token surfaces, >= 44px targets.
 * All state, events and copy semantics are unchanged from Slice 2.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { subscribeRealtimeStatus } from "../../shared/utils/realtimeStatus";
import { getJSON } from "../../app/utils/storage";
import {
  FABRIC_GHOST_SESSION_EVENT,
  FABRIC_GHOST_TOGGLE_EVENT,
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "./ghostStore";
import { MAX_GHOSTS_PER_ROOM } from "./GhostPeer";
import Icon from "../components/ui/Icon";
import { colors, hit, radius, spacing, type } from "../theme/tokens";

const VISITING_FRESH_MS = 15_000;

const pillStyle = (pressed: boolean) => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing.sm,
  minHeight: hit,
  backgroundColor: pressed ? "rgba(167,139,250,0.30)" : colors.ghostDim,
  borderColor: colors.ghostLine,
  borderWidth: 1,
  borderRadius: radius.pill,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
});

const labelStyle = {
  color: colors.text,
  fontSize: type.body,
  fontWeight: type.semibold,
} as const;

export default function GhostIndicator() {
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  const [peers, setPeers] = useState(0);
  const [, setTick] = useState(0);
  const [hue, setHue] = useState<number | null>(null);

  useEffect(() => subscribeGhostState(setGhost), []);
  useEffect(
    () => subscribeRealtimeStatus((s) => setPeers(s.peers)),
    []
  );
  // Re-render periodically so a "visiting" ghost ages out of the label.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);
  // Best-effort read of this ghost's signature hue for its icon tint.
  // Identity loads async (fabric_ghost_v1), so re-check when the name
  // lands; any failure keeps the established ghost violet.
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

  if (Platform.OS !== "web") return null;

  const tint = hue !== null ? `hsl(${hue}, 85%, 72%)` : colors.ghost;

  const dispatch = (type: string, detail: unknown) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }
  };

  const visiting =
    peers > 0 &&
    ghost.sessionRole !== "host" &&
    Date.now() - ghost.sessionGhostLastSeenAt < VISITING_FRESH_MS;

  const name = ghost.ghostName ?? "Ghost AI";
  let label: string;
  if (!ghost.enabled) {
    label = visiting
      ? "Ghost visiting · muted for you"
      : `${name} · off`;
  } else if (ghost.sessionRole === "host") {
    label = `${name} · summoned${ghost.temperament ? ` · ${ghost.temperament}` : ""}`;
  } else if (visiting) {
    label = "A ghost is visiting";
  } else if (ghost.presence === "sleeping") {
    label = `${name} · asleep`;
  } else if (ghost.presence === "away") {
    label = `${name} · away`;
  } else {
    label = `${name} · ${ghost.temperament ?? "here"}`;
  }

  // Room cap: my ghost would be one more on top of the sensed others.
  const roomFull = ghost.otherGhostCount >= MAX_GHOSTS_PER_ROOM;
  const showSummon =
    peers > 0 && ghost.enabled && ghost.sessionRole !== "host";
  const showDismiss = ghost.sessionRole === "host";

  return (
    <View
      pointerEvents="auto"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
    >
      <Pressable
        onPress={() =>
          dispatch(FABRIC_GHOST_TOGGLE_EVENT, !ghost.enabled)
        }
        accessibilityRole="button"
        accessibilityLabel={
          ghost.enabled
            ? "Turn the ghost AI off"
            : "Turn the ghost AI on"
        }
        style={({ pressed }) => pillStyle(pressed)}
      >
        <Icon name="ghost" size={20} color={tint} />
        <Text style={labelStyle}>{label}</Text>
      </Pressable>

      {showSummon && !roomFull ? (
        <Pressable
          onPress={() => dispatch(FABRIC_GHOST_SESSION_EVENT, "summon")}
          accessibilityRole="button"
          accessibilityLabel={`Summon your ghost ${name} into the session`}
          style={({ pressed }) => pillStyle(pressed)}
        >
          <Text style={labelStyle}>Summon {name}</Text>
        </Pressable>
      ) : null}

      {showSummon && roomFull ? (
        <Text
          style={{
            color: colors.textDim,
            fontSize: type.caption,
            alignSelf: "center",
            paddingHorizontal: spacing.xs,
          }}
        >
          Too many ghosts ({MAX_GHOSTS_PER_ROOM} max)
        </Text>
      ) : null}

      {showDismiss ? (
        <Pressable
          onPress={() => dispatch(FABRIC_GHOST_SESSION_EVENT, "dismiss")}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss your ghost ${name}`}
          style={({ pressed }) => pillStyle(pressed)}
        >
          <Text style={labelStyle}>Dismiss {name}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
