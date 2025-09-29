import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

export default function BackToFabric() {
  return (
    <View
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 80,
      }}
    >
      <Pressable
        onPress={() => router.replace("/")}
        style={{
          backgroundColor: "rgba(2,8,23,0.6)",
          borderColor: "rgba(34,211,238,0.6)",
          borderWidth: 1,
          borderRadius: 10,
          paddingVertical: 8,
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ color: "#22d3ee", fontWeight: "800" }}>Back to Fabric</Text>
      </Pressable>
    </View>
  );
}