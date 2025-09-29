import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import TopNav from "../components/TopNav";
import { useToast } from "../components/Toast";
import { useHaptics } from "../hooks/useHaptics";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export default function NewFabricLayer() {
  const [name, setName] = useState("");
  const toast = useToast();
  const haptics = useHaptics();

  const isValid = useMemo(() => name.trim().length >= 2, [name]);

  const handleCreate = () => {
    if (!isValid) return;
    const id = slugify(name) || `layer-${Date.now().toString(36)}`;
    haptics.notifySuccess();
    toast.show("Layer created");
    router.push(`/fabric/${id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <TopNav />
      <View
        style={{
          flex: 1,
          paddingTop: 72,
          paddingHorizontal: 16,
          gap: 16,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: "white", fontSize: 26, fontWeight: "800" }}>
            New Fabric Layer
          </Text>
          <Text style={{ color: "#93c5fd" }}>
            Name your layer and start weaving.
          </Text>
        </View>

        <View
          style={{
            backgroundColor: "#0f172a",
            borderWidth: 1,
            borderColor: "rgba(34,211,238,0.25)",
            borderRadius: 12,
            padding: 14,
            gap: 12,
          }}
        >
          <Text style={{ color: "#e5e7eb", marginBottom: 4 }}>Layer name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Synesthesia Studio"
            placeholderTextColor="#6b7280"
            autoFocus
            style={{
              backgroundColor: "#111827",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              borderRadius: 10,
              color: "white",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />

          <Pressable
            onPress={handleCreate}
            disabled={!isValid}
            style={{
              marginTop: 8,
              backgroundColor: isValid ? "#0891b2" : "rgba(8,145,178,0.4)",
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>
              Create Layer
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
          }}
        />

        <View
          style={{
            paddingVertical: 14,
            alignItems: "center",
            borderTopWidth: 1,
            borderColor: "rgba(55,65,81,0.6)",
          }}
        >
          <Text style={{ color: "#9ca3af" }}>
            Powered by Nirvana
          </Text>
        </View>
      </View>
    </View>
  );
}