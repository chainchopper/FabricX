import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getJSON, setJSON } from "../utils/storage";
import { mirrorHapticsPreference } from "../../src/sensory/vibration";
import {
  DEFAULT_VOICE_INPUT_MODE,
  mirrorVoiceInputMode,
  normalizeVoiceInputMode,
  type VoiceInputMode,
} from "../../src/sensory/voiceMode";

type IconsLockMode = "off" | "lock" | "lock_autohide";

type PreferencesContextValue = {
  hapticsEnabled: boolean;
  setHapticsEnabled: (v: boolean) => void;
  toggleHaptics: () => void;

  audioEnabled: boolean;
  setAudioEnabled: (v: boolean) => void;
  toggleAudio: () => void;

  // Slice 58, corrected by Slice 65: how talking to the
  // ghostie starts — ONE OR THE OTHER. Natural (hands off the
  // screen; the ghostie listens for its name; fresh-install
  // default) or Tap to talk (hands on the screen; the mic
  // button is the only door). There is no "both": tap-shaped
  // moments inside Natural are platform compatibility, never
  // a mode. A stored Slice 58 "both" loads as "natural".
  voiceInputMode: VoiceInputMode;
  setVoiceInputMode: (m: VoiceInputMode) => void;

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
  const [voiceInputMode, setVoiceInputModeState] = useState<VoiceInputMode>(DEFAULT_VOICE_INPUT_MODE);

  // New icon behavior
  const [iconsAutoHide, setIconsAutoHideState] = useState<boolean>(true);
  const [iconsAutoHideTimeoutSec, setIconsAutoHideTimeoutSecState] = useState<number>(6);
  const [iconsLockMode, setIconsLockModeState] = useState<IconsLockMode>("lock_autohide");

  useEffect(() => {
    getJSON<{
      hapticsEnabled?: boolean;
      audioEnabled?: boolean;
      voiceInputMode?: unknown;
      iconsAutoHide?: boolean;
      iconsAutoHideTimeoutSec?: number;
      iconsLockMode?: IconsLockMode;
    } | null>(STORAGE_KEY, null).then((saved) => {
      if (saved && typeof saved.hapticsEnabled === "boolean") setHapticsEnabledState(saved.hapticsEnabled);
      if (saved && typeof saved.audioEnabled === "boolean") setAudioEnabledState(saved.audioEnabled);
      // Slice 65: normalize on load — a stored "both" from
      // Slice 58 migrates to "natural" here, and the save
      // effect below re-persists it in the two-mode model.
      const savedMode = saved ? normalizeVoiceInputMode(saved.voiceInputMode) : null;
      if (savedMode) setVoiceInputModeState(savedMode);
      if (saved && typeof saved.iconsAutoHide === "boolean") setIconsAutoHideState(saved.iconsAutoHide);
      if (saved && typeof saved.iconsAutoHideTimeoutSec === "number") setIconsAutoHideTimeoutSecState(saved.iconsAutoHideTimeoutSec);
      if (saved && typeof saved.iconsLockMode === "string") setIconsLockModeState(saved.iconsLockMode);
    });
  }, []);

  useEffect(() => {
    setJSON(STORAGE_KEY, {
      hapticsEnabled,
      audioEnabled,
      voiceInputMode,
      iconsAutoHide,
      iconsAutoHideTimeoutSec,
      iconsLockMode,
    });
  }, [hapticsEnabled, audioEnabled, voiceInputMode, iconsAutoHide, iconsAutoHideTimeoutSec, iconsLockMode]);

  // Slice 50: mirror the haptics switch into the ONE vibration
  // gate (src/sensory/vibration) that every felt touch passes
  // through. This context stays the preference's only writer;
  // the mirror is how the canvas — which lives outside this
  // provider's React tree reads — hears a flip the moment it
  // happens (and the stored value when it loads above).
  useEffect(() => {
    mirrorHapticsPreference(hapticsEnabled);
  }, [hapticsEnabled]);

  // Slice 58: the same mirror for the voice input mode — this
  // context stays the preference's only writer; the gate
  // (src/sensory/voiceMode) is how the compose bar, which
  // reads outside this provider's tree, hears a flip the
  // moment it happens.
  useEffect(() => {
    mirrorVoiceInputMode(voiceInputMode);
  }, [voiceInputMode]);

  const setHapticsEnabled = (v: boolean) => setHapticsEnabledState(v);
  const toggleHaptics = () => setHapticsEnabledState((prev) => !prev);

  const setAudioEnabled = (v: boolean) => setAudioEnabledState(v);
  const toggleAudio = () => setAudioEnabledState((prev) => !prev);

  const setVoiceInputMode = (m: VoiceInputMode) => setVoiceInputModeState(m);

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
      voiceInputMode,
      setVoiceInputMode,
      iconsAutoHide,
      setIconsAutoHide,
      iconsAutoHideTimeoutSec,
      setIconsAutoHideTimeoutSec,
      iconsLockMode,
      setIconsLockMode,
    }),
    [hapticsEnabled, audioEnabled, voiceInputMode, iconsAutoHide, iconsAutoHideTimeoutSec, iconsLockMode]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}