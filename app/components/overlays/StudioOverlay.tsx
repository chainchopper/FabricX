import React from "react";
import { View, Text, Pressable } from "react-native";
import QuickCreateLayer from "../QuickCreateLayer";
import { useToast } from "../Toast";
import { useHaptics } from "../../hooks/useHaptics";

export default function StudioOverlay({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const haptics = useHaptics();

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: "white", fontWeight: "800" }}>Studio — Engine & Level Editor</Text>
      <Text style={{ color: "#cbd5e1" }}>Create, post, and share new layers and experiences.</Text>

      <QuickCreateLayer />

      <Pressable
        onPress={() => {
          haptics.impactLight();
          toast.show("Editor modules coming soon");
        }}
        style={{ borderColor: "rgba(34,211,238,0.6)", borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, alignItems: "center" }}
      >
        <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Open Editor</Text>
      </Pressable>

      <Pressable onPress={onClose} style={{ alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "rgba(148,163,184,0.35)" }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </View>
  );
}