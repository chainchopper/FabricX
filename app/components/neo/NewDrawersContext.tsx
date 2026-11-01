import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Platform } from "react-native";
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

// What getAnim hands a drawer: the anim pair plus whether the drawer
// is parked — fully closed, snapped to exactly -width, and cut from
// rendering and touches (see parkedMap below).
type DrawerHandle = DrawerAnim & { parked: boolean };

type NewDrawersCtx = {
  openName: DrawerName | null;
  history: DrawerName[];
  open: (name: DrawerName) => void;
  toggle: (name: DrawerName) => void;
  closeAll: () => void;
  back: () => void;
  getAnim: (name: DrawerName) => DrawerHandle;
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

  // Slice 37: drawer widths are capped at the actual window width.
  // The fixed 420px sheets are wider than a phone's viewport
  // (~390px), which pushed sheet content off the right edge, left
  // card text cut at the left after the slide-in, and stranded
  // dead margins beside the sheet (Terrell's Nov 1 panel shot). A
  // drawer never exceeds the screen it lands on.
  const widthsRef = useRef<Record<DrawerName, number>>(
    (() => {
      const cap =
        Math.round(Dimensions.get("window").width) || Number.POSITIVE_INFINITY;
      return ALL.reduce(
        (acc, n) => {
          acc[n] = Math.min(WIDTHS[n], cap);
          return acc;
        },
        {} as Record<DrawerName, number>
      );
    })()
  );

  // Drawer panel anims
  const panelsRef = useRef<Record<DrawerName, DrawerAnim>>(
    ALL.reduce((acc, n) => {
      acc[n] = {
        tx: new Animated.Value(-widthsRef.current[n]),
        width: widthsRef.current[n],
      };
      return acc;
    }, {} as Record<DrawerName, DrawerAnim>)
  );

  // Parked = the drawer's REAL closed state (Slice 37 amendment,
  // Terrell's correction, Nov 1). Before this, "closed" meant only
  // that an Animated value was supposed to be resting at exactly
  // -width: every drawer stayed mounted, rendered and touchable, and
  // on web the slide is JS-driven from the same thread the WebGL
  // stage saturates, with no completion snap — so a close that never
  // ran to its end left a live panel hiding at the screen's edge
  // with no menu open (his Nov 1 screenshot: no menu was open; the
  // mess at the edge was closed drawers failing to be closed).
  // A parked drawer renders display:none and takes no touches; it
  // un-parks the moment it starts opening.
  const [parkedMap, setParkedMap] = useState<Record<DrawerName, boolean>>(
    () =>
      ALL.reduce(
        (acc, n) => {
          acc[n] = true;
          return acc;
        },
        {} as Record<DrawerName, boolean>
      )
  );
  const intentRef = useRef<Record<DrawerName, "open" | "closed">>(
    ALL.reduce(
      (acc, n) => {
        acc[n] = "closed";
        return acc;
      },
      {} as Record<DrawerName, "open" | "closed">
    )
  );
  const parkTimerRef = useRef<Record<DrawerName, number | null>>(
    ALL.reduce(
      (acc, n) => {
        acc[n] = null;
        return acc;
      },
      {} as Record<DrawerName, number | null>
    )
  );

  const parkDrawer = (name: DrawerName) => {
    // Snap to the exact closed value first: the parked state must
    // never depend on where an animation happened to stop.
    panelsRef.current[name].tx.setValue(-panelsRef.current[name].width);
    setParkedMap((m) => (m[name] ? m : { ...m, [name]: true }));
  };

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
  const getAnim = (name: DrawerName): DrawerHandle => ({
    ...panelsRef.current[name],
    parked: parkedMap[name],
  });
  const getIconTx = (name: DrawerName) => iconsRef.current[name];

  const animatePanelTo = (name: DrawerName, toOpen: boolean) => {
    const { tx, width } = panelsRef.current[name];
    intentRef.current[name] = toOpen ? "open" : "closed";
    if (parkTimerRef.current[name]) {
      window.clearTimeout(parkTimerRef.current[name]!);
      parkTimerRef.current[name] = null;
    }
    if (toOpen) {
      // Un-park first: the drawer must be rendered before it slides.
      setParkedMap((m) => (m[name] ? { ...m, [name]: false } : m));
    }
    Animated.timing(tx, {
      toValue: toOpen ? 0 : -width,
      duration: toOpen ? 260 : 200,
      easing: toOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (!toOpen && finished && intentRef.current[name] === "closed") {
        parkDrawer(name);
      }
    });
    if (!toOpen) {
      // Safety net: if the timing is superseded or its frames are
      // starved past its own duration, the completion callback may
      // never fire — park anyway once the close should long be over.
      // The intent guard keeps this from ever parking a drawer that
      // has since been re-opened.
      parkTimerRef.current[name] = window.setTimeout(() => {
        parkTimerRef.current[name] = null;
        if (intentRef.current[name] === "closed") parkDrawer(name);
      }, 450) as unknown as number;
    }
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
    setIconsOpenInstant(widthsRef.current[name]);
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
      setIconsOpenInstant(widthsRef.current[prev]);
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
    [openName, history, open, toggle, closeAll, back, requestIconExpand, parkedMap]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNewDrawers() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNewDrawers must be used within NewDrawersProvider");
  return ctx;
}