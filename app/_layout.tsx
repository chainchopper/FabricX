import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";
import { LockerProvider, Locker } from "./components/Locker";
import { PreferencesProvider } from "./context/PreferencesContext";
import { ARProvider } from "./context/ARContext";
import React from "react";
import { View } from "react-native";
import GlobalFabricBackground from "./components/GlobalFabricBackground";
import { ExperienceProvider } from "./context/ExperienceContext";
import { OverlayProvider } from "./context/OverlayContext";
import OverlayRoot from "./components/overlays/OverlayRoot";
import { UserDrawerProvider } from "./components/UserDrawer";
import UserDrawer from "./components/UserDrawer";
import AvatarButton from "./components/AvatarButton";

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
                    <View style={{ flex: 1 }}>
                      {/* Fabric is the main event: persistent and always-on */}
                      <GlobalFabricBackground />
                      {/* Foreground routes (minimal; we favor overlays) */}
                      <View style={{ flex: 1, zIndex: 10 }}>
                        <Stack screenOptions={{ headerShown: false }} />
                      </View>
                      {/* Overlays (slide from left) */}
                      <OverlayRoot />
                      {/* Drawers (left side) */}
                      <UserDrawer />
                      <Locker />
                      {/* Avatar trigger */}
                      <AvatarButton />
                    </View>
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