import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, setJSON } from "../utils/storage";

type IconsLockMode = "off" | "lock" | "lock_autohide";

type PreferencesContextValue = {
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  toggleHaptics: () => void;

  audioEnabled: boolean;
  setAudioEnabled: (v: boolean) => void;
  toggleAudio: () => void;

  // New: icon behavior
  iconsAutoHide: boolean;
  setIconsAutoHide: (v: boolean) => void;
  iconsAutoHideTimeoutSec: number;
  setIconsAutoHideTimeoutSec: (n: number) => void;
  iconsLockMode: IconsLockMode;
  setIconsLockMode: (m: IconsLockMode) => void;
};

const STORAGE_KEY = "fabric_prefs_v1";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabledState] = useState<boolean>(true);

  // New icon behavior
  const [iconsAutoHide, setIconsAutoHideState] = useState<boolean>(true);
  const [iconsAutoHideTimeoutSec, setIconsAutoHideTimeoutSecState] = useState<number>(6);
  const [iconsLockMode, setIconsLockModeState] = useState<IconsLockMode>("lock_autohide");

  useEffect(() => {
    getJSON<{
      hapticsEnabled?: boolean;
      audioEnabled?: boolean;
      iconsAutoHide?: boolean;
      iconsAutoHideTimeoutSec?: number;
      iconsLockMode?: IconsLockMode;
    } | null>(STORAGE_KEY, null).then((saved) => {
      if (saved && typeof saved.hapticsEnabled === "boolean") setHapticsEnabledState(saved.hapticsEnabled);
      if (saved && typeof saved.audioEnabled === "boolean") setAudioEnabledState(saved.audioEnabled);
      if (saved && typeof saved.iconsAutoHide === "boolean") setIconsAutoHideState(saved.iconsAutoHide);
      if (saved && typeof saved.iconsAutoHideTimeoutSec === "number") setIconsAutoHideTimeoutSecState(saved.iconsAutoHideTimeoutSec);
      if (saved && typeof saved.iconsLockMode === "string") setIconsLockModeState(saved.iconsLockMode);
    });
  }, []);

  useEffect(() => {
    setJSON(STORAGE_KEY, {
      hapticsEnabled,
      audioEnabled,
      iconsAutoHide,
      iconsAutoHideTimeoutSec,
      iconsLockMode,
    });
  }, [hapticsEnabled, audioEnabled, iconsAutoHide, iconsAutoHideTimeoutSec, iconsLockMode]);

  const setHapticsEnabled = (v: boolean) => setHapticsEnabledState(v);
  const toggleHaptics = () => setHapticsEnabledState((prev) => !prev);

  const setAudioEnabled = (v: boolean) => setAudioEnabledState(v);
  const toggleAudio = () => setAudioEnabledState((prev) => !prev);

  const setIconsAutoHide = (v: boolean) => setIconsAutoHideState(v);
  const setIconsAutoHideTimeoutSec = (n: number) => setIconsAutoHideTimeoutSecState(Math.max(1, Math.min(60, Math.round(n))));
  const setIconsLockMode = (m: IconsLockMode) => setIconsLockModeState(m);

  const value = useMemo(
    () => ({
      hapticsEnabled,
      setHapticsEnabled,
      toggleHaptics,
      audioEnabled,
      setAudioEnabled,
      toggleAudio,
      iconsAutoHide,
      setIconsAutoHide,
      iconsAutoHideTimeoutSec,
      setIconsAutoHideTimeoutSec,
      iconsLockMode,
      setIconsLockMode,
    }),
    [hapticsEnabled, audioEnabled, iconsAutoHide, iconsAutoHideTimeoutSec, iconsLockMode]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}