import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { drawerEvents } from "../../shared/utils/drawerEvents";

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

  return <LockerContext.Provider value={value}>{children}{/* Locker UI rendered below */}<Locker /></LockerContext.Provider>;
}

export function useLocker() {
  const ctx = useContext(LockerContext);
  if (!ctx) throw new Error("useLocker must be used within LockerProvider");
  return ctx;
}

export default function Locker() {
  const ctx = useContext(LockerContext);
  if (!ctx) return null;
  const { open, closeLocker } = ctx;

  if (!open) return null;

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
      <Text style={{ color: "white", fontWeight: "800", marginBottom: 10 }}>Locker</Text>
      <Text style={{ color: "#93c5fd", marginBottom: 10 }}>Quick actions and controls.</Text>
      <Pressable
        onPress={closeLocker}
        style={{ marginTop: 8, borderColor: "rgba(148,163,184,0.35)", borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </View>
  );
}