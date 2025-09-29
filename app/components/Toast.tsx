import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";

type Toast = { id: number; message: string };
type ToastContextType = { show: (message: string) => void };

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateOut = (onDone: () => void) => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 8,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(onDone);
  };

  const show = useCallback((message: string) => {
    const id = Date.now();
    setQueue((q) => [...q, { id, message }]);

    // If not already visible, animate in
    if (queue.length === 0) {
      animateIn();
    }

    // Reset timer
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      animateOut(() => setQueue((q) => q.slice(1)));
    }, 2000);
  }, [queue.length]);

  const value = useMemo(() => ({ show }), [show]);

  const current = queue[0];

  return (
    <ToastContext.Provider value={value}>
      <View style={{ flex: 1 }}>{children}</View>
      {current ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastWrap,
            { opacity, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.toast}>
            <Text style={styles.toastText}>{current.message}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  toastWrap: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    backgroundColor: "rgba(15,23,42,0.95)",
    borderColor: "rgba(34,211,238,0.35)",
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  toastText: {
    color: "#e5e7eb",
    fontWeight: "600",
  },
});