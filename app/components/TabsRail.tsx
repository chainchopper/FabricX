import React, { useEffect, useRef } from "react";
import { Animated, View , Platform } from "react-native";
import ProfileTab from "./ProfileTab";
import LockerTab from "./LockerTab";
import { useLocker } from "./Locker";
import { useUserDrawer } from "./UserDrawer";

const DRAWER_WIDTH = 360;

export default function TabsRail() {
  const { open: lockerOpen } = useLocker();
  const { open: userOpen } = useUserDrawer();
  const tx = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shouldOpen = lockerOpen || userOpen;
    Animated.timing(tx, {
      toValue: shouldOpen ? DRAWER_WIDTH : 0,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [lockerOpen, userOpen, tx]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60, // above drawers so tabs always accessible
        transform: [{ translateX: tx }],
      }}
    >
      {/* Edge tabs, stacked left */}
      <ProfileTab />
      <LockerTab />
    </Animated.View>
  );
}