/**
 * GroundingChrome — Slice 30: the on-device eyes' two pieces of
 * canvas chrome, mounted once in the root ChromeLayer next to
 * BrainChrome, whose pattern this mirrors exactly.
 *
 * 1. THE ONE-TIME ASK. The first time See wants eyes this
 *    device could host (an act ask or a Segment tap the cloud
 *    can't serve) and no cloud model is resolved, the store
 *    raises askVisible and this card appears — once per
 *    install, in product language, with the REAL download size
 *    for this device's path on it. Yes starts the download;
 *    Not now records the decline and the ask never rises again
 *    (its own pref key — the brain's consent is a separate
 *    question, and the two never entangle). If the brain's own
 *    ask is on screen, this one waits: two asks never stack.
 *
 * 2. THE PROGRESS CHIP. While the model downloads, a slim pill
 *    reports the real percentage ("Eyes arriving… 42%"). It is
 *    pointerEvents="none" and visually light — nothing covers
 *    the work, and See never waits on the download: asks fall
 *    through to the honest resting answer until the eyes are
 *    ready, and then the same asks simply work.
 *
 * Pointer-events discipline: the wrapper is "box-none", the
 * ask card carries its own pointerEvents="auto", and each
 * button is a Pressable.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  answerGroundingConsent,
  ensureGroundingInit,
  getGroundingSnapshot,
  subscribeDeviceGrounding,
  type GroundingSnapshot,
} from "../../../src/sam/deviceGrounding";
import {
  brainChipVisible,
  getBrainSnapshot,
  subscribeOnDeviceBrain,
  type BrainSnapshot,
} from "../../../src/ai/onDeviceBrain";
import { ChromeMount } from "../../../src/components/ui/ChromeMount";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";

export default function GroundingChrome() {
  const [snap, setSnap] = useState<GroundingSnapshot>(() =>
    getGroundingSnapshot()
  );
  // Slice 44: the whole brain snapshot, not just its ask flag —
  // this chrome yields the top status slot to the brain's CHIP
  // as well as its ask (see showChip below).
  const [brainSnap, setBrainSnap] = useState<BrainSnapshot>(() =>
    getBrainSnapshot()
  );

  useEffect(() => subscribeDeviceGrounding(setSnap), []);
  useEffect(() => subscribeOnDeviceBrain(setBrainSnap), []);
  useEffect(() => {
    void ensureGroundingInit();
  }, []);

  const pct = Math.round(snap.progress * 100);
  // One ask at a time: the brain's card wins the moment; this
  // ask is still raised in the store and appears when it clears.
  const showAsk = snap.askVisible && !brainSnap.askVisible;
  // Slice 44: one status slot, one occupant. The ask-yield
  // above covered the brain's CARD; its progress CHIP rides
  // the same top slot at the same anchor (both wrappers sat at
  // top:60 centered, zIndex 40), so while the brain's chip is
  // up, this chip waits too — the two pills used to render
  // exactly on top of each other.
  const showChip =
    !snap.askVisible &&
    !brainSnap.askVisible &&
    !brainChipVisible(brainSnap) &&
    snap.state === "downloading";

  // Slice 44 (chrome discipline): same slot split as
  // BrainChrome — the ask takes the card slot (top:160), the
  // chip the status slot (top:68, right edge held at 112),
  // both through ChromeMount instead of a bare conditional.
  return (
    <>
      <ChromeMount
        visible={showAsk}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 160,
          left: 0,
          right: 0,
          alignItems: "center",
        paddingHorizontal: spacing.md,
        zIndex: 40,
      }}
    >
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
            Give this device its own eyes?
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
            GroundingDINO — {snap.sizeNote}, once. After that,
            &ldquo;touch the apple&rdquo; and &ldquo;draw a circle
            around the chair&rdquo; work right here: See reads the
            camera on this device only. Frames never leave it and
            nothing is stored. The cloud&rsquo;s SAM 3.1 still
            adds masks whenever it&rsquo;s configured.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
            <Pressable
              pointerEvents="auto"
              onPress={() => void answerGroundingConsent(true)}
              accessibilityRole="button"
              accessibilityLabel="Yes, give this device its own eyes"
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
                Give it eyes
              </Text>
            </Pressable>
            <Pressable
              pointerEvents="auto"
              onPress={() => void answerGroundingConsent(false)}
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
              <Text style={{ color: colors.textDim, fontSize: typeScale.body, fontWeight: "600" }}>
                Not now
              </Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Either way, See keeps working with whatever eyes it
            has — the camera, touch and your ghostie are unaffected.
          </Text>
        </View>
      </ChromeMount>
      <ChromeMount
        visible={showChip}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 68,
          left: 0,
          right: 112,
          alignItems: "center",
          zIndex: 40,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            maxWidth: 200,
            borderWidth: 1,
            borderColor: colors.ghostLine,
            borderRadius: 999,
            backgroundColor: "rgba(12,14,24,0.88)",
            paddingVertical: 5,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.caption, fontWeight: "600" }}>
            {`Eyes arriving… ${pct}%`}
          </Text>
        </View>
      </ChromeMount>
    </>
  );
}
