/**
 * FirstBreath — Slice 10: the first-run onboarding card.
 *
 * Terrell's direction: onboarding is a streamlined GHOST SPACE tied
 * to world palettes, not a form wizard. So there is no wizard here:
 * the app opens on the fabric itself (Slice 7's ambient life is
 * already breathing; the user's ghost — born from their LifePacket
 * in Slice 9 — is already present in solo mode, touching back).
 * This card is the only chrome in the moment, floating at the top
 * of the canvas where no control lives (F anchor top-left, badge
 * top-right, layer cluster bottom — nothing is covered, per the
 * doctrine):
 *
 *   Step 1 — PALETTE. Three cards dealt from the LifePacket seed
 *   (src/onboarding/onboardingStore.derivePaletteCards): a
 *   signature hue with its two harmonies, rendered as overlapping
 *   fluid blobs. Tapping a card wears the color immediately through
 *   the identity store — your strokes, your roster dot, your
 *   pitched sound all change with it. Shuffle deals three more.
 *   Skipping the tap keeps the color the packet dealt at birth.
 *
 *   Step 2 — NAME (light). One optional field, prefilled with the
 *   generated identity name, editable through the same store
 *   setter the menu uses. "Enter Fabric" stamps
 *   fabric_onboarded_v1 and the card never returns.
 *
 * The header introduces the ghost by name — "{ghostName} will keep
 * you company" — because meeting the ghost IS the first moment;
 * the ghost itself is the stock GhostPeer in solo mode, not a
 * second onboarding-only ghost.
 *
 * REPLAY: the menu's UNIVERSAL "First Breath" row reopens this card
 * in palette-only mode (no name step, no flag changes) — a door back
 * to your colors, labeled so it's discoverable.
 *
 * Mounted in the root ChromeLayer (app/_layout) as a direct child
 * of the root view, like every other tappable chrome element: the
 * wrapper passes touches through (pointerEvents "box-none") and
 * every control inside carries its own pointerEvents="auto" — the
 * PR #16 discipline, so react-native-web's descendant rule can
 * never strip a tap here. Chrome state only: mounting or closing
 * this card never remounts the canvas (single-canvas authority).
 *
 * Powered by Nirvana
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  colors,
  hit,
  radius,
  shadow,
  spacing,
  type as typeScale,
} from "../../../src/theme/tokens";
import { hueCss } from "../../../src/identity/identityStore";
import {
  useIdentitySnapshot,
  useLocalIdentity,
} from "../../../src/identity/useIdentity";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";
import {
  closeFirstBreath,
  derivePaletteCards,
  markOnboarded,
  resolveFirstBreathGate,
  subscribeFirstBreath,
  type FirstBreathState,
  type PaletteCard,
} from "../../../src/onboarding/onboardingStore";
import { useFabricChrome } from "./FabricChromeContext";
import {
  getBrainSnapshot,
  subscribeOnDeviceBrain,
} from "../../../src/ai/onDeviceBrain";
import {
  getGroundingSnapshot,
  subscribeDeviceGrounding,
} from "../../../src/sam/deviceGrounding";
import { ChromeMount } from "../../../src/components/ui/ChromeMount";

function PaletteCardView({
  card,
  selected,
  onPress,
}: {
  card: PaletteCard;
  selected: boolean;
  onPress: () => void;
}) {
  const [signature, harmonyA, harmonyB] = card.swatches;
  return (
    <Pressable
      pointerEvents="auto"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${card.harmony} palette, hue ${card.hue} degrees`}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: radius.card,
        borderWidth: 2,
        borderColor: selected ? colors.accent : colors.line,
        backgroundColor: pressed ? colors.accentDim : colors.panel,
        overflow: "hidden",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* The fluid blobs: the signature hue as the water, its two
          harmonies as the currents moving through it. */}
      <View
        style={{
          height: 58,
          backgroundColor: hueCss(signature),
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 58,
            height: 58,
            borderRadius: 29,
            top: -16,
            right: -10,
            backgroundColor: hueCss(harmonyA),
            opacity: 0.75,
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 42,
            height: 42,
            borderRadius: 21,
            bottom: -14,
            left: "30%",
            backgroundColor: hueCss(harmonyB),
            opacity: 0.75,
          }}
        />
      </View>
      <View style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: typeScale.caption,
            fontWeight: "700",
          }}
        >
          {card.harmony}
        </Text>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          hue {card.hue}°
        </Text>
      </View>
    </Pressable>
  );
}

export default function FirstBreath() {
  const { noteActivity } = useFabricChrome();
  const identity = useIdentitySnapshot();
  const localIdentity = useLocalIdentity();
  const self = identity.self;

  const [fb, setFb] = useState<FirstBreathState>(() => ({
    openMode: null,
    requestNonce: 0,
  }));
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  // Slice 44 (chrome discipline): the one-time consent asks
  // (brain, then eyes) outrank this card — while either ask is
  // raised, the welcome waits instead of stacking under it in
  // the same top band. The asks are quick; the gate re-opens
  // the moment they clear (fb state is untouched by the wait).
  const [brainAskUp, setBrainAskUp] = useState<boolean>(
    () => getBrainSnapshot().askVisible
  );
  const [groundingAskUp, setGroundingAskUp] = useState<boolean>(
    () => getGroundingSnapshot().askVisible
  );
  const [step, setStep] = useState<"palette" | "name">("palette");
  const [round, setRound] = useState(0);
  const [chosenHue, setChosenHue] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  // The gate runs once per app mount; existing installs resolve it
  // silently and this card simply never opens for them.
  useEffect(() => {
    resolveFirstBreathGate();
  }, []);
  useEffect(() => subscribeFirstBreath(setFb), []);
  useEffect(() => subscribeGhostState(setGhost), []);
  useEffect(
    () => subscribeOnDeviceBrain((s) => setBrainAskUp(s.askVisible)),
    []
  );
  useEffect(
    () => subscribeDeviceGrounding((s) => setGroundingAskUp(s.askVisible)),
    []
  );

  // Every fresh open starts the moment over: palette step, the
  // packet's first deal, the dealt name in the field.
  useEffect(() => {
    if (!fb.openMode) return;
    setStep("palette");
    setRound(0);
    setChosenHue(null);
    setNameDraft(null);
  }, [fb.openMode, fb.requestNonce]);

  const cards = useMemo(
    () => (self ? derivePaletteCards(self.seed, round) : []),
    [self, round]
  );

  // Slice 44: visibility is computed, not an early return —
  // ChromeMount owns the enter/exit (the card used to pop at
  // top:76, inside the corner/chip band). The card now takes
  // the shared card slot (top:160, below the status slot) and
  // waits out any consent ask (see the subscriptions above).
  // The mode freezes at its last open value so the exit fade
  // never swaps the card's step mid-animation.
  const modeRef = useRef(fb.openMode);
  if (fb.openMode) modeRef.current = fb.openMode;
  const mode = fb.openMode ?? modeRef.current;
  const wantShow =
    !!fb.openMode && !!self && !brainAskUp && !groundingAskUp;
  const ghostName = ghost.ghostName;

  const enterFabric = () => {
    noteActivity();
    if (nameDraft !== null) localIdentity.setName(nameDraft);
    void markOnboarded().then(() => closeFirstBreath());
  };

  return (
    <ChromeMount
      visible={wantShow}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 160,
        left: 0,
        right: 0,
        alignItems: "center",
        paddingHorizontal: spacing.lg,
      }}
    >
      {self ? (
      <View
        pointerEvents="auto"
        style={{
          width: "100%",
          maxWidth: 460,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.accentLine,
          borderRadius: radius.sheet,
          padding: spacing.lg,
          gap: spacing.md,
          ...shadow,
        }}
      >
        {/* The meeting. The canvas behind this card is the ghost
            space: ambient life breathing, the ghost present. */}
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: typeScale.title,
              fontWeight: "700",
            }}
          >
            First Breath
          </Text>
          <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
            {ghostName
              ? `${ghostName} will keep you company.`
              : "Your ghost will keep you company."}{" "}
            {mode === "full"
              ? "You're alone on a quiet fabric with them — pick the color the room will know you by, and draw: they'll touch back."
              : "Your LifePacket deals your colors — wear a new one whenever you like."}
          </Text>
        </View>

        {step === "palette" || mode === "palette" ? (
          <>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {cards.map((card) => (
                <PaletteCardView
                  key={`${round}-${card.hue}-${card.harmony}`}
                  card={card}
                  selected={chosenHue === card.hue}
                  onPress={() => {
                    noteActivity();
                    setChosenHue(card.hue);
                    localIdentity.setHue(card.hue);
                  }}
                />
              ))}
            </View>
            <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
              Dealt from your LifePacket seed — the same seed deals the
              same cards forever.{" "}
              {mode === "full" && chosenHue === null
                ? "No tap? You keep the color your packet dealt at birth."
                : "Your strokes, your name in the roster, and your sound all wear it."}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
              }}
            >
              <Pressable
                pointerEvents="auto"
                onPress={() => {
                  noteActivity();
                  setRound((r) => r + 1);
                }}
                accessibilityRole="button"
                style={{
                  minHeight: hit,
                  justifyContent: "center",
                  paddingHorizontal: spacing.sm,
                }}
              >
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: typeScale.body,
                    fontWeight: "700",
                  }}
                >
                  Shuffle — 3 more
                </Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              {mode === "full" ? (
                <Pressable
                  pointerEvents="auto"
                  onPress={() => {
                    noteActivity();
                    setStep("name");
                  }}
                  accessibilityRole="button"
                  style={{
                    minHeight: hit,
                    justifyContent: "center",
                    paddingHorizontal: spacing.lg,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: typeScale.body,
                      fontWeight: "700",
                    }}
                  >
                    Continue
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  pointerEvents="auto"
                  onPress={() => {
                    noteActivity();
                    closeFirstBreath();
                  }}
                  accessibilityRole="button"
                  style={{
                    minHeight: hit,
                    justifyContent: "center",
                    paddingHorizontal: spacing.lg,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accent,
                  }}
                >
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: typeScale.body,
                      fontWeight: "700",
                    }}
                  >
                    Done
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: colors.textDim, fontSize: typeScale.body }}>
              One last thing — what should the room call you? Your packet
              dealt a name; keep it or make it yours.
            </Text>
            <TextInput
              pointerEvents="auto"
              value={nameDraft ?? self.name}
              onChangeText={setNameDraft}
              placeholder="Your name in the room"
              placeholderTextColor={colors.textDim}
              maxLength={40}
              style={{
                color: colors.text,
                fontSize: typeScale.body,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.card,
                paddingVertical: 10,
                paddingHorizontal: 12,
                minHeight: hit,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
              }}
            >
              <Pressable
                pointerEvents="auto"
                onPress={() => {
                  noteActivity();
                  setStep("palette");
                }}
                accessibilityRole="button"
                style={{
                  minHeight: hit,
                  justifyContent: "center",
                  paddingHorizontal: spacing.sm,
                }}
              >
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: typeScale.body,
                    fontWeight: "700",
                  }}
                >
                  Back to colors
                </Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable
                pointerEvents="auto"
                onPress={enterFabric}
                accessibilityRole="button"
                style={{
                  minHeight: hit,
                  justifyContent: "center",
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                }}
              >
                <Text
                  style={{
                    color: colors.ink,
                    fontSize: typeScale.body,
                    fontWeight: "700",
                  }}
                >
                  Enter Fabric
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
      ) : null}
    </ChromeMount>
  );
}
