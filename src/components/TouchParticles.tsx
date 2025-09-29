import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { eventBus, InputEvent } from "../../shared/utils/eventBus";

export default function TouchParticles() {
  const pointsRef = useRef<THREE.Points | null>(null);

  const particleCount = useMemo(() => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const smallScreen = typeof window !== "undefined" ? Math.min(window.innerWidth, window.innerHeight) < 700 : false;
    if (dpr > 2 || smallScreen) return 400;
    if (dpr > 1.5) return 700;
    return 1000;
  }, []);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3 + 0] = 9999;
      positions[i3 + 1] = 9999;
      positions[i3 + 2] = 0;
      velocities[i3 + 0] = 0;
      velocities[i3 + 1] = 0;
      velocities[i3 + 2] = 0;
      lifetimes[i] = 0;
      colors[i3 + 0] = 0.8;
      colors[i3 + 1] = 0.95;
      colors[i3 + 2] = 1.0;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // @ts-expect-error custom attributes not consumed by material directly
    geom.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
    // @ts-expect-error custom attributes not consumed by material directly
    geom.setAttribute("lifetime", new THREE.BufferAttribute(lifetimes, 1));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.02,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return { geometry: geom, material: mat };
  }, [particleCount]);

  const spawnBurst = (ux: number, uy: number, strength: number) => {
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const velAttr = geometry.getAttribute("velocity") as unknown as THREE.BufferAttribute;
    const lifeAttr = geometry.getAttribute("lifetime") as unknown as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;

    const positions = posAttr.array as Float32Array;
    const velocities = velAttr.array as Float32Array;
    const lifetimes = lifeAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;

    const cx = ux * 2 - 1;
    const cy = uy * 2 - 1;

    const emitCount = Math.max(12, Math.floor(32 * strength));
    let emitted = 0;

    for (let i = 0; i < lifetimes.length && emitted < emitCount; i++) {
      if (lifetimes[i] <= 0) {
        const i3 = i * 3;

        positions[i3 + 0] = cx + (Math.random() - 0.5) * 0.12;
        positions[i3 + 1] = cy + (Math.random() - 0.5) * 0.12;
        positions[i3 + 2] = 0;

        const angle = Math.random() * Math.PI * 2;
        const speed = (0.12 + Math.random() * 0.28) * strength;
        velocities[i3 + 0] = Math.cos(angle) * speed * 0.5;
        velocities[i3 + 1] = Math.sin(angle) * speed * 0.5 + 0.08 * strength;
        velocities[i3 + 2] = 0;

        lifetimes[i] = 0.6 + Math.random() * 0.7;

        const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.08, 0.9, 0.6);
        colors[i3 + 0] = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;

        emitted++;
      }
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  };

  useEffect(() => {
    const unsub = eventBus.on((e: InputEvent) => {
      const strength = e.type === "long-press" ? 1.2 : e.type === "tap" ? 0.8 : 0.35;
      spawnBurst(e.x, e.y, strength);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const velAttr = geometry.getAttribute("velocity") as unknown as THREE.BufferAttribute;
    const lifeAttr = geometry.getAttribute("lifetime") as unknown as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;

    const positions = posAttr.array as Float32Array;
    const velocities = velAttr.array as Float32Array;
    const lifetimes = lifeAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;

    const drag = 0.96;
    const gravity = -0.18;

    for (let i = 0; i < lifetimes.length; i++) {
      if (lifetimes[i] > 0) {
        const i3 = i * 3;

        positions[i3 + 0] += velocities[i3 + 0] * delta;
        positions[i3 + 1] += velocities[i3 + 1] * delta;
        positions[i3 + 2] += velocities[i3 + 2] * delta;

        velocities[i3 + 0] *= drag;
        velocities[i3 + 1] = velocities[i3 + 1] * drag + gravity * delta * 0.2;
        velocities[i3 + 2] *= drag;

        lifetimes[i] -= delta;

        colors[i3 + 0] *= 0.98;
        colors[i3 + 1] *= 0.98;
        colors[i3 + 2] *= 0.98;

        if (lifetimes[i] <= 0) {
          positions[i3 + 0] = 9999;
          positions[i3 + 1] = 9999;
          positions[i3 + 2] = 0;
        }
      }
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}