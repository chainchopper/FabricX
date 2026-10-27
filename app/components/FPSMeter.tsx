import React, { useEffect, useRef, useState } from "react";
import { Platform, View, Text } from "react-native";
import { colors, radius, spacing, type } from "../../src/theme/tokens";

/**
 * FPSMeter — diagnostics only (Slice 3).
 *
 * The spec is explicit: the FPS meter never sits on the default path.
 * It renders only when diagnostics are enabled for this browser —
 * open the app with ?diag=1, or set localStorage
 * "fabric_diagnostics_v1" to "1". The live diagnostics surface is
 * FabricDiagnostics; this meter is the quick-glance companion to it.
 *
 * Powered by Nirvana
 */

function diagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has("diag")) return true;
    return window.localStorage.getItem("fabric_diagnostics_v1") === "1";
  } catch {
    return false;
  }
}

export default function FPSMeter() {
  if (Platform.OS !== "web") return null;

  const [diag] = useState<boolean>(() => diagnosticsEnabled());
  const [fps, setFps] = useState<number>(0);
  const lastRef = useRef<number>(performance.now());
  const framesRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!diag) return;
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
  }, [diag]);

  if (!diag) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 116, // under the connection chip, right edge
        right: spacing.md,
        zIndex: 60,
        backgroundColor: colors.panel,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: radius.card,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontWeight: type.semibold,
          fontSize: type.caption,
        }}
      >
        {fps} FPS
      </Text>
    </View>
  );
}
