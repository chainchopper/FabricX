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
import { NeoLockerProvider } from "./components/neo/NeoLockerContext";
import NeoLockerButton from "./components/neo/NeoLockerButton";
import NeoLocker from "./components/neo/NeoLocker";
import { LayerDrawerProvider } from "./components/neo/LayerDrawerContext";
import LayerDrawerButton from "./components/neo/LayerDrawerButton";
import LayerDrawer from "./components/neo/LayerDrawer";

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
                      <NeoLockerProvider>
                        <LayerDrawerProvider>
                          <View style={{ flex: 1 }}>
                            {/* Fabric is the main event: persistent and always-on */}
                            <GlobalFabricBackground />

                            {/* Foreground routes */}
                            <View style={{ flex: 1, zIndex: 10 }}>
                              <Stack screenOptions={{ headerShown: false }} />
                            </View>

                            {/* Edge tabs rail: above routes, below overlays/drawers */}
                            <TabsRail />

                            {/* Overlays and legacy drawers (highest layer) */}
                            <OverlayRoot />
                            <UserDrawer debugVariant="layout" />
                            <Locker debugVariant="layout" />

                            {/* New isolated right-side panels */}
                            <NeoLockerButton />
                            <NeoLocker />
                            <LayerDrawerButton />
                            <LayerDrawer />
                          </View>
                        </LayerDrawerProvider>
                      </NeoLockerProvider>
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