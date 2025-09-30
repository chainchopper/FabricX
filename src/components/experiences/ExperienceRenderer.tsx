import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { useAR } from "../../contexts/ARContext";
import WebFluidBackground from "../../../app/components/WebFluidBackground";

export default function ExperienceRenderer() {
  const { state } = useExperience();
  const { activeExperience, experienceConfig } = state;
  const { enableARCamera, disableARCamera, isARCameraActive } = useAR();

  // Keep AR camera state in sync with active experience
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const wantsAR = !!activeExperience?.capabilities.ar;
    if (wantsAR && !isARCameraActive) {
      void enableARCamera();
    }
    if (!wantsAR && isARCameraActive) {
      disableARCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExperience?.capabilities.ar, isARCameraActive]);

  // On native, we do not render web fluid; native canvas is handled by GlobalFabricBackground
  if (Platform.OS !== "web") return null;

  // Select background by experience; default-fluid uses LegacyFluid via WebFluidBackground
  const experienceId = activeExperience?.id ?? "default-fluid";

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
      {experienceId === "default-fluid" ? (
        <WebFluidBackground />
      ) : null}
      {/* Future: add additional backgrounds for other experience types */}
    </View>
  );
}