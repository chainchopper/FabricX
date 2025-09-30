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

export default function RootLayout() {
  return (
    <ToastProvider>
      <PreferencesProvider>
        <LayersProvider>
          <ARProvider>
            <ExperienceProvider>
              <OverlayProvider>
                <LockerProvider>
                  <View style={{ flex: 1 }}>
                    {/* Fabric is the main event: persistent and always-on */}
                    <GlobalFabricBackground />
                    {/* Foreground routes (minimal; we favor overlays) */}
                    <View style={{ flex: 1, zIndex: 10 }}>
                      <Stack screenOptions={{ headerShown: false }} />
                    </View>
                    {/* Overlays */}
                    <OverlayRoot />
                    {/* Locker for quick actions */}
                    <Locker />
                  </View>
                </LockerProvider>
              </OverlayProvider>
            </ExperienceProvider>
          </ARProvider>
        </LayersProvider>
      </PreferencesProvider>
    </ToastProvider>
  );
}