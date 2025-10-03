import React from "react";
import { Platform, View, Text } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useAR } from "../context/ARContext";
import { useMIDI } from "../../src/hooks/useMIDI";
import { getAudioReactive } from "../../src/shared/utils/audioReactive";

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

  const audioReactiveEnabled = Boolean((experienceConfig.specific as any)?.audioReactiveEnabled ?? false);
  const audioLevel = getAudioReactive().energy;

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
        minWidth: 160,
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
      {/* Audio reactivity chip */}
      {audioReactiveEnabled ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: "#22d3ee", fontSize: 11, marginBottom: 2 }}>Mic Reactive</Text>
          <View style={{ width: 120, height: 6, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.35)", overflow: "hidden" }}>
            <View style={{ width: `${Math.round(Math.min(1, Math.max(0, audioLevel)) * 100)}%`, height: "100%", backgroundColor: "#22d3ee" }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}