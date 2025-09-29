import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";

export default function RootLayout() {
  return (
    <ToastProvider>
      <LayersProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </LayersProvider>
    </ToastProvider>
  );
}