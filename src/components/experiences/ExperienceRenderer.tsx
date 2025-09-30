import React, { Suspense, lazy, useEffect } from "react";
import { Platform, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";

const FabricWeb3DLazy = lazy(() => import("../FabricWeb3D"));

declare global {
  interface Window {
    __fabric_bg_ready?: boolean;
  }
}

export default function ExperienceRenderer() {
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { enableARCamera, disableARCamera, isARCameraActive } = useAR();

  // Mark background ready on mount/unmount
  useEffect(() => {
    if (Platform.OS === "web") {
      window.__fabric_bg_ready = true;
      window.dispatchEvent(new CustomEvent("fabric:background-ready", { detail: true }));
      return () => {
        window.__fabric_bg_ready = false;
        window.dispatchEvent(new CustomEvent("fabric:background-ready", { detail: false }));
      };
    }
    return;
  }, []);

  // Keep AR camera state in sync with active experience
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const wantsAR = !!activeExperience?.capabilities.ar || !!activeExperience?.capabilities.camera;
    if (wantsAR && !isARCameraActive) {
      void enableARCamera();
    }
    if (!wantsAR && isARCameraActive) {
      disableARCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExperience?.capabilities.ar, activeExperience?.capabilities.camera, isARCameraActive]);

  if (Platform.OS !== "web") return null;

  const wantsAROrCamera =
    !!activeExperience?.capabilities.ar || !!activeExperience?.capabilities.camera;

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0,
        backgroundColor: (experienceConfig?.common?.backgroundColor as string) || "transparent",
      }}
    >
      {wantsAROrCamera ? (
        <Suspense fallback={null}>
          <FabricWeb3DLazy />
        </Suspense>
      ) : (
        <WebFluidBackground />
      )}
    </View>
  );
}