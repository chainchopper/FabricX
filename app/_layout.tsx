import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";

export default function RootLayout() {
  return (
    <ToastProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ToastProvider>
  );
}