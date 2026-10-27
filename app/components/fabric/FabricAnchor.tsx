/**
 * FabricAnchor — the single "F" (F doctrine, rule 2).
 *
 * One 52px anchor, top-left, and nothing else lives at that corner any
 * more (the legacy rail's 96px pulsing logo button that covered the
 * HUD's Heart button is gone with the rail). Tap F: the menu opens.
 * Tap F again: it collapses back to the loaded layer's controls.
 *
 * Idle behavior: the anchor fades with the rest of the chrome. On web
 * it then stops receiving touches — the chrome context's window-level
 * activity listeners restore everything on the next touch anywhere,
 * including a touch that draws on the canvas. On native there is no
 * window listener, so the anchor keeps a 44px hit area at ember
 * opacity (0.08) as the restore tap.
 *
 * Powered by Nirvana
 */

import React from "react";
import { Animated, Platform, Pressable, Text } from "react-native";
import { colors, radius } from "../../../src/theme/tokens";
import Icon from "../../../src/components/ui/Icon";
import { useFabricChrome } from "./FabricChromeContext";

export default function FabricAnchor() {
  const { menuOpen, toggleMenu, idle, chromeOpacity, noteActivity } =
    useFabricChrome();

  const faded = idle && !menuOpen;
  const pointerEvents = faded && Platform.OS === "web" ? "none" : "auto";

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 120,
        opacity: chromeOpacity,
      }}
    >
      <Pressable
        pointerEvents={pointerEvents}
        onPress={() => {
          noteActivity();
          toggleMenu();
        }}
        accessibilityRole="button"
        accessibilityLabel={menuOpen ? "Close Fabric menu" : "Open Fabric menu"}
        style={({ pressed }) => ({
          width: 52,
          height: 52,
          borderRadius: radius.pill,
          backgroundColor: pressed ? colors.accentDim : colors.panel,
          borderColor: menuOpen ? colors.accent : colors.accentLine,
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          opacity: faded && Platform.OS !== "web" ? 0.08 : 1,
        })}
      >
        {menuOpen ? (
          <Icon name="close" size={22} color={colors.accent} />
        ) : (
          <Text
            style={{
              color: colors.accent,
              fontSize: 24,
              fontWeight: "800",
              lineHeight: 26,
            }}
          >
            F
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
