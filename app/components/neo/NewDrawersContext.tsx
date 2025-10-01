import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

type DrawerName = "profile" | "neo" | "layer" | "studio" | "plugins";

type DrawerAnim = {
  tx: Animated.Value; // translateX from left: -WIDTH (closed) -> 0 (open)
  width: number;
};

type NewDrawersCtx = {
  openName: DrawerName | null;
  history: DrawerName[];
  open: (name: DrawerName) => void;
  toggle: (name: DrawerName) => void;
  closeAll: () => void;
  back: () => void;
  getAnim: (name: DrawerName) => DrawerAnim;
};

const Ctx = createContext<NewDrawersCtx | null>(null);

const DEFAULT_WIDTH = 380;
const WIDTHS: Record<DrawerName, number> = {
  profile: 380,
  neo: 380,
  layer: 420,
  studio: 420,
  plugins: 420,
};

export function NewDrawersProvider({ children }: { children: React.ReactNode }) {
  const [openName, setOpenName] = useState<DrawerName | null>(null);
  const [history, setHistory] = useState<DrawerName[]>([]);

  // Shared Animated tx per drawer so buttons can attach to the drawer edge
  const animsRef = useRef<Record<DrawerName, DrawerAnim>>({
    profile: { tx: new Animated.Value(-WIDTHS.profile), width: WIDTHS.profile },
    neo: { tx: new Animated.Value(-WIDTHS.neo), width: WIDTHS.neo },
    layer: { tx: new Animated.Value(-WIDTHS.layer), width: WIDTHS.layer },
    studio: { tx: new Animated.Value(-WIDTHS.studio), width: WIDTHS.studio },
    plugins: { tx: new Animated.Value(-WIDTHS.plugins), width: WIDTHS.plugins },
  });

  const animateTo = (name: DrawerName, toOpen: boolean) => {
    const { tx, width } = animsRef.current[name];
    Animated.timing(tx, {
      toValue: toOpen ? 0 : -width,
      duration: toOpen ? 260 : 200,
      easing: toOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const open = useCallback((name: DrawerName) => {
    // Close all others
    (Object.keys(animsRef.current) as DrawerName[]).forEach((n) => {
      if (n !== name) animateTo(n, false);
    });
    // Open target
    animateTo(name, true);
    setOpenName((prev) => {
      setHistory((h) => (h.length === 0 || h[h.length - 1] !== name ? [...h, name] : h));
      return name;
    });
  }, []);

  const toggle = useCallback((name: DrawerName) => {
    if (openName === name) {
      animateTo(name, false);
      setOpenName(null);
      setHistory((h) => (h.length > 0 ? h.slice(0, -1) : h));
    } else {
      open(name);
    }
  }, [openName, open]);

  const closeAll = useCallback(() => {
    (Object.keys(animsRef.current) as DrawerName[]).forEach((n) => animateTo(n, false));
    setOpenName(null);
    setHistory([]);
  }, []);

  const back = useCallback(() => {
    setHistory((h) => {
      if (h.length <= 1) {
        // Just close current if any
        if (h.length === 1) {
          animateTo(h[0], false);
        }
        setOpenName(null);
        return [];
      }
      // Close current, open previous
      const current = h[h.length - 1];
      const prev = h[h.length - 2];
      animateTo(current, false);
      animateTo(prev, true);
      setOpenName(prev);
      return h.slice(0, -1);
    });
  }, []);

  // Close all when Fabric is interacted with (custom event)
  useEffect(() => {
    const onCloseAll = () => closeAll();
    window.addEventListener("newdrawers:close-all", onCloseAll as EventListener);
    return () => window.removeEventListener("newdrawers:close-all", onCloseAll as EventListener);
  }, [closeAll]);

  const getAnim = useCallback((name: DrawerName) => animsRef.current[name], []);

  const value = useMemo<NewDrawersCtx>(() => ({
    openName,
    history,
    open,
    toggle,
    closeAll,
    back,
    getAnim,
  }), [openName, history, open, toggle, closeAll, back, getAnim]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNewDrawers() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNewDrawers must be used within NewDrawersProvider");
  return ctx;
}