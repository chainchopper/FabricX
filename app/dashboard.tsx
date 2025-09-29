import { View, Text, Pressable, ScrollView } from "react-native";
import { Link } from "expo-router";
import { useLayers, Layer } from "./context/LayersContext";
import { useToast } from "./components/Toast";
import { useHaptics } from "./hooks/useHaptics";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";

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
  const { layers, removeLayer, clear } = useLayers();
  const toast = useToast();
  const haptics = useHaptics();

  const recent = layers.slice(0, 6);
  const fallback: Array<{ id: string; name: string; meta?: string }> = [
    { name: "Synesthesia Studio", id: "synth-1", meta: "3 weavers • 2h ago" },
    { name: "Music Learning Hub", id: "music-1", meta: "2 weavers • 1d ago" },
    { name: "Portal Playground", id: "portal-1", meta: "5 weavers • 3d ago" },
  ];
  const items: Array<{ id: string; name: string; meta?: string }> =
    recent.length > 0 ? recent.map((l: Layer) => ({ id: l.id, name: l.name })) : fallback;

  const handleInvite = async (id: string, name: string) => {
    const url = Linking.createURL(`/fabric/${id}`);
    await Clipboard.setStringAsync(url);
    haptics.notifySuccess();
    toast.show(`Invite for ${name} copied`);
  };

  const handleRemove = (id: string, name: string) => {
    removeLayer(id);
    haptics.impactLight();
    toast.show(`Removed ${name}`);
  };

  const handleClearAll = () => {
    clear();
    haptics.notifyWarning();
    toast.show("Recent layers cleared");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 24,
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
                  shadowColor: "#22d3ee",
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 6 },
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

        <View style={{ marginTop: 8, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "white", fontSize: 20, fontWeight: "800" }}>
              Recent Layers
            </Text>
            {layers.length > 0 ? (
              <Pressable
                onPress={handleClearAll}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.8)",
                  backgroundColor: "transparent",
                }}
              >
                <Text style={{ color: "#ef4444", fontWeight: "700" }}>Clear All</Text>
              </Pressable>
            ) : null}
          </View>

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
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
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

                {layers.length > 0 && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => handleInvite(item.id, item.name)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "rgba(34,211,238,0.6)",
                      }}
                    >
                      <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Invite</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemove(item.id, item.name)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "rgba(239,68,68,0.7)",
                      }}
                    >
                      <Text style={{ color: "#ef4444", fontWeight: "700" }}>Remove</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}