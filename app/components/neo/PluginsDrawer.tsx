import React, { useState } from "react";
import { Animated, Pressable, Text, View, ScrollView, TextInput , Platform } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useAudioCues } from "../../hooks/useAudioCues";

interface Plugin {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  category: "experience" | "effect" | "control" | "device" | "integration";
  installed: boolean;
  enabled: boolean;
  downloads: number;
  rating: number;
}

export default function PluginsDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("plugins");
  const haptics = useHaptics();
  const audio = useAudioCues();
  
  const [activeTab, setActiveTab] = useState<"installed" | "discover" | "develop">("installed");
  const [searchQuery, setSearchQuery] = useState("");

  const mockPlugins: Plugin[] = [
    {
      id: "1",
      name: "Kaleidoscope Effect",
      author: "Fanalogy",
      version: "1.2.0",
      description: "Geometric mirroring and symmetry effects for visual layers",
      category: "effect",
      installed: true,
      enabled: true,
      downloads: 1250,
      rating: 4.8,
    },
    {
      id: "2",
      name: "MIDI Controller Pro",
      author: "Community",
      version: "2.0.1",
      description: "Advanced MIDI mapping with multi-device support",
      category: "control",
      installed: true,
      enabled: false,
      downloads: 890,
      rating: 4.5,
    },
    {
      id: "3",
      name: "Galaxy Experience",
      author: "Stargazer",
      version: "1.0.3",
      description: "Immersive space environment with particle stars and nebula",
      category: "experience",
      installed: false,
      enabled: false,
      downloads: 2340,
      rating: 4.9,
    },
    {
      id: "4",
      name: "Smart Lights Bridge",
      author: "IoT Labs",
      version: "1.5.0",
      description: "Connect Philips Hue, LIFX, and other smart bulbs",
      category: "integration",
      installed: false,
      enabled: false,
      downloads: 670,
      rating: 4.3,
    },
    {
      id: "5",
      name: "Haptic Composer",
      author: "Fanalogy",
      version: "1.1.0",
      description: "Design custom haptic patterns and sequences",
      category: "control",
      installed: true,
      enabled: true,
      downloads: 1120,
      rating: 4.7,
    },
  ];

  const filteredPlugins = mockPlugins.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const installedPlugins = filteredPlugins.filter((p) => p.installed);
  const availablePlugins = filteredPlugins.filter((p) => !p.installed);

  const handleTabChange = (tab: typeof activeTab) => {
    haptics.impactLight();
    audio.click();
    setActiveTab(tab);
  };

  const handleInstall = (id: string) => {
    haptics.impactMedium();
    audio.success();
    // Install logic would go here
  };

  const handleUninstall = (id: string) => {
    haptics.impactLight();
    audio.warning();
    // Uninstall logic would go here
  };

  const handleToggle = (id: string) => {
    haptics.impactLight();
    audio.click();
    // Toggle logic would go here
  };

  const getCategoryColor = (category: Plugin["category"]) => {
    const colors = {
      experience: "#22d3ee",
      effect: "#a78bfa",
      control: "#fb923c",
      device: "#10b981",
      integration: "#f59e0b",
    };
    return colors[category];
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
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 8, height: 0 },
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
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Plugins</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 16, paddingHorizontal: 16 }}>
          Extend Fabric with new experiences and tools
        </Text>

        {/* Tab Navigation */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
          {(["installed", "discover", "develop"] as const).map((tab) => (
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

        {/* Search Bar */}
        {(activeTab === "installed" || activeTab === "discover") && (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search plugins..."
              placeholderTextColor="#6b7280"
              style={{
                backgroundColor: "rgba(0,0,0,0.3)",
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.25)",
                borderRadius: 8,
                padding: 10,
                color: "white",
              }}
            />
          </View>
        )}

        {/* Content Area */}
        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
          {activeTab === "installed" && (
            <View style={{ gap: 12 }}>
              {installedPlugins.length === 0 ? (
                <Text style={{ color: "#9ca3af", textAlign: "center", marginTop: 20 }}>
                  No plugins installed yet. Discover new plugins in the Discover tab!
                </Text>
              ) : (
                installedPlugins.map((plugin) => (
                  <View
                    key={plugin.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: plugin.enabled ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.25)",
                      backgroundColor: "rgba(2,8,23,0.5)",
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{plugin.name}</Text>
                        <Text style={{ color: "#9ca3af", fontSize: 12 }}>by {plugin.author} • v{plugin.version}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleToggle(plugin.id)}
                        style={{
                          width: 40,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: plugin.enabled ? "#10b981" : "#6b7280",
                          justifyContent: "center",
                          alignItems: plugin.enabled ? "flex-end" : "flex-start",
                          paddingHorizontal: 2,
                        }}
                      >
                        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "white" }} />
                      </Pressable>
                    </View>
                    <Text style={{ color: "#cbd5e1", fontSize: 13, marginBottom: 8 }}>{plugin.description}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 6,
                          backgroundColor: `${getCategoryColor(plugin.category)}20`,
                          borderWidth: 1,
                          borderColor: `${getCategoryColor(plugin.category)}50`,
                        }}
                      >
                        <Text style={{ color: getCategoryColor(plugin.category), fontSize: 11, fontWeight: "600" }}>
                          {plugin.category}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleUninstall(plugin.id)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          borderRadius: 6,
                          backgroundColor: "rgba(239,68,68,0.2)",
                          borderWidth: 1,
                          borderColor: "rgba(239,68,68,0.5)",
                        }}
                      >
                        <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "600" }}>Uninstall</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === "discover" && (
            <View style={{ gap: 12 }}>
              {availablePlugins.length === 0 ? (
                <Text style={{ color: "#9ca3af", textAlign: "center", marginTop: 20 }}>
                  No plugins found. Try a different search term.
                </Text>
              ) : (
                availablePlugins.map((plugin) => (
                  <View
                    key={plugin.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.25)",
                      backgroundColor: "rgba(2,8,23,0.5)",
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{plugin.name}</Text>
                        <Text style={{ color: "#9ca3af", fontSize: 12 }}>by {plugin.author} • v{plugin.version}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: "#fbbf24", fontSize: 12 }}>★ {plugin.rating}</Text>
                        <Text style={{ color: "#9ca3af", fontSize: 11 }}>{plugin.downloads} downloads</Text>
                      </View>
                    </View>
                    <Text style={{ color: "#cbd5e1", fontSize: 13, marginBottom: 8 }}>{plugin.description}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 6,
                          backgroundColor: `${getCategoryColor(plugin.category)}20`,
                          borderWidth: 1,
                          borderColor: `${getCategoryColor(plugin.category)}50`,
                        }}
                      >
                        <Text style={{ color: getCategoryColor(plugin.category), fontSize: 11, fontWeight: "600" }}>
                          {plugin.category}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleInstall(plugin.id)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          borderRadius: 6,
                          backgroundColor: "rgba(34,211,238,0.2)",
                          borderWidth: 1,
                          borderColor: "rgba(34,211,238,0.5)",
                        }}
                      >
                        <Text style={{ color: "#22d3ee", fontSize: 12, fontWeight: "600" }}>Install</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === "develop" && (
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
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Plugin SDK</Text>
                <Text style={{ color: "#93c5fd", fontSize: 13, marginBottom: 12 }}>
                  Create your own extensions for Fabric
                </Text>
                <Pressable
                  onPress={() => { haptics.impactMedium(); audio.click(); }}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: "rgba(34,211,238,0.2)",
                    borderWidth: 1,
                    borderColor: "rgba(34,211,238,0.5)",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: "#22d3ee", fontWeight: "700" }}>View Documentation</Text>
                </Pressable>
                <Pressable
                  onPress={() => { haptics.impactMedium(); audio.click(); }}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: "rgba(16,185,129,0.2)",
                    borderWidth: 1,
                    borderColor: "rgba(16,185,129,0.5)",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#10b981", fontWeight: "700" }}>Create New Plugin</Text>
                </Pressable>
              </View>

              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.25)",
                  backgroundColor: "rgba(2,8,23,0.5)",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700", marginBottom: 8 }}>Resources</Text>
                <Text style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 20 }}>
                  • Plugin API Reference{"\n"}
                  • Example Plugins{"\n"}
                  • Publishing Guidelines{"\n"}
                  • Community Forum{"\n"}
                  • Testing Tools
                </Text>
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