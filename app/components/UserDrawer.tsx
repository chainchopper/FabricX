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

  // Do not render legacy drawer; keep provider state alive.
  return <UserDrawerContext.Provider value={value}>{children}</UserDrawerContext.Provider>;
}

export function useUserDrawer() {
  const ctx = useContext(UserDrawerContext);
  if (!ctx) throw new Error("useUserDrawer must be used within UserDrawerProvider");
  return ctx;
}

// Legacy drawer retained but no longer used
export default function UserDrawer() {
  return null;
}