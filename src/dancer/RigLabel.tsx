/**
 * RigLabel — a stage dancer's floating name tag (Stage v2).
 *
 * A canvas-texture sprite: the participant's name (the local rig
 * wears its GHOST's name — it is the ghostie) on a dark pill with a
 * dot in the owner's signature hue. Sprites always face the camera,
 * so the tag reads from anywhere in the house; the texture is drawn
 * once per (name, hue) and disposed on change/unmount. Dependency-
 * free by design (no drei in this tree): plain three + 2D canvas.
 */
import React, { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const LABEL_HEIGHT = 0.3; // world units
const FONT_PX = 46;
const PAD_X = 30;
const DOT_R = 11;

/**
 * Chrome avoidance (Slice 37): the Essence — the device's
 * identity card — owns the top-right corner as DOM chrome and
 * always paints over the canvas (its mount sits at zIndex 70;
 * the whole canvas branch is zIndex 0). A rig's name tag that
 * drifted into that corner was half-eaten by the card: Terrell's
 * Nov 1 shot has Boop's tag sitting BEHIND the Essence, its pill
 * arc and name bleeding around the card's edges — two pieces of
 * chrome pretending to share one corner. The tag now YIELDS:
 * this maps its projected screen position (NDC: x right, y up,
 * both -1..1) to a target opacity — full everywhere else, faded
 * to a ghost inside the Essence's corner, ramped on both axes so
 * the fade is a glide, not a pop. Pure math so the check can
 * prove the yield without a GPU.
 */
export function labelOpacityForNdc(x: number, y: number): number {
  const ramp = (v: number, lo: number, hi: number) =>
    Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  const intoCorner = ramp(x, 0.02, 0.3) * ramp(y, 0.5, 0.7);
  return 1 - 0.88 * intoCorner;
}

function makeLabelSprite(name: string, hue: number): THREE.Sprite {
  const label = name.trim() || "Ghostie";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${FONT_PX}px system-ui, -apple-system, sans-serif`;
  ctx.font = font;
  const textW = ctx.measureText(label).width;
  const w = Math.ceil(textW + PAD_X * 2 + DOT_R * 2 + 14);
  const h = 84;
  canvas.width = w;
  canvas.height = h;

  const c = canvas.getContext("2d")!;
  // Pill backdrop.
  const r = h / 2;
  c.beginPath();
  c.moveTo(r, 2);
  c.lineTo(w - r, 2);
  c.arc(w - r, h / 2, r - 2, -Math.PI / 2, Math.PI / 2);
  c.lineTo(r, h - 2);
  c.arc(r, h / 2, r - 2, Math.PI / 2, Math.PI * 1.5);
  c.closePath();
  c.fillStyle = "rgba(6, 9, 16, 0.58)";
  c.fill();
  c.strokeStyle = `hsla(${hue}, 80%, 68%, 0.45)`;
  c.lineWidth = 2;
  c.stroke();
  // Signature dot.
  c.beginPath();
  c.arc(PAD_X + DOT_R - 6, h / 2, DOT_R, 0, Math.PI * 2);
  c.fillStyle = `hsl(${hue}, 85%, 60%)`;
  c.fill();
  // Name.
  c.font = font;
  c.textBaseline = "middle";
  c.fillStyle = "#f2f6fb";
  c.fillText(label, PAD_X + DOT_R * 2 + 8, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(LABEL_HEIGHT * (w / h), LABEL_HEIGHT, 1);
  return sprite;
}

export default function RigLabel({
  name,
  hue,
}: {
  name: string;
  hue: number;
}) {
  const sprite = useMemo(() => makeLabelSprite(name, hue), [name, hue]);
  useEffect(
    () => () => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    },
    [sprite]
  );
  // The yield, applied per frame: project the tag's world
  // position and ease its opacity toward the corner verdict.
  // The tag never moves or resizes — it simply gets out of the
  // Essence's way while it passes through its corner.
  const probe = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!sprite.parent) return;
    sprite.getWorldPosition(probe).project(camera);
    const target = labelOpacityForNdc(probe.x, probe.y);
    const mat = sprite.material;
    mat.opacity += (target - mat.opacity) * 0.18;
  });
  return <primitive object={sprite} position={[0, 2.06, 0]} />;
}
