import React from "react";
import { Animated, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useNewDrawers } from "./NewDrawersContext";

export default function ProfileDrawer() {
  const { back, getAnim } = useNewDrawers();
  const { tx, width } = getAnim("profile");

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0, bottom: 0, left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 200,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0, width,
          backgroundColor: "rgba(10,14,28,0.96)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Pressable
            onPress={() => back()}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Profile</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <Image source={require("../../../logo.png")} style={{ width: 96, height: 96, borderRadius: 16 }} />
            <Text style={{ color: "white", fontWeight: "800", marginTop: 8 }}>Weaver</Text>
            <Text style={{ color: "#93c5fd" }}>Online</Text>
          </View>

          <View style={{ backgroundColor: "rgba(15,23,42,0.85)", borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <Text style={{ color: "#e5e7eb" }}>Bio</Text>
            <Text style={{ color: "#9ca3af", marginTop: 6 }}>Multi-sensory explorer. Building with Fabric.</Text>
          </View>

          <View style={{ backgroundColor: "rgba(15,23,42,0.85)", borderWidth: 1, borderColor: "rgba(148,163,184,0.35)", borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <Text style={{ color: "#e5e7eb" }}>Preferences</Text>
            <Text style={{ color: "#9ca3af", marginTop: 6 }}>Personalization lives in Global Controls.</Text>
          </View>

          <View style={{ marginTop: 8 }}>
            <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
}