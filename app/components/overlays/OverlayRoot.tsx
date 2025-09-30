import React from "react";
import { Animated, Easing, Pressable, View, Text, ScrollView } from "react-native";
import { useOverlays } from "../../context/OverlayContext";
import DashboardOverlay from "./DashboardOverlay";
import PluginsOverlay from "./PluginsOverlay";
import ProfileOverlay from "./ProfileOverlay";
import StudioOverlay from "./StudioOverlay";
import FabricDiagnostics from "../FabricDiagnostics";

export default function OverlayRoot() {
  const { state, close } = useOverlays();
  const { type, open } = state;

  const [opacity] = React.useState(new Animated.Value(0));
  const [slide] = React.useState(new Animated.Value(0));

  React.useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [open, opacity, slide]);

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  const renderContent = () => {
    switch (type) {
      case "dashboard":
        return <DashboardOverlay onClose={close} />;
      case "plugins":
        return <PluginsOverlay onClose={close} />;
      case "profile":
        return <ProfileOverlay onClose={close} />;
      case "studio":
        return <StudioOverlay onClose={close} />;
      case "diagnostics":
        return (
          <View style={{ padding: 12 }}>
            <FabricDiagnostics />
          </View>
        );
      default:
        return null;
    }
  };

  if (!open || !type) return null;

  return (
    <>
      <Animated.View
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          opacity,
          zIndex: 58,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={close} />
      </Animated.View>

      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          transform: [{ translateX }],
          zIndex: 59,
          backgroundColor: "rgba(15,23,42,0.95)",
          borderLeftColor: "rgba(34,211,238,0.35)",
          borderLeftWidth: 1,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: -6, height: 0 },
        }}
      >
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18, marginBottom: 8 }}>
            {type === "dashboard" ? "Dashboard" : type === "plugins" ? "Plugins" : type === "profile" ? "Profile" : type === "studio" ? "Studio" : "Fabric Diagnostics"}
          </Text>
          {renderContent()}
        </ScrollView>
      </Animated.View>
    </>
  );
}