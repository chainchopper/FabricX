import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { eventBus, InputEvent } from "../../shared/utils/eventBus";
import { getAudioReactive, subscribeAudioReactive } from "../shared/utils/audioReactive";
import { useExperience } from "../contexts/ExperienceContext";

export default function TouchParticles({ densityScale = 1 }: { densityScale?: number }) {
  const pointsRef = useRef<THREE.Points | null>(null);
  const pausedRef = useRef<boolean>(false);

  // Read audio-reactive config from experience
  const { state } = useExperience();
  const s = (state.experienceConfig.specific as Record<string, unknown>) || {};
  const audioParticleEnabled = Boolean((s?.audioParticleEnabled as boolean) ?? true);
  const audioParticleIntensity = Number.isFinite(s?.audioParticleIntensity) ? Number(s?.audioParticleIntensity) : 1;

  // Track current audio levels (reactive)
  const audioRef = useRef(getAudioReactive());
  useEffect(() => {
    const unsub = subscribeAudioReactive((next) => {
      audioRef.current = next;
    });
    return () => unsub();
  }, []);

  const env = useMemo(() => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const smallScreen =
      typeof window !== "undefined"
        ? Math.min(window.innerWidth, window.innerHeight) < 700
        : false;

    const preset = dpr > 2 || smallScreen ? "low" : dpr > 1.5 ? "medium" : "high";
    const baseCount = preset === "low" ? 400 : preset === "medium" ? 700 : 1000;
    const particleCount = Math.max(100, Math.floor(baseCount * Math.max(0.25, densityScale)));
    const particleSize = preset === "low" ? 0.016 : preset === "medium" ? 0.02 : 0.024;

    return { particleCount, particleSize };
  }, [densityScale]);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(env.particleCount * 3);
    const velocities = new Float32Array(env.particleCount * 3);
    const lifetimes = new Float32Array(env.particleCount);
    const colors = new Float32Array(env.particleCount * 3);

    for (let i = 0; i < env.particleCount; i++) {
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
    geom.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
    geom.setAttribute("lifetime", new THREE.BufferAttribute(lifetimes, 1));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: env.particleSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return { geometry: geom, material: mat };
  }, [env.particleCount, env.particleSize]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    const onVis = () => {
      pausedRef.current = typeof document !== "undefined" ? document.hidden : false;
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
      onVis();
      return () => document.removeEventListener("visibilitychange", onVis);
    }
    return;
  }, []);

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

    const emitCount = Math.max(10, Math.floor(28 * strength));
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

  // Beat-triggered bursts at center for extra sparkle
  const lastBeatRef = useRef(0);
  useEffect(() => {
    if (!audioParticleEnabled) return;
    const unsub = subscribeAudioReactive((s) => {
      // Rising edge near peak triggers a burst at center
      if (s.beat > 0.9 && lastBeatRef.current < 0.4) {
        const k = Math.max(0.6, Math.min(1.6, audioParticleIntensity));
        spawnBurst(0.5, 0.5, 1.2 * k);
      }
      lastBeatRef.current = s.beat;
    });
    return () => unsub();
  }, [audioParticleEnabled, audioParticleIntensity]); // intensity controls burst strength

  // Fabric input events → bursts
  useEffect(() => {
    const unsub = eventBus.on((e: InputEvent) => {
      const base = e.type === "long-press" ? 1.2 : e.type === "tap" ? 0.8 : 0.35;
      spawnBurst(e.x, e.y, base);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  useFrame((_, delta) => {
    if (!pointsRef.current || pausedRef.current) return;

    const dt = Math.min(delta, 1 / 30);

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const velAttr = geometry.getAttribute("velocity") as unknown as THREE.BufferAttribute;
    const lifeAttr = geometry.getAttribute("lifetime") as unknown as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;

    const positions = posAttr.array as Float32Array;
    const velocities = velAttr.array as Float32Array;
    const lifetimes = lifeAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;

    const reactivity = audioParticleEnabled ? Math.max(0.4, Math.min(1.8, audioParticleIntensity)) : 0.0;
    const energy = audioRef.current.energy; // 0..1
    const drag = 0.96 - 0.15 * (reactivity > 0 ? energy * 0.5 : 0); // lower drag when energy high
    const gravity = -0.18;

    for (let i = 0; i < lifetimes.length; i++) {
      if (lifetimes[i] > 0) {
        const i3 = i * 3;

        positions[i3 + 0] += velocities[i3 + 0] * dt;
        positions[i3 + 1] += velocities[i3 + 1] * dt;
        positions[i3 + 2] += velocities[i3 + 2] * dt;

        // Add small jitter with energy for shimmer
        if (reactivity > 0) {
          const j = (Math.random() - 0.5) * 0.04 * energy * reactivity;
          velocities[i3 + 0] += j * 0.2;
          velocities[i3 + 1] += j * 0.2;
        }

        velocities[i3 + 0] *= drag;
        velocities[i3 + 1] = velocities[i3 + 1] * drag + gravity * dt * 0.2;
        velocities[i3 + 2] *= drag;

        lifetimes[i] -= dt;

        // Soft fade
        colors[i3 + 0] *= 0.985;
        colors[i3 + 1] *= 0.985;
        colors[i3 + 2] *= 0.985;

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