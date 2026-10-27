import React from "react";
import { Pressable, Text, View } from "react-native";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import Icon from "../../../src/components/ui/Icon";
import { colors, hit, radius, spacing, type } from "../../../src/theme/tokens";

/**
 * SheetHeader — the one header pattern for every Fabric sheet/drawer
 * (Slice 3). Same shape everywhere: optional back chip on the left,
 * title (+ optional one-line subtitle), close button on the right.
 * Rows and sections below it share the rhythm tokens define.
 *
 * Adopted by MenuSheet, NeoLocker, SettingsDrawer and FriendsDrawer in
 * Slice 3; the remaining drawers adopt it as they are next touched
 * (see the Slice 3 PR for the deferred list).
 *
 * Powered by Nirvana
 */

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
};

export default function SheetHeader({ title, subtitle, onBack, onClose }: Props) {
  const haptics = useHaptics();
  const audio = useAudioCues();

  const tap = (fn?: () => void) => () => {
    haptics.impactLight();
    audio.click();
    fn?.();
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {onBack ? (
          <Pressable
            onPress={tap(onBack)}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              minHeight: hit,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: pressed ? colors.accentDim : "transparent",
            })}
          >
            <Icon name="back" size={18} color={colors.text} />
            <Text
              style={{
                color: colors.text,
                fontSize: type.body,
                fontWeight: type.semibold,
              }}
            >
              Back
            </Text>
          </Pressable>
        ) : null}
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: type.title,
            fontWeight: type.semibold,
          }}
        >
          {title}
        </Text>
        {onClose ? (
          <Pressable
            onPress={tap(onClose)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => ({
              width: hit,
              height: hit,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.card,
              backgroundColor: pressed ? colors.accentDim : "transparent",
            })}
          >
            <Icon name="close" size={20} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      {subtitle ? (
        <Text
          style={{
            color: colors.textDim,
            fontSize: type.body,
            marginTop: spacing.xs,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
