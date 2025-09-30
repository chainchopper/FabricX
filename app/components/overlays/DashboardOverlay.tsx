import React from "react";
import { View, Text, Pressable } from "react-native";
import { usePreferences } from "../../context/PreferencesContext";
import { useExperience } from "../../../src/contexts/ExperienceContext";
import QuickCreateLayer from "../QuickCreateLayer";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";

export default function DashboardOverlay({ onClose }: { onClose: () => void }) {
  const { hapticsEnabled, toggleHaptics, audioEnabled, toggleAudio } = usePreferences();
  const { state, switchExperience } = useExperience();
  const { availableExperiences, activeExperience } = state;
  const haptics = useHaptics();
  const toast = useToast();

  const selectExp = async (id: string, name: string) => {
    await switchExperience(id);
    haptics.impactLight();
    toast.show(`Switched to ${name}`);
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: "rgba(2,8,23,0.6)", borderColor: "rgba(34,211,238,0.25)", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}>
        <Text style={{ color: "white", fontWeight: "800" }}>Global Settings</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => toggleHaptics()}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              borderColor: hapticsEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
              borderWidth: 1,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: hapticsEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
              Haptics: {hapticsEnabled ? "On" : "Off"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => toggleAudio()}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              borderColor: audioEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
              borderWidth: 1,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: audioEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
              Audio: {audioEnabled ? "On" : "Off"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ backgroundColor: "rgba(2,8,23,0.6)", borderColor: "rgba(34,211,238,0.25)", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}>
        <Text style={{ color: "white", fontWeight: "800" }}>Experiences</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {availableExperiences.map((exp) => {
            const active = exp.id === activeExperience?.id;
            return (
              <Pressable
                key={exp.id}
                onPress={() => void selectExp(exp.id, exp.name)}
                style={{
                  width: "48%",
                  backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                  borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>{exp.name}</Text>
                <Text style={{ color: "#9ca3af", fontSize: 11 }} numberOfLines={2}>{exp.description}</Text>
                <Text style={{ color: "#64748b", fontSize: 10, marginTop: 4 }}>{exp.type} • v{exp.version}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <QuickCreateLayer />

      <Pressable
        onPress={onClose}
        style={{ alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "rgba(148,163,184,0.35)" }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </View>
  );
}