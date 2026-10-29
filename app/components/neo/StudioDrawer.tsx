import React, { useState } from "react";
import { Animated, Pressable, Text, View, ScrollView, TextInput, Platform } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";
import { useExperience } from "../../context/ExperienceContext";
import { FABRIC_SHARE_LIVE_EVENT } from "../../../src/session/sessionStore";
import {
  FABRIC_PLAY_PATTERN_EVENT,
} from "../../../src/ai/PatternComposer";
import {
  FABRIC_PLAY_RECIPE_EVENT,
} from "../../../src/ai/RecipeComposer";
import { patternPlayer } from "../../../src/ai/PatternPlayer";
import { recipePlayer } from "../../../src/ai/RecipePlayer";
import { useCompositions } from "../../../src/ai/useCompositions";
import {
  MAX_COMPOSITIONS,
  deleteComposition,
  renameComposition,
  saveComposition,
  saveRecipeComposition,
  type SavedComposition,
} from "../../../src/ai/compositionsStore";

interface Timeline {
  id: string;
  name: string;
  duration: number;
  tracks: Track[];
}

interface Track {
  id: string;
  type: "audio" | "visual" | "haptic" | "device";
  clips: Clip[];
}

interface Clip {
  id: string;
  start: number;
  duration: number;
  properties: Record<string, any>;
}

export default function StudioDrawer() {
  const { back, closeAll, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("studio");
  const haptics = useHaptics();
  const audio = useAudioCues();
  const { state } = useExperience();
  
  const [activeTab, setActiveTab] = useState<"composer" | "timeline" | "effects">("composer");
  const [isRecording, setIsRecording] = useState(false);
  const [compositionName, setCompositionName] = useState("Untitled");
  // Slice 8: the saved-compositions list is the real on-device store
  // now (fabric_compositions_v1) — no demo entries in the list.
  const compositions = useCompositions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // The most recent pattern composed/played this session (read at
  // render, like FabricMenu's share-live): what "Save" below keeps.
  const lastPattern = patternPlayer.lastPattern;

  const handleTabChange = (tab: typeof activeTab) => {
    haptics.impactLight();
    audio.click();
    setActiveTab(tab);
  };

  const handleStartRecording = () => {
    haptics.impactMedium();
    audio.success();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    haptics.impactMedium();
    audio.success();
    setIsRecording(false);
  };

  const mockEffects = [
    { id: "bloom", name: "Bloom", category: "visual", enabled: true },
    { id: "chromatic", name: "Chromatic Aberration", category: "visual", enabled: false },
    { id: "reverb", name: "Reverb", category: "audio", enabled: true },
    { id: "delay", name: "Delay", category: "audio", enabled: false },
    { id: "pulse", name: "Haptic Pulse", category: "haptic", enabled: false },
  ];

  // Play a saved composition through the EXISTING playback paths:
  // patterns ride FABRIC_PLAY_PATTERN_EVENT -> LegacyFluid's
  // dispatchStep -> sendInteraction; recipes (Slice 15) ride
  // FABRIC_PLAY_RECIPE_EVENT -> the recipe player + the one gated
  // fabric-recipe message. Either way Slice 5 session-mode
  // enforcement applies — a view-mode guest's playback renders
  // locally and transmits nothing, exactly like live input.
  const playComposition = (comp: SavedComposition) => {
    haptics.impactMedium();
    audio.success();
    if (typeof window !== "undefined") {
      if (comp.kind === "recipe") {
        window.dispatchEvent(
          new CustomEvent(FABRIC_PLAY_RECIPE_EVENT, { detail: comp.recipe })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent(FABRIC_PLAY_PATTERN_EVENT, { detail: comp.pattern })
        );
      }
    }
    closeAll();
  };

  const shareCompositionLive = (comp: SavedComposition) => {
    haptics.impactMedium();
    audio.success();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(FABRIC_SHARE_LIVE_EVENT, {
          detail: { name: comp.name, id: comp.id },
        })
      );
    }
    closeAll();
  };

  // "Save" in Current Composition: keep the session's last played
  // artifact — a pattern OR a recipe (Slice 15), whichever played
  // most recently — under the name typed above. Honest when there
  // is nothing to save yet — it says so instead of pretending.
  const saveCurrentPattern = () => {
    const p = patternPlayer.lastPattern;
    const r = recipePlayer.lastRecipe;
    const recipeIsLast =
      r !== null && recipePlayer.lastPlayedAt >= patternPlayer.lastPlayedAt;
    if (!p && !r) {
      setSaveNote(
        "Nothing to save yet — describe a feeling in the composer on the canvas first, then save it here."
      );
      return;
    }
    const typed = compositionName.trim();
    const name = typed && typed !== "Untitled" ? typed : undefined;
    if (recipeIsLast && r) {
      void saveRecipeComposition({ name, prompt: "", recipe: r }).then(
        (rec) => {
          if (rec) {
            haptics.impactMedium();
            audio.success();
            setSaveNote(`Saved “${rec.name}” — it's in your list below.`);
          }
        }
      );
      return;
    }
    if (!p) return;
    void saveComposition({
      name,
      prompt: "",
      pattern: p,
    }).then((rec) => {
      if (rec) {
        haptics.impactMedium();
        audio.success();
        setSaveNote(`Saved “${rec.name}” — it's in your list below.`);
      }
    });
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0, bottom: 0, left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 200,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, width,
          backgroundColor: "rgba(6,10,22,0.96)",
          paddingTop: 56,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, paddingHorizontal: 16 }}>
          <Pressable
            onPress={() => { haptics.impactLight(); audio.click(); back(); }}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Studio</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 16, paddingHorizontal: 16 }}>
          Create and compose multi-sensory experiences
        </Text>

        {/* Tab Navigation */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          {(["composer", "timeline", "effects"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: activeTab === tab ? "rgba(34,211,238,0.8)" : "rgba(148,163,184,0.25)",
                backgroundColor: activeTab === tab ? "rgba(34,211,238,0.15)" : "transparent",
              }}
            >
              <Text
                style={{
                  color: activeTab === tab ? "#22d3ee" : "#9ca3af",
                  fontWeight: activeTab === tab ? "700" : "600",
                  textAlign: "center",
                  fontSize: 13,
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Content Area */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
          {activeTab === "composer" && (
            <View style={{ gap: 12 }}>
              {/* Current Composition */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Current Composition</Text>
                <TextInput
                  value={compositionName}
                  onChangeText={setCompositionName}
                  placeholder="Composition name..."
                  placeholderTextColor="#6b7280"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.3)",
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.25)",
                    borderRadius: 8,
                    padding: 10,
                    color: "white",
                    marginBottom: 12,
                  }}
                />
                
                {/* Recording Controls */}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {!isRecording ? (
                    <Pressable
                      onPress={handleStartRecording}
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        backgroundColor: "rgba(239,68,68,0.2)",
                        borderWidth: 1,
                        borderColor: "rgba(239,68,68,0.5)",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#ef4444", fontWeight: "700" }}>● Record</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={handleStopRecording}
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        backgroundColor: "rgba(16,185,129,0.2)",
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.5)",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#10b981", fontWeight: "700" }}>■ Stop</Text>
                    </Pressable>
                  )}
                  
                  <Pressable
                    pointerEvents="auto"
                    onPress={saveCurrentPattern}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(34,211,238,0.2)",
                      borderWidth: 1,
                      borderColor: "rgba(34,211,238,0.5)",
                      paddingHorizontal: 20,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Save</Text>
                  </Pressable>
                </View>

                <Text style={{ color: "#9ca3af", fontSize: 12, marginTop: 10 }}>
                  {lastPattern
                    ? `Last composed this session: “${lastPattern.name}” (${lastPattern.steps.length} steps). Save keeps it on this device.`
                    : "Nothing composed yet this session — the composer on the canvas makes patterns you can keep here."}
                </Text>
                {saveNote ? (
                  <Text style={{ color: "#a3e635", fontSize: 12, marginTop: 6 }}>
                    {saveNote}
                  </Text>
                ) : null}
                
                {isRecording && (
                  <Text style={{ color: "#ef4444", marginTop: 8, fontSize: 12, textAlign: "center" }}>
                    ● Recording in progress...
                  </Text>
                )}
              </View>

              {/* Saved Compositions — the real store (Slice 8):
                  fabric_compositions_v1 on this device, newest first,
                  capped at MAX_COMPOSITIONS with the oldest evicted. */}
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 4 }}>Saved Compositions</Text>
                <Text style={{ color: "#9ca3af", fontSize: 11, marginBottom: 8 }}>
                  {compositions.loaded
                    ? `${compositions.items.length} of ${MAX_COMPOSITIONS} kept on this device`
                    : "Loading…"}
                </Text>
                {compositions.loaded && compositions.items.length === 0 ? (
                  <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                    No saved compositions yet. Describe a feeling in the
                    composer on the canvas, then tap Save — your pattern
                    will live here on this device.
                  </Text>
                ) : null}
                {compositions.items.map((comp) => (
                  <View
                    key={comp.id}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(0,0,0,0.3)",
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.2)",
                      marginBottom: 8,
                    }}
                  >
                    {editingId === comp.id ? (
                      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                        <TextInput
                          value={editName}
                          onChangeText={setEditName}
                          placeholder="Composition name..."
                          placeholderTextColor="#6b7280"
                          style={{
                            flex: 1,
                            backgroundColor: "rgba(0,0,0,0.3)",
                            borderWidth: 1,
                            borderColor: "rgba(148,163,184,0.25)",
                            borderRadius: 8,
                            padding: 8,
                            color: "white",
                          }}
                        />
                        <Pressable
                          pointerEvents="auto"
                          onPress={() => {
                            void renameComposition(comp.id, editName);
                            setEditingId(null);
                          }}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "rgba(163,230,53,0.6)",
                            backgroundColor: "rgba(163,230,53,0.12)",
                          }}
                        >
                          <Text style={{ color: "#a3e635", fontWeight: "700", fontSize: 12 }}>Done</Text>
                        </Pressable>
                        <Pressable
                          pointerEvents="auto"
                          onPress={() => setEditingId(null)}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "rgba(148,163,184,0.4)",
                          }}
                        >
                          <Text style={{ color: "#9ca3af", fontWeight: "700", fontSize: 12 }}>Cancel</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <Text style={{ color: "white", fontWeight: "600" }}>{comp.name}</Text>
                        <Text style={{ color: "#9ca3af", fontSize: 11 }}>
                          {comp.kind === "recipe"
                            ? `✦ Recipe • ${comp.recipe.steps.map((s) => s.shape).join(" + ")} • ${(comp.recipe.durationMs / 1000).toFixed(1)}s • ${new Date(comp.createdAt).toLocaleDateString()}`
                            : `${comp.pattern.steps.length} steps • ${(comp.pattern.durationMs / 1000).toFixed(1)}s • ${new Date(comp.createdAt).toLocaleDateString()}`}
                        </Text>
                        {comp.prompt ? (
                          <Text style={{ color: "#6b7280", fontSize: 11 }} numberOfLines={2}>
                            {`“${comp.prompt}”`}
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {/* Play: the existing playback path — session
                              mode gating rides along (see above). */}
                          <Pressable
                            pointerEvents="auto"
                            onPress={() => playComposition(comp)}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: "rgba(16,185,129,0.6)",
                              backgroundColor: "rgba(16,185,129,0.12)",
                            }}
                          >
                            <Text style={{ color: "#10b981", fontWeight: "700", fontSize: 12 }}>▶ Play</Text>
                          </Pressable>
                          {/* Share live (Slice 5 + 8): hands off to the
                              Fabric menu, which hosts a session (minting
                              a room if needed), plays this composition
                              into it, and surfaces the invite link. */}
                          <Pressable
                            pointerEvents="auto"
                            onPress={() => shareCompositionLive(comp)}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: "rgba(34,211,238,0.6)",
                              backgroundColor: "rgba(34,211,238,0.12)",
                            }}
                          >
                            <Text style={{ color: "#22d3ee", fontWeight: "700", fontSize: 12 }}>Share live</Text>
                          </Pressable>
                          <Pressable
                            pointerEvents="auto"
                            onPress={() => {
                              setEditName(comp.name);
                              setEditingId(comp.id);
                            }}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: "rgba(148,163,184,0.4)",
                            }}
                          >
                            <Text style={{ color: "#e5e7eb", fontWeight: "700", fontSize: 12 }}>Rename</Text>
                          </Pressable>
                          <Pressable
                            pointerEvents="auto"
                            onPress={() => {
                              if (armedDeleteId === comp.id) {
                                void deleteComposition(comp.id);
                                setArmedDeleteId(null);
                              } else {
                                setArmedDeleteId(comp.id);
                              }
                            }}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: "rgba(239,68,68,0.6)",
                              backgroundColor:
                                armedDeleteId === comp.id
                                  ? "rgba(239,68,68,0.25)"
                                  : "rgba(239,68,68,0.08)",
                            }}
                          >
                            <Text style={{ color: "#fca5a5", fontWeight: "700", fontSize: 12 }}>
                              {armedDeleteId === comp.id ? "Tap again to delete" : "Delete"}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {activeTab === "timeline" && (
            <View style={{ gap: 12 }}>
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Timeline Editor</Text>
                <Text style={{ color: "#93c5fd", fontSize: 13, marginBottom: 12 }}>
                  Multi-track sequencer for precise control
                </Text>
                
                {/* Timeline visualization */}
                <View style={{ gap: 8 }}>
                  {["Audio", "Visual", "Haptic", "Device"].map((track, i) => {
                    // Generate stable mock clips based on track index
                    const clipCount = (i % 3) + 1;
                    const clips = Array.from({ length: clipCount }, (_, j) => ({
                      key: `${track}-${j}`,
                      width: ((i + j) * 17 % 60) + 40,
                    }));
                    
                    return (
                      <View key={track} style={{ gap: 4 }}>
                        <Text style={{ color: "#9ca3af", fontSize: 11, fontWeight: "600" }}>{track}</Text>
                        <View
                          style={{
                            height: 32,
                            backgroundColor: "rgba(0,0,0,0.3)",
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: "rgba(148,163,184,0.2)",
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 4,
                            gap: 2,
                          }}
                        >
                          {/* Mock clips */}
                          {clips.map((clip) => (
                            <View
                              key={clip.key}
                              style={{
                                height: 24,
                                width: clip.width,
                                backgroundColor: `rgba(${i * 60}, ${180 - i * 30}, ${200 + i * 10}, 0.5)`,
                                borderRadius: 4,
                                borderWidth: 1,
                                borderColor: `rgba(${i * 60}, ${180 - i * 30}, ${200 + i * 10}, 0.8)`,
                              }}
                            />
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Pressable
                    onPress={() => { haptics.impactLight(); audio.click(); }}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(34,211,238,0.2)",
                      borderWidth: 1,
                      borderColor: "rgba(34,211,238,0.5)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Add Track</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { haptics.impactLight(); audio.click(); }}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(16,185,129,0.2)",
                      borderWidth: 1,
                      borderColor: "rgba(16,185,129,0.5)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#10b981", fontWeight: "700" }}>Preview</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {activeTab === "effects" && (
            <View style={{ gap: 12 }}>
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(34,211,238,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Effects Library</Text>
                <Text style={{ color: "#93c5fd", fontSize: 13, marginBottom: 12 }}>
                  Apply real-time effects to your experience
                </Text>
                
                {mockEffects.map((effect) => (
                  <Pressable
                    key={effect.id}
                    onPress={() => { haptics.impactLight(); audio.click(); }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: "rgba(0,0,0,0.3)",
                      borderWidth: 1,
                      borderColor: effect.enabled ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.2)",
                      marginBottom: 8,
                    }}
                  >
                    <View>
                      <Text style={{ color: "white", fontWeight: "600" }}>{effect.name}</Text>
                      <Text style={{ color: "#9ca3af", fontSize: 11 }}>{effect.category}</Text>
                    </View>
                    <View
                      style={{
                        width: 40,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: effect.enabled ? "#10b981" : "#6b7280",
                        justifyContent: "center",
                        alignItems: effect.enabled ? "flex-end" : "flex-start",
                        paddingHorizontal: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: "white",
                        }}
                      />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={{ position: "absolute", bottom: 12, left: 16 }}>
          <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
        </View>
      </View>
    </Animated.View>
  );
}