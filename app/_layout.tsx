import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";
import Locker, { LockerProvider } from "./components/Locker";
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
                      {/* Foreground routes */}
                      <View style={{ flex: 1, zIndex: 10 }}>
                        <Stack screenOptions={{ headerShown: false }} />
                      </View>
                      {/* Overlays and Drawers */}
                      <OverlayRoot />
                      <UserDrawer />
                      <Locker />
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