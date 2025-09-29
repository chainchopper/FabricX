import React, { Suspense, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { usePathname } from "expo-router";
import FabricCanvas from "./FabricCanvas";

type Web3DComp = React.ComponentType;

export default function GlobalFabricBackground() {
  const pathname = usePathname();
  const hideOnFabricRoutes = /^\/fabric(\/|$)/.test(pathname || "");
  const [Web3D, setWeb3D] = useState<Web3DComp | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      import("../../src/components/FabricWeb3D").then((m) => setWeb3D(() => m.default));
    }
  }, []);

  if (hideOnFabricRoutes) return null;

  return (
    <View
      pointerEvents="auto"
      style={{
        position: "absolute",
        inset: 0 as unknown as number,
        backgroundColor: "#0b1020",
        zIndex: 0,
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