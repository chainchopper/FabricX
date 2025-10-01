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
import TabsRail from "./components/TabsRail";
import { MenuControllerProvider } from "./components/MenuController";

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
                    <MenuControllerProvider>
                      <View style={{ flex: 1 }}>
                        {/* Fabric is the main event: persistent and always-on */}
                        <GlobalFabricBackground />

                        {/* Foreground routes */}
                        <View style={{ flex: 1, zIndex: 10 }}>
                          <Stack screenOptions={{ headerShown: false }} />
                        </View>

                        {/* Edge tabs rail: above routes, below overlays/drawers */}
                        <TabsRail />

                        {/* Overlays and Drawers (highest layer) */}
                        <OverlayRoot />
                        <UserDrawer />
                        <Locker />
                      </View>
                    </MenuControllerProvider>
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