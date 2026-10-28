/**
 * StageScene — everything inside the Dancer Stage's canvas.
 *
 * - CameraRig: a cinematic perspective camera (default framing on
 *   the figure, slow idle drift per the `breathe` contract when
 *   enabled) that the user can drag-orbit within limits. The
 *   camera has PRESENCE — it is never a fixed security feed.
 * - StageEnvironment: real-time lights (white key, theme-hued rim,
 *   two note-reactive accent points), a ground disc whose custom
 *   ShaderMaterial fires hue ripples from note events (the stage's
 *   own GPU voice — the fluid is welcome here only as an effect,
 *   and this shader + the motes are that nod), fog for depth, and
 *   drifting particle motes tinted by recent note hues.
 * - DancerRig: the body.
 *
 * The fx object (stageFx) is drained once per frame here and in
 * the rig: notes become ripples + light flashes + mote tints.
 */
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import DancerRig from "./DancerRig";
import type { DancerDriver } from "./DancerDriver";
import { STAGE_BG, type StageFxState } from "./stageFx";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

function CameraRig({ drift }: { drift: boolean }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const target = useRef({ yaw: 0, pitch: 0.12 });
  const cur = useRef({ yaw: 0, pitch: 0.12 });

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let px = 0;
    let py = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      px = e.clientX;
      py = e.clientY;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is an enhancement.
      }
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      target.current.yaw = clamp(target.current.yaw - dx * 0.005, -0.95, 0.95);
      target.current.pitch = clamp(target.current.pitch + dy * 0.004, -0.02, 0.55);
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Idle contract `breathe`: the camera sways slowly when alone
    // on stage (THIS LAYER can switch the drift off).
    const swayYaw = drift ? Math.sin(t * 0.11) * 0.07 : 0;
    const swayPitch = drift ? Math.sin(t * 0.073 + 1.3) * 0.02 : 0;
    cur.current.yaw += (target.current.yaw + swayYaw - cur.current.yaw) * 0.06;
    cur.current.pitch +=
      (target.current.pitch + swayPitch - cur.current.pitch) * 0.06;
    const { yaw, pitch } = cur.current;
    const r = 4.5;
    const hr = r * Math.cos(pitch * 0.6);
    camera.position.set(
      Math.sin(yaw) * hr,
      1.15 + pitch * 2.4,
      Math.cos(yaw) * hr
    );
    camera.lookAt(0, 1.02, 0);
  });
  return null;
}

// ---------------------------------------------------------------------------
// Environment: lights, shader floor, motes
// ---------------------------------------------------------------------------

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FLOOR_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uTheme;
uniform vec3 uBg;
uniform vec4 uRipples[6];
varying vec3 vWorld;

vec3 hsl2rgb(float h, float s, float l) {
  h = mod(h, 360.0) / 360.0;
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

void main() {
  float d = length(vWorld.xz);
  float glow = smoothstep(3.1, 0.0, d);
  vec3 col = uBg + uTheme * (0.10 + glow * 0.16);
  // Slow concentric sheen — the disc breathes with the stage.
  col += uTheme * (sin(d * 7.0 - uTime * 0.6) * 0.5 + 0.5) * 0.03 * glow;
  // Note ripples: an expanding ring in the note's hue, GPU-side.
  for (int i = 0; i < 6; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.x;
    if (r.z > 0.001 && age > 0.0 && age < 2.4) {
      float rad = age * 1.6;
      float w = exp(-pow((d - rad) * 3.2, 2.0)) * exp(-age * 1.15) * r.z;
      col += hsl2rgb(r.y, 0.85, 0.55) * w * 0.9;
    }
  }
  // Fade the rim into the backdrop so the disc floats in fog.
  col = mix(col, uBg, smoothstep(2.3, 3.18, d));
  gl_FragColor = vec4(col, 1.0);
}
`;

function StageEnvironment({
  fx,
  themeHue,
}: {
  fx: StageFxState;
  themeHue: number;
}) {
  const floorMat = useRef<THREE.ShaderMaterial>(null);
  const accentA = useRef<THREE.PointLight>(null);
  const accentB = useRef<THREE.PointLight>(null);
  const motes = useRef<THREE.Points>(null);
  const motesMat = useRef<THREE.PointsMaterial>(null);
  const rippleIdx = useRef(0);
  const flash = useRef({ a: 0, b: 0, next: 0 });
  const moteTarget = useRef(new THREE.Color().setHSL(themeHue / 360, 0.7, 0.6));

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTheme: {
        value: new THREE.Color().setHSL(themeHue / 360, 0.85, 0.5),
      },
      uBg: { value: new THREE.Color(STAGE_BG) },
      uRipples: {
        value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)),
      },
    }),
    // Recreated only on mount; theme updates flow through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    uniforms.uTheme.value.setHSL(themeHue / 360, 0.85, 0.5);
    moteTarget.current.setHSL(themeHue / 360, 0.7, 0.6);
  }, [themeHue, uniforms]);

  const themeCss = useMemo(
    () => `#${new THREE.Color().setHSL(themeHue / 360, 0.85, 0.6).getHexString()}`,
    [themeHue]
  );

  const motesGeom = useMemo(() => {
    const N = 240;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(Math.random()) * 3.0;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.15 + Math.random() * 3.0;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (floorMat.current) {
      floorMat.current.uniforms.uTime.value = t;
    }
    // Drain note events: floor ripples + accent flashes + mote tint.
    if (fx.pendingNotes.length) {
      for (const n of fx.pendingNotes.splice(0)) {
        const i = rippleIdx.current++ % 6;
        const slot = (
          floorMat.current?.uniforms.uRipples.value as THREE.Vector4[] | undefined
        )?.[i];
        slot?.set(t, n.hue, Math.min(1, 0.35 + n.strength * 0.75), 0);
        const useA = flash.current.next++ % 2 === 0;
        const light = useA ? accentA.current : accentB.current;
        if (light) {
          light.color.setHSL(((n.hue % 360) + 360) % 360 / 360, 0.9, 0.6);
          if (useA) flash.current.a = 1;
          else flash.current.b = 1;
        }
        moteTarget.current
          .setHSL(themeHue / 360, 0.7, 0.6)
          .lerp(new THREE.Color().setHSL(((n.hue % 360) + 360) % 360 / 360, 0.9, 0.65), 0.55);
      }
    }
    const decay = Math.exp(-dt * 3.2);
    flash.current.a *= decay;
    flash.current.b *= decay;
    if (accentA.current) accentA.current.intensity = 1.5 + flash.current.a * 30;
    if (accentB.current) accentB.current.intensity = 1.5 + flash.current.b * 30;
    // Motes: slow swirl + bob, color chasing the recent notes.
    if (motes.current) {
      motes.current.rotation.y = t * 0.02;
      motes.current.position.y = Math.sin(t * 0.25) * 0.06;
    }
    if (motesMat.current) {
      motesMat.current.color.lerp(moteTarget.current, 0.04);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      {/* Key: warm white from front-right, the performer's light. */}
      <directionalLight position={[3.5, 6, 3]} intensity={2.1} color="#fff4e0" />
      {/* Rim: theme-hued from back-left, separates figure from fog. */}
      <directionalLight position={[-4, 3.5, -4.5]} intensity={1.15} color={themeCss} />
      {/* Accents: note-reactive pools at the stage's front corners. */}
      <pointLight ref={accentA} position={[-2.2, 1.6, 2.2]} distance={10} decay={2} intensity={1.5} />
      <pointLight ref={accentB} position={[2.2, 1.2, 2.4]} distance={10} decay={2} intensity={1.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.2, 72]} />
        <shaderMaterial
          ref={floorMat}
          uniforms={uniforms}
          vertexShader={FLOOR_VERT}
          fragmentShader={FLOOR_FRAG}
        />
      </mesh>
      <points ref={motes} geometry={motesGeom}>
        <pointsMaterial
          ref={motesMat}
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.65}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

// ---------------------------------------------------------------------------

export default function StageScene({
  driver,
  fx,
  figureEnabled,
  drift,
  themeHue,
}: {
  driver: DancerDriver;
  fx: StageFxState;
  figureEnabled: boolean;
  drift: boolean;
  themeHue: number;
}) {
  return (
    <>
      <color attach="background" args={[STAGE_BG]} />
      <fog attach="fog" args={[STAGE_BG, 7.5, 15]} />
      <CameraRig drift={drift} />
      <StageEnvironment fx={fx} themeHue={themeHue} />
      <DancerRig driver={driver} fx={fx} figureEnabled={figureEnabled} />
    </>
  );
}
