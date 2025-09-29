import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { useHaptics } from "../hooks/useHaptics";
import { useToast } from "./Toast";
import { useLayers } from "../context/LayersContext";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export default function QuickCreateLayer() {
  const [name, setName] = useState("");
  const haptics = useHaptics();
  const toast = useToast();
  const { addLayer } = useLayers();

  const isValid = useMemo(() => name.trim().length >= 2, [name]);

  const handleCreate = () => {
    if (!isValid) return;
    const id = slugify(name) || `layer-${Date.now().toString(36)}`;
    addLayer({ id, name: name.trim() });
    haptics.notifySuccess();
    toast.show("Layer created");
    setName("");
    router.push(`/fabric/${id}`);
  };

  return (
    <View
      style={{
        backgroundColor: "rgba(2,8,23,0.6)",
        borderColor: "rgba(34,211,238,0.25)",
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginTop: 6,
      }}
    >
      <Text style={{ color: "white", fontWeight: "800", marginBottom: 6 }}>
        Quick Create
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Layer name"
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
      <Pressable
        onPress={handleCreate}
        disabled={!isValid}
        style={{
          marginTop: 8,
          backgroundColor: isValid ? "#0891b2" : "rgba(8,145,178,0.4)",
          paddingVertical: 10,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>Create & Enter</Text>
      </Pressable>
    </View>
  );
}