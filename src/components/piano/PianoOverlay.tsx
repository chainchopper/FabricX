import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Asset } from "expo-asset";

interface PianoOverlayProps {
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

/**
 * PianoOverlay
 * - Resolve GLB via expo-asset so Metro serves a proper URL
 * - Load with GLTFLoader in an effect (no conditional hooks)
 * - Render null until the scene is ready
 */
export default function PianoOverlay({
  scale = 0.18,
  position = [0, -0.6, -0.2],
  rotation = [0, 0, 0],
}: PianoOverlayProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);

  // Resolve bundler asset → URL
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const moduleId = require("../../../app/assets/models/piano_v5.glb");
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

  // Load GLB once URL is available
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const s = gltf.scene.clone(true);
        s.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if ((mesh as any).isMesh) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
          }
        });
        setScene(s);
      },
      undefined,
      () => {
        if (!cancelled) setScene(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!scene) return null;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}