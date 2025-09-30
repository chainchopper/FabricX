import React from "react";
import { View, Text, Pressable } from "react-native";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";

export default function ProfileOverlay({ onClose }: { onClose: () => void }) {
  const haptics = useHaptics();
  const toast = useToast();

  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: "rgba(15,23,42,0.85)", borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", borderRadius: 12, padding: 14 }}>
        <Text style={{ color: "#e5e7eb" }}>Username: Weaver</Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>Status: Online</Text>
      </View>
      <Pressable
        onPress={() => {
          haptics.impactLight();
          toast.show("Profile editing coming soon");
        }}
        style={{ backgroundColor: "#0891b2", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>Edit Profile</Text>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "rgba(148,163,184,0.35)" }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Close</Text>
      </Pressable>
    </View>
  );
}