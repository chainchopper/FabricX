import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, setJSON } from "../utils/storage";

type PreferencesContextValue = {
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  toggleHaptics: () => void;
};

const STORAGE_KEY = "fabric_prefs_v1";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);

  useEffect(() => {
    getJSON<{ hapticsEnabled: boolean } | null>(STORAGE_KEY, null).then((saved) => {
      if (saved && typeof saved.hapticsEnabled === "boolean") {
        setHapticsEnabledState(saved.hapticsEnabled);
      }
    });
  }, []);

  useEffect(() => {
    setJSON(STORAGE_KEY, { hapticsEnabled });
  }, [hapticsEnabled]);

  const setHapticsEnabled = (v: boolean) => setHapticsEnabledState(v);
  const toggleHaptics = () => setHapticsEnabledState((prev) => !prev);

  const value = useMemo(
    () => ({ hapticsEnabled, setHapticsEnabled, toggleHaptics }),
    [hapticsEnabled]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}