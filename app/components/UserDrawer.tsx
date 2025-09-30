import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, Text, View, BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";
import { useOverlays } from "../context/OverlayContext";
import { drawerEvents } from "../utils/drawerEvents";

type UserDrawerContextValue = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const UserDrawerContext = createContext<UserDrawerContextValue | null>(null);

export function useUserDrawer() {
  const ctx = useContext(UserDrawerContext);
  if (!ctx) throw new Error("useUserDrawer must be used within UserDrawerProvider");
  return ctx;
}

export function UserDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const haptics = useHaptics();
  const audio = useAudioCues();

  const openDrawer = useCallback(() => {
    drawerEvents.emitCloseLocker();
    setOpen(true);
    haptics.impactMedium();
    audio.click();
  }, [haptics, audio]);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    haptics.impactLight();
    audio.click();
  }, [haptics, audio]);

  const toggleDrawer = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        drawerEvents.emitCloseLocker();
        haptics.impactMedium();
        audio.click();
      } else {
        haptics.impactLight();
        audio.click();
      }
      return next;
    });
  }, [haptics, audio]);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeDrawer();
      return true;
    });
    return () => sub.remove();
  }, [open, closeDrawer]);

  // Close when Locker asks
  useEffect(() => {
    return drawerEvents.on("fabric:close-user-drawer", () => setOpen(false));
  }, []);

  const value = useMemo<UserDrawerContextValue>(() => ({ open, openDrawer, closeDrawer, toggleDrawer }), [open, openDrawer, closeDrawer, toggleDrawer]);

  return <UserDrawerContext.Provider value={value}>{children}</UserDrawerContext.Provider>;
}

export default function UserDrawer() {
  const { open, closeDrawer } = useUserDrawer();
  const overlays = useOverlays();

  const PANEL_WIDTH = 300;
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [-PANEL_WIDTH, 0] });

  const NavButton = ({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: "rgba(2,8,23,0.6)",
        borderColor: "rgba(34,211,238,0.3)",
        borderWidth: 1,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800", fontSize: 16 }}>{label}</Text>
      {hint ? <Text style={{ color: "#9ca3af", marginTop: 2 }}>{hint}</Text> : null}
    </Pressable>
  );

  if (!open) return null;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: PANEL_WIDTH,
        transform: [{ translateX: tx }],
        zIndex: 57,
        backgroundColor: "rgba(15,23,42,0.9)",
        borderRightColor: "rgba(34,211,238,0.35)",
        borderRightWidth: 1,
      }}
    >
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, paddingTop: 12, paddingHorizontal: 14 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Image source={require("../../logo.png")} style={{ width: 44, height: 44, borderRadius: 22 }} />
            <Text style={{ color: "white", fontWeight: "800", fontSize: 16 }}>Weaver</Text>
            <Text style={{ color: "#93c5fd", fontSize: 12 }}>Profile & Menus</Text>
          </View>

          <NavButton label="Dashboard" hint="Global settings • Experiences" onPress={() => { overlays.open("dashboard"); closeDrawer(); }} />
          <NavButton label="Plugins" hint="Discover and manage" onPress={() => { overlays.open("plugins"); closeDrawer(); }} />
          <NavButton label="Profile" onPress={() => { overlays.open("profile"); closeDrawer(); }} />
          <NavButton label="Studio" hint="Engine / Level editor" onPress={() => { overlays.open("studio"); closeDrawer(); }} />
          <NavButton label="Diagnostics" hint="Fabric status & controls" onPress={() => { overlays.open("diagnostics"); closeDrawer(); }} />
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}