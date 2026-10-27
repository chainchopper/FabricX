/**
 * FabricChromeContext — the F-doctrine chrome state (Oct 27, 2026).
 *
 * Doctrine (~/workspace/fabric-ui-doctrine.md, Terrell's brief):
 * - All action occurs on the canvas layer that is loaded; chrome is a guest.
 * - ONE anchor: the "F". It opens the menu; tapping it again collapses
 *   back to the loaded layer's own controls.
 * - Idle fade: after ~4s with no on-device touch, ALL chrome fades to
 *   opacity 0 and stops receiving touches, leaving only canvas activity.
 *   Any touch anywhere restores it. Voice/motion layers are never
 *   cluttered by resident UI.
 * - Single-canvas authority: this state lives in React context ABOVE the
 *   canvas branch and never remounts it — opening menus, fading chrome,
 *   or switching panels cannot recreate the WebGL engine.
 *
 * The provider only owns UI state (menu open, idle, voice panel mounted).
 * It renders no pixels itself.
 *
 * Powered by Nirvana
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Easing, Platform } from "react-native";

export const CHROME_IDLE_MS = 4000;

type FabricChromeValue = {
  /** The one menu (FabricMenu) is open. */
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  toggleMenu: () => void;
  /** True after CHROME_IDLE_MS without on-device activity (and no hold). */
  idle: boolean;
  /** Shared opacity for chrome surfaces: 1 active, 0 idle. */
  chromeOpacity: Animated.Value;
  /** Call on any user activity to restore chrome and restart the clock. */
  noteActivity: () => void;
  /**
   * While something needs the chrome to stay (menu open, a drawer open),
   * hold the fade off. Mirrors the boolean into the idle timer.
   */
  setHoldVisible: (v: boolean) => void;
  /** Voice input panel mounted (from the menu, not a floating button). */
  voiceOpen: boolean;
  setVoiceOpen: (v: boolean) => void;
};

const Ctx = createContext<FabricChromeValue | null>(null);

export function FabricChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpenState] = useState(false);
  const [idle, setIdle] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [holdVisible, setHoldVisibleState] = useState(false);

  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef(false);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;
  holdRef.current = holdVisible || menuOpen;

  const setHoldVisible = useCallback((v: boolean) => {
    setHoldVisibleState(v);
  }, []);

  const scheduleIdle = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Never fade while the menu or a held surface (drawer) is open.
      if (!holdRef.current && !menuOpenRef.current) setIdle(true);
    }, CHROME_IDLE_MS);
  }, []);

  const noteActivity = useCallback(() => {
    setIdle(false);
    scheduleIdle();
  }, [scheduleIdle]);

  const setMenuOpen = useCallback(
    (v: boolean) => {
      setMenuOpenState(v);
      if (v) {
        setIdle(false);
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        scheduleIdle();
      }
    },
    [scheduleIdle]
  );

  const toggleMenu = useCallback(() => {
    setMenuOpen(!menuOpenRef.current);
  }, [setMenuOpen]);

  // Start the idle clock on mount; any on-device activity resets it.
  // Web: window-level listeners catch touches on the CANVAS too, so
  // drawing restores the chrome. Native: chrome presses call
  // noteActivity through their handlers.
  useEffect(() => {
    scheduleIdle();
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    const onActivity = () => noteActivity();
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", onActivity, opts);
    window.addEventListener("touchstart", onActivity, opts);
    window.addEventListener("mousedown", onActivity, opts);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("mousedown", onActivity);
      window.removeEventListener("keydown", onActivity);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [noteActivity, scheduleIdle]);

  // Opening the menu or holding a surface cancels a pending fade.
  useEffect(() => {
    if (menuOpen || holdVisible) {
      setIdle(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      scheduleIdle();
    }
  }, [menuOpen, holdVisible, scheduleIdle]);

  // Drive the shared opacity.
  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: idle ? 0 : 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [idle, chromeOpacity]);

  const value = useMemo<FabricChromeValue>(
    () => ({
      menuOpen,
      setMenuOpen,
      toggleMenu,
      idle,
      chromeOpacity,
      noteActivity,
      setHoldVisible,
      voiceOpen,
      setVoiceOpen,
    }),
    [menuOpen, setMenuOpen, toggleMenu, idle, chromeOpacity, noteActivity, setHoldVisible, voiceOpen]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFabricChrome() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useFabricChrome must be used within FabricChromeProvider");
  }
  return ctx;
}
