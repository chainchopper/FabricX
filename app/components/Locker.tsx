import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, View, Text, Image } from "react-native";
import { Link, usePathname } from "expo-router";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { usePreferences } from "../context/PreferencesContext";

type LockerContextValue = {
  open: boolean;
  openLocker: () => void;
  closeLocker: () => void;
  toggleLocker: () => void;
  updateActivity: () => void;
};

const LockerContext = createContext<LockerContextValue | null>(null);

export function useLocker() {
  const ctx = useContext(LockerContext);
  if (!ctx) throw new Error("useLocker must be used within LockerProvider");
  return ctx;
}

export function LockerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<boolean>(false);
  const inactivityRef = useRef<NodeJS.Timeout | null>(null);
  const haptics = useHaptics();

  const clearTimer = () => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = null;
  };

  const updateActivity = useCallback(() => {
    clearTimer();
    inactivityRef.current = setTimeout(() => {
      setOpen(false);
      haptics.impactLight();
    }, 6000);
  }, [haptics]);

  const openLocker = useCallback(() => {
    setOpen(true);
    haptics.impactMedium();
    updateActivity();
  }, [haptics, updateActivity]);

  const closeLocker = useCallback(() => {
    clearTimer();
    setOpen(false);
    haptics.impactLight();
  }, [haptics]);

  const toggleLocker = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        haptics.impactMedium();
        updateActivity();
      } else {
        clearTimer();
        haptics.impactLight();
      }
      return next;
    });
  }, [haptics, updateActivity]);

  const value = useMemo(
    () => ({ open, openLocker, closeLocker, toggleLocker, updateActivity }),
    [open, openLocker, closeLocker, toggleLocker, updateActivity]
  );

  return <LockerContext.Provider value={value}>{children}</LockerContext.Provider>;
}

export function Locker() {
  const { open, toggleLocker, closeLocker, updateActivity } = useLocker();
  const pathname = usePathname();
  const haptics = useHaptics();
  const toast = useToast();
  const { hapticsEnabled, toggleHaptics } = usePreferences();

  const slide = useRef(new Animated.Value(0)).current; // 0 closed, 1 open

  const PANEL_WIDTH = 300;
  const TAB_SIZE = 58;

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-PANEL_WIDTH, 0], // leave just the tab visible when closed
  });

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  // Close on route change
  useEffect(() => {
    if (open) closeLocker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const NavItem = ({ href, label, hint }: { href: string; label: string; hint?: string }) => (
    <Link href={href} asChild>
      <Pressable
        onPress={updateActivity}
        style={{
          backgroundColor: "rgba(2,8,23,0.6)",
          borderColor: "rgba(34,211,238,0.3)",
          borderWidth: 1,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
          marginBottom: 10,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text style={{ color: "white", fontWeight: "800", fontSize: 16 }}>{label}</Text>
        {hint ? <Text style={{ color: "#9ca3af", marginTop: 2 }}>{hint}</Text> : null}
      </Pressable>
    </Link>
  );

  const Divider = () => (
    <View
      style={{
        height: 1,
        backgroundColor: "rgba(148,163,184,0.25)",
        marginVertical: 8,
      }}
    />
  );

  const getActiveLayerId = () => {
    const m = pathname?.match(/^\/fabric\/([^\/?#]+)/);
    return m?.[1] ?? null;
  };

  const handleCopyInvite = async () => {
    const layerId = getActiveLayerId();
    if (layerId) {
      const url = Linking.createURL(`/fabric/${layerId}`);
      await Clipboard.setStringAsync(url);
      haptics.notifySuccess();
      toast.show("Invite link copied");
      updateActivity();
      return;
    }
    haptics.impactLight();
    toast.show("Open a layer to generate an invite");
    updateActivity();
  };

  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <>
      {/* Backdrop */}
      {open ? (
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "black",
            opacity: backdropOpacity,
            zIndex: 55,
          }}
        >
          <Pressable
            onPress={() => {
              haptics.impactLight();
              closeLocker();
            }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}

      {/* Drawer + Attached Tab (both slide together) */}
      <Animated.View
        onStartShouldSetResponder={() => true}
        onResponderGrant={updateActivity}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: PANEL_WIDTH + TAB_SIZE,
          transform: [{ translateX }],
          zIndex: 56,
        }}
      >
        {/* Drawer Panel */}
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: PANEL_WIDTH,
            paddingTop: 18,
            paddingHorizontal: 14,
            backgroundColor: "rgba(15,23,42,0.82)",
            borderRightColor: "rgba(34,211,238,0.35)",
            borderRightWidth: 1,
            shadowColor: "#22d3ee",
            shadowOpacity: 0.3,
            shadowRadius: 14,
            shadowOffset: { width: 6, height: 0 },
          }}
        >
          {/* Header with inline logo */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Image
              source={require("../../logo.png")}
              style={{ width: 28, height: 28, borderRadius: 6 }}
            />
            <View>
              <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Fabric</Text>
              <Text style={{ color: "#93c5fd", fontSize: 12 }}>Powered by Nirvana</Text>
            </View>
          </View>

          <Divider />

          {/* Primary Navigation */}
          <NavItem href="/" label="Home" hint="Return to the hero" />
          <NavItem href="/dashboard" label="Dashboard" hint="Recent layers and actions" />
          <NavItem href="/fabric/new" label="New Layer" hint="Start weaving a new space" />
          <NavItem href="/plugins" label="Plugins" hint="Discover and manage Looms" />
          <NavItem href="/profile" label="Profile" hint="Identity and preferences" />

          <Divider />

          {/* Quick Actions */}
          <Pressable
            onPress={() => void handleCopyInvite()}
            style={{
              backgroundColor: "rgba(2,132,199,0.1)",
              borderColor: "rgba(34,211,238,0.35)",
              borderWidth: 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 10,
              marginTop: 6,
            }}
          >
            <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Invite to Current Layer</Text>
            <Text style={{ color: "#94a3b8", marginTop: 2, fontSize: 12 }}>
              Copies a deep link if you’re inside a layer
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              toggleHaptics();
              haptics.impactLight();
              toast.show(`Haptics ${hapticsEnabled ? "off" : "on"}`);
              updateActivity();
            }}
            style={{
              marginTop: 10,
              backgroundColor: hapticsEnabled ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              borderColor: hapticsEnabled ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)",
              borderWidth: 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: hapticsEnabled ? "#34d399" : "#ef4444", fontWeight: "700" }}>
              Haptics {hapticsEnabled ? "On" : "Off"}
            </Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          {/* Footer */}
          <View style={{ paddingVertical: 10, alignItems: "center" }}>
            <Text style={{ color: "#9ca3af", fontSize: 12 }}>
              © 2024 Fanalogy • Powered by Nirvana
            </Text>
          </View>
        </View>

        {/* Attached Corner Tab (logo) - bottom-left */}
        <Pressable
          onPress={toggleLocker}
          style={{
            position: "absolute",
            bottom: 16,
            left: PANEL_WIDTH,
            width: TAB_SIZE,
            height: TAB_SIZE,
            borderTopRightRadius: 14,
            borderBottomRightRadius: 14,
            backgroundColor: "rgba(2,8,23,0.65)",
            borderColor: "rgba(34,211,238,0.45)",
            borderLeftWidth: 0,
            borderRightWidth: 1,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#22d3ee",
            shadowOpacity: 0.55,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <Image
            source={require("../../logo.png")}
            style={{
              width: 44,
              height: 44,
              resizeMode: "contain",
              opacity: 0.95,
            }}
          />
        </Pressable>
      </Animated.View>
    </>
  );
}