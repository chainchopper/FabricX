import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { drawerEvents } from "../../shared/utils/drawerEvents";

type Ctx = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const UserDrawerContext = createContext<Ctx | null>(null);

export function UserDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubClose = drawerEvents.on("fabric:close-user-drawer", () => setOpen(false));
    return () => {
      unsubClose();
    };
  }, []);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(() => ({ open, openDrawer, closeDrawer, toggleDrawer }), [open, openDrawer, closeDrawer, toggleDrawer]);

  return <UserDrawerContext.Provider value={value}>{children}<UserDrawer /></UserDrawerContext.Provider>;
}

export function useUserDrawer() {
  const ctx = useContext(UserDrawerContext);
  if (!ctx) throw new Error("useUserDrawer must be used within UserDrawerProvider");
  return ctx;
}

export default function UserDrawer() {
  const { open, closeDrawer } = useUserDrawer();
  const CLOSED_X = -360;
  const slideX = useRef(new Animated.Value(CLOSED_X)).current;

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: open ? 0 : CLOSED_X,
      duration: 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slideX]);

  useEffect(() => {
    if (open && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fabric:shockwave", { detail: { x: 0.05, y: 0.12, strength: 1.0 } }));
    }
  }, [open]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 360,
        transform: [{ translateX: slideX }],
        zIndex: 59,
      }}
      pointerEvents="box-none"
    >
      {/* Drawer panel */}
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 360,
          backgroundColor: "rgba(15,23,42,0.95)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 48,
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ color: "white", fontWeight: "800", marginBottom: 12 }}>User</Text>
        <Text style={{ color: "#93c5fd", marginBottom: 10 }}>Profile, privacy, identity.</Text>

        <View style={{ gap: 8 }}>
          <View style={{ backgroundColor: "rgba(15,23,42,0.85)", borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", borderRadius: 12, padding: 14 }}>
            <Text style={{ color: "#e5e7eb" }}>Username: Weaver</Text>
            <Text style={{ color: "#9ca3af", marginTop: 4 }}>Status: Online</Text>
          </View>

          <View style={{ alignSelf: "flex-start", marginTop: 8, borderColor: "rgba(148,163,184,0.35)", borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}>
            <Text onPress={closeDrawer} style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
          </View>
        </View>

        <View style={{ position: "absolute", bottom: 12, left: 14 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}