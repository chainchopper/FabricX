import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ProfileDrawerCtx = {
  open: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const Ctx = createContext<ProfileDrawerCtx | null>(null);

export function ProfileDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({
    open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(v => !v),
  }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfileDrawer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProfileDrawer must be used within ProfileDrawerProvider");
  return ctx;
}