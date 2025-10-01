import React from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { usePreferences } from "../../context/PreferencesContext";

export default function SettingsDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("settings");

  const { iconsAutoHide, setIconsAutoHide, iconsAutoHideTimeoutSec, setIconsAutoHideTimeoutSec, iconsLockMode, setIconsLockMode } = usePreferences();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0, bottom: 0, left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 200,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, width,
          backgroundColor: "rgba(6,10,22,0.96)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Pressable onPress={() => back()} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", marginRight: 8 }}>
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Settings</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 12 }}>Global preferences for menu icons.</Text>

        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => setIconsAutoHide(!iconsAutoHide)}
            style={{ borderWidth: 1, borderColor: iconsAutoHide ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.35)", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}
          >
            <Text style={{ color: iconsAutoHide ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
              Auto-hide Icons: {iconsAutoHide ? "On" : "Off"}
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[3, 6, 10, 15, 30].map((sec) => {
              const active = iconsAutoHideTimeoutSec === sec;
              return (
                <Pressable
                  key={sec}
                  onPress={() => setIconsAutoHideTimeoutSec(sec)}
                  style={{ borderWidth: 1, borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                    Timeout: {sec}s
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["off", "lock", "lock_autohide"] as const).map((mode) => {
              const active = iconsLockMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setIconsLockMode(mode)}
                  style={{ borderWidth: 1, borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                    {mode === "off" ? "Unlocked" : mode === "lock" ? "Lock (no autohide)" : "Lock + Autohide (double-tap unlock)"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}