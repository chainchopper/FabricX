import React from "react";
import { Platform, View, Text, Pressable } from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";

const TRACKS = ["ambience", "A4", "C5"];

export default function AmbienceControls() {
  if (Platform.OS !== "web") return null;

  const { state, updateConfig } = useExperience();
  const haptics = useHaptics();
  const toast = useToast();

  const active = state.activeExperience;
  const cfg = state.experienceConfig;
  if (!active || active.id !== "default-fluid") return null;

  const s = cfg.specific as any;
  const ambienceEnabled = Boolean(s?.ambienceEnabled ?? false);
  const ambienceName = String(s?.ambienceFile ?? "ambience");

  const toggleAmbience = () => {
    updateConfig({ specific: { ...cfg.specific, ambienceEnabled: !ambienceEnabled } });
    haptics.impactLight();
    toast.show(!ambienceEnabled ? "Ambience: On" : "Ambience: Off");
  };

  const setAmbienceFile = (name: string) => {
    updateConfig({ specific: { ...cfg.specific, ambienceFile: name } });
    haptics.impactLight();
    toast.show(`Ambience track: ${name}`);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Ambience</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable
          onPress={toggleAmbience}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: ambienceEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
            backgroundColor: ambienceEnabled ? "rgba(16,185,129,0.18)" : "transparent",
          }}
        >
          <Text style={{ color: ambienceEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
            {ambienceEnabled ? "On" : "Off"}
          </Text>
        </Pressable>

        {TRACKS.map((name) => {
          const activeName = ambienceName === name;
          return (
            <Pressable
              key={name}
              onPress={() => setAmbienceFile(name)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: activeName ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                backgroundColor: activeName ? "rgba(2,132,199,0.22)" : "transparent",
              }}
            >
              <Text style={{ color: activeName ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: "#9ca3af", fontSize: 11 }}>
        Generated with Web Audio — no downloads required.
      </Text>
    </View>
  );
}