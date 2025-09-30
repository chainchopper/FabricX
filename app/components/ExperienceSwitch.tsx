import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";

export default function ExperienceSwitch() {
  const { state, switchExperience } = useExperience();
  const { availableExperiences, activeExperience, isLoading } = state;
  const haptics = useHaptics();
  const toast = useToast();

  const handleSelect = async (id: string, name: string) => {
    if (id === activeExperience?.id) return;
    haptics.impactMedium();
    await switchExperience(id);
    toast.show(`Switched to ${name}`);
  };

  return (
    <View
      style={{
        backgroundColor: "rgba(2,8,23,0.6)",
        borderColor: "rgba(34,211,238,0.25)",
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "white", fontWeight: "800" }}>Experiences</Text>
        {isLoading ? <ActivityIndicator color="#22d3ee" /> : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {availableExperiences.map((exp) => {
          const active = exp.id === activeExperience?.id;
          return (
            <Pressable
              key={exp.id}
              onPress={() => void handleSelect(exp.id, exp.name)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
              }}
            >
              <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                {exp.name}
              </Text>
              <Text style={{ color: "#9ca3af", fontSize: 11 }}>{exp.type}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}