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
 * - Minimal GLB loader (no extra deps)
 * - Renders a simple piano model above the Fabric surface
 * - Intended for AR Piano experience visual context
 */
export default function PianoOverlay({
  scale = 0.18,
  position = [0, -0.6, -0.2],
  rotation = [0, 0, 0],
}: PianoOverlayProps) {
  // Serve directly from /piano/public/models/... (already present in repo)
  const url = useMemo(
    () =>
      encodeURI(
        "/piano/public/models/MIDI to Keyframe - Piano Template - Web V5.glb"
      ),
    []
  );

  const gltf = useLoader(GLTFLoader, url);

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