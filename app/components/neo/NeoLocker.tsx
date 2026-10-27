import React, { useEffect, useState } from "react";
import { Animated, Pressable, Text, View, ScrollView, Platform } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import SheetHeader from "./SheetHeader";
import { FABRIC_NEO_TAB_EVENT } from "./MenuSheet";
import { colors, radius, type } from "../../../src/theme/tokens";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import ExperienceSwitch from "../ExperienceSwitch";
// Keep full ExperienceControls for advanced options
import ExperienceControls from "../ExperienceControls";

// Modular quick-controls
import AmbienceControls from "../controls/AmbienceControls";
import MusicControls from "../controls/MusicControls";
import BackgroundControls from "../controls/BackgroundControls";
import AudioVolumeControls from "../controls/AudioVolumeControls";
import ParticleDensityControls from "../controls/ParticleDensityControls";
import FluidQualityControls from "../controls/FluidQualityControls";

// New feature drawers
import SwarmControlDrawer from "./SwarmControlDrawer";
import SocialFeedDrawer from "./SocialFeedDrawer";

export default function NeoLocker() {
  const { back, closeAll, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("neo");
  const haptics = useHaptics();
  const audio = useAudioCues();
  const [activeTab, setActiveTab] = useState<"controls" | "social" | "swarm">("controls");

  // Slice 3: the MenuSheet routes Experiences/Swarm here — it names
  // the tab, this drawer lands on it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onTab = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (t === "controls" || t === "social" || t === "swarm") setActiveTab(t);
    };
    window.addEventListener(FABRIC_NEO_TAB_EVENT, onTab);
    return () => window.removeEventListener(FABRIC_NEO_TAB_EVENT, onTab);
  }, []);

  const handleTabChange = (tab: typeof activeTab) => {
    haptics.impactLight();
    audio.click();
    setActiveTab(tab);
  };

  const handleBackPress = () => {
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
          shadowColor: "#000000",
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 8, height: 0 },
        }}
      >
        {/* Header — the shared Slice 3 sheet pattern */}
        <View style={{ paddingHorizontal: 16 }}>
          <SheetHeader
            title="Fabric Menu"
            subtitle="Video game-inspired controls"
            onBack={handleBackPress}
            onClose={closeAll}
          />
        </View>

        {/* Tab Navigation */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          {(["controls", "social", "swarm"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: activeTab === tab ? colors.accent : colors.line,
                backgroundColor: activeTab === tab ? colors.accentDim : "transparent",
              }}
            >
              <Text
                style={{
                  color: activeTab === tab ? colors.accent : colors.textDim,
                  fontWeight: activeTab === tab ? type.semibold : type.regular,
                  textAlign: "center",
                  fontSize: type.body,
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content Area */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
          {activeTab === "controls" && (
            <View style={{ gap: 12 }}>
              {/* Experience selection */}
              <ExperienceSwitch />

              {/* Quick Controls section */}
              <View
                style={{
                  marginTop: 6,
                  padding: 12,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  gap: 12,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: type.semibold, fontSize: type.label }}>Quick Controls</Text>
                <BackgroundControls />
                <AudioVolumeControls />
                <ParticleDensityControls />
                <FluidQualityControls />
                <AmbienceControls />
                <MusicControls />
              </View>

              {/* Advanced controls */}
              <ExperienceControls />
            </View>
          )}

          {activeTab === "social" && <SocialFeedDrawer />}

          {activeTab === "swarm" && <SwarmControlDrawer />}
        </ScrollView>

        {/* Footer */}
        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: colors.textDim, fontSize: type.caption }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}