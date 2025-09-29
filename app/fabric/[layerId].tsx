import { useLocalSearchParams, router } from "expo-router";
import { View, Text, Pressable, Vibration } from "react-native";
import { useToast } from "../components/Toast";
import { useHaptics } from "../hooks/useHaptics";
import { useLayers } from "../context/LayersContext";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import FabricCanvas from "../components/FabricCanvas";

export default function FabricRoom() {
  const { layerId } = useLocalSearchParams<{ layerId?: string }>();
  const id = String(layerId || "");
  const { layers, addLayer } = useLayers();
  const layer = layers.find((l) => l.id === id);

  const toast = useToast();
  const haptics = useHaptics();

  const handleCanvasTouch = () => {
    // Potential hook for realtime propagation later; keep simple now
    Vibration.vibrate([30]);
    haptics.impactLight();
  };

  const handleTouchPulse = () => {
    Vibration.vibrate([80, 40, 80]);
    haptics.impactHeavy();
    toast.show("Pulse sent");
  };

  const handleInvite = async () => {
    const url = Linking.createURL(`/fabric/${id}`);
    await Clipboard.setStringAsync(url);
    haptics.notifySuccess();
    toast.show("Invite link copied");
  };

  const handleSaveToRecent = () => {
    const name = `Layer ${id}`;
    addLayer({ id, name });
    haptics.notifySuccess();
    toast.show("Saved to recent");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <View
        style={{
          flex: 1,
          paddingTop: 24,
          paddingHorizontal: 16,
          gap: 16,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: "white", fontSize: 24, fontWeight: "800" }}>
            Fabric Layer
          </Text>
          <Text style={{ color: "#a5b4fc" }}>ID: {id}</Text>
          {layer?.name ? (
            <Text style={{ color: "#93c5fd" }}>Name: {layer.name}</Text>
          ) : (
            <View
              style={{
                marginTop: 8,
                backgroundColor: "rgba(2,132,199,0.15)",
                borderColor: "rgba(34,211,238,0.35)",
                borderWidth: 1,
                borderRadius: 10,
                padding: 10,
                gap: 8,
              }}
            >
              <Text style={{ color: "#bae6fd" }}>
                This layer isn’t in your recent list yet.
              </Text>
              <Pressable
                onPress={handleSaveToRecent}
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: "#0891b2",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  Save to Recent
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Interactive Fabric Canvas */}
        <FabricCanvas height={280} onTouch={handleCanvasTouch} />

        <View
          style={{
            backgroundColor: "#0f172a",
            borderWidth: 1,
            borderColor: "rgba(34,211,238,0.2)",
            borderRadius: 12,
            padding: 14,
            gap: 12,
          }}
        >
          <Text style={{ color: "#cbd5e1" }}>
            Touch the Fabric above to send ripples. Use actions to interact or share.
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={handleTouchPulse}
              style={{
                backgroundColor: "#0891b2",
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Send Pulse</Text>
            </Pressable>
            <Pressable
              onPress={handleInvite}
              style={{
                borderColor: "#22d3ee",
                borderWidth: 1,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Invite</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => router.push("/dashboard")}
            style={{
              borderColor: "#22d3ee",
              borderWidth: 1,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Back to Dashboard</Text>
          </Pressable>
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
        <Text style={{ color: "#9ca3af" }}>Powered by Nirvana</Text>
      </View>
    </View>
  );
}