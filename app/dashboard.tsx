import { View, Text, Pressable, ScrollView } from "react-native";
import { Link } from "expo-router";
import TopNav from "./components/TopNav";
import { useLayers, Layer } from "./context/LayersContext";

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: "#0f172a",
        borderWidth: 1,
        borderColor: "rgba(34,211,238,0.25)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>{title}</Text>
      {!!description && (
        <Text style={{ color: "#cbd5e1", marginTop: 4 }}>{description}</Text>
      )}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

export default function Dashboard() {
  const { layers } = useLayers();
  const recent = layers.slice(0, 6);

  const fallback: Array<{ id: string; name: string; meta?: string }> = [
    { name: "Synesthesia Studio", id: "synth-1", meta: "3 weavers • 2h ago" },
    { name: "Music Learning Hub", id: "music-1", meta: "2 weavers • 1d ago" },
    { name: "Portal Playground", id: "portal-1", meta: "5 weavers • 3d ago" },
  ];

  const items: Array<{ id: string; name: string; meta?: string }> =
    recent.length > 0 ? recent.map((l: Layer) => ({ id: l.id, name: l.name })) : fallback;

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <TopNav />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 72,
          paddingBottom: 24,
          paddingHorizontal: 16,
          gap: 16,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: "white", fontSize: 26, fontWeight: "800" }}>
            Your Fabric Dashboard
          </Text>
          <Text style={{ color: "#93c5fd" }}>
            Welcome back. Ready to weave some magic?
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <Card
            title="Create New Layer"
            description="Start a new Fabric session with custom settings"
          >
            <Link href="/fabric/new" asChild>
              <Pressable
                style={{
                  backgroundColor: "#0891b2",
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  Weave New Reality
                </Text>
              </Pressable>
            </Link>
          </Card>

          <Card title="Plugin Gallery" description="Discover and install new Looms">
            <Link href="/plugins" asChild>
              <Pressable
                style={{
                  borderColor: "#22d3ee",
                  borderWidth: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                  Explore Looms
                </Text>
              </Pressable>
            </Link>
          </Card>
        </View>

        <View style={{ marginTop: 8 }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "800", marginBottom: 10 }}>
            Recent Layers
          </Text>
          <View style={{ gap: 12 }}>
            {items.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: "#0f172a",
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.35)",
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: "#9ca3af", marginTop: 2 }}>
                    {item.meta ?? "Just created • your layer"}
                  </Text>
                </View>
                <Link href={`/fabric/${item.id}`} asChild>
                  <Pressable
                    style={{
                      borderColor: "#22d3ee",
                      borderWidth: 1,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                      Enter
                    </Text>
                  </Pressable>
                </Link>
              </View>
            ))}
          </View>
        </View>

        <View
          style={{
            marginTop: 24,
            alignItems: "center",
            borderTopWidth: 1,
            borderColor: "rgba(55,65,81,0.6)",
            paddingTop: 12,
          }}
        >
          <Text style={{ color: "#9ca3af" }}>
            Powered by Nirvana
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}