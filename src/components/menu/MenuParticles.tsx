/**
 * MenuParticles - Video game style particle effects for menu interactions
 * Powered by Nirvana
 */
import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ParticleEmitterProps {
  position: [number, number, number];
  count: number;
  color: string;
  emitting: boolean;
}

function ParticleEmitter({ position, count, color, emitting }: ParticleEmitterProps) {
  const particlesRef = useRef<THREE.Points>(null);
  const velocities = useRef<Float32Array>(new Float32Array(count * 3));
  const lifetimes = useRef<Float32Array>(new Float32Array(count));
  const maxLifetime = 1.5;

  const [positions, colors] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const col = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      // Initial position at emitter
      positions[i * 3] = position[0];
      positions[i * 3 + 1] = position[1];
      positions[i * 3 + 2] = position[2];

      // Random velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 1 + Math.random() * 2;
      velocities.current[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities.current[i * 3 + 1] = Math.cos(phi) * speed;
      velocities.current[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;

      // Lifetime
      lifetimes.current[i] = Math.random() * maxLifetime;

      // Color with variation
      colors[i * 3] = col.r + (Math.random() - 0.5) * 0.2;
      colors[i * 3 + 1] = col.g + (Math.random() - 0.5) * 0.2;
      colors[i * 3 + 2] = col.b + (Math.random() - 0.5) * 0.2;
    }

    return [positions, colors];
  }, [count, color, position]);

  useFrame((state, delta) => {
    if (!particlesRef.current || !emitting) return;

    const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      // Update lifetime
      lifetimes.current[i] -= delta;

      if (lifetimes.current[i] <= 0) {
        // Reset particle
        lifetimes.current[i] = maxLifetime;
        pos[i * 3] = position[0];
        pos[i * 3 + 1] = position[1];
        pos[i * 3 + 2] = position[2];

        // New random velocity
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = 1 + Math.random() * 2;
        velocities.current[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        velocities.current[i * 3 + 1] = Math.cos(phi) * speed;
        velocities.current[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
      } else {
        // Update position based on velocity
        pos[i * 3] += velocities.current[i * 3] * delta;
        pos[i * 3 + 1] += velocities.current[i * 3 + 1] * delta;
        pos[i * 3 + 2] += velocities.current[i * 3 + 2] * delta;

        // Apply gravity
        velocities.current[i * 3 + 1] -= 2 * delta;
      }
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface MenuParticlesProps {
  emitters: Array<{
    id: string;
    position: [number, number, number];
    color: string;
    active: boolean;
  }>;
}

export default function MenuParticles({ emitters }: MenuParticlesProps) {
  return (
    <Canvas
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 1000,
      }}
      camera={{ position: [0, 0, 10], fov: 50 }}
    >
      <ambientLight intensity={0.5} />
      {emitters.map((emitter) => (
        <ParticleEmitter
          key={emitter.id}
          position={emitter.position}
          count={50}
          color={emitter.color}
          emitting={emitter.active}
        />
      ))}
    </Canvas>
  );
}
