import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";
import FabricWeb3D from "../FabricWeb3D";

export default function ExperienceRenderer() {
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { enableARCamera, disableARCamera, isARCameraActive } = useAR();

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

  // On native, we do not render web canvas here; native canvas is handled by GlobalFabricBackground
  if (Platform.OS !== "web") return null;

  const wantsAROrCamera =
    !!activeExperience?.capabilities.ar || !!activeExperience?.capabilities.camera;
  const isDefaultFluid = (activeExperience?.id ?? "default-fluid") === "default-fluid";

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
        // Camera-capable or AR experiences render via R3F scene which can composite camera feed
        <FabricWeb3D />
      ) : isDefaultFluid ? (
        // Default liquid fabric uses the LegacyFluid engine
        <WebFluidBackground />
      ) : null}
    </View>
  );
}