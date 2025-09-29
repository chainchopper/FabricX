import { Alert, Platform } from "react-native";

export async function confirmAction(title: string, message?: string): Promise<boolean> {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    return window.confirm(message ? `${title}\n\n${message}` : title);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Proceed", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true }
    );
  });
}