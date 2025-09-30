import React, { useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface PianoOverlayProps {
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/**
 * PianoOverlay
 * - Loads GLB via bundler-resolved URL (require) so it’s served correctly on web
 * - Graceful no-op if the asset cannot be resolved
 */
export default function PianoOverlay({
  scale = 0.18,
  position = [0, -0.6, -0.2],
  rotation = [0, 0, 0],
}: PianoOverlayProps) {
  // Resolve asset through bundler so it’s hosted under /assets/... instead of 404/HTML
  const url = useMemo(() => {
    try {
      // NOTE: keep path relative to this file; Metro/Expo will rewrite to a served URL on web
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const resolved = require("../../../piano/public/models/MIDI to Keyframe - Piano Template - Web V5.glb") as string;
      return resolved;
    } catch {
      return null;
    }
  }, []);

  const gltf = useLoader(GLTFLoader, url ?? "", (loader) => {
    // no custom settings for now
  });

  if (!url) {
    // Asset not found by bundler — no-op overlay
    return null;
  }

  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return s;
  }, [gltf.scene]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}