import React, { Suspense, lazy, useEffect } from "react";
import { Platform, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";

const FabricWeb3DLazy = lazy(() => import("../FabricWeb3D"));

export default function ExperienceRenderer() {
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { enableARCamera, disableARCamera, isARCameraActive } = useAR();

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