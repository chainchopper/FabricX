import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ProfileDrawerCtx = {
  open: boolean;
  openDrawer: () => void;
  close: () => void;
  toggle: () => void;
};

const Ctx = createContext<ProfileDrawerCtx | null>(null);

export function ProfileDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo<ProfileDrawerCtx>(
    () => ({
      open,
      openDrawer,
      close,
      toggle,
    }),
    [open, openDrawer, close, toggle]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfileDrawer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProfileDrawer must be used within ProfileDrawerProvider");
  return ctx;
}