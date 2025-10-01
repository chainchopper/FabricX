import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, Text, View } from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import LayerControls from "../LayerControls";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";
import { confirmAction } from "../../utils/confirm";
import { useNewDrawers } from "./NewDrawersContext";

export default function LayerDrawer() {
  const { state, switchExperience } = useExperience();
  const { availableExperiences, activeExperience } = state;
  const haptics = useHaptics();
  const toast = useToast();
  const { openName, back, getAnim } = useNewDrawers();

  const { tx, width } = getAnim("layer"); // tx: -width (closed) to 0 (open)
  const isOpen = openName === "layer";

  // Realtime preview (low res) via dataURL updated while open
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const capture = () => {
      const main = document.getElementById("fabric-canvas") as HTMLCanvasElement | null;
      if (!main) return;
      try {
        const scaleW = 320;
        const scaleH = Math.max(160, Math.round(scaleW * 9 / 16));
        const off = document.createElement("canvas");
        off.width = scaleW;
        off.height = scaleH;
        const ctx = off.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(main, 0, 0, scaleW, scaleH);
        const uri = off.toDataURL("image/webp", 0.6);
        setPreviewUri(uri);
      } catch {
        // ignore failures (cross-origin, etc.)
      }
    };
    capture();
    timerRef.current = window.setInterval(capture, 250) as unknown as number; // ~4fps for light weight
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen]);

  const requestSwitch = async (id: string, name: string) => {
    if (activeExperience?.id === id) return;
    const ok = await confirmAction("Switch Layer?", `Load “${name}” and show its controls?`);
    if (!ok) return;
    await switchExperience(id);
    haptics.notifySuccess();
    toast.show(`Switched to ${name}`);
  };

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width,
        transform: [{ translateX: tx }],
        zIndex: 84,
      }}
      pointerEvents="box-none"
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width,
          backgroundColor: "rgba(6,10,22,0.96)",
          borderRightColor: "rgba(34,211,238,0.35)",
          borderRightWidth: 1,
          paddingTop: 56,
          paddingHorizontal: 16,
          shadowColor: "#22d3ee",
          shadowOpacity: 0.45,
          shadowRadius: 22,
          shadowOffset: { width: 8, height: 0 },
        }}
      >
        {/* Header with Back */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Pressable
            onPress={() => back()}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>← Back</Text>
          </Pressable>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>Layer</Text>
        </View>
        <Text style={{ color: "#93c5fd", marginBottom: 12 }}>
          Choose your experience and tune only its controls.
        </Text>

        {/* Preview */}
        <View style={{ marginBottom: 12, alignItems: "center" }}>
          <View
            style={{
              width: 320,
              height: 180,
              backgroundColor: "rgba(2,8,23,0.6)",
              borderColor: "rgba(34,211,238,0.35)",
              borderWidth: 1,
              borderRadius: 10,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={{ width: 320, height: 180 }}
                resizeMode="cover"
              />
            ) : (
              <Text style={{ color: "#9ca3af" }}>Preview loading…</Text>
            )}
          </View>
        </View>

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
  );
}