import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
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
    // Close on global events
    const unsubClose = drawerEvents.on("fabric:close-user-drawer", () => setOpen(false));
    return () => {
      unsubClose();
    };
  }, []);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(() => ({ open, openDrawer, closeDrawer, toggleDrawer }), [open, openDrawer, closeDrawer, toggleDrawer]);

  return <UserDrawerContext.Provider value={value}>{children}{/* Drawer rendered separately */}</UserDrawerContext.Provider>;
}

export function useUserDrawer() {
  const ctx = useContext(UserDrawerContext);
  if (!ctx) throw new Error("useUserDrawer must be used within UserDrawerProvider");
  return ctx;
}

export default function UserDrawer() {
  const { open, closeDrawer } = useUserDrawer();

  if (!open) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 300,
        zIndex: 58,
        backgroundColor: "rgba(15,23,42,0.95)",
        borderRightColor: "rgba(34,211,238,0.35)",
        borderRightWidth: 1,
        paddingTop: 48,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800", marginBottom: 12 }}>User Panel</Text>
      <Text style={{ color: "#93c5fd", marginBottom: 10 }}>Manage profile and quick actions.</Text>
      <Pressable
        onPress={closeDrawer}
        style={{ marginTop: 8, borderColor: "rgba(148,163,184,0.35)", borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </View>
  );
}