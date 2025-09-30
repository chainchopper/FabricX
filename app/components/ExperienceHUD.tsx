import React from "react";
import { Platform, View, Text } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useAR } from "../context/ARContext";

export default function ExperienceHUD() {
  if (Platform.OS !== "web") return null;
  const { state } = useExperience();
  const { activeExperience } = state;
  const { isARCameraActive } = useAR();

  if (!activeExperience) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 60,
        backgroundColor: "rgba(2,8,23,0.6)",
        borderColor: "rgba(34,211,238,0.45)",
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: "#e5e7eb", fontWeight: "800" }}>
        {activeExperience.name}
      </Text>
      <Text style={{ color: "#93c5fd", fontSize: 11 }}>{activeExperience.type}</Text>
      {isARCameraActive ? (
        <Text style={{ color: "#34d399", fontSize: 11, marginTop: 2 }}>AR On</Text>
      ) : null}
    </View>
  );
}