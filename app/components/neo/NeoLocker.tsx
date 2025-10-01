import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useNeoLocker } from "./NeoLockerContext";
import ExperienceSwitch from "../ExperienceSwitch";
import ExperienceControls from "../ExperienceControls";
import { useOverlays } from "../../context/OverlayContext";
import { useExperience } from "../../context/ExperienceContext";
import * as Clipboard from "expo-clipboard";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";
import { buildInviteUrl } from "../../utils/invite";

const WIDTH = 380;

export default function NeoLocker() {
  const { open, closeLocker } = useNeoLocker();
  const { open: openOverlay } = useOverlays();
  const { state } = useExperience();
  const haptics = useHaptics();
  const toast = useToast();

  const tx = useRef(new Animated.Value(WIDTH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(tx, { toValue: WIDTH, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [open, tx, backdrop]);

  const openAndFocus = (type: Parameters<typeof openOverlay>[0]) => openOverlay(type);

  const copyInvite = async () => {
    const expId = state.activeExperience?.id;
    const roomId = String(((state.experienceConfig.specific as any)?.roomId as string) || "main");
    const url = buildInviteUrl(roomId, expId);
    await Clipboard.setStringAsync(url);
    haptics.notifySuccess();
    toast.show("Invite link copied");
  };

  return (
    <>
      {open ? (
        <Animated.View
          style={{ position: "absolute", inset: 0 as unknown as number, backgroundColor: "rgba(0,0,0,0.5)", opacity: backdrop, zIndex: 78 }}
        >
          <Pressable style={{ flex: 1 }} onPress={closeLocker} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: WIDTH, transform: [{ translateX: tx }], zIndex: 79 }}
        pointerEvents="box-none"
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: WIDTH,
            backgroundColor: "rgba(10,14,28,0.96)",
            borderLeftColor: "rgba(34,211,238,0.35)",
            borderLeftWidth: 1,
            paddingTop: 54,
            paddingHorizontal: 16,
            shadowColor: "#22d3ee",
            shadowOpacity: 0.4,
            shadowRadius: 18,
            shadowOffset: { width: -6, height: 0 },
          }}
        >
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18, marginBottom: 12 }}>Neo Locker</Text>
          <Text style={{ color: "#93c5fd", marginBottom: 12 }}>Modern panel • Independent controls</Text>

          <View style={{ gap: 8, marginBottom: 12 }}>
            <Pressable onPress={() => openAndFocus("dashboard")} style={styles.action}><Text style={styles.actionText}>Dashboard</Text></Pressable>
            <Pressable onPress={() => openAndFocus("plugins")} style={styles.action}><Text style={styles.actionText}>Plugins</Text></Pressable>
            <Pressable onPress={() => openAndFocus("profile")} style={styles.action}><Text style={styles.actionText}>Profile</Text></Pressable>
            <Pressable onPress={() => openAndFocus("studio")} style={styles.action}><Text style={styles.actionText}>Studio</Text></Pressable>
            <Pressable onPress={() => openAndFocus("diagnostics")} style={styles.action}><Text style={styles.actionText}>Diagnostics</Text></Pressable>
            <Pressable onPress={() => openAndFocus("credits")} style={styles.action}><Text style={styles.actionText}>Credits</Text></Pressable>
            <Pressable onPress={() => void copyInvite()} style={styles.actionAlt}><Text style={styles.actionTextAlt}>Copy Invite</Text></Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <ExperienceSwitch />
            <ExperienceControls />
          </View>

          <View style={{ position: "absolute", bottom: 12, left: 16 }}>
            <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
          </View>
        </View>
      </Animated.View>
    </>
  );
}

const styles = {
  action: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.45)",
    backgroundColor: "rgba(2,8,23,0.6)",
  },
  actionText: { color: "#e5e7eb", fontWeight: "700" as const },
  actionAlt: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.6)",
    backgroundColor: "rgba(2,132,199,0.18)",
  },
  actionTextAlt: { color: "#22d3ee", fontWeight: "700" as const },
};