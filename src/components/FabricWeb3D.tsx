import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { eventBus, InputEvent } from "../../shared/utils/eventBus";
import { decayTowards } from "../../shared/utils/easing";

type Vec2 = [number, number];

const vertexShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPulse;

  float ripple(vec2 p, vec2 c, float t) {
    float d = distance(p, c);
    return sin(12.0 * d - t * 2.5) * exp(-3.0 * d);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Distortion based on pointer-centered ripples + slow waves
    float r = ripple(vUv, uPointer, uTime) * (0.06 + uPulse * 0.08);
    float wave = sin((position.x + position.y) * 2.0 + uTime * 0.7) * 0.02;

    pos.z += r + wave;

    // Subtle edge lift for nicer shading
    float edge = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
    edge *= smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
    pos.z += edge * 0.01;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPulse;

  // Fanalogy cyan/blue energy palette
  vec3 baseColor(vec2 uv) {
    vec3 c1 = vec3(0.03, 0.07, 0.15);
    vec3 c2 = vec3(0.10, 0.60, 0.74);
    float g = smoothstep(0.0, 1.0, uv.y);
    return mix(c1, c2, g * 0.25);
  }

  void main() {
    float d = distance(vUv, uPointer);
    float ripple = sin(12.0 * d - uTime * 2.5) * exp(-3.0 * d);
    float glow = smoothstep(0.22, 0.0, d) * (0.5 + uPulse * 0.9);

    vec3 col = baseColor(vUv);
    col += vec3(0.0, 0.5, 0.7) * ripple * 0.25;
    col += vec3(0.15, 0.85, 0.95) * glow * 0.35;

    // Soft vignette
    float vx = vUv.x * (1.0 - vUv.x);
    float vy = vUv.y * (1.0 - vUv.y);
    float vignette = pow(vx * vy * 4.0, 0.35);
    col *= vignette * 0.25 + 0.75;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function LiquidSurface() {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const { size } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uPulse: { value: 0 },
    }),
    []
  );

  // Subscribe to unified input bus
  useEffect(() => {
    const sub = eventBus.on((e: InputEvent) => {
      if (!materialRef.current) return;

      // On any event, nudge pulse and update pointer (already normalized 0..1)
      const u = materialRef.current.uniforms;
      const nx = Math.min(1, Math.max(0, e.x));
      const ny = Math.min(1, Math.max(0, e.y));
      (u.uPointer.value as THREE.Vector2).set(nx, ny);

      if (e.type === "tap") {
        u.uPulse.value = Math.min(1, u.uPulse.value + 0.6);
      } else if (e.type === "long-press") {
        u.uPulse.value = Math.min(1, u.uPulse.value + 0.9);
      } else if (e.type === "drag") {
        u.uPulse.value = Math.min(1, u.uPulse.value + 0.2);
      }
    });
    return () => sub();
  }, []);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value += delta;

    // Decay pulse smoothly
    materialRef.current.uniforms.uPulse.value = decayTowards(
      materialRef.current.uniforms.uPulse.value,
      0,
      0.06
    );
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI * 0.0, 0, 0]}
      onPointerMove={(e) => {
        // Update pointer via UV and emit drag to bus for global consumers
        if (!materialRef.current || !e.uv) return;
        const uv = e.uv;
        (materialRef.current.uniforms.uPointer.value as THREE.Vector2).set(uv.x, uv.y);
        eventBus.emitDrag(uv.x, uv.y);
      }}
      onPointerDown={(e) => {
        if (!materialRef.current || !e.uv) return;
        const uv = e.uv;
        eventBus.emitTap(uv.x, uv.y);
      }}
      onContextMenu={(e) => {
        // Simulate long-press via right-click on web
        e.preventDefault();
        const target = materialRef.current;
        if (!target) return;
        const uv = (e as unknown as { uv?: THREE.Vector2 }).uv;
        if (uv) eventBus.emitLongPress(uv.x, uv.y);
      }}
    >
      <planeGeometry args={[2, 2, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms as unknown as { [uniform: string]: THREE.IUniform }}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function FabricWeb3D() {
  // Camera setup: simple perspective, orbit disabled
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  return (
    <div style={{ width: "100%", height: "100%", background: "#0b1020" }}>
      <Canvas dpr={dpr} gl={{ antialias: true }}>
        <color attach="background" args={["#0b1020"]} />
        <ambientLight intensity={0.3} />
        <directionalLight intensity={0.6} position={[2, 3, 2]} />
        <LiquidSurface />
        <perspectiveCamera position={[0, 0, 1.8]} fov={50} />
      </Canvas>
    </div>
  );
}