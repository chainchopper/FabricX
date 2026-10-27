import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import Icon, { type IconName } from "../../../src/components/ui/Icon";
import SheetHeader from "./SheetHeader";
import {
  colors,
  hit,
  motion,
  radius,
  shadow,
  spacing,
  type,
} from "../../../src/theme/tokens";

/**
 * MenuSheet — the menu home (Slice 3).
 *
 * The eleven pulsing emoji edge-buttons are gone. At rest the canvas
 * carries ONE menu button (top-right, in ExperienceHUD); it dispatches
 * FABRIC_MENU_EVENT and this sheet answers: a short, drawn-icon list —
 * Experiences, People, Call, Swarm, Studio, AI, Settings — plus a More
 * section so every existing drawer stays reachable. Tapping a row
 * closes the sheet and opens that drawer through NewDrawersContext;
 * the canvas never remounts.
 *
 * The sheet is the reference implementation of the Slice 3 sheet
 * pattern: SheetHeader + 56px rows + token surfaces, spring-eased
 * slide/fade (240–320ms), backdrop tap to dismiss.
 *
 * Powered by Nirvana
 */

/** Window event: HUD menu button -> MenuSheet. detail: "toggle" | "open" | "close". */
export const FABRIC_MENU_EVENT = "fabric:menu";

/** Window event: MenuSheet -> NeoLocker. detail: "controls" | "social" | "swarm". */
export const FABRIC_NEO_TAB_EVENT = "fabric:neo-tab";

type DrawerName = Parameters<ReturnType<typeof useNewDrawers>["open"]>[0];

type Entry = {
  key: string;
  icon: IconName;
  label: string;
  desc: string;
  drawer: DrawerName;
  neoTab?: "controls" | "social" | "swarm";
};

const MAIN_ENTRIES: Entry[] = [
  { key: "experiences", icon: "droplet", label: "Experiences", desc: "Switch experiences and quick controls", drawer: "neo", neoTab: "controls" },
  { key: "people", icon: "people", label: "People", desc: "Friends, peers and chat", drawer: "friends" },
  { key: "call", icon: "call", label: "Call", desc: "Voice and video, felt live", drawer: "call" },
  { key: "swarm", icon: "swarm", label: "Swarm", desc: "Conduct the device swarm", drawer: "neo", neoTab: "swarm" },
  { key: "studio", icon: "sliders", label: "Studio", desc: "Create and arrange", drawer: "studio" },
  { key: "ai", icon: "spark", label: "AI", desc: "Services, keys and models", drawer: "ai-settings" },
  { key: "settings", icon: "gear", label: "Settings", desc: "Feel, look and data", drawer: "settings" },
];

const MORE_ENTRIES: Entry[] = [
  { key: "profile", icon: "user", label: "Profile", desc: "Your identity", drawer: "profile" },
  { key: "layers", icon: "layers", label: "Layers", desc: "The layer stack", drawer: "layer" },
  { key: "plugins", icon: "grid", label: "Plugins", desc: "Installed plugins", drawer: "plugins" },
  { key: "companion", icon: "message", label: "Companion", desc: "Your AI companion", drawer: "companion" },
  { key: "ai-chat", icon: "spark", label: "AI Chat", desc: "Chat with the assistant", drawer: "ai-chat" },
  { key: "vision", icon: "eye", label: "Vision AI", desc: "Camera understanding", drawer: "vision-ai" },
  { key: "shop", icon: "bag", label: "Shop", desc: "Fabric shop", drawer: "shop" },
  { key: "wallet", icon: "wallet", label: "Wallet", desc: "Balance and cards", drawer: "wallet" },
];

export default function MenuSheet() {
  const { open } = useNewDrawers();
  const haptics = useHaptics();
  const audio = useAudioCues();
  const [mounted, setMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const animateTo = (toOpen: boolean) => {
    openRef.current = toOpen;
    if (toOpen) setMounted(true);
    Animated.timing(progress, {
      toValue: toOpen ? 1 : 0,
      duration: toOpen ? motion.slow : motion.fast,
      easing: toOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      if (finished && !openRef.current) setMounted(false);
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMenu = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "open") animateTo(true);
      else if (detail === "close") animateTo(false);
      else animateTo(!openRef.current);
    };
    const onCloseAll = () => animateTo(false);
    window.addEventListener(FABRIC_MENU_EVENT, onMenu);
    window.addEventListener("newdrawers:close-all", onCloseAll);
    return () => {
      window.removeEventListener(FABRIC_MENU_EVENT, onMenu);
      window.removeEventListener("newdrawers:close-all", onCloseAll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  const go = (entry: Entry) => {
    haptics.impactLight();
    audio.click();
    animateTo(false);
    if (entry.neoTab && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(FABRIC_NEO_TAB_EVENT, { detail: entry.neoTab })
      );
    }
    open(entry.drawer);
  };

  const renderRow = (entry: Entry) => (
    <Pressable
      key={entry.key}
      onPress={() => go(entry)}
      accessibilityRole="button"
      accessibilityLabel={`${entry.label}. ${entry.desc}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 56,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.card,
        backgroundColor: pressed ? colors.accentDim : "transparent",
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.card,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Icon name={entry.icon} size={21} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: type.label,
            fontWeight: type.semibold,
          }}
        >
          {entry.label}
        </Text>
        <Text style={{ color: colors.textDim, fontSize: type.caption }}>
          {entry.desc}
        </Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textDim} />
    </Pressable>
  );

  const sectionLabel = (text: string) => (
    <Text
      style={{
        color: colors.textDim,
        fontSize: type.caption,
        fontWeight: type.semibold,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        marginTop: spacing.lg,
        marginBottom: spacing.xs,
        paddingHorizontal: spacing.sm,
      }}
    >
      {text}
    </Text>
  );

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 300,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.backdrop,
          opacity: progress,
        }}
      >
        <Pressable
          style={{ flex: 1, minHeight: hit }}
          onPress={() => animateTo(false)}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [420, 0],
              }),
            },
          ],
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 560,
            maxHeight: "82%",
            backgroundColor: colors.sheet,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            borderWidth: 1,
            borderColor: colors.line,
            paddingTop: spacing.lg,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
            ...shadow,
          }}
        >
          <SheetHeader title="Menu" onClose={() => animateTo(false)} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {MAIN_ENTRIES.map(renderRow)}
            {sectionLabel("More")}
            {MORE_ENTRIES.map(renderRow)}
            <Text
              style={{
                color: colors.textDim,
                fontSize: type.caption,
                textAlign: "center",
                marginTop: spacing.lg,
              }}
            >
              Powered by Nirvana
            </Text>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}
