import { View, Text, Pressable } from "react-native";
import BackToFabric from "./components/BackToFabric";
import WebFluidBackground from "./components/WebFluidBackground";

export default function Profile() {
  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <WebFluidBackground />
      <BackToFabric />
      <View
        style={{
          flex: 1,
          paddingTop: 64,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        <Text style={{ color: "white", fontSize: 26, fontWeight: "800" }}>
          Your Profile
        </Text>
        <Text style={{ color: "#a3a3a3" }}>
          Manage your preferences and identity. More coming soon.
        </Text>

        <View style={{ marginTop: 12, gap: 8 }}>
          <View
            style={{
              backgroundColor: "rgba(15,23,42,0.85)",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text style={{ color: "#e5e7eb" }}>Username: Weaver</Text>
            <Text style={{ color: "#9ca3af", marginTop: 4 }}>Status: Online</Text>
          </View>

          <Pressable
            style={{
              backgroundColor: "#0891b2",
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Edit Profile</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}