/**
 * RETIRED — Hotfix 2.8. Do not mount.
 *
 * This was the Heart / Cheer / Tickle button row in ExperienceHUD's
 * bottom cluster (its only mount). Terrell's field report, Oct 29:
 * "that ui with heart cheer and tickle on it is stale as we don't
 * use that anymore" — his Oct 28 direction was that preset verb
 * buttons are "boring macros." Verbs in Fabric happen by ASKING
 * (the compose bar: "tickle, Boop" is performed by the ghost
 * itself; a bare "cheer" composes as a verb-step performance), by
 * hand SIGNS (Slice 28: ✌ cheer, 👍 heart), and from a person's
 * profile card ("Send a heart") — and every one of those paths
 * dispatches the same FABRIC_VERB_EVENT this bar dispatched, into
 * the same LegacyFluid listener, through the same session gates.
 * Only the canned row is gone; no capability left with it. This
 * file is kept for reference and history, per house rule (marked
 * retired, not deleted); nothing imports it.
 */

import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { FABRIC_VERB_EVENT, SENSORY_VERBS, type SensoryVerb } from "../../sensory/verbs";

/**
 * VerbBar — a small row of sensory-verb buttons (Heart / Cheer / Tickle).
 *
 * Pressing a button dispatches the FABRIC_VERB_EVENT window event with
 * the verb id; the live canvas (LegacyFluid) hears it and sends the verb
 * through its multi-user transport, so every peer feels it. Keeping the
 * send in the canvas means this bar needs no transport plumbing and
 * works unchanged over WebRTC or the BroadcastChannel fallback.
 *
 * Pointer-events note (F-doctrine rebuild): the old HUD root was
 * pointerEvents="none", and react-native-web compiles that into a CSS
 * descendant rule (`selector * { pointer-events: none }`) — this bar's
 * root View re-enabled itself, but the Pressables inside carry the hit
 * testing and had no value of their own, so fingers never landed. Each
 * Pressable now carries pointerEvents="auto" itself (compiled to
 * `auto !important`, immune to ancestor rules), and the bar's mount
 * chain (see _layout's ChromeLayer) has no "none" ancestor at all.
 *
 * Powered by Nirvana
 */
export default function VerbBar() {
  if (Platform.OS !== "web") return null;

  const send = (verb: SensoryVerb) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FABRIC_VERB_EVENT, { detail: verb.id }));
    }
  };

  return (
    <View
      pointerEvents="auto"
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 6,
        marginTop: 8,
        maxWidth: "100%",
      }}
    >
      {SENSORY_VERBS.map((verb) => (
        <Pressable
          key={verb.id}
          pointerEvents="auto"
          onPress={() => send(verb)}
          accessibilityRole="button"
          accessibilityLabel={`Send ${verb.label}`}
          style={({ pressed }) => ({
            backgroundColor: pressed ? "rgba(34,211,238,0.35)" : "rgba(34,211,238,0.15)",
            borderColor: "rgba(34,211,238,0.45)",
            borderWidth: 1,
            borderRadius: 999,
            paddingVertical: 4,
            paddingHorizontal: 10,
          })}
        >
          <Text style={{ color: "#e5e7eb", fontSize: 12, fontWeight: "700" }}>
            {verb.emoji} {verb.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
