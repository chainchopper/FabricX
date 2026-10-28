import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { noteBus } from "../../../shared/utils/noteBus";
import { DancerDriver, type DancerPose } from "../../dancer/DancerDriver";

/**
 * FrequencyDancer — the placeholder figure for Terrell's frequency
 * dancer (spike v0; challenge in fabric-world-model.md).
 *
 * SUPERSEDED (realignment, Oct 28): this flat overlay is no longer
 * mounted anywhere. The dancer is its own fabric now — the Dancer
 * Stage (src/dancer/DancerStage.tsx), a full 3D stage where the
 * same DancerDriver drives a rigged UE5-bone figure. This file is
 * kept only as the spike's record (the push tooling cannot delete
 * files); the driver and its check are the living pieces.
 *
 * A flat light-puppet of pills and one circle, in six band groups
 * that mirror DancerDriver's band map exactly: head+neck, chest,
 * arms, torso, hips, legs+feet. It is a RENDERING of the note bus:
 * the component subscribes to noteBus (local surfaces AND remote
 * peers — both already travel the bus) and never, ever publishes.
 * A peer's playing dances your dancer; your playing dances theirs.
 *
 * The puppet is deliberately a placeholder — Terrell's real
 * characters arrive as glTF rigs. What is NOT a placeholder is the
 * seam: this component consumes only DancerDriver.tick() poses
 * ({offset, energy, hue} per band), the same BandState contract a
 * glTF adapter will consume (see DancerDriver's header). Swap the
 * puppet for a rig and the driver doesn't change a line.
 *
 * Mounting (ExperienceHUD): inside the chrome layer, standing above
 * the piano keyboard cluster in the piano layer only, gated by the
 * per-layer `specific.dancerEnabled` setting (THIS LAYER → Dancer,
 * default on). pointerEvents="none" on every element — the dancer
 * is a performance, never a control; it cannot eat a touch. Idle:
 * the driver's breath phase sways it gently at rest (the Slice 7
 * `breathe` answer for this component), and any note takes over
 * instantly through the same springs.
 *
 * Powered by Nirvana
 */

// Pale silhouette the puppet rests in; a firing band blends toward
// its note's chromatic hue as energy rises.
const REST_RGB: [number, number, number] = [226, 238, 242];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number] = [0, 0, 0];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

function bandFill(hue: number, energy: number): string {
  const [r, g, b] = hslToRgb(hue, 0.85, 0.62);
  const t = Math.min(1, energy);
  const mix = (a: number, c: number) => Math.round(a + (c - a) * t);
  return `rgba(${mix(REST_RGB[0], r)}, ${mix(REST_RGB[1], g)}, ${mix(REST_RGB[2], b)}, 0.92)`;
}

function bandShadow(hue: number, energy: number): string | undefined {
  if (energy < 0.03) return undefined;
  return `0 0 ${Math.round(16 * energy)}px hsla(${hue}, 90%, 65%, ${(0.75 * energy).toFixed(2)})`;
}

export default function FrequencyDancer() {
  const driverRef = useRef<DancerDriver | null>(null);
  if (driverRef.current === null) driverRef.current = new DancerDriver();
  const [pose, setPose] = useState<DancerPose>(() => driverRef.current!.tick());

  useEffect(() => {
    const driver = driverRef.current!;
    // Subscribe-only: the dancer is a rendering of the bus. It
    // hears local keys, the 3D scene's surfaces, and remote peers
    // (all on the bus) — and answers none of them.
    const off = noteBus.on((e) => driver.handleNoteEvent(e));
    let raf = 0;
    let lastPaint = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      // ~30 fps is plenty for spring poses; halving the paint rate
      // keeps this overlay effectively free next to the fluid sim.
      if (ts - lastPaint < 33) return;
      lastPaint = ts;
      setPose(driver.tick());
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, []);

  const band = (id: string) => pose.bands.find((b) => b.id === id)!;
  const head = band("head");
  const chest = band("chest");
  const arms = band("arms");
  const torso = band("torso");
  const hips = band("hips");
  const legs = band("legs");
  const breath = pose.breath;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{
        alignItems: "center",
        marginBottom: 6,
        transform: [{ translateY: breath * 1.4 }],
      }}
    >
      {/* HEAD · NECK — high notes. Nods and turns with the line. */}
      <View
        pointerEvents="none"
        style={{
          alignItems: "center",
          transform: [
            { translateX: head.offset * 9 },
            { rotate: `${(head.offset * 10).toFixed(1)}deg` },
          ],
        }}
      >
        <View
          pointerEvents="none"
          style={{
            width: 27,
            height: 27,
            borderRadius: 14,
            backgroundColor: bandFill(head.hue, head.energy),
            boxShadow: bandShadow(head.hue, head.energy),
          }}
        />
        <View
          pointerEvents="none"
          style={{
            width: 7,
            height: 8,
            borderRadius: 3,
            marginTop: 1,
            backgroundColor: bandFill(head.hue, head.energy),
          }}
        />
      </View>

      {/* ARMS + CHEST row — the arms swing mirrored around the chest. */}
      <View
        pointerEvents="none"
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          width: 94,
          marginTop: 1,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            width: 9,
            height: 37,
            borderRadius: 5,
            backgroundColor: bandFill(arms.hue, arms.energy),
            boxShadow: bandShadow(arms.hue, arms.energy),
            transform: [
              { translateY: Math.abs(arms.offset) * -2 },
              { rotate: `${(-16 + arms.offset * 24).toFixed(1)}deg` },
            ],
          }}
        />
        <View
          pointerEvents="none"
          style={{
            width: 45,
            height: 21,
            borderRadius: 11,
            marginTop: 2,
            backgroundColor: bandFill(chest.hue, chest.energy),
            boxShadow: bandShadow(chest.hue, chest.energy),
            transform: [
              { translateX: chest.offset * 4 },
              { scale: 1 + chest.energy * 0.06 },
            ],
          }}
        />
        <View
          pointerEvents="none"
          style={{
            width: 9,
            height: 37,
            borderRadius: 5,
            backgroundColor: bandFill(arms.hue, arms.energy),
            boxShadow: bandShadow(arms.hue, arms.energy),
            transform: [
              { translateY: Math.abs(arms.offset) * -2 },
              { rotate: `${(16 + arms.offset * 24).toFixed(1)}deg` },
            ],
          }}
        />
      </View>

      {/* TORSO · WAIST — a lean. */}
      <View
        pointerEvents="none"
        style={{
          width: 30,
          height: 17,
          borderRadius: 9,
          marginTop: 2,
          backgroundColor: bandFill(torso.hue, torso.energy),
          boxShadow: bandShadow(torso.hue, torso.energy),
          transform: [{ rotate: `${(torso.offset * 7).toFixed(1)}deg` }],
        }}
      />

      {/* HIPS — the sway. */}
      <View
        pointerEvents="none"
        style={{
          width: 38,
          height: 12,
          borderRadius: 6,
          marginTop: 2,
          backgroundColor: bandFill(hips.hue, hips.energy),
          boxShadow: bandShadow(hips.hue, hips.energy),
          transform: [{ translateX: hips.offset * 7 }],
        }}
      />

      {/* LEGS · FEET — low notes. A bounce with foot taps. */}
      <View
        pointerEvents="none"
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 7,
          marginTop: 2,
          transform: [{ translateY: Math.abs(legs.offset) * -5 }],
        }}
      >
        {([-1, 1] as const).map((side) => (
          <View key={side} pointerEvents="none" style={{ alignItems: "center" }}>
            <View
              pointerEvents="none"
              style={{
                width: 9,
                height: 28,
                borderRadius: 5,
                backgroundColor: bandFill(legs.hue, legs.energy),
                boxShadow: bandShadow(legs.hue, legs.energy),
                transform: [{ rotate: `${(side * legs.offset * 8).toFixed(1)}deg` }],
              }}
            />
            <View
              pointerEvents="none"
              style={{
                width: 14,
                height: 6,
                borderRadius: 3,
                marginTop: 2,
                marginLeft: side * 3,
                backgroundColor: bandFill(legs.hue, legs.energy),
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
