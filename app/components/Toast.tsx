/**
 * Toast — the ONE toast slot (Slice 44 rewrite of the provider;
 * the public API is unchanged: ToastProvider + useToast().show).
 *
 * Terrell's chrome doctrine (Nov 2, 2026): "Toasts overlap" —
 * the old provider rendered its queue's head at bottom:24
 * centered, which is the ExperienceHUD cluster's band on every
 * fabric, and its queue discipline was broken besides: one
 * shared timer reset by every show(), so a burst held the
 * first toast up indefinitely and the followers inherited a
 * faded-out opacity with no timer of their own.
 *
 * Now:
 * - The queue discipline lives in toastQueue.ts (pure,
 *   check-driven): one visible toast, FIFO waiting capped at
 *   3, the visible toast never preempted.
 * - The slot is DECLARED: top-center, in the strip between the
 *   two corner anchors — wrapper top:14, left:70, right:110,
 *   pill maxWidth 196. At a 390pt phone the pill's worst-case
 *   rect [77,273]×[14,54] clears the F anchor ([12,64]×[12,64]),
 *   the Essence ([276,378]×[12,86]) and the status-chip slot
 *   (top:68) — and it never enters the HUD's bottom band again.
 * - Transitions are the house idiom (tokens motion range):
 *   280ms out-cubic in, 240ms in-cubic out, per toast — a toast
 *   leaving and the next arriving never share a frame at full
 *   opacity.
 *
 * Powered by Nirvana
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, Animated, Easing, StyleSheet, Platform } from "react-native";
import {
  advanceToast,
  createToastQueue,
  enqueueToast,
  TOAST_DISPLAY_MS,
  type ToastItem,
  type ToastQueueState,
} from "./toastQueue";
import { colors, motion, radius, type as typeScale } from "../../src/theme/tokens";

type ToastContextType = { show: (message: string) => void };

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const queueRef = useRef<ToastQueueState>(createToastQueue());
  const idRef = useRef(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRef = useRef<ToastItem | null>(null);
  currentRef.current = current;
  // True while the visible toast is playing its exit: a repeat
  // show() in that window must not arm a second advance timer.
  const leavingRef = useRef(false);

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [opacity, translateY]);

  const animateOut = useCallback(
    (onDone: () => void) => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: motion.fast,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(translateY, {
          toValue: 8,
          duration: motion.fast,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    },
    [opacity, translateY]
  );

  const serveCurrent = useCallback(() => {
    const item = queueRef.current.visible;
    if (!item) {
      setCurrent(null);
      return;
    }
    setCurrent(item);
    animateIn();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      leavingRef.current = true;
      animateOut(() => {
        leavingRef.current = false;
        queueRef.current = advanceToast(queueRef.current);
        serveCurrent();
      });
    }, TOAST_DISPLAY_MS);
  }, [animateIn, animateOut]);

  const show = useCallback(
    (message: string) => {
      const before = queueRef.current;
      const item: ToastItem = { id: ++idRef.current, message };
      queueRef.current = enqueueToast(before, item);
      if (!currentRef.current && queueRef.current.visible) {
        // The slot was empty: serve immediately.
        serveCurrent();
      } else if (
        currentRef.current &&
        !leavingRef.current &&
        queueRef.current.visible?.id === currentRef.current.id &&
        before.visible?.message === message
      ) {
        // The visible toast repeated itself: refresh its turn
        // instead of queueing a copy (toastQueue no-ops it).
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          leavingRef.current = true;
          animateOut(() => {
            leavingRef.current = false;
            queueRef.current = advanceToast(queueRef.current);
            serveCurrent();
          });
        }, TOAST_DISPLAY_MS);
      }
    },
    [animateOut, serveCurrent]
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      <View style={{ flex: 1 }}>{children}</View>
      {current ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toastWrap, { opacity, transform: [{ translateY }] }]}
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
    // The declared toast slot: top-center, between the corner
    // anchors (see the header for the 390pt rect math).
    top: 14,
    left: 70,
    right: 110,
    alignItems: "center",
  },
  toast: {
    maxWidth: 196,
    backgroundColor: colors.panel,
    borderColor: colors.accentLine,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.card,
  },
  toastText: {
    color: colors.text,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
});
