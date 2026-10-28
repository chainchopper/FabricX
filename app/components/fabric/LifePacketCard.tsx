/**
 * LifePacketCard — Slice 9 "LifePacket step 1": the identity VIEW,
 * slimmed by Slice 20 ("Ghostie Home").
 *
 * The "You are" card in UNIVERSAL is the editor (name + hue). This
 * card is the token's summary — your display name, your signature
 * hue as a living color chip, your ghost's name, and the honest
 * privacy line. The fDNA itself — the Game of Life seeded from your
 * identity seed, alive while you watch — moved UP the section into
 * Your Ghostie (GhostieHome.tsx, on the shared fdna module), where
 * it runs big; the big grid deliberately lives in exactly one
 * place, so this card points there instead of duplicating it.
 *
 * Since Slice 9 a NEW ghost's seed derives from this packet, so the
 * ghost is provably born from the DNA (existing ghosts keep the
 * identity they were born with; nobody gets re-born). The seed is
 * the packet root: it lives on this device only and is never
 * transmitted — peers see name + hue, which is all Slice 6 has
 * ever announced.
 *
 * Menu UI only: nothing here touches the fluid canvas (the
 * single-canvas authority is untouched) and nothing writes to any
 * store — it reads the identity snapshot and the ghost's public
 * state, the same reads the rest of the menu makes.
 *
 * Powered by Nirvana
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text } from "react-native";
import { colors, radius, spacing, type as typeScale } from "../../../src/theme/tokens";
import { hueCss } from "../../../src/identity/identityStore";
import { useIdentitySnapshot } from "../../../src/identity/useIdentity";
import {
  getGhostPublicState,
  subscribeGhostState,
  type GhostPublicState,
} from "../../../src/ghost/ghostStore";

export default function LifePacketCard() {
  const identity = useIdentitySnapshot();
  const self = identity.self;
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  useEffect(() => subscribeGhostState(setGhost), []);

  // The signature chip breathes — a living token, not a settings row.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const chipColor = self ? hueCss(self.hue) : colors.textDim;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.accentLine,
        borderRadius: radius.card,
        padding: spacing.md,
        marginBottom: spacing.sm,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Animated.View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: chipColor,
            opacity: pulse,
          }}
        />
        <Text
          style={{
            flex: 1,
            color: colors.text,
            fontSize: typeScale.label,
            fontWeight: "700",
          }}
        >
          LifePacket{self ? ` · ${self.name}` : ""}
        </Text>
        <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
          {self ? `hue ${self.hue}°` : "waking…"}
        </Text>
      </View>

      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        Your fDNA — a Game of Life seeded from your LifePacket. Its big,
        living view runs in Your Ghostie, at the top of this section. No
        two packets live the same life.
      </Text>

      {ghost.ghostName ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.ghost,
            }}
          />
          <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
            Your ghost: {ghost.ghostName}
          </Text>
        </View>
      ) : null}

      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        On this device only — your seed never leaves this device.
        Peers see your name and color, nothing else.
      </Text>
    </View>
  );
}
