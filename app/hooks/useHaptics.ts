import * as Haptics from "expo-haptics";

export function useHaptics() {
  const impactLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const impactMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const impactHeavy = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

  const notifySuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const notifyWarning = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  const notifyError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

  return {
    impactLight,
    impactMedium,
    impactHeavy,
    notifySuccess,
    notifyWarning,
    notifyError,
  };
}