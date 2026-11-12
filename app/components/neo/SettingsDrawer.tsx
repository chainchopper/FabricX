import React from "react";
import { Animated, Pressable, Text, View, Platform, ScrollView } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { usePreferences } from "../../context/PreferencesContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import AISettingsDrawerButton from "./AISettingsDrawerButton";
import AIChatDrawerButton from "./AIChatDrawerButton";
import SeeFabricButton from "./SeeFabricButton";

export default function SettingsDrawer() {
  const { back, getAnim, open } = useNewDrawers();
  const { tx, width, parked } = getAnim("settings");
  const haptics = useHaptics();
  const audio = useAudioCues();

  const { 
    iconsAutoHide, 
    setIconsAutoHide, 
    iconsAutoHideTimeoutSec, 
    setIconsAutoHideTimeoutSec, 
    iconsLockMode, 
    setIconsLockMode,
    hapticsEnabled,
    setHapticsEnabled,
    audioEnabled,
    setAudioEnabled,
  } = usePreferences();

  const handleBack = () => {
    haptics.impactLight();
    audio.click();
    back();
  };

  return (
    <Animated.View
      pointerEvents={parked ? "none" : "box-none"}
      style={{
        position: "absolute",
        top: 0, bottom: 0, left: 0,
        width,
        transform: [{ translateX: tx }],
        display: parked ? "none" : "flex",
        zIndex: 200,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, width,
          backgroundColor: "rgba(6,10,22,0.96)",
          paddingTop: 56,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Pressable onPress={handleBack} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", marginRight: 8 }}>
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Settings</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 12 }}>Global preferences and configuration.</Text>

        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80, gap: 16 }}
        >
          {/* AI Services Quick Access */}
          <View>
            <Text style={{ color: "#e5e7eb", fontWeight: "700", marginBottom: 8, fontSize: 14 }}>
              AI Services
            </Text>
            <View style={{ gap: 8 }}>
              <AISettingsDrawerButton />
              <AIChatDrawerButton />
              <SeeFabricButton />
            </View>
          </View>

          {/* Audio & Vibration */}
          <View>
            <Text style={{ color: "#e5e7eb", fontWeight: "700", marginBottom: 8, fontSize: 14 }}>
              Audio & Vibration
            </Text>
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  setHapticsEnabled(!hapticsEnabled);
                  if (!hapticsEnabled) haptics.impactLight();
                }}
                style={{ 
                  borderWidth: 1, 
                  borderColor: hapticsEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.35)", 
                  borderRadius: 10, 
                  paddingVertical: 8, 
                  paddingHorizontal: 12 
                }}
              >
                <Text style={{ color: hapticsEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
                  Vibration: {hapticsEnabled ? "On" : "Off"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setAudioEnabled(!audioEnabled);
                  haptics.impactLight();
                }}
                style={{ 
                  borderWidth: 1, 
                  borderColor: audioEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.35)", 
                  borderRadius: 10, 
                  paddingVertical: 8, 
                  paddingHorizontal: 12 
                }}
              >
                <Text style={{ color: audioEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
                  Audio: {audioEnabled ? "On" : "Off"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Icon Behavior */}
          <View>
            <Text style={{ color: "#e5e7eb", fontWeight: "700", marginBottom: 8, fontSize: 14 }}>
              Menu Icon Behavior
            </Text>
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  setIconsAutoHide(!iconsAutoHide);
                  haptics.impactLight();
                  audio.click();
                }}
                style={{ 
                  borderWidth: 1, 
                  borderColor: iconsAutoHide ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.35)", 
                  borderRadius: 10, 
                  paddingVertical: 8, 
                  paddingHorizontal: 12 
                }}
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
                      onPress={() => {
                        setIconsAutoHideTimeoutSec(sec);
                        haptics.impactLight();
                        audio.click();
                      }}
                      style={{ 
                        borderWidth: 1, 
                        borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)", 
                        borderRadius: 10, 
                        paddingVertical: 6, 
                        paddingHorizontal: 10 
                      }}
                    >
                      <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                        {sec}s
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
                      onPress={() => {
                        setIconsLockMode(mode);
                        haptics.impactLight();
                        audio.click();
                      }}
                      style={{ 
                        flex: 1,
                        minWidth: 100,
                        borderWidth: 1, 
                        borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)", 
                        borderRadius: 10, 
                        paddingVertical: 6, 
                        paddingHorizontal: 10 
                      }}
                    >
                      <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700", fontSize: 11 }}>
                        {mode === "off" ? "Unlocked" : mode === "lock" ? "Lock" : "Lock + Autohide"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}