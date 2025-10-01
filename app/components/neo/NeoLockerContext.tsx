import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type NeoLockerCtx = {
  open: boolean;
  openLocker: () => void;
  closeLocker: () => void;
  toggleLocker: () => void;
};

const NeoLockerContext = createContext<NeoLockerCtx | null>(null);

export function NeoLockerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openLocker = useCallback(() => setOpen(true), []);
  const closeLocker = useCallback(() => setOpen(false), []);
  const toggleLocker = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(() => ({ open, openLocker, closeLocker, toggleLocker }), [open, openLocker, closeLocker, toggleLocker]);
  return <NeoLockerContext.Provider value={value}>{children}</NeoLockerContext.Provider>;
}

export function useNeoLocker() {
  const ctx = useContext(NeoLockerContext);
  if (!ctx) throw new Error("useNeoLocker must be used within NeoLockerProvider");
  return ctx;
}