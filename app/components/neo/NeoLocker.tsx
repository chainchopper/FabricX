import React, { useState } from "react";
import { Animated, Pressable, Text, View, ScrollView } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
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
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("neo");
  const haptics = useHaptics();
  const audio = useAudioCues();
  const [activeTab, setActiveTab] = useState<"controls" | "social" | "swarm">("controls");

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
          backgroundColor: "rgba(10,14,28,0.96)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 8, height: 0 },
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, paddingHorizontal: 16 }}>
          <Pressable
            onPress={handleBackPress}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Fabric Menu</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 16, paddingHorizontal: 16 }}>
          Video game-inspired controls
        </Text>

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
                borderColor: activeTab === tab ? "rgba(34,211,238,0.8)" : "rgba(148,163,184,0.25)",
                backgroundColor: activeTab === tab ? "rgba(34,211,238,0.15)" : "transparent",
              }}
            >
              <Text
                style={{
                  color: activeTab === tab ? "#22d3ee" : "#9ca3af",
                  fontWeight: activeTab === tab ? "700" : "600",
                  textAlign: "center",
                  fontSize: 13,
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
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                  gap: 12,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>Quick Controls</Text>
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
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}