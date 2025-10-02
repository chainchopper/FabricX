import React from "react";
import { Platform, View, Text } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useAR } from "../context/ARContext";
import { useMIDI } from "../../src/hooks/useMIDI";

export default function ExperienceHUD() {
  if (Platform.OS !== "web") return null;

  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { isARCameraActive } = useAR();

  if (!activeExperience) return null;

  // Always call hooks (web-only component)
  const midi = useMIDI();
  const midiEnabled = Boolean((experienceConfig.specific as any)?.midiEnabled ?? true);
  const isARPiano = activeExperience.id === "ar-piano";
  const activeNotes = isARPiano && midiEnabled ? midi.activeNotes : [];

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
      {isARPiano ? (
        <Text style={{ color: midiEnabled ? "#34d399" : "#9ca3af", fontSize: 11, marginTop: 2 }}>
          MIDI {midiEnabled ? "On" : "Off"}{midiEnabled ? ` • ${activeNotes.length} notes` : ""}
        </Text>
      ) : null}
    </View>
  );
}