import { View, Text, Pressable } from "react-native";
import { Link } from "expo-router";
import TopNav from "./components/TopNav";

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <TopNav />

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingTop: 56,
          gap: 16,
        }}
      >
        <Text
          style={{
            fontSize: 56,
            fontWeight: "800",
            color: "white",
            textAlign: "center",
            letterSpacing: 1,
          }}
        >
          Fabric
        </Text>
        <Text
          style={{
            fontSize: 18,
            color: "#a5b4fc",
            textAlign: "center",
            maxWidth: 520,
          }}
        >
          Weave Reality Together • Multi‑Sensory Social Platform
        </Text>
        <Text style={{ fontSize: 14, color: "#22d3ee" }}>Powered by Nirvana AI</Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Link href="/dashboard" asChild>
            <Pressable
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor: "#0891b2",
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Start Weaving</Text>
            </Pressable>
          </Link>
          <Link href="/plugins" asChild>
            <Pressable
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderColor: "#22d3ee",
                borderWidth: 1,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#22d3ee", fontWeight: "600" }}>Explore Plugins</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View
        style={{
          paddingVertical: 14,
          alignItems: "center",
          borderTopWidth: 1,
          borderColor: "rgba(55,65,81,0.6)",
        }}
      >
        <Text style={{ color: "#9ca3af" }}>
          © 2024 Fanalogy. Fabric Platform. Powered by Nirvana.
        </Text>
      </View>
    </View>
  );
}