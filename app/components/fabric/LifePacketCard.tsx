/**
 * LifePacketCard — Slice 9 "LifePacket step 1": the identity VIEW.
 *
 * The "You are" card in UNIVERSAL is the editor (name + hue). This
 * card is the token itself — what Terrell asked the account menu to
 * show: your LifePacket's fDNA, a small Game of Life seeded from your
 * identity seed, alive while you watch it. It renders:
 *
 * - your display name and your signature hue as a living color chip,
 * - the fDNA grid (B3/S23, toroidal so it never dies against an
 *   edge), seeded deterministically from the identity seed with the
 *   same mulberry32 family the identity and ghost stores use, and
 *   stepping a few generations a second while the menu is open —
 *   the menu unmounts on close, which stops the clock, and a hidden
 *   tab pauses it,
 * - your ghost's name when a ghost record exists — since Slice 9 a
 *   NEW ghost's seed derives from this packet, so the ghost is
 *   provably born from the DNA on this card (existing ghosts keep
 *   the identity they were born with; nobody gets re-born),
 * - the honest privacy line: the seed is the packet root, it lives
 *   on this device only, and it is never transmitted — peers see
 *   name + hue, which is all Slice 6 has ever announced.
 *
 * Menu UI only: this grid never touches the fluid canvas (the
 * single-canvas authority is untouched), and nothing here writes to
 * any store — it reads the identity snapshot and the ghost's public
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

const COLS = 18;
const ROWS = 12;
const STEP_MS = 300;
/** First-state fill: sparse enough for gliders, dense enough to churn. */
const FILL = 0.27;

/** Same PRNG family as the identity/ghost stores, so the DNA derives from the seed. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedGrid(seed: number): Uint8Array {
  const rng = mulberry32(seed);
  const grid = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng() < FILL ? 1 : 0;
  }
  return grid;
}

/** One B3/S23 generation on a torus — the packet wraps, never walls. */
function stepGrid(grid: Uint8Array): Uint8Array {
  const next = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + COLS) % COLS;
          const ny = (y + dy + ROWS) % ROWS;
          n += grid[ny * COLS + nx];
        }
      }
      const alive = grid[y * COLS + x] === 1;
      next[y * COLS + x] = alive
        ? n === 2 || n === 3
          ? 1
          : 0
        : n === 3
          ? 1
          : 0;
    }
  }
  return next;
}

export default function LifePacketCard() {
  const identity = useIdentitySnapshot();
  const self = identity.self;
  const [ghost, setGhost] = useState<GhostPublicState>(() =>
    getGhostPublicState()
  );
  useEffect(() => subscribeGhostState(setGhost), []);

  const seed = self?.seed;
  const gridRef = useRef<Uint8Array | null>(null);
  const genRef = useRef(0);
  const [generation, setGeneration] = useState(0);

  // Seed from the packet root and keep the packet alive while the
  // card is mounted and the tab is visible. Mount == menu open (the
  // menu renders nothing while closed), so closing the menu stops
  // the clock; a hidden tab pauses it via document.hidden.
  useEffect(() => {
    if (typeof seed !== "number") return;
    gridRef.current = seedGrid(seed);
    genRef.current = 0;
    setGeneration(0);
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const current = gridRef.current;
      if (!current) return;
      let next = stepGrid(current);
      genRef.current += 1;
      // A token should not flatline on camera: if a lineage burns
      // out, the packet re-seeds itself from its root + generation
      // (still deterministic, still this device's DNA story).
      let live = 0;
      for (let i = 0; i < next.length; i++) live += next[i];
      if (live === 0) {
        next = seedGrid((seed ^ Math.imul(genRef.current, 0x9e3779b9)) | 0);
      }
      gridRef.current = next;
      setGeneration(genRef.current);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [seed]);

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

  if (typeof seed === "number" && !gridRef.current) {
    gridRef.current = seedGrid(seed);
  }
  const grid = gridRef.current;
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
        Your fDNA — a Game of Life seeded from your LifePacket, alive
        while you watch. No two packets live the same life.
      </Text>

      {grid ? (
        <View
          style={{
            alignSelf: "center",
            padding: spacing.sm,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            gap: 2,
          }}
        >
          {Array.from({ length: ROWS }, (_, y) => (
            <View key={y} style={{ flexDirection: "row", gap: 2 }}>
              {Array.from({ length: COLS }, (_, x) => {
                const alive = grid[y * COLS + x] === 1;
                return (
                  <View
                    key={x}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 3,
                      backgroundColor: alive
                        ? chipColor
                        : "rgba(255,255,255,0.05)",
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
        }}
      >
        <Text style={{ flex: 1, color: colors.textDim, fontSize: typeScale.caption }}>
          {grid ? `Generation ${generation}` : "Seeding your packet…"}
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
      </View>

      <Text style={{ color: colors.textDim, fontSize: typeScale.caption }}>
        On this device only — your seed never leaves this device.
        Peers see your name and color, nothing else.
      </Text>
    </View>
  );
}
