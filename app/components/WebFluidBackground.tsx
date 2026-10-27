import React, { Suspense, useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";

type WebFluidComp = React.ComponentType<{ onReady?: () => void }>;

// Hotfix 1.3: sessionStorage flag guarding the one-shot reload below, so
// a persistently failing chunk can never reload-loop the page.
const CHUNK_RELOAD_KEY = "fabric_fluid_chunk_reload_v1";

export default function WebFluidBackground({ onReady }: { onReady?: () => void } = {}) {
  const [WebFluid, setWebFluid] = useState<WebFluidComp | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    import("../../src/components/fluid/LegacyFluid")
      .then((m) => {
        if (cancelled) return;
        // Chunk loaded — clear the reload guard so a *later* deploy
        // skew in this same session can self-heal once more.
        try {
          window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch {
          /* storage unavailable — non-fatal */
        }
        setWebFluid(() => m.default as unknown as WebFluidComp);
      })
      .catch((err) => {
        // Hotfix 1.3: this import had no .catch — a rejected chunk
        // (classically: a new deploy while a client holds a stale
        // index) left an empty View forever: shell loads, no canvas,
        // no error. Self-heal once per session with a reload (which
        // fetches the fresh index); if it still fails, say so visibly.
        console.error("[WebFluidBackground] Failed to load the fluid canvas chunk:", err);
        if (cancelled) return;
        let alreadyReloaded = false;
        try {
          alreadyReloaded = !!window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
          if (!alreadyReloaded) {
            window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          }
        } catch {
          /* storage unavailable — skip the reload, show the error state */
          alreadyReloaded = true;
        }
        if (!alreadyReloaded) {
          window.location.reload();
          return;
        }
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
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
          <WebFluid onReady={onReady} />
        </Suspense>
      ) : loadError ? (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ color: "#93c5fd", fontSize: 12, textAlign: "center" }}>
            Fabric canvas failed to load. Check your connection, then reload the page.
          </Text>
        </View>
      ) : null}
    </View>
  );
}