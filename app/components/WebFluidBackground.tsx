import React, { Suspense, useEffect, useState } from "react";
import { Platform, View } from "react-native";

type WebFluidComp = React.ComponentType;

export default function WebFluidBackground() {
  const [WebFluid, setWebFluid] = useState<WebFluidComp | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../../src/components/fluid/LegacyFluid").then((m) =>
        setWebFluid(() => m.default as unknown as WebFluidComp)
      );
    }
  }, []);

  if (Platform.OS !== "web") return null;

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 0,
        backgroundColor: "transparent",
      }}
    >
      {WebFluid ? (
        <Suspense fallback={null}>
          <WebFluid />
        </Suspense>
      ) : null}
    </View>
  );
}