import React from "react";
import { View, Text } from "react-native";

export default function HomeScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "transparent",
      }}
    >
      {/* Centered title overlay (non-interactive) */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0 as unknown as number,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 56,
            fontWeight: "800",
            color: "white",
            textAlign: "center",
            letterSpacing: 1,
            textShadowColor: "rgba(34,211,238,0.25)",
            textShadowRadius: 12,
            textShadowOffset: { width: 0, height: 2 },
          }}
        >
          Fabric
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 16,
            color: "#93c5fd",
            textAlign: "center",
          }}
        >
          By Fanalogy
        </Text>
      </View>
    </View>
  );
}