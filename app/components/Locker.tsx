import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, View, Text, Image, ScrollView, BackHandler } from "react-native";
import { usePathname, router } from "expo-router";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { usePreferences } from "../context/PreferencesContext";
import { useLayers, Layer } from "../context/LayersContext";
import CreditsOverlay from "./CreditsOverlay";
import { useAudioCues } from "../hooks/useAudioCues";
import QuickCreateLayer from "./QuickCreateLayer";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getJSON, setJSON } from "../utils/storage";
import { confirmAction } from "../utils/confirm";
import ExperienceSwitch from "./ExperienceSwitch";
import ExperienceControls from "./ExperienceControls";
import { drawerEvents } from "../utils/drawerEvents";

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
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    drawerEvents.emitCloseUserDrawer();
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
        drawerEvents.emitCloseUserDrawer();
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
  const { open, toggleLocker, closeLocker, updateActivity, openLocker } = useLocker();
  const pathname = usePathname();
  const haptics = useHaptics();
  const toast = useToast();
  const { hapticsEnabled, toggleHaptics, audioEnabled, toggleAudio } = usePreferences();
  const { layers, removeLayer, addLayer, clear } = useLayers();
  const [creditsOpen, setCreditsOpen] = useState(false);
  const audio = useAudioCues();
  const insets = useSafeAreaInsets();

  const HINT_KEY = "fabric_locker_hint_seen_v1";
  const [hintSeen, setHintSeen] = useState<boolean>(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    getJSON<boolean>(HINT_KEY, false).then((v) => setHintSeen(!!v));
  }, []);

  const startPulse = () => {
    if (pulseLoop.current) return;
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseLoop.current = null;
    pulse.setValue(0);
  };

  useEffect(() => {
    if (!open && !hintSeen) {
      startPulse();
    } else {
      stopPulse();
    }
    return () => {
      stopPulse();
    };
  }, [open, hintSeen]);

  const markHintSeen = () => {
    if (!hintSeen) {
      setHintSeen(true);
      void setJSON(HINT_KEY, true);
      stopPulse();
    }
  };

  useEffect(() => {
    if (open) markHintSeen();
  }, [open]);

  // Listen for external close signal from UserDrawer
  useEffect(() => {
    return drawerEvents.on("fabric:close-locker", () => {
      closeLocker();
    });
  }, [closeLocker]);

  const slide = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const PANEL_WIDTH = 300;

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-PANEL_WIDTH, 0],
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

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      haptics.impactLight();
      audio.click();
      closeLocker();
      return true;
    });
    return () => sub.remove();
  }, [open, closeLocker, haptics, audio]);

  const Divider = () => (
    <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 8 }} />
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
      audio.success();
      toast.show("Invite link copied");
      updateActivity();
      return;
    }
    haptics.impactLight();
    audio.click();
    toast.show("Open a layer to generate an invite");
    updateActivity();
  };

  const handleCopyInviteFor = async (layerId: string, name?: string) => {
    const url = Linking.createURL(`/fabric/${layerId}`);
    await Clipboard.setStringAsync(url);
    haptics.notifySuccess();
    audio.success();
    toast.show(`${name ?? "Layer"} invite copied`);
    updateActivity();
  };

  const enterLayer = async (id: string, name?: string) => {
    const ok = await confirmAction(
      "Switch Fabric experience?",
      "This may unload the current canvas and affect connected viewers."
    );
    if (!ok) return;
    router.replace(`/fabric/${id}`);
    toast.show(`Entering ${name ?? id}`);
  };

  const handleRemoveLayer = (id: string, name?: string) => {
    removeLayer(id);
    haptics.impactLight();
    toast.show(`Removed ${name ?? id}`);
  };

  const handleClearRecents = () => {
    clear();
    haptics.notifyWarning();
    toast.show("Recent layers cleared");
  };

  const recent = layers.slice(0, 5);
  const activeLayerId = getActiveLayerId();
  const isInLayer = !!activeLayerId;

  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });

  return (
    <>
      {/* Top-left CTA for Locker (stacked below AvatarButton) */}
      {!open ? (
        <Pressable
          onPress={() => {
            markHintSeen();
            audio.click();
            openLocker();
          }}
          style={{
            position: "absolute",
            top: 64,
            left: 12,
            width: 44,
            height: 44,
            zIndex: 56,
            backgroundColor: "rgba(2,8,23,0.65)",
            borderColor: "rgba(34,211,238,0.45)",
            borderWidth: 1,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#22d3ee",
            shadowOpacity: 0.4,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Image source={require("../../logo.png")} style={{ width: 26, height: 26, borderRadius: 6, opacity: 0.95 }} />
        </Pressable>
      ) : null}

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
              audio.click();
              closeLocker();
            }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}

      <Animated.View
        onStartShouldSetResponder={() => true}
        onResponderGrant={updateActivity}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 300 + 58,
          transform: [{ translateX }],
          zIndex: 56,
        }}
      >
        <SafeAreaView
          edges={["top", "bottom"]}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: 300,
            paddingTop: 12,
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
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Image source={require("../../logo.png")} style={{ width: 44, height: 44, borderRadius: 8 }} />
              <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Fabric</Text>
              <Text style={{ color: "#93c5fd", fontSize: 12 }}>Fanalogy</Text>
              <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
            </View>

            {/* Fabric-only controls */}
            <Text style={{ color: "white", fontWeight: "800", marginBottom: 6 }}>Experiences</Text>
            <ExperienceSwitch />
            <View style={{ marginTop: 10 }}>
              <ExperienceControls />
            </View>

            <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 8 }} />

            <QuickCreateLayer />

            <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 8 }} />

            {/* Active/Invite Controls */}
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={handleCopyInvite}
                style={{
                  backgroundColor: "rgba(2,132,199,0.18)",
                  borderColor: "rgba(34,211,238,0.6)",
                  borderWidth: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                  Copy Active Invite
                </Text>
              </Pressable>

              {/* Toggles */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => {
                    toggleHaptics();
                    updateActivity();
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(2,8,23,0.6)",
                    borderColor: hapticsEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
                    borderWidth: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: hapticsEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
                    Haptics: {hapticsEnabled ? "On" : "Off"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    toggleAudio();
                    updateActivity();
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(2,8,23,0.6)",
                    borderColor: audioEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
                    borderWidth: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: audioEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
                    Audio: {audioEnabled ? "On" : "Off"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 8 }} />

            {/* Recent Layers */}
            <Text style={{ color: "white", fontWeight: "800", marginBottom: 6 }}>Recent Layers</Text>
            <View style={{ gap: 10 }}>
              {recent.length === 0 ? (
                <Text style={{ color: "#9ca3af" }}>No recent layers yet.</Text>
              ) : (
                recent.map((l: Layer) => (
                  <View
                    key={l.id}
                    style={{
                      backgroundColor: "rgba(2,8,23,0.6)",
                      borderColor: "rgba(148,163,184,0.35)",
                      borderWidth: 1,
                      borderRadius: 10,
                      padding: 10,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: "white", fontWeight: "700" }}>{l.name}</Text>
                        <Text style={{ color: "#9ca3af", fontSize: 12 }} numberOfLines={1}>
                          {l.id}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => void enterLayer(l.id, l.name)}
                        style={{
                          borderColor: "#22d3ee",
                          borderWidth: 1,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Open</Text>
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => handleCopyInviteFor(l.id, l.name)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "rgba(34,211,238,0.6)",
                        }}
                      >
                        <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Invite</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleRemoveLayer(l.id, l.name)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "rgba(239,68,68,0.7)",
                        }}
                      >
                        <Text style={{ color: "#ef4444", fontWeight: "700" }}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 8 }} />

            {/* Credits */}
            <Pressable
              onPress={() => setCreditsOpen(true)}
              style={{
                backgroundColor: "rgba(2,8,23,0.6)",
                borderColor: "rgba(34,211,238,0.35)",
                borderWidth: 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Credits</Text>
              <Animated.View
                style={{
                  marginTop: 6,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "rgba(34,211,238,0.25)",
                  transform: [{ scale: pulseScale }],
                  opacity: pulseOpacity,
                }}
              />
            </Pressable>
          </ScrollView>
        </SafeAreaView>

        {/* Drawer edge toggle when open (kept near top-left edge) */}
        <Pressable
          onPress={() => {
            markHintSeen();
            audio.click();
            toggleLocker();
          }}
          style={{
            position: "absolute",
            top: 16 + insets.top,
            left: 300,
            width: 58,
            height: 58,
            borderTopRightRadius: 14,
            borderBottomRightRadius: 14,
            backgroundColor: isInLayer ? "rgba(2,132,199,0.22)" : "rgba(2,8,23,0.65)",
            borderColor: isInLayer ? "rgba(34,211,238,0.85)" : "rgba(34,211,238,0.45)",
            borderLeftWidth: 0,
            borderRightWidth: 1,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#22d3ee",
            shadowOpacity: 0.6,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <Image source={require("../../logo.png")} style={{ width: 44, height: 44, resizeMode: "contain", opacity: 0.95 }} />
        </Pressable>
      </Animated.View>

      <CreditsOverlay visible={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </>
  );
}