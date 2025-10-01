import React, { createContext, useContext, useMemo } from "react";
import { useLocker } from "./Locker";
import { useUserDrawer } from "./UserDrawer";
import { useOverlays } from "../context/OverlayContext";
import { drawerEvents } from "../../shared/utils/drawerEvents";

type MenuControllerValue = {
  toggleProfile: () => void;
  toggleLocker: () => void;
  openOverlay: (type: Parameters<ReturnType<typeof useOverlays>["open"]>[0]) => void;
};

const MenuControllerContext = createContext<MenuControllerValue | null>(null);

export function MenuControllerProvider({ children }: { children: React.ReactNode }) {
  const { open: lockerOpen, openLocker, closeLocker } = useLocker();
  const { open: userOpen, openDrawer, closeDrawer } = useUserDrawer();
  const { open: openOverlay } = useOverlays();

  const value = useMemo<MenuControllerValue>(() => {
    return {
      toggleProfile() {
        if (userOpen) {
          closeDrawer();
        } else {
          drawerEvents.emitCloseLocker();
          openDrawer();
        }
      },
      toggleLocker() {
        if (lockerOpen) {
          closeLocker();
        } else {
          drawerEvents.emitCloseUserDrawer();
          openLocker();
        }
      },
      openOverlay(type) {
        // Do NOT close locker automatically; tabs rail stays pushed while open.
        openOverlay(type);
      },
    };
  }, [userOpen, lockerOpen, openDrawer, closeDrawer, openLocker, closeLocker, openOverlay]);

  return <MenuControllerContext.Provider value={value}>{children}</MenuControllerContext.Provider>;
}

export function useMenuController() {
  const ctx = useContext(MenuControllerContext);
  if (!ctx) throw new Error("useMenuController must be used within MenuControllerProvider");
  return ctx;
}