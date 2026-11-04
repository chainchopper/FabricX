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
 * - Slice 61: a toast may carry ONE action (today exactly one
 *   exists: the haptics-off toast's "Enable"). The action is
 *   the pill's only touch target — the rest of the pill stays
 *   touch-transparent, so the canvas underneath is never
 *   blocked by a message. An item may also hold the slot
 *   longer than the standard turn (an actionable toast must
 *   live long enough to be read and tapped) and registers an
 *   onSettle callback, fired exactly once when it leaves,
 *   whether by its action or by expiry.
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
import { View, Text, Animated, Easing, StyleSheet, Platform, Pressable } from "react-native";
import {
  advanceToast,
  createToastQueue,
  enqueueToast,
  TOAST_DISPLAY_MS,
  type ToastAction,
  type ToastItem,
  type ToastQueueState,
} from "./toastQueue";
import { colors, motion, radius, type as typeScale } from "../../src/theme/tokens";

/** Slice 61: the optional extras a show() may carry (see header). */
export type ToastShowOptions = {
  action?: ToastAction;
  displayMs?: number;
  onSettle?: (how: "action" | "expired") => void;
};

type ToastContextType = {
  show: (message: string, options?: ToastShowOptions) => void;
};

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
  // Slice 61: the id whose onSettle already fired — an item
  // settles exactly once, however its exit paths race.
  const settledIdRef = useRef(0);

  const settleItem = useCallback(
    (item: ToastItem | null, how: "action" | "expired") => {
      if (!item?.onSettle) return;
      if (settledIdRef.current === item.id) return;
      settledIdRef.current = item.id;
      try {
        item.onSettle(how);
      } catch {
        // A settle hook must never strand the slot.
      }
    },
    []
  );

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
        settleItem(item, "expired");
        queueRef.current = advanceToast(queueRef.current);
        serveCurrent();
      });
    }, item.displayMs ?? TOAST_DISPLAY_MS);
  }, [animateIn, animateOut, settleItem]);

  const show = useCallback(
    (message: string, options?: ToastShowOptions) => {
      const before = queueRef.current;
      const item: ToastItem = {
        id: ++idRef.current,
        message,
        action: options?.action,
        displayMs: options?.displayMs,
        onSettle: options?.onSettle,
      };
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
        const refreshed = currentRef.current;
        timerRef.current = setTimeout(() => {
          leavingRef.current = true;
          animateOut(() => {
            leavingRef.current = false;
            settleItem(refreshed, "expired");
            queueRef.current = advanceToast(queueRef.current);
            serveCurrent();
          });
        }, refreshed.displayMs ?? TOAST_DISPLAY_MS);
      }
    },
    [animateOut, serveCurrent, settleItem]
  );

  // Slice 61: the visible toast's action was pressed. The
  // action runs, the item settles as "action", and the slot
  // hands over through the same exit transition as an expiry —
  // the press never pops the toast out of existence.
  const pressAction = useCallback(() => {
    const item = currentRef.current;
    if (!item?.action || leavingRef.current) return;
    leavingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      item.action.onPress();
    } catch {
      // An action must never strand the slot.
    }
    settleItem(item, "action");
    animateOut(() => {
      leavingRef.current = false;
      queueRef.current = advanceToast(queueRef.current);
      serveCurrent();
    });
  }, [animateOut, serveCurrent, settleItem]);

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
          pointerEvents={current.action ? "box-none" : "none"}
          style={[styles.toastWrap, { opacity, transform: [{ translateY }] }]}
        >
          <View style={styles.toast} pointerEvents="box-none">
            <Text style={styles.toastText} pointerEvents="none">
              {current.message}
            </Text>
            {current.action ? (
              <Pressable
                pointerEvents="auto"
                onPress={pressAction}
                accessibilityRole="button"
                accessibilityLabel={current.action.label}
                style={({ pressed }) => ({
                  ...styles.toastAction,
                  backgroundColor: pressed ? colors.accentDim : colors.accent,
                })}
              >
                <Text style={styles.toastActionText}>
                  {current.action.label}
                </Text>
              </Pressable>
            ) : null}
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
  // Slice 61: the pill's one touch target (see header).
  toastAction: {
    alignSelf: "flex-end",
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.card,
  },
  toastActionText: {
    color: "#06202a",
    fontSize: typeScale.caption,
    fontWeight: "800",
  },
});
