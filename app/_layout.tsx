import { Stack } from "expo-router";
import { ToastProvider } from "./components/Toast";
import { LayersProvider } from "./context/LayersContext";
import { LockerProvider, Locker } from "./components/Locker";

export default function RootLayout() {
  return (
    <ToastProvider>
      <LayersProvider>
        <LockerProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <Locker />
        </LockerProvider>
      </LayersProvider>
    </ToastProvider>
  );
}