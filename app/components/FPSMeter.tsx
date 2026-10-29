/**
 * RETIRED — Slice 29. Do not mount.
 *
 * This FPS readout lived in the same top-right corner as the
 * connection badge (top:42, right under it). Terrell's rule for
 * that corner is now absolute: no FPS, ever — the corner belongs
 * to the Essence. The real diagnostic surface remains the
 * engine's ?diag=1 panel in LegacyFluid. This file is kept for
 * reference (marked retired, not deleted); nothing imports it.
 */

import React, { useEffect, useRef, useState } from "react";
import { Platform, View, Text } from "react-native";

export default function FPSMeter() {
  if (Platform.OS !== "web") return null;

  const [fps, setFps] = useState<number>(0);
  const lastRef = useRef<number>(performance.now());
  const framesRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = () => {
      const now = performance.now();
      framesRef.current += 1;
      const dt = now - lastRef.current;
      if (dt >= 500) {
        const f = (framesRef.current / dt) * 1000;
        setFps(Math.round(f));
        framesRef.current = 0;
        lastRef.current = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 42, // just under ConnectionBadge (top 12 + ~chip height)
        right: 12,
        zIndex: 60,
        backgroundColor: "rgba(2,8,23,0.7)",
        borderColor: "rgba(34,211,238,0.5)",
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 4,
        paddingHorizontal: 8,
      }}
    >
      <Text style={{ color: "#e5e7eb", fontWeight: "800", fontSize: 12 }}>{fps} FPS</Text>
    </View>
  );
}