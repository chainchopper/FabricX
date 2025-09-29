import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, setJSON } from "../utils/storage";

type PreferencesContextValue = {
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  toggleHaptics: () => void;

  audioEnabled: boolean;
  setAudioEnabled: (v: boolean) => void;
  toggleAudio: () => void;
};

const STORAGE_KEY = "fabric_prefs_v1";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);
  const [audioEnabled, setAudioEnabledState] = useState<boolean>(true);

  useEffect(() => {
    getJSON<{ hapticsEnabled?: boolean; audioEnabled?: boolean } | null>(STORAGE_KEY, null).then((saved) => {
      if (saved && typeof saved.hapticsEnabled === "boolean") {
        setHapticsEnabledState(saved.hapticsEnabled);
      }
      if (saved && typeof saved.audioEnabled === "boolean") {
        setAudioEnabledState(saved.audioEnabled);
      }
    });
  }, []);

  useEffect(() => {
    setJSON(STORAGE_KEY, { hapticsEnabled, audioEnabled });
  }, [hapticsEnabled, audioEnabled]);

  const setHapticsEnabled = (v: boolean) => setHapticsEnabledState(v);
  const toggleHaptics = () => setHapticsEnabledState((prev) => !prev);

  const setAudioEnabled = (v: boolean) => setAudioEnabledState(v);
  const toggleAudio = () => setAudioEnabledState((prev) => !prev);

  const value = useMemo(
    () => ({ hapticsEnabled, setHapticsEnabled, toggleHaptics, audioEnabled, setAudioEnabled, toggleAudio }),
    [hapticsEnabled, audioEnabled]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}