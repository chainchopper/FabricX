import React from "react";
import { View, Text, Pressable } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import { useAR } from "../context/ARContext";

type MidiCurve = "soft" | "linear" | "hard";
type HueMap = "chromatic" | "fifths";

export default function LayerControls() {
  const { state, updateConfig } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const haptics = useHaptics();
  const toast = useToast();
  const { isARCameraActive, enableARCamera, disableARCamera } = useAR();

  if (!activeExperience) return null;

  const s = experienceConfig.specific as Record<string, unknown> | undefined;

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

  // MIDI settings (for AR Piano or any layer that declares midi capability)
  const midiEnabled = Boolean((s?.midiEnabled as boolean) ?? true);
  const setMidiEnabled = (v: boolean) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiEnabled: v } });
    haptics.impactLight();
    toast.show(`MIDI mapping ${v ? "enabled" : "disabled"}`);
  };

  const midiIntensity = Number(s?.midiIntensity ?? 1);
  const setMidiIntensity = (v: number) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiIntensity: v } });
    haptics.impactLight();
    toast.show(`MIDI intensity: ${v}`);
  };

  const midiCurve = ((s?.midiCurve as MidiCurve) ?? "linear") as MidiCurve;
  const setMidiCurve = (c: MidiCurve) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiCurve: c } });
    haptics.impactLight();
    toast.show(`MIDI curve: ${c}`);
  };

  const midiTranspose = Number.isFinite(s?.midiTranspose) ? Number(s?.midiTranspose) : 0;
  const setMidiTranspose = (v: number) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiTranspose: v } });
    haptics.impactLight();
    toast.show(`Transpose: ${v >= 0 ? "+" : ""}${v}`);
  };

  const midiHueMap = ((s?.midiHueMap as HueMap) ?? "chromatic") as HueMap;
  const setMidiHueMap = (m: HueMap) => {
    updateConfig({ specific: { ...experienceConfig.specific, midiHueMap: m } });
    haptics.impactLight();
    toast.show(m === "chromatic" ? "Hue: Chromatic" : "Hue: Fifths");
  };

  // Capability flags
  const caps = activeExperience.capabilities;

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
      <Text style={{ color: "white", fontWeight: "800" }}>Layer Controls</Text>
      <Text style={{ color: "#93c5fd" }}>{activeExperience.name}</Text>

      {/* Default Fluid controls */}
      {activeExperience.id === "default-fluid" ? (
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
                    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                    backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                  }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>{q}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Camera Effects controls */}
      {activeExperience.id === "camera-effects" ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Filter Intensity</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[0.4, 0.7, 1.0].map((v) => {
              const active = Math.abs((s?.filterIntensity as number ?? 0.7) - v) < 0.001;
              return (
                <Pressable
                  key={v}
                  onPress={() => setFilterIntensity(v)}
                  style={{
                    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10,
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
          {/* Camera toggle (layer has camera capability) */}
          {caps.camera || caps.ar ? (
            <View style={{ marginTop: 6 }}>
              <Pressable
                onPress={() => void toggleARCamera()}
                style={{
                  paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                  borderColor: isARCameraActive ? "rgba(34,197,94,0.7)" : "rgba(148,163,184,0.4)",
                  backgroundColor: isARCameraActive ? "rgba(16,185,129,0.18)" : "transparent",
                }}
              >
                <Text style={{ color: isARCameraActive ? "#34d399" : "#e5e7eb", fontWeight: "700" }}>
                  AR/Camera: {isARCameraActive ? "On" : "Off"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* AR Piano (or any MIDI-capable) */}
      {caps.midi ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>MIDI</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => setMidiEnabled(!midiEnabled)}
              style={{
                paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
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
                    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
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

            {(["soft", "linear", "hard"] as MidiCurve[]).map((c) => {
              const active = midiCurve === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setMidiCurve(c)}
                  style={{
                    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                    borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                    backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                  }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>Curve {c}</Text>
                </Pressable>
              );
            })}

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {[-12, -7, -5, 0, 5, 7, 12].map((t) => {
                const active = midiTranspose === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setMidiTranspose(t)}
                    style={{
                      paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1,
                      borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                      backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                    }}
                  >
                    <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                      {t >= 0 ? `+${t}` : `${t}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {(["chromatic", "fifths"] as HueMap[]).map((m) => {
                const active = midiHueMap === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMidiHueMap(m)}
                    style={{
                      paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1,
                      borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                      backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
                    }}
                  >
                    <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                      {m === "chromatic" ? "Hue: Chromatic" : "Hue: Fifths"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}