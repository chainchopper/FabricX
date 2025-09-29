import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import TopNav from "./components/TopNav";
import { useToast } from "./components/Toast";
import { useHaptics } from "./hooks/useHaptics";

type Plugin = {
  id: string;
  name: string;
  desc: string;
  installed: boolean;
};

const INITIAL_PLUGINS: Plugin[] = [
  { id: "music-visualizer", name: "Music Visualizer", desc: "Transform audio into visual patterns", installed: true },
  { id: "portal-effects", name: "Portal Effects", desc: "Create wormholes and gates", installed: true },
  { id: "haptic-sequences", name: "Haptic Sequences", desc: "Program vibration patterns", installed: false },
  { id: "ai-companion", name: "AI Companion", desc: "Learns your style", installed: false },
];

export default function PluginGallery() {
  const [plugins, setPlugins] = useState<Plugin[]>(INITIAL_PLUGINS);
  const toast = useToast();
  const haptics = useHaptics();

  const handleInstall = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, installed: true } : p))
    );
    haptics.notifySuccess();
    const name = plugins.find((p) => p.id === id)?.name || "Plugin";
    toast.show(`${name} installed`);
  };

  const handleConfigure = (id: string) => {
    const name = plugins.find((p) => p.id === id)?.name || "Plugin";
    haptics.impactLight();
    toast.show(`Open ${name} settings (coming soon)`);
  };

  const handlePreview = (id: string) => {
    const name = plugins.find((p) => p.id === id)?.name || "Plugin";
    haptics.impactMedium();
    toast.show(`Preview ${name} (coming soon)`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <TopNav />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 72,
          paddingBottom: 24,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        <Text style={{ color: "white", fontSize: 26, fontWeight: "800", marginBottom: 8 }}>
          Plugin Gallery
        </Text>

        {plugins.map((p) => (
          <View
            key={p.id}
            style={{
              backgroundColor: "#0f172a",
              borderWidth: 1,
              borderLeftWidth: 4,
              borderColor: p.installed ? "rgba(34,197,94,0.8)" : "rgba(34,211,238,0.8)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
              {p.name}
            </Text>
            <Text style={{ color: "#cbd5e1", marginTop: 4 }}>{p.desc}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={() => (p.installed ? handleConfigure(p.id) : handleInstall(p.id))}
                style={{
                  backgroundColor: p.installed ? "transparent" : "#0891b2",
                  borderColor: p.installed ? "#22d3ee" : "transparent",
                  borderWidth: p.installed ? 1 : 0,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: p.installed ? "#22d3ee" : "white", fontWeight: "700" }}>
                  {p.installed ? "Configure" : "Install"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handlePreview(p.id)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: "transparent",
                  borderColor: "rgba(148,163,184,0.5)",
                  borderWidth: 1,
                }}
              >
                <Text style={{ color: "#e5e7eb", fontWeight: "600" }}>Preview</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View
          style={{
            marginTop: 24,
            alignItems: "center",
            borderTopWidth: 1,
            borderColor: "rgba(55,65,81,0.6)",
            paddingTop: 12,
          }}
        >
          <Text style={{ color: "#9ca3af" }}>
            Powered by Nirvana
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}