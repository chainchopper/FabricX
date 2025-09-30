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

export default function RootLayout() {
  return (
    <ToastProvider>
      <PreferencesProvider>
        <LayersProvider>
          <ARProvider>
            <ExperienceProvider>
              <LockerProvider>
                <View style={{ flex: 1 }}>
                  {/* Global Fabric/Experience background runs behind all routes */}
                  <GlobalFabricBackground />
                  {/* Foreground routes */}
                  <View style={{ flex: 1, zIndex: 10 }}>
                    <Stack screenOptions={{ headerShown: false }} />
                  </View>
                  {/* Locker overlay */}
                  <Locker />
                </View>
              </LockerProvider>
            </ExperienceProvider>
          </ARProvider>
        </LayersProvider>
      </PreferencesProvider>
    </ToastProvider>
  );
}