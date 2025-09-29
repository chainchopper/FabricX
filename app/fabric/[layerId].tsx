import { useLocalSearchParams, router } from "expo-router";
import { View, Text, Pressable, Vibration } from "react-native";
import TopNav from "../components/TopNav";
import { useToast } from "../components/Toast";
import { useHaptics } from "../hooks/useHaptics";

export default function FabricRoom() {
  const { layerId } = useLocalSearchParams<{ layerId: string }>();
  const toast = useToast();
  const haptics = useHaptics();

  const handleTouchPulse = () => {
    // Visual/haptic pulse
    Vibration.vibrate([80, 40, 80]);
    haptics.impactHeavy();
    toast.show("Pulse sent");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      <TopNav />
      <View
        style={{
          flex: 1,
          paddingTop: 72,
          paddingHorizontal: 16,
          gap: 16,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: "white", fontSize: 24, fontWeight: "800" }}>
            Fabric Layer
          </Text>
          <Text style={{ color: "#a5b4fc" }}>ID: {String(layerId || "")}</Text>
        </View>

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
            This is a placeholder for the 3D fabric canvas. Tap the button below
            to simulate a connection pulse (vibration).
          </Text>

          <Pressable
            onPress={handleTouchPulse}
            style={{
              backgroundColor: "#0891b2",
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "700" }}>Touch Pulse</Text>
          </Pressable>
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