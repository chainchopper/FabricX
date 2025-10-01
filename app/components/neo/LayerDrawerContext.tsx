import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type LayerDrawerCtx = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const LayerDrawerContext = createContext<LayerDrawerCtx | null>(null);

export function LayerDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(() => ({ open, openDrawer, closeDrawer, toggleDrawer }), [open, openDrawer, closeDrawer, toggleDrawer]);
  return <LayerDrawerContext.Provider value={value}>{children}</LayerDrawerContext.Provider>;
}

export function useLayerDrawer() {
  const ctx = useContext(LayerDrawerContext);
  if (!ctx) throw new Error("useLayerDrawer must be used within LayerDrawerProvider");
  return ctx;
}