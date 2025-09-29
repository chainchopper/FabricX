import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";
import { LockerProvider, Locker } from "./components/Locker";
import { PreferencesProvider } from "./context/PreferencesContext";
import { ARProvider } from "./context/ARContext";
import React from "react";
import { View } from "react-native";
import GlobalFabricBackground from "./components/GlobalFabricBackground";

export default function RootLayout() {
  return (
    <ToastProvider>
      <PreferencesProvider>
        <LayersProvider>
          <ARProvider>
            <LockerProvider>
              <View style={{ flex: 1 }}>
                {/* Global Fabric background runs behind all routes (hidden on /fabric) */}
                <GlobalFabricBackground />
                {/* Foreground routes */}
                <View style={{ flex: 1, zIndex: 10 }}>
                  <Stack screenOptions={{ headerShown: false }} />
                </View>
                {/* Locker overlay */}
                <Locker />
              </View>
            </LockerProvider>
          </ARProvider>
        </LayersProvider>
      </PreferencesProvider>
    </ToastProvider>
  );
}