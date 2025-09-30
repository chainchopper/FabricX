import React from "react";
import { Platform, View, Text } from "react-native";
import { useAR } from "../context/ARContext";

export default function ARStatus() {
  if (Platform.OS !== "web") return null;
  const { isARCameraActive } = useAR();

  if (!isARCameraActive) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        zIndex: 60,
        backgroundColor: "rgba(16,185,129,0.18)",
        borderColor: "rgba(16,185,129,0.6)",
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: "#34d399", fontWeight: "800" }}>AR Camera Active</Text>
    </View>
  );
}