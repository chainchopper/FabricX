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

import ProfileDrawer from "./components/neo/ProfileDrawer";
import NeoLocker from "./components/neo/NeoLocker";
import LayerDrawer from "./components/neo/LayerDrawer";
import StudioDrawer from "./components/neo/StudioDrawer";
import PluginsDrawer from "./components/neo/PluginsDrawer";

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

                        {/* Left-side drawers */}
                        <NeoLocker />
                        <LayerDrawer />
                        <ProfileDrawer />
                        <StudioDrawer />
                        <PluginsDrawer />
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