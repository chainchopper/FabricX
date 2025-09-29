import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { eventBus, InputEvent } from "../../shared/utils/eventBus";
import { decayTowards } from "../../shared/utils/easing";
import { useAR } from "../contexts/ARContext";
import TouchParticles from "./TouchParticles";

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

    float r = ripple(vUv, uPointer, uTime) * (0.06 + uPulse * 0.08);
    float wave = sin((position.x + position.y) * 2.0 + uTime * 0.7) * 0.02;

    pos.z += r + wave;

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

    float vx = vUv.x * (1.0 - vUv.x);
    float vy = vUv.y * (1.0 - vUv.y);
    float vignette = pow(vx * vy * 4.0, 0.35);
    col *= vignette * 0.25 + 0.75;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function CameraBackground({ texture }: { texture: THREE.VideoTexture }) {
  // Use a plane behind the liquid surface
  return (
    <mesh position={[0, 0, -0.6]} frustumCulled={false}>
      <planeGeometry args={[2, 2, 1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function LiquidSurface() {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uPulse: { value: 0 },
    }),
    []
  );

  useEffect(() => {
    const sub = eventBus.on((e: InputEvent) => {
      if (!materialRef.current) return;
      const u = materialRef.current.uniforms;
      const nx = Math.min(1, Math.max(0, e.x));
      const ny = Math.min(1, Math.max(0, e.y));
      (u.uPointer.value as THREE.Vector2).set(nx, ny);

      if (e.type === "tap") u.uPulse.value = Math.min(1, u.uPulse.value + 0.6);
      else if (e.type === "long-press") u.uPulse.value = Math.min(1, u.uPulse.value + 0.9);
      else if (e.type === "drag") u.uPulse.value = Math.min(1, u.uPulse.value + 0.2);
    });
    return () => sub();
  }, []);

  useFrame((_, delta) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value += delta;
    materialRef.current.uniforms.uPulse.value = decayTowards(
      materialRef.current.uniforms.uPulse.value,
      0,
      0.06
    );
  });

  return (
    <mesh
      rotation={[-Math.PI * 0.0, 0, 0]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!materialRef.current || !e.uv) return;
        const uv = e.uv;
        (materialRef.current.uniforms.uPointer.value as THREE.Vector2).set(uv.x, uv.y);
        eventBus.emitDrag(uv.x, uv.y);
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!materialRef.current || !e.uv) return;
        eventBus.emitTap(e.uv.x, e.uv.y);
      }}
      onContextMenu={(e: ThreeEvent<MouseEvent>) => {
        e.nativeEvent.preventDefault();
        if (!materialRef.current || !e.uv) return;
        eventBus.emitLongPress(e.uv.x, e.uv.y);
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
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const { isARCameraActive, videoTexture } = useAR();

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "transparent" }}>
      <Canvas
        dpr={dpr}
        gl={{ antialias: true }}
        style={{ position: "fixed", inset: 0 }}
      >
        {isARCameraActive && videoTexture ? <CameraBackground texture={videoTexture} /> : <color attach="background" args={["#0b1020"]} />}
        <ambientLight intensity={0.3} />
        <directionalLight intensity={0.6} position={[2, 3, 2]} />
        <LiquidSurface />
        <TouchParticles />
        <perspectiveCamera position={[0, 0, 1.8]} fov={50} />
      </Canvas>
    </div>
  );
}