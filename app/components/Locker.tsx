import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { drawerEvents } from "../../shared/utils/drawerEvents";
import { useOverlays } from "../context/OverlayContext";
import ExperienceSwitch from "./ExperienceSwitch";
import ExperienceControls from "./ExperienceControls";

type LockerCtx = {
  open: boolean;
  openLocker: () => void;
  closeLocker: () => void;
  toggleLocker: () => void;
};

const LockerContext = createContext<LockerCtx | null>(null);

export function LockerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = drawerEvents.on("fabric:close-locker", () => setOpen(false));
    return () => unsub();
  }, []);

  const openLocker = useCallback(() => setOpen(true), []);
  const closeLocker = useCallback(() => setOpen(false), []);
  const toggleLocker = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(() => ({ open, openLocker, closeLocker, toggleLocker }), [open, openLocker, closeLocker, toggleLocker]);

  return (
    <LockerContext.Provider value={value}>
      {children}
      <Locker />
    </LockerContext.Provider>
  );
}

export function useLocker() {
  const ctx = useContext(LockerContext);
  if (!ctx) throw new Error("useLocker must be used within LockerProvider");
  return ctx;
}

export default function Locker() {
  const { open, closeLocker } = useLocker();
  const { open: openOverlay } = useOverlays();
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

  const Action = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.45)",
        backgroundColor: "rgba(2,8,23,0.6)",
        marginBottom: 8,
      }}
    >
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );

  const openAndFocus = (type: Parameters<typeof openOverlay>[0]) => {
    closeLocker();
    openOverlay(type);
  };

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 360,
        transform: [{ translateX: slideX }],
        zIndex: 58,
      }}
      pointerEvents="box-none"
    >
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
          paddingHorizontal: 14,
        }}
      >
        <Text style={{ color: "white", fontWeight: "800", marginBottom: 12 }}>Locker</Text>
        <Text style={{ color: "#93c5fd", marginBottom: 10 }}>Quick actions and controls.</Text>

        <View style={{ marginTop: 6 }}>
          <Action label="Dashboard" onPress={() => openAndFocus("dashboard")} />
          <Action label="Plugins" onPress={() => openAndFocus("plugins")} />
          <Action label="Profile" onPress={() => openAndFocus("profile")} />
          <Action label="Studio" onPress={() => openAndFocus("studio")} />
          <Action label="Diagnostics" onPress={() => openAndFocus("diagnostics")} />
          <Action label="Credits" onPress={() => openAndFocus("credits")} />
        </View>

        <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 10 }} />

        <View style={{ gap: 10 }}>
          <ExperienceSwitch />
          <ExperienceControls />
        </View>

        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: "rgba(148,163,184,0.25)", paddingTop: 12 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}