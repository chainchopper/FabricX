/**
 * GhostIndicator — RETIRED from the canvas in Cleanup 2 (Oct 29).
 *
 * This was the ghost's honest HUD presence, next to the VerbBar —
 * the bottom-center chip ("Boop · summoned · playful" + Dismiss).
 * Terrell's call: the chip "has no purpose at this point"; the
 * ghostie's surface is its ID card / the Ghostie Home. The chip is
 * unmounted (ExperienceHUD no longer renders it) and its controls
 * moved, dispatching the same window events: on/off + Summon/
 * Dismiss live in Your Ghostie, Summon/Dismiss also ride THIS
 * LAYER's ghost row in the F menu. The component stays in-tree
 * (snapshot pushes can't delete) for reference only — do not
 * remount it.
 *
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
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { subscribeRealtimeStatus } from "../../shared/utils/realtimeStatus";
import {
  FABRIC_GHOST_SESSION_EVENT,
  FABRIC_GHOST_TOGGLE_EVENT,
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "./ghostStore";
import { MAX_GHOSTS_PER_ROOM } from "./GhostPeer";

const VISITING_FRESH_MS = 15_000;

const pillStyle = (pressed: boolean) => ({
  backgroundColor: pressed
    ? "rgba(167,139,250,0.35)"
    : "rgba(167,139,250,0.14)",
  borderColor: "rgba(167,139,250,0.5)",
  borderWidth: 1,
  borderRadius: 999,
  paddingVertical: 4,
  paddingHorizontal: 10,
});

export default function GhostIndicator() {
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  const [peers, setPeers] = useState(0);
  const [, setTick] = useState(0);

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

  if (Platform.OS !== "web") return null;

  // Per-layer feature toggle ("Ghost in this layer", THIS LAYER
  // settings): when the loaded layer has the ghost off, the pill
  // leaves the cluster entirely — no ghost chrome in a layer that
  // doesn't have ghosts.
  if (ghost.layerEnabled === false) return null;

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
      ? "👻 Ghost visiting · muted for you"
      : `👻 ${name} · off`;
  } else if (ghost.sessionRole === "host") {
    label = `👻 ${name} · summoned${ghost.temperament ? ` · ${ghost.temperament}` : ""}`;
  } else if (visiting) {
    label = "👻 A ghost is visiting";
  } else if (ghost.presence === "sleeping") {
    label = `👻 ${name} · asleep`;
  } else if (ghost.presence === "away") {
    label = `👻 ${name} · away`;
  } else {
    label = `👻 ${name} · ${ghost.temperament ?? "here"}`;
  }

  // Room cap: my ghost would be one more on top of the sensed others.
  const roomFull = ghost.otherGhostCount >= MAX_GHOSTS_PER_ROOM;
  const showSummon =
    peers > 0 && ghost.enabled && ghost.sessionRole !== "host";
  const showDismiss = ghost.sessionRole === "host";

  return (
    <View
      pointerEvents="auto"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}
    >
      <Pressable
        pointerEvents="auto"
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
        <Text style={{ color: "#e5e7eb", fontSize: 12, fontWeight: "700" }}>
          {label}
        </Text>
      </Pressable>

      {showSummon && !roomFull ? (
        <Pressable
          pointerEvents="auto"
          onPress={() => dispatch(FABRIC_GHOST_SESSION_EVENT, "summon")}
          accessibilityRole="button"
          accessibilityLabel={`Summon your ghost ${name} into the session`}
          style={({ pressed }) => pillStyle(pressed)}
        >
          <Text style={{ color: "#e5e7eb", fontSize: 12, fontWeight: "700" }}>
            Summon {name}
          </Text>
        </Pressable>
      ) : null}

      {showSummon && roomFull ? (
        <Text
          style={{
            color: "#9ca3af",
            fontSize: 11,
            alignSelf: "center",
            paddingHorizontal: 4,
          }}
        >
          Too many ghosts ({MAX_GHOSTS_PER_ROOM} max)
        </Text>
      ) : null}

      {showDismiss ? (
        <Pressable
          pointerEvents="auto"
          onPress={() => dispatch(FABRIC_GHOST_SESSION_EVENT, "dismiss")}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss your ghost ${name}`}
          style={({ pressed }) => pillStyle(pressed)}
        >
          <Text style={{ color: "#e5e7eb", fontSize: 12, fontWeight: "700" }}>
            Dismiss {name}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
