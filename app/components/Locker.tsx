import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, View, Text, Image } from "react-native";
import { Link, usePathname } from "expo-router";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";

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

  const slide = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });
  const panelTranslate = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-320, 0],
  });

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

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

  const handleCopyInvite = () => {
    haptics.impactLight();
    toast.show("Open a layer to generate an invite");
    updateActivity();
  };

  return (
    <>
      {/* Corner Tab Trigger with Logo */}
      <Pressable
        onPress={toggleLocker}
        style={{
          position: "absolute",
          top: 16,
          left: 10,
          zIndex: 60,
          width: 58,
          height: 58,
          borderRadius: 14,
          backgroundColor: "rgba(2,8,23,0.65)",
          borderColor: "rgba(34,211,238,0.45)",
          borderWidth: 1,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#22d3ee",
          shadowOpacity: 0.55,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <Image
          source={require("../assets/IconLogo.png")}
          style={{
            width: 44,
            height: 44,
            resizeMode: "contain",
            opacity: 0.95,
          }}
        />
      </Pressable>

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

      {/* Drawer Panel */}
      <Animated.View
        onStartShouldSetResponder={() => true}
        onResponderGrant={updateActivity}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 300,
          transform: [{ translateX: panelTranslate }],
          zIndex: 56,
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
            source={require("../assets/IconLogo.png")}
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
          onPress={handleCopyInvite}
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
            Open a layer, then use the room’s Invite for copy link
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        {/* Footer */}
        <View style={{ paddingVertical: 10, alignItems: "center" }}>
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            © 2024 Fanalogy • Powered by Nirvana
          </Text>
        </View>
      </Animated.View>
    </>
  );
}