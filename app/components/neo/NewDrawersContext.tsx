import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform } from "react-native";
import { usePreferences } from "../../context/PreferencesContext";

type DrawerName =
  | "profile"
  | "neo"
  | "layer"
  | "studio"
  | "plugins"
  | "companion"
  | "shop"
  | "call"
  | "wallet"
  | "friends"
  | "settings"
  | "ai-settings"
  | "ai-chat"
  | "vision-ai";

type DrawerAnim = {
  tx: Animated.Value; // drawer translateX from left: -WIDTH (closed) -> 0 (open)
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
  getIconTx: (name: DrawerName) => Animated.Value;
  requestIconExpand: (byUser?: boolean) => void;
};

const Ctx = createContext<NewDrawersCtx | null>(null);

const WIDTHS: Record<DrawerName, number> = {
  profile: 380,
  neo: 380,
  layer: 420,
  studio: 420,
  plugins: 420,
  companion: 420,
  shop: 420,
  call: 420,
  wallet: 420,
  friends: 420,
  settings: 420,
  "ai-settings": 420,
  "ai-chat": 420,
  "vision-ai": 420,
};

const ALL: DrawerName[] = Object.keys(WIDTHS) as DrawerName[];

export function NewDrawersProvider({ children }: { children: React.ReactNode }) {
  const [openName, setOpenName] = useState<DrawerName | null>(null);
  const [history, setHistory] = useState<DrawerName[]>([]);
  const { iconsAutoHide, iconsAutoHideTimeoutSec, iconsLockMode } = usePreferences();

  // Drawer panel anims
  const panelsRef = useRef<Record<DrawerName, DrawerAnim>>(
    ALL.reduce((acc, n) => {
      acc[n] = { tx: new Animated.Value(-WIDTHS[n]), width: WIDTHS[n] };
      return acc;
    }, {} as Record<DrawerName, DrawerAnim>)
  );

  // Icon edge-attachment anims (each icon has its own X so we can stagger close)
  const iconsRef = useRef<Record<DrawerName, Animated.Value>>(
    ALL.reduce((acc, n) => {
      acc[n] = new Animated.Value(0);
      return acc;
    }, {} as Record<DrawerName, Animated.Value>)
  );

  // Collapse state for auto-hide
  const [iconsCollapsed, setIconsCollapsed] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const collapseTimerRef = useRef<number | null>(null);
  const doubleTapRef = useRef<number>(0);

  // Expose for buttons
  const getAnim = (name: DrawerName) => panelsRef.current[name];
  const getIconTx = (name: DrawerName) => iconsRef.current[name];

  const animatePanelTo = (name: DrawerName, toOpen: boolean) => {
    const { tx, width } = panelsRef.current[name];
    Animated.timing(tx, {
      toValue: toOpen ? 0 : -width,
      duration: toOpen ? 260 : 200,
      easing: toOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  // Icons: open instantly to current drawer width; close staggered after last drawer closes.
  const setIconsOpenInstant = (width: number) => {
    ALL.forEach((name) => {
      iconsRef.current[name].setValue(width);
    });
  };
  const animateIconsCloseStaggered = () => {
    ALL.forEach((name) => {
      const delay = 100 + Math.floor(Math.random() * 900);
      Animated.timing(iconsRef.current[name], {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        delay,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  };

  const open = (name: DrawerName) => {
    // Any open? close others
    ALL.forEach((n) => {
      if (n !== name) animatePanelTo(n, false);
    });
    // Open target
    animatePanelTo(name, true);
    setOpenName((prev) => {
      setHistory((h) => (h.length === 0 || h[h.length - 1] !== name ? [...h, name] : h));
      return name;
    });

    // Icons: open instantly to that panel width
    setIconsCollapsed(false);
    setIconsOpenInstant(WIDTHS[name]);
    lastActivityRef.current = Date.now();
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  };

  const toggle = (name: DrawerName) => {
    if (openName === name) {
      animatePanelTo(name, false);
      setOpenName(null);
      setHistory((h) => (h.length > 0 ? h.slice(0, -1) : h));
      // Close icons when no drawer open (staggered)
      animateIconsCloseStaggered();
      lastActivityRef.current = Date.now();
      scheduleAutoHide();
    } else {
      open(name);
    }
  };

  const closeAll = () => {
    ALL.forEach((n) => animatePanelTo(n, false));
    setOpenName(null);
    setHistory([]);
    animateIconsCloseStaggered();
    lastActivityRef.current = Date.now();
    scheduleAutoHide();
  };

  const back = () => {
    setHistory((h) => {
      if (h.length <= 1) {
        if (h.length === 1) animatePanelTo(h[0], false);
        setOpenName(null);
        animateIconsCloseStaggered();
        lastActivityRef.current = Date.now();
        scheduleAutoHide();
        return [];
      }
      const current = h[h.length - 1];
      const prev = h[h.length - 2];
      animatePanelTo(current, false);
      animatePanelTo(prev, true);
      setOpenName(prev);
      setIconsOpenInstant(WIDTHS[prev]);
      lastActivityRef.current = Date.now();
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      return h.slice(0, -1);
    });
  };

  // Auto-hide: collapse icons after inactivity when no drawer is open (unless locked)
  const scheduleAutoHide = () => {
    if (!iconsAutoHide || iconsLockMode === "lock") return;
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => {
      // TS fix: iconsLockMode !== "lock" is redundant here due to early return.
      if (!openName && iconsAutoHide) {
        setIconsCollapsed(true);
      }
    }, Math.max(1, iconsAutoHideTimeoutSec) * 1000) as unknown as number;
  };

  // Pointer activity resets auto-hide and expands icons if collapsed
  const onActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (iconsCollapsed) setIconsCollapsed(false);
    if (!openName) {
      // keep icons at rest; no need to slide out unless a drawer is opened
    }
    scheduleAutoHide();
  }, [iconsCollapsed, openName]);

  useEffect(() => {
    const onMouseMove = () => onActivity();
    const onTouch = () => onActivity();
    if (Platform.OS === "web") {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("touchstart", onTouch);
    }
    return () => {
      if (Platform.OS === "web") {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("touchstart", onTouch);
      }
    };
  }, [onActivity]);

  // Public method to request icon expansion (e.g., double-tap unlock)
  const requestIconExpand = (byUser?: boolean) => {
    if (iconsLockMode === "lock") {
      setIconsCollapsed(false);
      return;
    }
    if (iconsLockMode === "lock_autohide" && byUser) {
      const now = Date.now();
      if (now - doubleTapRef.current < 350) {
        setIconsCollapsed(false);
      }
      doubleTapRef.current = now;
      return;
    }
    setIconsCollapsed(false);
  };

  const value = useMemo(
    () => ({
      openName,
      history,
      open,
      toggle,
      closeAll,
      back,
      getAnim,
      getIconTx: (name: DrawerName) => iconsRef.current[name],
      requestIconExpand,
    }),
    [openName, history, open, toggle, closeAll, back, requestIconExpand]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNewDrawers() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNewDrawers must be used within NewDrawersProvider");
  return ctx;
}