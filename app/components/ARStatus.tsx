import React from "react";
import { Platform, View, Text } from "react-native";
import { useAR } from "../context/ARContext";
import { ChromeMount } from "../../src/components/ui/ChromeMount";

export default function ARStatus() {
  if (Platform.OS !== "web") return null;
  const { isARCameraActive, lastError } = useAR();

  const show = isARCameraActive || !!lastError;
  const isError = !!lastError && !isARCameraActive;

  // Slice 44 (chrome discipline): this chip used to pop in at
  // bottom:12 left:12 — inside the ExperienceHUD cluster's
  // band, zIndex 60 against the HUD's own 60, so on the piano
  // layer it rendered under/over the keyboard controls by
  // paint order. It now owns the top-left status anchor
  // (top:104, below the status-chip slot at 68–97) and fades
  // through ChromeMount like every other canvas element.
  return (
    <ChromeMount
      visible={show}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 104,
        left: 12,
        zIndex: 60,
      }}
    >
      <View
        pointerEvents="none"
        style={{
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
    </ChromeMount>
  );
}