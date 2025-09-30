import React from "react";
import { Platform, View, Text } from "react-native";
import { useAR } from "../context/ARContext";

export default function ARStatus() {
  if (Platform.OS !== "web") return null;
  const { isARCameraActive, lastError } = useAR();

  if (!isARCameraActive && !lastError) return null;

  const isError = !!lastError && !isARCameraActive;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        zIndex: 60,
        backgroundColor: isError ? "rgba(234,179,8,0.18)" : "rgba(16,185,129,0.18)",
        borderColor: isError ? "rgba(234,179,8,0.6)" : "rgba(16,185,129,0.6)",
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        maxWidth: 320,
      }}
    >
      {isError ? (
        <>
          <Text style={{ color: "#fbbf24", fontWeight: "800" }}>Camera blocked</Text>
          <Text style={{ color: "#fde68a", marginTop: 2 }} numberOfLines={2}>
            {lastError}
          </Text>
        </>
      ) : (
        <Text style={{ color: "#34d399", fontWeight: "800" }}>AR Camera Active</Text>
      )}
    </View>
  );
}