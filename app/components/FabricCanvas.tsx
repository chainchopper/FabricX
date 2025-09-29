import React, { useCallback, useRef, useState } from "react";
import { View, Pressable, Animated, StyleSheet, LayoutChangeEvent } from "react-native";
import { useHaptics } from "../hooks/useHaptics";
import { useAudioCues } from "../hooks/useAudioCues";
import { eventBus } from "../../shared/utils/eventBus";

type Ripple = {
  id: number;
  x: number;
  y: number;
  scale: Animated.Value;
  opacity: Animated.Value;
};

export interface FabricCanvasTouch {
  x: number; // local x within canvas
  y: number; // local y within canvas
  timestamp: number;
}

interface FabricCanvasProps {
  height?: number;
  fullScreen?: boolean;
  onTouch?: (t: FabricCanvasTouch) => void;
}

/**
 * FabricCanvas
 * - Game-like interactive area
 * - Tapping spawns ripples with glow; triggers haptic + soft audio cue (web only)
 * - Long-press sends a stronger "Pulse" (double ripple) with heavier feedback
 * - Emits unified input events via shared eventBus (tap/drag/long-press)
 */
export default function FabricCanvas({ height = 260, fullScreen = false, onTouch }: FabricCanvasProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [layout, setLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const idRef = useRef(0);
  const haptics = useHaptics();
  const audio = useAudioCues();

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setLayout({ width, height: h });
  };

  const norm = (x: number, y: number) => {
    const nx = layout.width > 0 ? x / layout.width : 0.5;
    const ny = layout.height > 0 ? y / layout.height : 0.5;
    return { nx: Math.min(1, Math.max(0, nx)), ny: Math.min(1, Math.max(0, ny)) };
    };

  const spawnRipple = useCallback((x: number, y: number) => {
    const id = ++idRef.current;
    const scale = new Animated.Value(0.25);
    const opacity = new Animated.Value(0.85);
    const ripple: Ripple = { id, x, y, scale, opacity };

    setRipples((prev) => [...prev, ripple]);

    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1.8,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    });
  }, []);

  const handlePressIn = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    spawnRipple(locationX, locationY);
    haptics.impactLight();
    audio.click();
    onTouch?.({ x: locationX, y: locationY, timestamp: Date.now() });

    const { nx, ny } = norm(locationX, locationY);
    eventBus.emitTap(nx, ny);
  };

  const handleLongPress = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    // Double ripple pulse
    spawnRipple(locationX, locationY);
    setTimeout(() => spawnRipple(locationX, locationY), 90);
    haptics.impactHeavy();
    audio.pulse();
    onTouch?.({ x: locationX, y: locationY, timestamp: Date.now() });

    const { nx, ny } = norm(locationX, locationY);
    eventBus.emitLongPress(nx, ny);
  };

  const handleDragMove = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    const { nx, ny } = norm(locationX, locationY);
    eventBus.emitDrag(nx, ny);
  };

  // Calculate a max radius so ripples always feel big enough across sizes
  const maxRadius = Math.max(layout.width, layout.height) * 0.55;

  return (
    <View
      style={[styles.wrap, fullScreen ? { flex: 1 } : { height }]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onResponderMove={handleDragMove}
    >
      <Pressable
        onPressIn={handlePressIn}
        onLongPress={handleLongPress}
        delayLongPress={320}
        style={styles.pressable}
      >
        {/* Subtle energy backdrop */}
        <View style={styles.energyGlow} />
        {/* Border and inner surface */}
        <View style={styles.surface} />

        {/* Ripples */}
        {ripples.map((r) => (
          <Animated.View
            key={r.id}
            pointerEvents="none"
            style={[
              styles.ripple,
              {
                left: r.x - maxRadius,
                top: r.y - maxRadius,
                width: maxRadius * 2,
                height: maxRadius * 2,
                borderRadius: maxRadius,
                transform: [{ scale: r.scale }],
                opacity: r.opacity,
              },
            ]}
          />
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
    backgroundColor: "#0a1225",
    shadowColor: "#22d3ee",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  pressable: {
    flex: 1,
  },
  energyGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,132,199,0.08)",
  },
  surface: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.65)",
  },
  ripple: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(34,211,238,0.8)",
    backgroundColor: "rgba(34,211,238,0.12)",
  },
});