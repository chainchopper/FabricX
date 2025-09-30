import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, Text, View } from "react-native";
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
  const { open, toggleDrawer, closeDrawer } = useUserDrawer();
  // Drawer width 360; visible tab 48 → closed offset = -312
  const CLOSED_X = -312;
  const slideX = useRef(new Animated.Value(CLOSED_X)).current;

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: open ? 0 : CLOSED_X,
      duration: 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slideX]);

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

          <Pressable
            onPress={closeDrawer}
            style={{ alignSelf: "flex-start", marginTop: 8, borderColor: "rgba(148,163,184,0.35)", borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
          </Pressable>
        </View>

        <View style={{ position: "absolute", bottom: 12, left: 14 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>

      {/* Attached edge tab (avatar) that sticks out and slides with drawer */}
      <Pressable
        onPress={toggleDrawer}
        style={{
          position: "absolute",
          top: 12,
          right: -48,
          width: 48,
          height: 48,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderLeftWidth: 0,
          borderRightWidth: 1,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Image source={require("../../logo.png")} style={{ width: 28, height: 28, borderRadius: 6 }} />
      </Pressable>
    </Animated.View>
  );
}