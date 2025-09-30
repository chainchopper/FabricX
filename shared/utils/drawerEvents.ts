import { Platform } from "react-native";

export type DrawerEvent = "fabric:close-locker" | "fabric:close-user-drawer";

function isWeb() {
  return Platform.OS === "web" && typeof window !== "undefined";
}

function emit(name: DrawerEvent) {
  if (isWeb()) {
    window.dispatchEvent(new CustomEvent(name));
  }
}

export const drawerEvents = {
  emitCloseLocker: () => emit("fabric:close-locker"),
  emitCloseUserDrawer: () => emit("fabric:close-user-drawer"),
  on: (name: DrawerEvent, handler: () => void) => {
    if (!isWeb()) return () => {};
    const wrapped = () => handler();
    window.addEventListener(name, wrapped as EventListener);
    return () => window.removeEventListener(name, wrapped as EventListener);
  },
};