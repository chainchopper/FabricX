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
 * Rendered inside ExperienceHUD (whose container is pointerEvents="none"),
 * so this root re-enables pointer events for the buttons only.
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
    <View pointerEvents="auto" style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
      {SENSORY_VERBS.map((verb) => (
        <Pressable
          key={verb.id}
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
