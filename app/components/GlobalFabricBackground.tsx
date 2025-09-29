import React, { Suspense, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import FabricCanvas from "./FabricCanvas";

type Web3DComp = React.ComponentType;

export default function GlobalFabricBackground() {
  const [Web3D, setWeb3D] = useState<Web3DComp | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../../src/components/FabricWeb3D").then((m) => setWeb3D(() => m.default));
    }
  }, []);

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute", // RN absolute == fixed at root container here
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
        backgroundColor: "transparent",
      }}
    >
      {Platform.OS === "web" && Web3D ? (
        <Suspense fallback={null}>
          <Web3D />
        </Suspense>
      ) : (
        <FabricCanvas fullScreen />
      )}
    </View>
  );
}