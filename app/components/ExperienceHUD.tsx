import React from "react";
import { Platform, View, Text } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useAR } from "../context/ARContext";
import { useMIDI } from "../../src/hooks/useMIDI";
import { getAudioReactive } from "../../src/shared/utils/audioReactive";

export default function ExperienceHUD() {
  // Platform const guard is safe; never changes across renders
  if (Platform.OS !== "web") return null;

  // Call hooks unconditionally and in stable order
  const { state } = useExperience();
  const { isARCameraActive } = useAR();
  const midi = useMIDI();

  const activeExperience = state.activeExperience;
  const experienceConfig = state.experienceConfig;

  const isARPiano = activeExperience?.id === "ar-piano";
  const midiEnabled = Boolean((experienceConfig.specific as any)?.midiEnabled ?? true);
  const activeNotes = isARPiano && midiEnabled ? midi.activeNotes : [];

  const audioReactiveEnabled = Boolean((experienceConfig.specific as any)?.audioReactiveEnabled ?? false);
  const audio = getAudioReactive();

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
        {activeExperience?.name ?? "—"}
      </Text>
      <Text style={{ color: "#93c5fd", fontSize: 11 }}>
        {activeExperience?.type ?? "no-experience"}
      </Text>
      {isARCameraActive ? (
        <Text style={{ color: "#34d399", fontSize: 11, marginTop: 2 }}>AR On</Text>
      ) : null}
      {isARPiano ? (
        <Text style={{ color: midiEnabled ? "#34d399" : "#9ca3af", fontSize: 11, marginTop: 2 }}>
          MIDI {midiEnabled ? "On" : "Off"}{midiEnabled ? ` • ${activeNotes.length} notes` : ""}
        </Text>
      ) : null}
      {audioReactiveEnabled ? (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: "#22d3ee", fontSize: 11, marginBottom: 2 }}>Mic Reactive</Text>
          <View style={{ width: 140, height: 6, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.35)", overflow: "hidden", marginBottom: 6 }}>
            <View style={{ width: `${Math.round(Math.min(1, Math.max(0, audio.energy)) * 100)}%`, height: "100%", backgroundColor: "#22d3ee" }} />
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[
              { label: "B", value: audio.bass, color: "#60a5fa" },
              { label: "M", value: audio.mid, color: "#34d399" },
              { label: "T", value: audio.treble, color: "#f472b6" },
            ].map((b) => (
              <View key={b.label} style={{ alignItems: "center" }}>
                <View style={{ width: 36, height: 6, borderRadius: 6, backgroundColor: "rgba(148,163,184,0.35)", overflow: "hidden" }}>
                  <View style={{ width: `${Math.round(Math.min(1, Math.max(0, b.value)) * 100)}%`, height: "100%", backgroundColor: b.color as string }} />
                </View>
                <Text style={{ color: "#9ca3af", fontSize: 10, marginTop: 2 }}>{b.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}