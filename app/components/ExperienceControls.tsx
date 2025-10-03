import React, { useState } from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import { useAR } from "../context/ARContext";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useAudioReactive } from "../../src/hooks/useAudioReactive";

function slugRoom(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "main";
}

type MidiCurve = "soft" | "linear" | "hard";
type HueMap = "chromatic" | "fifths";

export default function ExperienceControls() {
  // Hooks first (stable order)
  const { state, updateConfig } = useExperience();
  const { isARCameraActive, enableARCamera, disableARCamera } = useAR();
  const { enable: enableAR, disable: disableAR, setSensitivity } = useAudioReactive();
  const haptics = useHaptics();
  const toast = useToast();

  const activeExperience = state.activeExperience;
  const experienceConfig = state.experienceConfig;

  const [roomDraft, setRoomDraft] = useState<string>(() => {
    const s = experienceConfig.specific as any;
    return (s?.roomId as string) || "main";
  });

  if (!activeExperience) return null;

  // Rendering mode
  const renderMode = (experienceConfig.common as any)?.renderMode ?? "default";
  const setRenderMode = (mode: "default" | "compat") => {
    updateConfig({ common: { ...experienceConfig.common, renderMode: mode } as any });
    haptics.impactLight();
    toast.show(mode === "default" ? "Rendering: Default (recommended)" : "Rendering: Compatibility");
  };

  const isDefaultFluid = activeExperience.id === "default-fluid";
  const s = experienceConfig.specific as any;

  // Ambience (Web Audio)
  const ambienceEnabled = Boolean(s?.ambienceEnabled ?? false);
  const trackList = ["ambience", "A4", "C5"];
  const ambienceName = String(s?.ambienceFile ?? "ambience");

  const toggleAmbience = () => {
    updateConfig({ specific: { ...experienceConfig.specific, ambienceEnabled: !ambienceEnabled } });
    haptics.impactLight();
    toast.show(!ambienceEnabled ? "Ambience: On" : "Ambience: Off");
  };
  const setAmbienceFile = (name: string) => {
    updateConfig({ specific: { ...experienceConfig.specific, ambienceFile: name } });
    haptics.impactLight();
    toast.show(`Ambience track: ${name}`);
  };

  // Generative Music (Tone.js)
  const musicEnabled = Boolean((s?.musicEnabled as boolean) ?? false);
  const musicTempo = Number.isFinite(s?.musicTempo) ? Number(s?.musicTempo) : 100;
  const musicScale = (s?.musicScale as string) || "ionian";
  const musicPattern = (s?.musicPattern as string) || "up";

  const setMusicEnabled = (v: boolean) => {
    updateConfig({ specific: { ...experienceConfig.specific, musicEnabled: v } });
    haptics.impactLight();
    toast.show(`Generative music ${v ? "enabled" : "disabled"}`);
  };
  const setMusicTempo = (bpm: number) => {
    const clamped = Math.max(40, Math.min(180, Math.round(bpm)));
    updateConfig({ specific: { ...experienceConfig.specific, musicTempo: clamped } });
    haptics.impactLight();
    toast.show(`Tempo: ${clamped} BPM`);
  };
  const setMusicScale = (name: string) => {
    updateConfig({ specific: { ...experienceConfig.specific, musicScale: name } });
    haptics.impactLight();
    toast.show(`Scale: ${name}`);
  };
  const setMusicPattern = (name: string) => {
    updateConfig({ specific: { ...experienceConfig.specific, musicPattern: name } });
    haptics.impactLight();
    toast.show(`Pattern: ${name}`);
  };

  // Fluid/camera checks
  const isFluid = activeExperience.id === "default-fluid";
  const isCamera = !!activeExperience.capabilities.camera || !!activeExperience.capabilities.ar;
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

  // Audio quick volume
  const currentVol = Number(experienceConfig.common?.audioVolume ?? 0.7);
  const setAudioVolume = (v: number) => {
    updateConfig({ common: { ...experienceConfig.common, audioVolume: v } });
    haptics.impactLight();
    toast.show(`Audio volume: ${Math.round(v * 100)}%`);
  };

  // Particles density
  const currentDensity = Number(experienceConfig.common?.particleDensity ?? 0.6);
  const setParticleDensity = (v: number) => {
    updateConfig({ common: { ...experienceConfig.common, particleDensity: v } });
    haptics.impactLight();
    toast.show(`Particles: ${Math.round(v * 100)}%`);
  };

  // MIDI controls (AR Piano)
  const midiEnabled = Boolean((s?.midiEnabled as boolean) ?? true);
  const midiIntensity = Number(s?.midiIntensity ?? 1);
  const midiCurve = ((s?.midiCurve as MidiCurve) ?? "linear") as MidiCurve;
  const midiTranspose = Number.isFinite(s?.midiTranspose) ? Number(s?.midiTranspose) : 0;
  const midiHueMap = ((s?.midiHueMap as HueMap) ?? "chromatic") as HueMap;

  const setMidiEnabled = (v: boolean) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiEnabled: v } });
    haptics.impactLight();
    toast.show(`MIDI mapping ${v ? "enabled" : "disabled"}`);
  };
  const setMidiIntensity = (v: number) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiIntensity: v } });
    haptics.impactLight();
    toast.show(`MIDI intensity: ${v}`);
  };
  const setMidiCurve = (c: MidiCurve) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiCurve: c } });
    haptics.impactLight();
    toast.show(`MIDI curve: ${c}`);
  };
  const setMidiTranspose = (v: number) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiTranspose: v } });
    haptics.impactLight();
    toast.show(`Transpose: ${v >= 0 ? "+" : ""}${v}`);
  };
  const setMidiHueMap = (m: HueMap) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiHueMap: m } });
    haptics.impactLight();
    toast.show(m === "chromatic" ? "Hue: Chromatic" : "Hue: Fifths");
  };

  // Realtime room controls
  const applyRoom = () => {
    const id = slugRoom(roomDraft);
    updateConfig({ specific: { ...experienceConfig.specific, roomId: id } });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const loc = new URL(window.location.href);
      loc.searchParams.set("room", id);
      loc.searchParams.set("exp", activeExperience.id);
      window.history.replaceState({}, "", loc.toString());
      window.dispatchEvent(new CustomEvent("fabric:webrtc-reannounce", { detail: id }));
    }
    haptics.impactLight();
    toast.show(`Room set: ${id}`);
  };

  const copyInvite = async () => {
    const id = slugRoom(roomDraft || s?.roomId || "main");
    let url = "";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const loc = new URL(window.location.href);
      loc.searchParams.set("room", id);
      loc.searchParams.set("exp", activeExperience.id);
      url = loc.toString();
    } else {
      url = Linking.createURL(`/?room=${id}&exp=${activeExperience.id}`);
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

      {/* Rendering */}
      {activeExperience.id === "default-fluid" ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Rendering</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              { id: "default", label: "Default (recommended)" },
              { id: "compat", label: "Compatibility" },
            ].map((opt) => {
              const active = renderMode === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setRenderMode(opt.id as "default" | "compat")}
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
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Ambience (Web Audio) */}
      {isDefaultFluid && Platform.OS === "web" ? (
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

            {trackList.map((name) => {
              const active = ambienceName === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => setAmbienceFile(name)}
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
                    {name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Generative Music (Tone.js) */}
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
                const active = musicTempo === b;
                return (
                  <Pressable
                    key={b}
                    onPress={() => setMusicTempo(b)}
                    style={{
                      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                      borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                      backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                    }}
                  >
                    <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                      {b} BPM
                    </Text>
                  </Pressable>
                );
              })}

              {["ionian", "dorian", "mixolydian", "minor"].map((name) => {
                const active = musicScale === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setMusicScale(name)}
                    style={{
                      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                      borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                      backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                    }}
                  >
                    <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })}

              {["up", "random", "triad"].map((name) => {
                const active = musicPattern === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setMusicPattern(name)}
                    style={{
                      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                      borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                      backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                    }}
                  >
                    <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}

      {/* Background presets */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Background</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            { label: "Cyan Glow", value: "#0b1020" },
            { label: "Deep Space", value: "#000000" },
            { label: "Nebula", value: "#0a1f2e" },
            { label: "Transparent", value: "transparent" },
          ].map((p) => {
            const active = experienceConfig.common.backgroundColor === p.value;
            return (
              <Pressable
                key={p.value}
                onPress={() => {
                  updateConfig({ common: { ...experienceConfig.common, backgroundColor: p.value } });
                  haptics.impactLight();
                  toast.show("Background updated");
                }}
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

      {/* Audio Volume */}
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

      {/* Particles */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Particles</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[0.4, 0.6, 0.9].map((v) => {
            const active = Math.abs(currentDensity - v) < 0.0001;
            return (
              <Pressable
                key={v}
                onPress={() => setParticleDensity(v)}
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

      {/* Fluid Quality */}
      {isFluid ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Fluid Quality</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["auto", "low", "medium", "high"] as const).map((q) => {
              const active = (s?.fluidQuality as string) === q;
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

      {/* Camera */}
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

      {/* Mic Reactivity + Generative music are above */}

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