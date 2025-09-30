export type DrawerEvent = "fabric:close-locker" | "fabric:close-user-drawer";

function emit(name: DrawerEvent) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name));
  }
}

export const drawerEvents = {
  emitCloseLocker: () => emit("fabric:close-locker"),
  emitCloseUserDrawer: () => emit("fabric:close-user-drawer"),
  on: (name: DrawerEvent, handler: () => void) => {
    if (typeof window === "undefined") return () => {};
    const wrapped = () => handler();
    window.addEventListener(name, wrapped as EventListener);
    return () => window.removeEventListener(name, wrapped as EventListener);
  },
};