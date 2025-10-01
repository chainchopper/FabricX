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

// Legacy providers kept (unwired drawers)
import { UserDrawerProvider } from "./components/UserDrawer";
import { LockerProvider } from "./components/Locker";

// New isolated menus
import { NeoLockerProvider } from "./components/neo/NeoLockerContext";
import NeoLockerButton from "./components/neo/NeoLockerButton";
import NeoLocker from "./components/neo/NeoLocker";
import { LayerDrawerProvider } from "./components/neo/LayerDrawerContext";
import LayerDrawerButton from "./components/neo/LayerDrawerButton";
import LayerDrawer from "./components/neo/LayerDrawer";
import { ProfileDrawerProvider } from "./components/neo/ProfileDrawerContext";
import ProfileDrawerButton from "./components/neo/ProfileDrawerButton";
import ProfileDrawer from "./components/neo/ProfileDrawer";

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
                    <NeoLockerProvider>
                      <LayerDrawerProvider>
                        <ProfileDrawerProvider>
                          <View style={{ flex: 1 }}>
                            {/* Fabric is the main event: persistent and always-on */}
                            <GlobalFabricBackground />

                            {/* Foreground routes */}
                            <View style={{ flex: 1, zIndex: 10 }}>
                              <Stack screenOptions={{ headerShown: false }} />
                            </View>

                            {/* Overlays (highest layer) */}
                            <OverlayRoot />

                            {/* New left-edge icon menus */}
                            <ProfileDrawerButton />
                            <NeoLockerButton />
                            <LayerDrawerButton />

                            {/* New right-side drawers */}
                            <NeoLocker />
                            <LayerDrawer />
                            <ProfileDrawer />
                          </View>
                        </ProfileDrawerProvider>
                      </LayerDrawerProvider>
                    </NeoLockerProvider>
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