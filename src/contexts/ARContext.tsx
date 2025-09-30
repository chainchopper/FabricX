import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as THREE from "three";

type AugmentationMode = "liquid" | "particles";

interface ARState {
  isARCameraActive: boolean;
  augmentationMode: AugmentationMode;
  videoTexture: THREE.VideoTexture | null;
  lastError: string | null;
}

interface ARActions {
  enableARCamera: () => Promise<void>;
  disableARCamera: () => void;
  setAugmentationMode: (m: AugmentationMode) => void;
}

type ARContextValue = ARState & ARActions;

const ARContext = createContext<ARContextValue | null>(null);

export function ARProvider({ children }: { children: React.ReactNode }) {
  const [isARCameraActive, setActive] = useState(false);
  const [augmentationMode, setAugmentationMode] = useState<AugmentationMode>("liquid");
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const enableARCamera = async () => {
    if (Platform.OS !== "web") return;
    setLastError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      if (!videoElRef.current) {
        const el = document.createElement("video");
        el.setAttribute("playsinline", "true");
        el.muted = true;
        el.style.display = "none";
        document.body.appendChild(el);
        videoElRef.current = el;
      }

      const video = videoElRef.current!;
      video.srcObject = stream;
      await video.play();

      const tex = new THREE.VideoTexture(video);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.format = THREE.RGBFormat;

      setVideoTexture(tex);
      setActive(true);
    } catch (err) {
      console.warn("AR camera enable failed:", err);
      const msg = err instanceof Error ? err.message : "Unable to access camera";
      setLastError(msg);
      setActive(false);
      setVideoTexture(null);
    }
  };

  const disableARCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoTexture?.dispose();
    setVideoTexture(null);
    setActive(false);
    // keep lastError as-is so users see what happened, until next enable attempt
  };

  const value: ARContextValue = useMemo(
    () => ({
      isARCameraActive,
      augmentationMode,
      videoTexture,
      lastError,
      enableARCamera,
      disableARCamera,
      setAugmentationMode,
    }),
    [isARCameraActive, augmentationMode, videoTexture, lastError]
  );

  return <ARContext.Provider value={value}>{children}</ARContext.Provider>;
}

export function useAR() {
  const ctx = useContext(ARContext);
  if (!ctx) throw new Error("useAR must be used within ARProvider");
  return ctx;
}