import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
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

  const value = useMemo(
    () => ({ open, openLocker, closeLocker, toggleLocker }),
    [open, openLocker, closeLocker, toggleLocker]
  );

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
  const ctx = useContext(LockerContext);
  const { open: overlaysOpen, open } = useOverlays();

  if (!ctx) return null;
  const { open: visible, closeLocker } = ctx;
  if (!visible) return null;

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

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 360,
        zIndex: 59,
        backgroundColor: "rgba(15,23,42,0.95)",
        borderRightColor: "rgba(34,211,238,0.35)",
        borderRightWidth: 1,
        paddingTop: 48,
        paddingHorizontal: 14,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800", marginBottom: 12 }}>Locker</Text>
      <Text style={{ color: "#93c5fd", marginBottom: 10 }}>
        Quick actions and controls.
      </Text>

      {/* Quick actions */}
      <View style={{ marginTop: 6 }}>
        <Action label="Dashboard" onPress={() => open("dashboard")} />
        <Action label="Plugins" onPress={() => open("plugins")} />
        <Action label="Profile" onPress={() => open("profile")} />
        <Action label="Studio" onPress={() => open("studio")} />
        <Action label="Diagnostics" onPress={() => open("diagnostics")} />
      </View>

      {/* Separator */}
      <View
        style={{
          height: 1,
          backgroundColor: "rgba(148,163,184,0.25)",
          marginVertical: 10,
        }}
      />

      {/* Experiences section (switch + controls) */}
      <View style={{ gap: 10 }}>
        <ExperienceSwitch />
        <ExperienceControls />
      </View>

      <View
        style={{
          marginTop: 14,
          borderTopWidth: 1,
          borderTopColor: "rgba(148,163,184,0.25)",
          paddingTop: 12,
        }}
      >
        <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
      </View>

      <Pressable
        onPress={closeLocker}
        style={{
          marginTop: 10,
          borderColor: "rgba(148,163,184,0.35)",
          borderWidth: 1,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </View>
  );
}