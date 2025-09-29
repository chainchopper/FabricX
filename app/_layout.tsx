import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";
import { LockerProvider, Locker } from "./components/Locker";
import { PreferencesProvider } from "./context/PreferencesContext";

export default function RootLayout() {
  return (
    <ToastProvider>
      <PreferencesProvider>
        <LayersProvider>
          <LockerProvider>
            <Stack screenOptions={{ headerShown: false }} />
            <Locker />
          </LockerProvider>
        </LayersProvider>
      </PreferencesProvider>
    </ToastProvider>
  );
}