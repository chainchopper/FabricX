import { Stack } from "expo-router";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { ARProvider } from "./context/ARContext";
import React from "react";
import { Platform, View } from "react-native";
import GlobalFabricBackground from "./components/GlobalFabricBackground";
import { ExperienceProvider } from "./context/ExperienceContext";
import { OverlayProvider } from "./context/OverlayContext";
import OverlayRoot from "./components/overlays/OverlayRoot";

// Keep legacy providers alive but not rendered
import { UserDrawerProvider } from "./components/UserDrawer";
import { LockerProvider } from "./components/Locker";

// New Drawers Controller — retained as the panel engine behind the one
// Fabric menu (see FabricMenu). Its left-edge rail of ~14 pulsing
// buttons is GONE (F doctrine): the buttons are what piled onto the
// canvas and covered the HUD; the panels themselves now open only
// from the single menu.
import { NewDrawersProvider } from "./components/neo/NewDrawersContext";

import ProfileDrawer from "./components/neo/ProfileDrawer";
import NeoLocker from "./components/neo/NeoLocker";
import LayerDrawer from "./components/neo/LayerDrawer";
import StudioDrawer from "./components/neo/StudioDrawer";
import PluginsDrawer from "./components/neo/PluginsDrawer";
import CompanionDrawer from "./components/neo/CompanionDrawer";
import ShopDrawer from "./components/neo/ShopDrawer";
import CallDrawer from "./components/neo/CallDrawer";
import WalletDrawer from "./components/neo/WalletDrawer";
import FriendsDrawer from "./components/neo/FriendsDrawer";
import SettingsDrawer from "./components/neo/SettingsDrawer";
import AISettingsDrawer from "./components/neo/AISettingsDrawer";
import AIChatDrawer from "./components/neo/AIChatDrawer";
import VisionAIDrawer from "./components/neo/VisionAIDrawer";
import VoiceInputButton from "./components/VoiceInputButton";

// F doctrine chrome: one anchor, one menu, per-layer settings mirror.
import {
  FabricChromeProvider,
  useFabricChrome,
} from "./components/fabric/FabricChromeContext";
import FabricAnchor from "./components/fabric/FabricAnchor";
import FabricMenu from "./components/fabric/FabricMenu";
import LayerSettingsMirror from "./components/fabric/LayerSettingsMirror";
import ExperienceHUD from "./components/ExperienceHUD";
import ConnectionBadge from "./components/ConnectionBadge";

// LogBox/Metro symbolication sanitizer (web-only)
import LogboxSanitizer from "./components/LogboxSanitizer";
import { getSignalingService } from "../src/services/SignalingService";
import {
  getRealtimeStatus,
  setRealtimeStatus,
} from "../shared/utils/realtimeStatus";

// Hotfix 1.4: React Navigation paints EVERY screen with the navigation
// theme's background color (@react-navigation/elements' Background:
// backgroundColor = theme.colors.background; DefaultTheme = the pale
// rgb(242, 242, 242)). Fabric never overrode the theme, so that opaque
// pale layer sat in the zIndex-10 routes stack above the global canvas
// branch (zIndex 0) — permanently covering the fluid canvas, the HUD,
// and the verb bar on every route, on web and native alike. It reads
// on screen as a stuck splash: pale void plus Home's white "Fabric /
// By Fanalogy" branding text showing faintly on top of it. Fabric's
// design is the opposite — the global canvas IS the backdrop for every
// route ("Fabric is the main event: persistent and always-on", below)
// — so the navigator must not paint at all. Keep DefaultTheme, make
// only its background transparent, and the canvas branch shows through
// exactly as designed. (screenOptions.contentStyle cannot fix this:
// in native-stack v7 it styles an inner container INSIDE the painted
// Background, not the paint itself.)
const FabricNavTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "transparent" },
};

/**
 * The F-doctrine chrome layer: the single F anchor, the one menu, the
 * per-layer settings mirror, and the voice panel (mounted only when
 * the menu asks for it — no more permanent floating mic button
 * cluttering voice/motion layers).
 *
 * TAPPABILITY, BY CONSTRUCTION (the field failure this rebuild fixes):
 * everything interactive in Fabric's chrome — the F anchor, the menu,
 * the layer-control cluster (ExperienceHUD: verbs, composer, ghost),
 * and the connection badge — mounts HERE, as direct children of the
 * root view. Their complete pointer-events ancestry is:
 *
 *   RootLayout's root <View> (no pointerEvents prop anywhere)
 *     -> the chrome element itself (explicit pointerEvents props)
 *
 * No ancestor uses pointerEvents="none". That matters because
 * react-native-web's StyleSheet compiler turns a "none" ancestor into
 * a CSS descendant rule (`selector * { pointer-events: none }`) that
 * silently strips hit-testing from every descendant lacking its OWN
 * explicit pointerEvents value — exactly how the old HUD died inside
 * GlobalFabricBackground (full trace in the rebuild PR). Here, the
 * interactive elements additionally carry their own
 * pointerEvents="auto", which compiles to `auto !important` and
 * cannot be stripped by any ancestor rule.
 */
function ChromeLayer() {
  const { voiceOpen } = useFabricChrome();
  return (
    <>
      <LayerSettingsMirror />
      <ExperienceHUD />
      <ConnectionBadge />
      <FabricAnchor />
      <FabricMenu />
      {voiceOpen ? <VoiceInputButton /> : null}
    </>
  );
}

/**
 * Slice 6 join latency: warm the signaling socket at app start.
 *
 * Until now the socket's first connect() happened inside useWebRTC's
 * effect — which runs inside useFluidMultiUser, inside LegacyFluid,
 * a LAZILY imported chunk behind the experience renderer. The whole
 * page-load waterfall (providers, chunk fetch, engine init) had to
 * finish before the TLS + WebSocket handshake even BEGAN, and the
 * connection badge sat on its "Local • 0" default the entire time,
 * reading as broken local mode (Terrell's "takes a bit to sync").
 *
 * The service is a singleton and connect() is idempotent, so
 * starting it here — at the root layout's first effect — overlaps
 * the handshake with the chunk download instead of sequencing after
 * it, and the canvas hook simply finds the socket already coming up
 * (its own connect() call shares the same in-flight attempt).
 *
 * The state mirror gives the badge an honest "Connecting…" from
 * first paint when a server resolves, instead of the Local default.
 * It only ever writes the mode field of the realtime status (the
 * canvas hook owns the rest and derives mode from this same state,
 * so the two writers can never disagree). Web only: the fluid
 * session layer is web-verified, and native keeps its existing
 * lazy path untouched.
 */
function SignalingWarmup() {
  React.useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      const sig = getSignalingService();
      void sig.connect();
      return sig.onStateChange((s) => {
        const cur = getRealtimeStatus();
        if (cur.mode !== s) setRealtimeStatus({ ...cur, mode: s });
      });
    } catch {
      return undefined;
    }
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <ToastProvider>
      <PreferencesProvider>
        <LayersProvider>
          <ARProvider>
            <ExperienceProvider>
              <OverlayProvider>
                <UserDrawerProvider>
                  <LockerProvider>
                    <NewDrawersProvider>
                      <FabricChromeProvider>
                        {/* Sanitize console errors to prevent Metro's <anonymous> ENOENT spam */}
                        <LogboxSanitizer />
                        <View style={{ flex: 1 }}>
                          {/* Slice 6: start the signaling handshake
                              now, in parallel with the canvas chunk
                              loading below — not after it. */}
                          <SignalingWarmup />
                          {/* Fabric is the main event: persistent and always-on.
                              Single-canvas authority: this branch mounts once
                              and chrome state (menu, idle fade) never remounts it. */}
                          <GlobalFabricBackground />

                          {/* Foreground routes. Hotfix 1.3 (web): this
                              wrapper used to cover the whole screen above
                              the global canvas (zIndex 0) with default
                              hit-testing, so every touch landed here and
                              the canvas engine's own listeners never
                              fired — no drawable canvas, anywhere. Pass
                              touches through on web; each real page screen
                              re-enables "auto" on its root (the house
                              pattern: ExperienceHUD is "none" with "auto"
                              controls). Native keeps default behavior —
                              its input lives in the background layer's
                              FabricCanvas responder, not under this stack. */}
                          <View
                            pointerEvents={Platform.OS === "web" ? "none" : "auto"}
                            style={{ flex: 1, zIndex: 10 }}
                          >
                            <ThemeProvider value={FabricNavTheme}>
                              <Stack screenOptions={{ headerShown: false }} />
                            </ThemeProvider>
                          </View>

                          {/* Overlays (highest layer) */}
                          <OverlayRoot />

                          {/* Panels — opened ONLY from the Fabric menu
                              (ChromeLayer below). The legacy left-edge
                              rail buttons that used to live here are
                              stripped: one F anchor replaces all of them. */}
                          <NeoLocker />
                          <LayerDrawer />
                          <ProfileDrawer />
                          <StudioDrawer />
                          <PluginsDrawer />
                          <CompanionDrawer />
                          <ShopDrawer />
                          <CallDrawer />
                          <WalletDrawer />
                          <FriendsDrawer />
                          <SettingsDrawer />
                          <AISettingsDrawer />
                          <AIChatDrawer />
                          <VisionAIDrawer />

                          {/* F doctrine chrome: F anchor + one menu. */}
                          <ChromeLayer />
                        </View>
                      </FabricChromeProvider>
                    </NewDrawersProvider>
                  </LockerProvider>
                </UserDrawerProvider>
              </OverlayProvider>
            </ExperienceProvider>
          </ARProvider>
        </LayersProvider>
      </PreferencesProvider>
    </ToastProvider>
  );
}
