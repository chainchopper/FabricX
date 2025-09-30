import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Asset } from "expo-asset";

interface PianoOverlayProps {
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/**
 * PianoOverlay
 * - Loads GLB using expo-asset so Metro serves a real URL (not HTML)
 * - Renders null until the asset is ready
 */
export default function PianoOverlay({
  scale = 0.18,
  position = [0, -0.6, -0.2],
  rotation = [0, 0, 0],
}: PianoOverlayProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Resolve through bundler so the file is included in the web build
        // Keep path relative; Metro will fingerprint and serve it
        const moduleId = require("../../../piano/public/models/MIDI to Keyframe - Piano Template - Web V5.glb");
        const asset = Asset.fromModule(moduleId);
        if (!asset.downloaded) {
          await asset.downloadAsync();
        }
        if (mounted) setUrl(asset.uri || null);
      } catch {
        if (mounted) setUrl(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // If asset isn't ready, don't attempt to load
  if (!url) return null;

  const gltf = useLoader(GLTFLoader, url);

  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as any).isMesh) {
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