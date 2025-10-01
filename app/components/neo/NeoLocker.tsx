import React from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import ExperienceSwitch from "../ExperienceSwitch";
import ExperienceControls from "../ExperienceControls";

export default function NeoLocker() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("neo");

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
          paddingHorizontal: 16,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 8, height: 0 },
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Pressable
            onPress={() => back()}
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
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Neo Locker</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 12 }}>
          Modern panel • Independent controls
        </Text>

        <View style={{ gap: 10 }}>
          <ExperienceSwitch />
          <ExperienceControls />
        </View>

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}