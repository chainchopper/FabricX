import React, { useMemo, useState, useEffect } from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import { useExperience } from "../context/ExperienceContext";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import { useAR } from "../context/ARContext";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { loadTracks } from "../../src/components/audio/tracks";

function slugRoom(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "main";
}

type MidiCurve = "soft" | "linear" | "hard";
type HueMap = "chromatic" | "fifths";

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

  // Rendering mode
  const renderMode = (experienceConfig.common as any)?.renderMode ?? "default";
  const setRenderMode = (mode: "default" | "compat") => {
    updateConfig({ common: { ...experienceConfig.common, renderMode: mode } as any });
    haptics.impactLight();
    toast.show(mode === "default" ? "Rendering: Default (recommended)" : "Rendering: Compatibility");
  };

  // Ambience controls (default-fluid only, web)
  const isDefaultFluid = activeExperience.id === "default-fluid";
  const s = experienceConfig.specific as any;

  const ambienceEnabled = Boolean(s?.ambienceEnabled ?? false);
  // Store name only (e.g., "ambience", "A4", "C5")
  const ambienceName = String(s?.ambienceFile ?? "ambience");
  const [trackList, setTrackList] = useState<string[]>(["ambience"]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tracks = await loadTracks();
        if (alive) setTrackList(tracks.map((t) => t.name));
      } catch {
        if (alive) setTrackList(["ambience"]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    toast.show(`MIDI intensity: ${v.toFixed(2)}`);
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

      {/* Rendering Mode */}
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

      {/* Ambience */}
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
          <Text style={{ color: "#9ca3af", fontSize: 11 }}>
            Tracks are bundled locally; no network needed.
          </Text>
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

      {/* Particles density */}
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

      {/* Default Fluid controls */}
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

            {(["soft", "linear", "hard"] as MidiCurve[]).map((c) => {
              const active = midiCurve === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setMidiCurve(c)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
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
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      borderWidth: 1,
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
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      borderWidth: 1,
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