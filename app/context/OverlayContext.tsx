import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type OverlayType = "dashboard" | "plugins" | "profile" | "studio" | "diagnostics" | "credits";

type OverlayState = {
  type: OverlayType | null;
  open: boolean;
};

type OverlayContextValue = {
  state: OverlayState;
  open: (type: OverlayType) => void;
  close: () => void;
  toggle: (type: OverlayType) => void;
};

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OverlayState>({ type: null, open: false });

  const open = useCallback((type: OverlayType) => {
    setState({ type, open: true });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const toggle = useCallback((type: OverlayType) => {
    setState((s) => {
      if (s.open && s.type === type) return { ...s, open: false };
      return { type, open: true };
    });
  }, []);

  const value = useMemo(() => ({ state, open, close, toggle }), [state, open, close, toggle]);

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlays() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("useOverlays must be used within OverlayProvider");
  return ctx;
}