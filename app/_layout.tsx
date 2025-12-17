import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { ARProvider } from "./context/ARContext";
import React from "react";
import { View } from "react-native";
import GlobalFabricBackground from "./components/GlobalFabricBackground";
import { ExperienceProvider } from "./context/ExperienceContext";
import { OverlayProvider } from "./context/OverlayContext";
import OverlayRoot from "./components/overlays/OverlayRoot";

// Keep legacy providers alive but not rendered
import { UserDrawerProvider } from "./components/UserDrawer";
import { LockerProvider } from "./components/Locker";

// New Drawers Controller
import { NewDrawersProvider } from "./components/neo/NewDrawersContext";

// New left-edge icons and drawers
import ProfileDrawerButton from "./components/neo/ProfileDrawerButton";
import NeoLockerButton from "./components/neo/NeoLockerButton";
import LayerDrawerButton from "./components/neo/LayerDrawerButton";
import StudioDrawerButton from "./components/neo/StudioDrawerButton";
import PluginsDrawerButton from "./components/neo/PluginsDrawerButton";
import CompanionDrawerButton from "./components/neo/CompanionDrawerButton";
import ShopDrawerButton from "./components/neo/ShopDrawerButton";
import CallDrawerButton from "./components/neo/CallDrawerButton";
import WalletDrawerButton from "./components/neo/WalletDrawerButton";
import FriendsDrawerButton from "./components/neo/FriendsDrawerButton";
import SettingsDrawerButton from "./components/neo/SettingsDrawerButton";
import AISettingsDrawerButton from "./components/neo/AISettingsDrawerButton";
import AIChatDrawerButton from "./components/neo/AIChatDrawerButton";
import VisionAIDrawerButton from "./components/neo/VisionAIDrawerButton";
import VoiceInputButton from "./components/VoiceInputButton";

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

// LogBox/Metro symbolication sanitizer (web-only)
import LogboxSanitizer from "./components/LogboxSanitizer";

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
                      {/* Sanitize console errors to prevent Metro's <anonymous> ENOENT spam */}
                      <LogboxSanitizer />
                      <View style={{ flex: 1 }}>
                        {/* Fabric is the main event: persistent and always-on */}
                        <GlobalFabricBackground />

                        {/* Foreground routes */}
                        <View style={{ flex: 1, zIndex: 10 }}>
                          <Stack screenOptions={{ headerShown: false }} />
                        </View>

                        {/* Overlays (highest layer) */}
                        <OverlayRoot />

                        {/* New left-edge icon menus (attached to drawers) */}
                        <ProfileDrawerButton />
                        <NeoLockerButton />
                        <LayerDrawerButton />
                        <StudioDrawerButton />
                        <PluginsDrawerButton />
                        <CompanionDrawerButton />
                        <ShopDrawerButton />
                        <CallDrawerButton />
                        <WalletDrawerButton />
                        <FriendsDrawerButton />
                        <SettingsDrawerButton />

                        {/* Left-side drawers */}
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
                        
                        {/* Floating Voice Input */}
                        <VoiceInputButton />
                      </View>
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