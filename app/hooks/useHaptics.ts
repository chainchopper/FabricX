import React from "react";
import * as Haptics from "expo-haptics";
import { usePreferences } from "../context/PreferencesContext";

export function useHaptics() {
  const { hapticsEnabled } = usePreferences();

  const maybe = <T extends (...args: any[]) => Promise<void>>(fn: T) => {
    return (...args: Parameters<T>) => {
      if (!hapticsEnabled) return Promise.resolve() as Promise<void>;
      return fn(...args);
    };
  };

  const impactLight = maybe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  const impactMedium = maybe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  const impactHeavy = maybe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

  const notifySuccess = maybe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  const notifyWarning = maybe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  const notifyError = maybe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

  return {
    impactLight,
    impactMedium,
    impactHeavy,
    notifySuccess,
    notifyWarning,
    notifyError,
  };
}