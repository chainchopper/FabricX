/**
 * ChromeMount — Slice 44: the one mount/unmount transition for
 * canvas chrome.
 *
 * Terrell's chrome doctrine (Nov 2, 2026): the loaded fabric's
 * canvas is the VIEW SPACE, not available real estate — and
 * elements "just pop in and out" was half the complaint. Before
 * this module, every layer panel, status pill and notice on the
 * demo path mounted by bare conditional render: one frame it
 * wasn't there, the next it was, at full opacity, on top of
 * whatever it landed on.
 *
 * The pattern is the house one (FabricChromeContext's idle fade,
 * the drawers' Animated slides): Animated.timing in the design
 * tokens' motion range (enter = motion.base 280ms, exit =
 * motion.fast 240ms), out-cubic in, in-cubic out, a small 8pt
 * rise, useNativeDriver off web only. ChromeMount owns the
 * render lifetime: when `visible` goes false it plays the exit
 * and only then unmounts, so nothing ever vanishes mid-frame.
 *
 * Usage: wrap the element's ROOT view, moving its positioning
 * style onto ChromeMount:
 *
 *   <ChromeMount visible={open} pointerEvents="box-none"
 *     style={{ position: "absolute", top: 92, left: 12 }}>
 *     …
 *   </ChromeMount>
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { motion } from "../../theme/tokens";

/** Enter duration — the tokens' base motion step. */
export const CHROME_MOUNT_IN_MS = motion.base;
/** Exit duration — the tokens' fast motion step. */
export const CHROME_MOUNT_OUT_MS = motion.fast;
/** How far an element rises as it enters (and sinks as it leaves). */
export const CHROME_MOUNT_RISE = 8;

export function useChromeMount(visible: boolean) {
  const [render, setRender] = useState<boolean>(visible);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(CHROME_MOUNT_RISE)).current;

  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: CHROME_MOUNT_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: CHROME_MOUNT_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
      return undefined;
    }
    if (!render) return undefined;
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: CHROME_MOUNT_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(translateY, {
        toValue: CHROME_MOUNT_RISE,
        duration: CHROME_MOUNT_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) setRender(false);
    });
    return () => anim.stop();
    // `render` is read as a guard only; visibility drives the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, opacity, translateY]);

  return { render, opacity, translateY };
}

type ChromeMountProps = {
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "auto" | "box-none" | "box-only" | "none";
  children?: React.ReactNode;
};

export function ChromeMount({
  visible,
  style,
  pointerEvents = "auto",
  children,
}: ChromeMountProps) {
  const { render, opacity, translateY } = useChromeMount(visible);
  if (!render) return null;
  return (
    <Animated.View
      // While leaving, the element is already gone for input:
      // a fading panel must not eat the tap that dismissed it.
      pointerEvents={visible ? pointerEvents : "none"}
      style={[style, { opacity, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}

export default ChromeMount;
