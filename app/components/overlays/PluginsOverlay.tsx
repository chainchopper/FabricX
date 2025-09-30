import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useToast } from "../Toast";
import { useHaptics } from "../../hooks/useHaptics";
import { getJSON, setJSON } from "../../utils/storage";

type Plugin = { id: string; name: string; desc: string; installed: boolean };
const STORAGE_KEY = "fabric_plugins_v1";
const INITIAL_PLUGINS: Plugin[] = [
  { id: "music-visualizer", name: "Music Visualizer", desc: "Transform audio into visual patterns", installed: true },
  { id: "portal-effects", name: "Portal Effects", desc: "Create wormholes and gates", installed: true },
  { id: "haptic-sequences", name: "Haptic Sequences", desc: "Program vibration patterns", installed: false },
  { id: "ai-companion", name: "AI Companion", desc: "Learns your style", installed: false },
];

export default function PluginsOverlay({ onClose }: { onClose: () => void }) {
  const [plugins, setPlugins] = useState<Plugin[]>(INITIAL_PLUGINS);
  const toast = useToast();
  const haptics = useHaptics();

  useEffect(() => {
    getJSON<Plugin[]>(STORAGE_KEY, INITIAL_PLUGINS).then(setPlugins);
  }, []);

  useEffect(() => {
    setJSON(STORAGE_KEY, plugins);
  }, [plugins]);

  const handleInstall = (id: string) => {
    setPlugins((prev) => prev.map((p) => (p.id === id ? { ...p, installed: true } : p)));
    haptics.notifySuccess();
    const name = plugins.find((p) => p.id === id)?.name || "Plugin";
    toast.show(`${name} installed`);
  };

  const handleConfigure = (id: string) => {
    const name = plugins.find((p) => p.id === id)?.name || "Plugin";
    haptics.impactLight();
    toast.show(`Open ${name} settings (coming soon)`);
  };

  return (
    <View style={{ gap: 10 }}>
      {plugins.map((p) => (
        <View key={p.id} style={{ backgroundColor: "rgba(15,23,42,0.85)", borderWidth: 1, borderLeftWidth: 4, borderColor: p.installed ? "rgba(34,197,94,0.8)" : "rgba(34,211,238,0.8)", borderRadius: 12, padding: 14 }}>
          <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>{p.name}</Text>
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
              onPress={onClose}
              style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "rgba(148,163,184,0.5)" }}
            >
              <Text style={{ color: "#e5e7eb", fontWeight: "600" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}