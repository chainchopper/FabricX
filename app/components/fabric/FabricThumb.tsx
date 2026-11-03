/**
 * FabricThumb — the drawn thumbnail on a fabric's gallery card
 * (Slice 32, "The Fabrics Gallery").
 *
 * Terrell's order (Oct 29): fabrics must be a GALLERY of cards with
 * THUMBNAILS he can scroll through — not a swelling vertical menu.
 * A thumbnail has to look like the fabric it opens, not a generic
 * icon, so each registered fabric gets a small deterministic scene
 * drawn from the app's own palette (tokens + the stage-theme hues):
 *
 *   default-fluid   the living liquid — hue blobs, streamlines, splats
 *   ar-piano        the fluid, dimmed, under a real key strip
 *   dancer-stage    spotlights, floor ripples, the dancer's silhouette
 *   sam-see         a camera frame with SAM's boxes over a scene
 *   camera-effects  aperture rings and a prism trail
 *   genx-fold       scattered motes resolving toward a helix — the fold forming
 *   ghostie-playground  the ghostie itself, golden over its pool, keys laid out
 *
 * Scenes are plain Views — no image assets, no new dependencies —
 * so they stay crisp at any size and can never go stale against a
 * build. An UNREGISTERED fabric (community / plugin layers, per
 * the doctrine's million-layers rule) falls back to a generic
 * scene tinted by a stable hash of its id, with the F glyph: a new
 * fabric is presentable in the gallery before anyone draws for it.
 *
 * Scenes are drawn in a fixed 208x118 space and scaled by the
 * card's width via aspectRatio; every element is absolutely
 * positioned inside that space.
 *
 * Powered by Nirvana
 */

import React from "react";
import { Text, View } from "react-native";
import { colors } from "../../../src/theme/tokens";

/** The drawn space every scene is composed in. */
export const THUMB_W = 208;
export const THUMB_H = 118;

/** Stage-theme hues (the same four the stage itself offers). */
const HUES = {
  cyan: "#22D3EE",
  violet: "#A78BFA",
  magenta: "#E879F9",
  amber: "#FBBF24",
} as const;

/** A soft round pool of color — the fluid's native shape. */
function Blob({
  left,
  top,
  size,
  color,
  opacity,
}: {
  left: number;
  top: number;
  size: number;
  color: string;
  opacity: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

/** A thin bright streamline, raked like the fluid's currents. */
function Stream({
  left,
  top,
  width,
  color,
  opacity,
  rotate = -16,
}: {
  left: number;
  top: number;
  width: number;
  color: string;
  opacity: number;
  rotate?: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left,
        top,
        width,
        height: 3,
        borderRadius: 2,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${rotate}deg` }],
      }}
    />
  );
}

/** A viewfinder corner (See / camera scenes). */
function Corner({
  left,
  top,
  right,
  bottom,
  vertical,
  horizontal,
}: {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  vertical: "top" | "bottom";
  horizontal: "left" | "right";
}) {
  return (
    <View
      style={{
        position: "absolute",
        left,
        top,
        right,
        bottom,
        width: 16,
        height: 16,
        borderColor: "rgba(242,247,249,0.55)",
        borderTopWidth: vertical === "top" ? 2 : 0,
        borderBottomWidth: vertical === "bottom" ? 2 : 0,
        borderLeftWidth: horizontal === "left" ? 2 : 0,
        borderRightWidth: horizontal === "right" ? 2 : 0,
      }}
    />
  );
}

/** The liquid canvas itself — also the ground the piano floats on. */
function FluidScene({ dim = false }: { dim?: boolean }) {
  const k = dim ? 0.45 : 1;
  return (
    <>
      <Blob left={-34} top={-42} size={150} color={HUES.cyan} opacity={0.5 * k} />
      <Blob left={118} top={-26} size={128} color={HUES.violet} opacity={0.45 * k} />
      <Blob left={-18} top={62} size={104} color={HUES.magenta} opacity={0.32 * k} />
      <Blob left={150} top={66} size={72} color={HUES.amber} opacity={0.3 * k} />
      <Stream left={26} top={40} width={118} color={HUES.cyan} opacity={0.75 * k} />
      <Stream left={64} top={66} width={96} color="#FFFFFF" opacity={0.4 * k} />
      <Stream left={10} top={88} width={72} color={HUES.violet} opacity={0.55 * k} />
      <Stream left={96} top={96} width={84} color={HUES.magenta} opacity={0.45 * k} />
      {/* A touch landing — the ripple it leaves in the liquid. */}
      <View style={{ position: "absolute", left: 128, top: 12, width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: "rgba(34,211,238,0.55)", opacity: k }} />
      <View style={{ position: "absolute", left: 137, top: 21, width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)", opacity: k }} />
      {/* Splat dots — other people's touches, mid-flight. */}
      <Blob left={88} top={22} size={9} color={HUES.amber} opacity={0.9 * k} />
      <Blob left={164} top={44} size={7} color={HUES.cyan} opacity={0.9 * k} />
      <Blob left={48} top={98} size={6} color="#FFFFFF" opacity={0.7 * k} />
      <Blob left={146} top={24} size={5} color={HUES.cyan} opacity={0.95 * k} />
      {/* The ghostie, at home in the fluid. */}
      <Blob left={178} top={88} size={12} color={HUES.violet} opacity={0.95 * k} />
    </>
  );
}

/** AR Piano — the fluid below, a true key strip across the bottom. */
function PianoScene() {
  const whiteKeys = Array.from({ length: 11 }, (_, i) => i);
  // Black keys sit on the seams after white keys 0,1,3,4,5,7,8.
  const blackSeams = [0, 1, 3, 4, 5, 7, 8];
  return (
    <>
      <FluidScene dim />
      {/* Notes rising off the keys. */}
      <Blob left={52} top={30} size={10} color={HUES.cyan} opacity={0.95} />
      <Blob left={98} top={18} size={10} color={HUES.violet} opacity={0.95} />
      <Blob left={144} top={36} size={10} color={HUES.magenta} opacity={0.95} />
      <View style={{ position: "absolute", left: 61, top: 36, width: 2, height: 26, backgroundColor: HUES.cyan, opacity: 0.7 }} />
      <View style={{ position: "absolute", left: 107, top: 24, width: 2, height: 26, backgroundColor: HUES.violet, opacity: 0.7 }} />
      <View style={{ position: "absolute", left: 153, top: 42, width: 2, height: 20, backgroundColor: HUES.magenta, opacity: 0.7 }} />
      {/* The key strip. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 46,
          flexDirection: "row",
          gap: 1.5,
          paddingHorizontal: 5,
          backgroundColor: "rgba(5,8,10,0.55)",
        }}
      >
        {whiteKeys.map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: "#DCE9ED",
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
              opacity: 0.96,
            }}
          />
        ))}
      </View>
      {blackSeams.map((seam) => (
        <View
          key={seam}
          style={{
            position: "absolute",
            bottom: 20,
            left: `${((seam + 1) / 11) * 100}%`,
            marginLeft: -6,
            width: 11,
            height: 26,
            backgroundColor: "#0A0F12",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
          }}
        />
      ))}
    </>
  );
}

/** A spotlight cone (border triangle), apex at the top. */
function SpotCone({ left, color, rotate }: { left: number; color: string; rotate: number }) {
  return (
    <View
      style={{
        position: "absolute",
        top: -6,
        left,
        width: 0,
        height: 0,
        borderLeftWidth: 27,
        borderRightWidth: 27,
        borderBottomWidth: 108,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: color,
        opacity: 0.14,
        transform: [{ rotate: `${rotate}deg` }],
      }}
    />
  );
}

/** A limb of the dancer figure. */
function Limb({
  left,
  top,
  width,
  height,
  rotate,
  color = HUES.violet,
  opacity = 0.95,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: 3,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${rotate}deg` }],
      }}
    />
  );
}

/** Dancer Stage — lit floor, ripples, the ghostie-dancer mid-move. */
function StageScene() {
  return (
    <>
      <SpotCone left={16} color={HUES.cyan} rotate={13} />
      <SpotCone left={138} color={HUES.violet} rotate={-13} />
      {/* Floor glow + ripples where the notes land. */}
      <View style={{ position: "absolute", left: 9, bottom: -20, width: 190, height: 46, borderRadius: 999, backgroundColor: HUES.cyan, opacity: 0.16 }} />
      <View style={{ position: "absolute", left: 29, bottom: -9, width: 150, height: 30, borderRadius: 999, borderWidth: 1, borderColor: "rgba(34,211,238,0.4)" }} />
      <View style={{ position: "absolute", left: 54, bottom: -4, width: 100, height: 20, borderRadius: 999, borderWidth: 1, borderColor: "rgba(167,139,250,0.45)" }} />
      {/* The dancer — one figure, its owner's hue, mid-phrase. */}
      <Blob left={99} top={26} size={11} color={HUES.violet} opacity={0.98} />
      <Limb left={102} top={36} width={4} height={25} rotate={7} />
      <Limb left={90} top={40} width={21} height={4} rotate={-38} />
      <Limb left={103} top={42} width={21} height={4} rotate={24} color={HUES.cyan} />
      <Limb left={99} top={58} width={4} height={24} rotate={17} />
      <Limb left={106} top={58} width={4} height={24} rotate={-21} color={HUES.cyan} />
      {/* Notes in the air around her. */}
      <Blob left={52} top={34} size={7} color={HUES.amber} opacity={0.9} />
      <Blob left={156} top={48} size={7} color={HUES.magenta} opacity={0.9} />
      <Blob left={70} top={70} size={5} color={HUES.cyan} opacity={0.85} />
    </>
  );
}

/** See — a camera frame; SAM's boxes make the scene touchable. */
function SeeScene() {
  return (
    <>
      {/* The scene, muted — it is the world, not the chrome. */}
      <Blob left={-20} top={52} size={120} color="#3E5A5E" opacity={0.5} />
      <Blob left={120} top={-30} size={110} color="#4A4458" opacity={0.5} />
      <Blob left={70} top={64} size={80} color="#5E523E" opacity={0.4} />
      <Corner left={8} top={8} vertical="top" horizontal="left" />
      <Corner right={8} top={8} vertical="top" horizontal="right" />
      <Corner left={8} bottom={8} vertical="bottom" horizontal="left" />
      <Corner right={8} bottom={8} vertical="bottom" horizontal="right" />
      {/* The found thing: a filled segment inside SAM's box. */}
      <View style={{ position: "absolute", left: 30, top: 30, width: 66, height: 46, borderWidth: 1.5, borderColor: HUES.cyan, borderRadius: 4, backgroundColor: "rgba(34,211,238,0.13)" }}>
        <Blob left={10} top={8} size={30} color={HUES.cyan} opacity={0.4} />
        <Blob left={28} top={16} size={22} color={HUES.cyan} opacity={0.35} />
      </View>
      <View style={{ position: "absolute", left: 30, top: 20, width: 26, height: 9, backgroundColor: HUES.cyan, borderRadius: 2 }} />
      {/* Two more candidates, still just outlines. */}
      <View style={{ position: "absolute", left: 128, top: 44, width: 48, height: 34, borderWidth: 1.5, borderColor: HUES.violet, borderRadius: 4 }} />
      <View style={{ position: "absolute", left: 128, top: 35, width: 26, height: 9, backgroundColor: HUES.violet, borderRadius: 2 }} />
      <View style={{ position: "absolute", left: 108, top: 88, width: 34, height: 20, borderWidth: 1.5, borderColor: HUES.amber, borderRadius: 4 }} />
    </>
  );
}

/** Camera Effects — aperture rings and the prism trail of a filter. */
function EffectsScene() {
  return (
    <>
      <Blob left={-30} top={-36} size={120} color={HUES.violet} opacity={0.3} />
      <Blob left={140} top={60} size={90} color={HUES.cyan} opacity={0.25} />
      {/* The aperture, worn over the fabric. */}
      <View style={{ position: "absolute", left: 22, top: 17, width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: "rgba(242,247,249,0.5)" }} />
      <View style={{ position: "absolute", left: 38, top: 33, width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: HUES.cyan, opacity: 0.75 }} />
      <View style={{ position: "absolute", left: 52, top: 47, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: HUES.violet, opacity: 0.85 }} />
      <Blob left={60} top={55} size={8} color="#FFFFFF" opacity={0.9} />
      {/* Blades. */}
      <Limb left={30} top={26} width={26} height={7} rotate={32} color="#FFFFFF" opacity={0.28} />
      <Limb left={74} top={82} width={26} height={7} rotate={32} color="#FFFFFF" opacity={0.28} />
      <Limb left={82} top={30} width={26} height={7} rotate={-48} color="#FFFFFF" opacity={0.22} />
      {/* The prism trail — one touch, split into the hues. */}
      <Blob left={126} top={30} size={11} color={HUES.cyan} opacity={0.95} />
      <Blob left={144} top={46} size={11} color={HUES.violet} opacity={0.95} />
      <Blob left={158} top={64} size={11} color={HUES.magenta} opacity={0.95} />
      <Blob left={168} top={82} size={11} color={HUES.amber} opacity={0.95} />
    </>
  );
}

/**
 * The Fold — GenX's own visual contract (its Visualizer): atoms
 * start scattered and resolve toward the form as progress
 * climbs. Here: loose motes at the edges, a helix of dye
 * resolving through the middle — one job, every screen, forming.
 */
function FoldScene() {
  // The helix: two strands of motes winding through the frame.
  const helixA = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const x = 34 + i * 20;
    const y = 59 + Math.sin(i * 0.9) * 26;
    return { x, y };
  });
  const helixB = helixA.map((p, i) => ({
    x: p.x,
    y: 59 - Math.sin(i * 0.9) * 26,
  }));
  return (
    <>
      <Blob left={-30} top={-40} size={130} color={HUES.cyan} opacity={0.28} />
      <Blob left={140} top={58} size={100} color={HUES.violet} opacity={0.24} />
      {/* Scattered motes — the field at 0%, not yet a shape. */}
      <Blob left={12} top={10} size={5} color="#FFFFFF" opacity={0.5} />
      <Blob left={52} top={96} size={5} color={HUES.amber} opacity={0.55} />
      <Blob left={168} top={12} size={6} color={HUES.cyan} opacity={0.5} />
      <Blob left={188} top={88} size={5} color="#FFFFFF" opacity={0.45} />
      <Blob left={8} top={84} size={6} color={HUES.magenta} opacity={0.4} />
      {/* The resolving helix — progress made visible as form. */}
      {helixA.map((p, i) => (
        <Blob key={`a${i}`} left={p.x} top={p.y} size={i % 2 ? 7 : 9} color={HUES.cyan} opacity={0.95} />
      ))}
      {helixB.map((p, i) => (
        <Blob key={`b${i}`} left={p.x} top={p.y} size={i % 2 ? 9 : 7} color={HUES.violet} opacity={0.9} />
      ))}
      {/* Rungs where the strands meet — shards locking in. */}
      {[1, 3, 5].map((i) => (
        <View
          key={`r${i}`}
          style={{
            position: "absolute",
            left: helixA[i].x + 3,
            top: Math.min(helixA[i].y, helixB[i].y),
            width: 2,
            height: Math.abs(helixA[i].y - helixB[i].y),
            backgroundColor: "#FFFFFF",
            opacity: 0.35,
          }}
        />
      ))}
    </>
  );
}

/** Stable hue pair for an unregistered fabric id. */
function hashHues(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const all = [HUES.cyan, HUES.violet, HUES.magenta, HUES.amber];
  return [all[h % 4], all[(h >> 3) % 4]];
}

/** The fallback scene — any fabric is presentable, drawn or not. */
function GenericScene({ layerId }: { layerId: string }) {
  const [a, b] = hashHues(layerId);
  return (
    <>
      <Blob left={-26} top={-34} size={130} color={a} opacity={0.42} />
      <Blob left={126} top={40} size={110} color={b} opacity={0.38} />
      <View style={{ position: "absolute", left: 74, top: 29, width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: "rgba(242,247,249,0.35)" }} />
      <Text
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 38,
          textAlign: "center",
          color: colors.text,
          fontSize: 30,
          fontWeight: "700",
          opacity: 0.9,
        }}
      >
        F
      </Text>
    </>
  );
}

function PlaygroundScene() {
  // The ghostie at home: a golden dome with a wavy hem, hovering
  // over its own pool of fluid, its key strip laid out below —
  // the one room where everything it has is on the table.
  const gold = "#F2C063";
  const keys = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <>
      <Blob left={-24} top={52} size={120} color={HUES.amber} opacity={0.22} />
      <Blob left={138} top={-30} size={110} color={HUES.violet} opacity={0.2} />
      <Stream left={18} top={30} width={44} color={HUES.amber} opacity={0.4} />
      <Stream left={150} top={86} width={38} color={HUES.cyan} opacity={0.35} />
      {/* The pool it hovers over — the fluid, its ground. */}
      <Blob left={64} top={74} size={80} color={gold} opacity={0.3} />
      <Blob left={82} top={82} size={44} color={gold} opacity={0.35} />
      {/* The ghostie: dome + wavy hem + two eyes. */}
      <View
        style={{
          position: "absolute",
          left: 79,
          top: 18,
          width: 50,
          height: 44,
          borderTopLeftRadius: 25,
          borderTopRightRadius: 25,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          backgroundColor: gold,
          opacity: 0.95,
        }}
      />
      {[0, 1, 2].map((i) => (
        <Blob
          key={`hem${i}`}
          left={81 + i * 15}
          top={56}
          size={14}
          color={gold}
          opacity={0.95}
        />
      ))}
      <Blob left={93} top={36} size={5} color="#23180A" opacity={0.9} />
      <Blob left={108} top={36} size={5} color="#23180A" opacity={0.9} />
      {/* Sparkles — the tools out on the table. */}
      <Blob left={40} top={22} size={5} color="#FFFFFF" opacity={0.6} />
      <Blob left={164} top={30} size={6} color={HUES.amber} opacity={0.65} />
      <Blob left={148} top={58} size={4} color="#FFFFFF" opacity={0.5} />
      {/* Its key strip — notes live here too. */}
      {keys.map((i) => (
        <View
          key={`key${i}`}
          style={{
            position: "absolute",
            left: 52 + i * 13,
            top: 102,
            width: 10,
            height: 12,
            borderRadius: 2,
            backgroundColor: i % 2 ? "#EDE2D0" : "#FFFFFF",
            opacity: 0.85,
          }}
        />
      ))}
    </>
  );
}

const SCENES: Record<string, () => React.ReactElement> = {
  "default-fluid": () => <FluidScene />,
  "ar-piano": () => <PianoScene />,
  "dancer-stage": () => <StageScene />,
  "sam-see": () => <SeeScene />,
  "camera-effects": () => <EffectsScene />,
  "genx-fold": () => <FoldScene />,
  "ghostie-playground": () => <PlaygroundScene />,
};

/**
 * The thumbnail for one fabric. Fills its card's thumb frame
 * (the card fixes the height); scenes compose in 208x118 space.
 */
export default function FabricThumb({ layerId }: { layerId: string }) {
  const scene = SCENES[layerId];
  return (
    <View
      pointerEvents="none"
      style={{
        width: "100%",
        height: THUMB_H,
        overflow: "hidden",
        backgroundColor: "#070D10",
        position: "relative",
      }}
    >
      {scene ? scene() : <GenericScene layerId={layerId} />}
    </View>
  );
}
