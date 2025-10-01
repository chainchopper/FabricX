import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

  // Do not render legacy drawer; keep provider in place.
  return <LockerContext.Provider value={value}>{children}</LockerContext.Provider>;
}

export function useLocker() {
  const ctx = useContext(LockerContext);
  if (!ctx) throw new Error("useLocker must be used within LockerProvider");
  return ctx;
}

// Legacy drawer retained but no longer used
export default function Locker() {
  return null;
}