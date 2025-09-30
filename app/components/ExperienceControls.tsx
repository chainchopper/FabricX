import React from "react";
import { View, Text, Pressable } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import { useAR } from "../context/ARContext";

export default function ExperienceControls() {
  const { state, updateConfig } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const haptics = useHaptics();
  const toast = useToast();
  const { isARCameraActive, enableARCamera, disableARCamera } = useAR();

  if (!activeExperience) return null;

  const presets = [
    { label: "Cyan Glow", value: "#0b1020" },
    { label: "Deep Space", value: "#000000" },
    { label: "Nebula", value: "#0a1f2e" },
    { label: "Transparent", value: "transparent" },
  ];

  const applyBg = (color: string) => {
    updateConfig({ common: { ...experienceConfig.common, backgroundColor: color } });
    haptics.impactLight();
    toast.show("Background updated");
  };

  const isFluid = activeExperience.id === "default-fluid";
  const isCamera = !!activeExperience.capabilities.camera || !!activeExperience.capabilities.ar;
  const isCameraEffects = activeExperience.id === "camera-effects";
  const isARPiano = activeExperience.id === "ar-piano";

  const setFluidQuality = (q: "low" | "medium" | "high") => {
    updateConfig({ specific: { ...experienceConfig.specific, fluidQuality: q } });
    haptics.impactLight();
    toast.show(`Fluid quality: ${q}`);
  };

  const setFilterIntensity = (v: number) => {
    updateConfig({ specific: { ...experienceConfig.specific, filterIntensity: v } });
    haptics.impactLight();
    toast.show(`Filter intensity: ${v}`);
  };

  const toggleARCamera = async () => {
    if (isARCameraActive) {
      disableARCamera();
      haptics.impactLight();
      toast.show("AR Camera disabled");
    } else {
      await enableARCamera();
      haptics.notifySuccess();
      toast.show("AR Camera enabled");
    }
  };

  // MIDI controls for AR Piano
  const midiEnabled = Boolean((experienceConfig.specific as any)?.midiEnabled ?? true);
  const midiIntensity = Number((experienceConfig.specific as any)?.midiIntensity ?? 1);

  const setMidiEnabled = (v: boolean) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiEnabled: v } });
    haptics.impactLight();
    toast.show(`MIDI mapping ${v ? "enabled" : "disabled"}`);
  };

  const setMidiIntensity = (v: number) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiIntensity: v } });
    haptics.impactLight();
    toast.show(`MIDI intensity: ${v.toFixed(2)}`);
  };

  return (
    <View
      style={{
        backgroundColor: "rgba(2,8,23,0.6)",
        borderColor: "rgba(34,211,238,0.25)",
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 10,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800" }}>Experience Controls</Text>
      <Text style={{ color: "#93c5fd" }}>{activeExperience.name}</Text>

      {/* Background presets */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Background</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {presets.map((p) => {
            const active = experienceConfig.common.backgroundColor === p.value;
            return (
              <Pressable
                key={p.value}
                onPress={() => applyBg(p.value)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                  backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                }}
              >
                <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Fluid-specific controls */}
      {isFluid ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Fluid Quality</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["low", "medium", "high"] as const).map((q) => {
              const active = (experienceConfig.specific as any)?.fluidQuality === q;
              return (
                <Pressable
                  key={q}
                  onPress={() => setFluidQuality(q)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                    backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                  }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                    {q}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Camera / AR toggle */}
      {isCamera ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Camera</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void toggleARCamera()}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: isARCameraActive ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
                backgroundColor: isARCameraActive ? "rgba(16,185,129,0.18)" : "transparent",
              }}
            >
              <Text style={{ color: isARCameraActive ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
                {isARCameraActive ? "AR Camera: On" : "AR Camera: Off"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Camera Effects controls */}
      {isCameraEffects ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Effects</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[0.3, 0.5, 0.7, 0.9].map((v) => {
              const active = Number((experienceConfig.specific as any)?.filterIntensity ?? 0.7) === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => setFilterIntensity(v)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                    backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                  }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                    Intensity {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* AR Piano - MIDI controls */}
      {isARPiano ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>MIDI</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => setMidiEnabled(!midiEnabled)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: midiEnabled ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
                backgroundColor: midiEnabled ? "rgba(16,185,129,0.18)" : "transparent",
              }}
            >
              <Text style={{ color: midiEnabled ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
                Notes → Fabric: {midiEnabled ? "On" : "Off"}
              </Text>
            </Pressable>

            {[0.6, 1.0, 1.4].map((v) => {
              const active = Math.abs((midiIntensity ?? 1) - v) < 0.001;
              return (
                <Pressable
                  key={v}
                  onPress={() => setMidiIntensity(v)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                    backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                  }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                    Intensity {v}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}