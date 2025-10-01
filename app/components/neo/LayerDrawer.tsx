import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useLayerDrawer } from "./LayerDrawerContext";
import { useExperience } from "../../context/ExperienceContext";
import LayerControls from "../LayerControls";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";
import { confirmAction } from "../../utils/confirm";

const WIDTH = 420;

export default function LayerDrawer() {
  const { open, closeDrawer } = useLayerDrawer();
  const { state, switchExperience } = useExperience();
  const { availableExperiences, activeExperience } = state;
  const haptics = useHaptics();
  const toast = useToast();

  const tx = useRef(new Animated.Value(WIDTH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(tx, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(tx, { toValue: WIDTH, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [open, tx, backdrop]);

  const requestSwitch = async (id: string, name: string) => {
    if (activeExperience?.id === id) return;
    const ok = await confirmAction("Switch Layer?", `Load “${name}” and show its controls?`);
    if (!ok) return;
    await switchExperience(id);
    haptics.notifySuccess();
    toast.show(`Switched to ${name}`);
  };

  return (
    <>
      {open ? (
        <Animated.View
          style={{ position: "absolute", inset: 0 as unknown as number, backgroundColor: "rgba(0,0,0,0.5)", opacity: backdrop, zIndex: 83 }}
        >
          <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: WIDTH, transform: [{ translateX: tx }], zIndex: 84 }}
        pointerEvents="box-none"
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: WIDTH,
            backgroundColor: "rgba(6,10,22,0.96)",
            borderLeftColor: "rgba(34,211,238,0.35)",
            borderLeftWidth: 1,
            paddingTop: 56,
            paddingHorizontal: 16,
            shadowColor: "#22d3ee",
            shadowOpacity: 0.45,
            shadowRadius: 22,
            shadowOffset: { width: -8, height: 0 },
          }}
        >
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18, marginBottom: 12 }}>
            Layer
          </Text>
          <Text style={{ color: "#93c5fd", marginBottom: 12 }}>
            Choose your experience and tune only its controls.
          </Text>

          {/* Layers list */}
          <View style={{ gap: 8, marginBottom: 12 }}>
            {availableExperiences.map((exp) => {
              const active = exp.id === activeExperience?.id;
              return (
                <Pressable
                  key={exp.id}
                  onPress={() => void requestSwitch(exp.id, exp.name)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
                    backgroundColor: active ? "rgba(2,132,199,0.22)" : "rgba(2,8,23,0.6)",
                  }}
                >
                  <Text style={{ color: active ? "#22d3ee" : "#e5e7eb", fontWeight: "700" }}>
                    {exp.name}
                  </Text>
                  <Text style={{ color: "#9ca3af", fontSize: 11 }}>{exp.type} • v{exp.version}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Experience-specific controls */}
          <LayerControls />

          <View style={{ position: "absolute", bottom: 12, left: 16 }}>
            <Text style={{ color: "#a3e635", fontSize: 12 }}>Powered by Nirvana</Text>
          </View>
        </View>
      </Animated.View>
    </>
  );
}