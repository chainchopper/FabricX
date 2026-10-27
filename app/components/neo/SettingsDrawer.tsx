import React from "react";
import { Animated, Pressable, Text, View, Platform, ScrollView } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { usePreferences } from "../../context/PreferencesContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import AISettingsDrawerButton from "./AISettingsDrawerButton";
import AIChatDrawerButton from "./AIChatDrawerButton";
import VisionAIDrawerButton from "./VisionAIDrawerButton";
import SheetHeader from "./SheetHeader";
import { colors, hit, type } from "../../../src/theme/tokens";

export default function SettingsDrawer() {
  const { back, closeAll, getAnim, open } = useNewDrawers();
  const { tx, width } = getAnim("settings");
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
          backgroundColor: colors.sheet,
          borderRightColor: colors.line,
          borderRightWidth: 1,
          paddingTop: 56,
          paddingHorizontal: 16,
        }}
      >
        <SheetHeader
          title="Settings"
          subtitle="Global preferences and configuration."
          onBack={handleBack}
          onClose={closeAll}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80, gap: 16 }}
        >
          {/* AI — services */}
          <View>
            <Text style={{ color: colors.text, fontWeight: type.semibold, marginBottom: 8, fontSize: type.body }}>
              AI — Services
            </Text>
            <View style={{ gap: 8 }}>
              <AISettingsDrawerButton />
              <AIChatDrawerButton />
              <VisionAIDrawerButton />
            </View>
          </View>

          {/* Feel — haptics & audio */}
          <View>
            <Text style={{ color: colors.text, fontWeight: type.semibold, marginBottom: 8, fontSize: type.body }}>
              Feel — Haptics & Audio
            </Text>
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  setHapticsEnabled(!hapticsEnabled);
                  if (!hapticsEnabled) haptics.impactLight();
                }}
                style={{
                  borderWidth: 1,
                  borderColor: hapticsEnabled ? colors.accent : colors.line,
                  borderRadius: 10,
                  minHeight: hit,
                  justifyContent: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 12
                }}
              >
                <Text style={{ color: hapticsEnabled ? colors.accent : colors.text, fontWeight: type.semibold }}>
                  Haptics: {hapticsEnabled ? "On" : "Off"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setAudioEnabled(!audioEnabled);
                  haptics.impactLight();
                }}
                style={{
                  borderWidth: 1,
                  borderColor: audioEnabled ? colors.accent : colors.line,
                  borderRadius: 10,
                  minHeight: hit,
                  justifyContent: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 12
                }}
              >
                <Text style={{ color: audioEnabled ? colors.accent : colors.text, fontWeight: type.semibold }}>
                  Audio Cues: {audioEnabled ? "On" : "Off"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Icon Behavior (drives the retired edge rail's slide state;
              kept for compatibility — see Slice 3 PR notes) */}
          <View>
            <Text style={{ color: colors.text, fontWeight: type.semibold, marginBottom: 8, fontSize: type.body }}>
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
                  borderColor: iconsAutoHide ? colors.accent : colors.line,
                  borderRadius: 10,
                  minHeight: hit,
                  justifyContent: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 12
                }}
              >
                <Text style={{ color: iconsAutoHide ? colors.accent : colors.text, fontWeight: type.semibold }}>
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
          <Text style={{ color: colors.textDim, fontSize: type.caption }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}
