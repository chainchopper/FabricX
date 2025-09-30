import React, { Suspense, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";

type WebFluidComp = React.ComponentType;

export default function GlobalFabricBackground() {
  const [WebFluid, setWebFluid] = useState<WebFluidComp | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../../src/components/fluid/LegacyFluid").then((m) =>
        setWebFluid(() => m.default as unknown as WebFluidComp)
      );
    }
  }, []);

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute", // single background authority
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        backgroundColor: "transparent",
      }}
    >
      {Platform.OS === "web" && WebFluid ? (
        <Suspense fallback={null}>
          <WebFluid />
        </Suspense>
      ) : (
        <FabricCanvas fullScreen />
      )}
    </View>
  );
}