import React, { Suspense, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";

type WebFluidComp = React.ComponentType<{ roomId?: string }>;

export default function GlobalFabricBackground() {
  const [WebFluid, setWebFluid] = useState<WebFluidComp | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../../src/components/fabric/FluidFabric").then((m) =>
        setWebFluid(() => m.FluidFabric as unknown as WebFluidComp)
      );
    }
  }, []);

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute", // acts as the single background authority
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
          <WebFluid roomId="default" />
        </Suspense>
      ) : (
        <FabricCanvas fullScreen />
      )}
    </View>
  );
}