import { View, Text, Pressable } from "react-native";
import { Link } from "expo-router";

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingTop: 24,
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
            textShadowColor: "rgba(34,211,238,0.25)",
            textShadowRadius: 12,
            textShadowOffset: { width: 0, height: 2 },
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

        <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
          <Link href="/dashboard" asChild>
            <Pressable
              style={{
                paddingVertical: 14,
                paddingHorizontal: 18,
                borderRadius: 14,
                backgroundColor: "rgba(2,8,23,0.6)",
                borderColor: "rgba(34,211,238,0.5)",
                borderWidth: 1,
                shadowColor: "#22d3ee",
                shadowOpacity: 0.55,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>Start Weaving</Text>
            </Pressable>
          </Link>

          <Link href="/plugins" asChild>
            <Pressable
              style={{
                paddingVertical: 14,
                paddingHorizontal: 18,
                borderRadius: 14,
                backgroundColor: "rgba(2,132,199,0.12)",
                borderColor: "rgba(34,211,238,0.5)",
                borderWidth: 1,
                shadowColor: "#22d3ee",
                shadowOpacity: 0.4,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Text style={{ color: "#22d3ee", fontWeight: "800" }}>Explore Plugins</Text>
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