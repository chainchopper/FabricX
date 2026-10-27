import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { FABRIC_VERB_EVENT, SENSORY_VERBS, type SensoryVerb } from "../../sensory/verbs";
import Icon, { type IconName } from "../ui/Icon";
import { colors, hit, radius, spacing, type } from "../../theme/tokens";

/**
 * VerbBar — the sensory-verb thumb bar (Heart / Cheer / Tickle).
 *
 * Pressing a button dispatches the FABRIC_VERB_EVENT window event with
 * the verb id; the live canvas (LegacyFluid) hears it and sends the verb
 * through its multi-user transport, so every peer feels it. Keeping the
 * send in the canvas means this bar needs no transport plumbing and
 * works unchanged over WebRTC or the BroadcastChannel fallback.
 *
 * Slice 3: drawn icons + labels (no emoji in chrome — a verb's emoji is
 * user content and still travels in the verb data, it just isn't the
 * button furniture anymore), >= 44px thumb targets, token styling. The
 * bar renders bare inside ExperienceHUD's bottom pill, which owns the
 * shared panel surface; ComposeBar (Slice 4) mounts in the same pill.
 *
 * Rendered inside ExperienceHUD (whose container is pointerEvents="none"),
 * so this root re-enables pointer events for the buttons only.
 *
 * Powered by Nirvana
 */

const VERB_ICONS: Record<string, IconName> = {
  heart: "heart",
  cheer: "cheer",
  tickle: "tickle",
};

export default function VerbBar() {
  if (Platform.OS !== "web") return null;

  const send = (verb: SensoryVerb) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FABRIC_VERB_EVENT, { detail: verb.id }));
    }
  };

  return (
    <View pointerEvents="auto" style={{ flexDirection: "row", gap: spacing.xs }}>
      {SENSORY_VERBS.map((verb) => (
        <Pressable
          key={verb.id}
          onPress={() => send(verb)}
          accessibilityRole="button"
          accessibilityLabel={`Send ${verb.label}`}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            minHeight: hit,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radius.pill,
            backgroundColor: pressed ? colors.accentDim : "transparent",
          })}
        >
          <Icon name={VERB_ICONS[verb.id] ?? "spark"} size={20} color={colors.text} />
          <Text
            style={{
              color: colors.text,
              fontSize: type.body,
              fontWeight: type.semibold,
            }}
          >
            {verb.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
