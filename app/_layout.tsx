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
import ProfileTab from "./components/ProfileTab";
import LockerTab from "./components/LockerTab";

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

                      {/* Edge tabs (always visible, above routes, below overlays) */}
                      <View
                        pointerEvents="box-none"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          zIndex: 20,
                        }}
                      >
                        <ProfileTab />
                        <LockerTab />
                      </View>

                      {/* Overlays and Drawers (highest layer) */}
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