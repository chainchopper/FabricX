import React from "react";
import { Platform, View, Text, Pressable } from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";

export default function MusicControls() {
  if (Platform.OS !== "web") return null;

  const { state, updateConfig } = useExperience();
  const haptics = useHaptics();
  const toast = useToast();

  const active = state.activeExperience;
  const cfg = state.experienceConfig;
  if (!active || active.id !== "default-fluid") return null;

  const s = cfg.specific as any;
  const musicEnabled = Boolean((s?.musicEnabled as boolean) ?? false);
  const musicTempo = Number.isFinite(s?.musicTempo) ? Number(s?.musicTempo) : 100;
  const musicScale = (s?.musicScale as string) || "ionian";
  const musicPattern = (s?.musicPattern as string) || "up";

  const setMusicEnabled = (v: boolean) => {
    updateConfig({ specific: { ...cfg.specific, musicEnabled: v } });
    haptics.impactLight();
    toast.show(`Generative music ${v ? "enabled" : "disabled"}`);
  };
  const setMusicTempo = (bpm: number) => {
    const clamped = Math.max(40, Math.min(180, Math.round(bpm)));
    updateConfig({ specific: { ...cfg.specific, musicTempo: clamped } });
    haptics.impactLight();
    toast.show(`Tempo: ${clamped} BPM`);
  };
  const setMusicScale = (name: string) => {
    updateConfig({ specific: { ...cfg.specific, musicScale: name } });
    haptics.impactLight();
    toast.show(`Scale: ${name}`);
  };
  const setMusicPattern = (name: string) => {
    updateConfig({ specific: { ...cfg.specific, musicPattern: name } });
    haptics.impactLight();
    toast.show(`Pattern: ${name}`);
  };

  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Generative Music</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Pressable
          onPress={() => setMusicEnabled(!musicEnabled)}
          style={{
            paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
            borderColor: musicEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.35)",
            backgroundColor: musicEnabled ? "rgba(16,185,129,0.18)" : "transparent",
          }}
        >
          <Text style={{ color: musicEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
            {musicEnabled ? "On" : "Off"}
          </Text>
        </Pressable>

        {[80, 100, 120].map((b) => {
          const activeBpm = musicTempo === b;
          return (
            <Pressable
              key={b}
              onPress={() => setMusicTempo(b)}
              style={{
                paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                borderColor: activeBpm ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                backgroundColor: activeBpm ? "rgba(2,132,199,0.22)" : "transparent",
              }}
            >
              <Text style={{ color: activeBpm ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                {b} BPM
              </Text>
            </Pressable>
          );
        })}

        {["ionian", "dorian", "mixolydian", "minor"].map((name) => {
          const activeScale = musicScale === name;
          return (
            <Pressable
              key={name}
              onPress={() => setMusicScale(name)}
              style={{
                paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                borderColor: activeScale ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                backgroundColor: activeScale ? "rgba(2,132,199,0.22)" : "transparent",
              }}
            >
              <Text style={{ color: activeScale ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                {name}
              </Text>
            </Pressable>
          );
        })}

        {["up", "random", "triad"].map((name) => {
          const activePat = musicPattern === name;
          return (
            <Pressable
              key={name}
              onPress={() => setMusicPattern(name)}
              style={{
                paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                borderColor: activePat ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                backgroundColor: activePat ? "rgba(2,132,199,0.22)" : "transparent",
              }}
            >
              <Text style={{ color: activePat ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}