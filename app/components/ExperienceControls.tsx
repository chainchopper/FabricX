import React, { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import { useAR } from "../context/ARContext";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";

function slugRoom(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "main";
}

export default function ExperienceControls() {
  const { state, updateConfig } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const haptics = useHaptics();
  const toast = useToast();
  const { isARCameraActive, enableARCamera, disableARCamera } = useAR();

  const [roomDraft, setRoomDraft] = useState<string>(() => {
    const s = experienceConfig.specific as any;
    return (s?.roomId as string) || "main";
  });

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

  const setFluidQuality = (q: "low" | "medium" | "high" | "auto") => {
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

  const resetExperience = () => {
    updateConfig(activeExperience.configDefaults);
    haptics.impactLight();
    toast.show("Experience reset");
  };

  // Audio volume quick controls (0.5, 0.7, 0.9)
  const currentVol = Number(experienceConfig.common?.audioVolume ?? 0.7);
  const setAudioVolume = (v: number) => {
    updateConfig({ common: { ...experienceConfig.common, audioVolume: v } });
    haptics.impactLight();
    toast.show(`Audio volume: ${Math.round(v * 100)}%`);
  };

  // MIDI controls (AR Piano)
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

  const applyRoom = () => {
    const id = slugRoom(roomDraft);
    updateConfig({ specific: { ...experienceConfig.specific, roomId: id } });
    haptics.impactLight();
    toast.show(`Room set: ${id}`);
  };

  const copyInvite = async () => {
    const s = experienceConfig.specific as any;
    const id = slugRoom(roomDraft || s?.roomId || "main");
    let url = "";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const loc = new URL(window.location.href);
      loc.searchParams.set("room", id);
      url = loc.toString();
    } else {
      url = Linking.createURL(`/?room=${id}`);
    }
    await Clipboard.setStringAsync(url);
    haptics.notifySuccess();
    toast.show("Invite link copied");
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

      {/* Audio quick volume */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Audio</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[0.5, 0.7, 0.9].map((v) => {
            const active = Math.abs(currentVol - v) < 0.0001;
            return (
              <Pressable
                key={v}
                onPress={() => setAudioVolume(v)}
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
                  {Math.round(v * 100)}%
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
            {(["auto", "low", "medium", "high"] as const).map((q) => {
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

      {/* Realtime room controls */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Realtime</Text>
        <Text style={{ color: "#93c5fd", fontSize: 12 }}>Room</Text>
        <TextInput
          value={roomDraft}
          onChangeText={setRoomDraft}
          placeholder="room id"
          placeholderTextColor="#6b7280"
          style={{
            backgroundColor: "#111827",
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.35)",
            borderRadius: 10,
            color: "white",
            paddingHorizontal: 10,
            paddingVertical: 10,
          }}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={applyRoom}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(34,211,238,0.6)",
              backgroundColor: "rgba(2,132,199,0.18)",
            }}
          >
            <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Apply</Text>
          </Pressable>
          <Pressable
            onPress={() => void copyInvite()}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(34,211,238,0.6)",
            }}
          >
            <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Copy Invite</Text>
          </Pressable>
        </View>
      </View>

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

      {/* Reset Experience */}
      <View style={{ height: 1, backgroundColor: "rgba(148,163,184,0.25)", marginVertical: 6 }} />
      <Pressable
        onPress={resetExperience}
        style={{
          alignSelf: "flex-start",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "rgba(234,179,8,0.7)",
          backgroundColor: "rgba(234,179,8,0.15)",
        }}
      >
        <Text style={{ color: "#fde047", fontWeight: "700" }}>Reset Experience</Text>
      </Pressable>
    </View>
  );
}