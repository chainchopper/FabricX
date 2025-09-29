import { useLocalSearchParams } from "expo-router";
import { View, Text, Pressable, Vibration } from "react-native";
import { useToast } from "../components/Toast";
import { useHaptics } from "../hooks/useHaptics";
import { useLayers } from "../context/LayersContext";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import FabricCanvas from "../components/FabricCanvas";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export default function FabricRoom() {
  const { layerId } = useLocalSearchParams<{ layerId?: string }>();
  const id = String(layerId || "");
  const { layers, addLayer } = useLayers();
  const layer = layers.find((l) => l.id === id);

  const toast = useToast();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();

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
    const name = layer?.name ?? `Layer ${id}`;
    addLayer({ id, name });
    haptics.notifySuccess();
    toast.show("Saved to recent");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1020" }}>
      {/* Full-screen Fabric Canvas */}
      <View style={{ flex: 1 }}>
        <FabricCanvas fullScreen onTouch={handleCanvasTouch} />
      </View>

      {/* Minimal Overlays */}
      <SafeAreaView
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 8,
          paddingHorizontal: 10,
        }}
      >
        {/* Top-left: Layer info */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 10,
            backgroundColor: "rgba(2,8,23,0.6)",
            borderColor: "rgba(34,211,238,0.35)",
            borderWidth: 1,
            borderRadius: 10,
            paddingVertical: 6,
            paddingHorizontal: 10,
          }}
        >
          <Text style={{ color: "#e5e7eb", fontWeight: "800" }}>
            {layer?.name ?? `Layer ${id}`}
          </Text>
          <Text style={{ color: "#93c5fd", fontSize: 12 }} numberOfLines={1}>
            ID: {id}
          </Text>
        </View>

        {/* Top-right: Invite */}
        <Pressable
          onPress={handleInvite}
          style={{
            position: "absolute",
            top: insets.top + 8,
            right: 10,
            backgroundColor: "rgba(2,132,199,0.18)",
            borderColor: "rgba(34,211,238,0.6)",
            borderWidth: 1,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#22d3ee", fontWeight: "700" }}>Invite</Text>
        </Pressable>

        {/* Bottom-right: Pulse */}
        <Pressable
          onPress={handleTouchPulse}
          style={{
            position: "absolute",
            bottom: insets.bottom + 14,
            right: 12,
            backgroundColor: "#0891b2",
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            shadowColor: "#22d3ee",
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Pulse</Text>
        </Pressable>

        {/* Bottom-left: Save (only if not in recent) */}
        {!layer ? (
          <Pressable
            onPress={handleSaveToRecent}
            style={{
              position: "absolute",
              bottom: insets.bottom + 14,
              left: 12,
              backgroundColor: "rgba(2,8,23,0.6)",
              borderColor: "rgba(34,211,238,0.5)",
              borderWidth: 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Save</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}