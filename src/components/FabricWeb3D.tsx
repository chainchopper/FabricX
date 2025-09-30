import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { eventBus, InputEvent } from "../../shared/utils/eventBus";
import { decayTowards } from "../../shared/utils/easing";
import { useAR } from "../contexts/ARContext";
import TouchParticles from "./TouchParticles";
import { useExperience } from "../contexts/ExperienceContext";
import PianoOverlay from "./piano/PianoOverlay";
import { useMIDIFluid } from "../hooks/useMIDIFluid";
import ToneEngine from "./audio/ToneEngine";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

const vertexShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPulse;
  uniform float uBoost;

  float ripple(vec2 p, vec2 c, float t) {
    float d = distance(p, c);
    return sin(12.0 * d - t * 2.5) * exp(-3.0 * d);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    float r = ripple(vUv, uPointer, uTime) * (0.06 + uPulse * 0.08 * uBoost);
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
  uniform float uBoost;

  vec3 baseColor(vec2 uv) {
    vec3 c1 = vec3(0.03, 0.07, 0.15);
    vec3 c2 = vec3(0.10, 0.60, 0.74);
    float g = smoothstep(0.0, 1.0, uv.y);
    return mix(c1, c2, g * 0.25);
  }

  void main() {
    float d = distance(vUv, uPointer);
    float ripple = sin(12.0 * d - uTime * 2.5) * exp(-3.0 * d);
    float glow = smoothstep(0.22, 0.0, d) * (0.5 + uPulse * 0.9 * uBoost);

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
  return (
    <mesh position={[0, 0, -0.6]} frustumCulled={false}>
      <planeGeometry args={[2, 2, 1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function LiquidSurface() {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;

  const uBoost = useMemo(() => {
    if (!activeExperience) return 1;
    if (activeExperience.id === "camera-effects") {
      const v = Number(experienceConfig.specific?.filterIntensity ?? 0.7);
      return Math.max(0.4, Math.min(1.5, v + 0.3));
    }
    return 1;
  }, [activeExperience, experienceConfig]);

  const segments = useMemo(() => {
    const fq = (experienceConfig.specific as Record<string, unknown> | undefined)?.["fluidQuality"] as
      | "low"
      | "medium"
      | "high"
      | "auto"
      | undefined;

    if (fq === "low") return 96;
    if (fq === "medium") return 128;
    if (fq === "high" || fq === undefined) return 160;

    // Auto: scale with DPR and viewport
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    const minEdge = typeof window !== "undefined" ? Math.min(window.innerWidth, window.innerHeight) : 800;
    if (dpr <= 1 || minEdge < 700) return 120;
    if (dpr <= 2 || minEdge < 1000) return 144;
    return 176;
  }, [experienceConfig]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uPulse: { value: 0 },
      uBoost: { value: uBoost },
    }),
    [uBoost]
  );

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uBoost.value = uBoost;
    }
  }, [uBoost]);

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
      <planeGeometry args={[2, 2, segments, segments]} />
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
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;

  const isARPiano = activeExperience?.id === "ar-piano";

  const midiEnabled = useMemo(() => {
    if (!isARPiano) return false;
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    return (s?.midiEnabled as boolean | undefined) ?? true;
  }, [isARPiano, experienceConfig]);

  const midiIntensity = useMemo(() => {
    const s = experienceConfig.specific as Record<string, unknown> | undefined;
    const v = Number(s?.midiIntensity ?? 1);
    return isFinite(v) ? v : 1;
  }, [experienceConfig]);

  useMIDIFluid("ar-piano", !!midiEnabled, midiIntensity);

  const densityScale = useMemo(() => {
    if (!activeExperience) return 1;
    if (activeExperience.id === "camera-effects") return 0.6;
    if (activeExperience.id === "ar-piano") return 1.0;
    return 1.0;
  }, [activeExperience]);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "transparent" }}>
      <ToneEngine />
      <Canvas
        dpr={dpr}
        frameloop="always"
        gl={{
          antialias: true,
          alpha: true,
          stencil: false,
          depth: true,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
        }}
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {isARCameraActive && videoTexture ? <CameraBackground texture={videoTexture} /> : <color attach="background" args={["#0b1020"]} />}
        <ambientLight intensity={0.3} />
        <directionalLight intensity={0.6} position={[2, 3, 2]} />
        <LiquidSurface />
        {isARPiano ? <PianoOverlay /> : null}
        <TouchParticles densityScale={densityScale} />
        {isARPiano ? (
          <EffectComposer multisampling={4}>
            <Bloom intensity={0.5} luminanceThreshold={0.1} luminanceSmoothing={0.9} />
          </EffectComposer>
        ) : null}
        <perspectiveCamera position={[0, 0, 1.8]} fov={50} />
      </Canvas>
    </div>
  );
}