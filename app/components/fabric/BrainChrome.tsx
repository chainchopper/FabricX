/**
 * BrainChrome — Slice 27: the on-device brain's two pieces of
 * canvas chrome, mounted once in the root ChromeLayer.
 *
 * 1. THE ONE-TIME ASK. The first time a feature (a compose, the
 *    ghost's deliberation) wants the on-device brain and this
 *    device could host it, the store raises askVisible and this
 *    card appears — once per install, in product language, with
 *    the real download size on it. Yes teaches the device (the
 *    download starts immediately); Not now records the decline
 *    and the ask never rises again. The choice itself lives on
 *    permanently in AI Services and Your Ghostie.
 *
 * 2. THE PROGRESS CHIP. While the model downloads or warms, a
 *    slim pill at the top edge reports the real percentage
 *    ("Brain arriving… 42%"). It is pointerEvents="none" and
 *    visually light — the doctrine is that nothing covers the
 *    work, and the canvas never waits on the brain anyway: the
 *    rule interpreter and the decision table answer underneath
 *    the whole time.
 *
 * Pointer-events discipline (the house rule that keeps chrome
 * tappable): the wrapper is "box-none", the ask card carries its
 * own pointerEvents="auto", and each button is a Pressable.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  answerBrainConsent,
  getBrainSnapshot,
  subscribeOnDeviceBrain,
  type BrainSnapshot,
} from "../../../src/ai/onDeviceBrain";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";

export default function BrainChrome() {
  const [snap, setSnap] = useState<BrainSnapshot>(() => getBrainSnapshot());

  useEffect(() => subscribeOnDeviceBrain(setSnap), []);

  const pct = Math.round(snap.progress * 100);
  const showChip =
    !snap.askVisible &&
    (snap.state === "downloading" || snap.state === "warming");

  if (!snap.askVisible && !showChip) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 60,
        left: 0,
        right: 0,
        alignItems: "center",
        paddingHorizontal: spacing.md,
        zIndex: 40,
      }}
    >
      {snap.askVisible ? (
        <View
          pointerEvents="auto"
          style={{
            maxWidth: 440,
            width: "100%",
            borderWidth: 1,
            borderColor: colors.ghostLine,
            borderRadius: radius.card,
            backgroundColor: "rgba(12,14,24,0.94)",
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text
            style={{ color: colors.text, fontSize: typeScale.label, fontWeight: "700" }}
          >
            Teach this device its own brain?
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
            {snap.model.label} — {snap.model.sizeNote}, once. After that
            it thinks here, offline, no account: composing answers and
            your ghost&rsquo;s deliberation happen on this device, and
            nothing you say leaves it.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
            <Pressable
              pointerEvents="auto"
              onPress={() => void answerBrainConsent(true)}
              accessibilityRole="button"
              accessibilityLabel="Yes, teach this device its own brain"
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.ghostLine,
                backgroundColor: pressed ? colors.ghostDim : colors.ghostDim,
              })}
            >
              <Text
                style={{ color: colors.text, fontSize: typeScale.body, fontWeight: "700" }}
              >
                Teach it
              </Text>
            </Pressable>
            <Pressable
              pointerEvents="auto"
              onPress={() => void answerBrainConsent(false)}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "transparent",
              })}
            >
              <Text
                style={{ color: colors.textDim, fontSize: typeScale.body, fontWeight: "600" }}
              >
                Not now
              </Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Either way, Fabric keeps answering — the in-browser
            interpreter and your ghost&rsquo;s table are already here.
          </Text>
        </View>
      ) : (
        <View
          pointerEvents="none"
          style={{
            borderWidth: 1,
            borderColor: colors.ghostLine,
            borderRadius: 999,
            backgroundColor: "rgba(12,14,24,0.88)",
            paddingVertical: 5,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.caption, fontWeight: "600" }}>
            {snap.state === "warming"
              ? "Brain warming up…"
              : `Brain arriving… ${pct}%`}
          </Text>
        </View>
      )}
    </View>
  );
}
