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
 *    slim pill at the top edge NAMES the brain and reports the
 *    real percentage. Slice 46 made it name the model ("Ghostie
 *    1B (Llama 3.2 1B) arriving… 42%" — a bare "downloading a
 *    brain" told Terrell nothing about WHAT was arriving);
 *    Slice 50 gives the headline to the ghostie itself —
 *    "{GhostieName}'s brain arriving… 42%" — because the brain
 *    being fetched is the ghostie's own, under its persistent
 *    name (ghost store). The exact model stays named one
 *    surface down, in the settings card. Before the ghost
 *    record exists the chip falls back to the model-named
 *    label (brainTransferLabel's own rule). It is
 *    pointerEvents="none" and
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
  brainChipVisible,
  brainTransferLabel,
  getBrainSnapshot,
  subscribeOnDeviceBrain,
  type BrainSnapshot,
} from "../../../src/ai/onDeviceBrain";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import { ChromeMount } from "../../../src/components/ui/ChromeMount";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";

export default function BrainChrome() {
  const [snap, setSnap] = useState<BrainSnapshot>(() => getBrainSnapshot());

  useEffect(() => subscribeOnDeviceBrain(setSnap), []);

  // Slice 50: the chip's headline is the ghostie's own name —
  // the ghost store publishes it (and republishes on a rename).
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  useEffect(() => subscribeGhostState(setGhost), []);

  const showChip = brainChipVisible(snap);

  // Slice 44 (chrome discipline): the ask and the chip used to
  // share one wrapper at top:60 and mount by bare conditional —
  // the ask card landed across the corner row and both popped.
  // Now each owns a DECLARED slot and enters/leaves through
  // ChromeMount: the chip takes the top status slot (top:68,
  // its right edge held 112pt off the right so its pill can
  // never reach the Essence's corner), and the one-time ask
  // takes the card slot below it (top:160), clear of the
  // corner row and the chip alike.
  return (
    <>
      <ChromeMount
        visible={snap.askVisible}
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
            Teach this device its own brain?
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
            {snap.model.displayName} — {snap.model.baseNote} · {snap.model.sizeNote}, once. After that
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
            // Slice 46: widened 200 → 264 so the chip's named
            // label stays on ONE line — Slice 44's slot (right
            // edge held 112pt off the right; 278pt wide at a
            // 390pt phone) still contains it, and the pill still
            // can never reach the Essence's corner. Slice 50:
            // the ghostie-named label ("{name}'s brain
            // arriving… 42%") is shorter than Slice 46's
            // model-named one at every name the editor allows
            // (≤20 chars); a longest-legal name can wrap inside
            // the pill on narrow screens, growing it downward
            // inside its slot — the Slice 46 honest limit.
            maxWidth: 264,
            borderWidth: 1,
            borderColor: colors.ghostLine,
            borderRadius: 999,
            backgroundColor: "rgba(12,14,24,0.88)",
            paddingVertical: 5,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: colors.text, fontSize: typeScale.caption, fontWeight: "600" }}>
            {/* Slice 46: the chip NAMES the brain, never a bare
                "Brain arriving…". Slice 50: the headline is the
                ghostie's own persistent name ("{name}'s brain
                arriving… 42%") from the one naming source; the
                exact model is named in the settings card. */}
            {brainTransferLabel(snap, ghost.ghostName)}
          </Text>
        </View>
      </ChromeMount>
    </>
  );
}
