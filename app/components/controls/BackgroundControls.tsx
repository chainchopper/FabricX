/**
 * BackgroundControls — THIS LAYER › Fluid › Background.
 *
 * The color presets are the original row. Slice 62 adds the two
 * sources Terrell asked for (Nov 3): "Can I take a photo to
 * replace background of the liquid canvas with my snap or camera
 * feed or no? The front camera should be default of course."
 *
 * - Snap a photo / Pick a photo: the picture goes UNDER the fluid
 *   (FluidBackdrop renders it; the engine runs transparent over
 *   it). It is downscaled before it is stored — a backdrop does
 *   not need twelve megapixels, and the layer's settings record
 *   is a small JSON document. The photo lives in this layer's own
 *   config (backgroundPhoto), persisted per layer by
 *   LayerSettingsMirror like every setting here.
 * - Live camera: your feed as the living background. Front
 *   camera by default; the Front/Rear switch is in this same
 *   row. The feed is local-only — never recorded, never sent —
 *   and the panel says so below the switch. If the camera can't
 *   start (denied, absent), FluidBackdrop falls back to the
 *   color preset and leaves its caption in the backdrop store;
 *   this row renders that caption until the next pick.
 *
 * Everything here writes through updateConfig's common section —
 * one source of truth (backgroundSource) beside the color it
 * falls back to (backgroundColor, untouched by the new sources).
 *
 * Powered by Nirvana
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useExperience } from "../../context/ExperienceContext";
import { useHaptics } from "../../hooks/useHaptics";
import { useToast } from "../Toast";
import {
  getFluidBackdropSnapshot,
  publishFluidBackdrop,
  subscribeFluidBackdrop,
  type FluidBackdropSnapshot,
} from "../../../src/components/fluid/fluidBackdropStore";

const PRESETS = [
  { label: "Cyan Glow", value: "#0b1020" },
  { label: "Deep Space", value: "#000000" },
  { label: "Nebula", value: "#0a1f2e" },
  { label: "Transparent", value: "transparent" },
];

/** Backdrops are bounded: 1280px on the long edge is plenty. */
const MAX_PHOTO_EDGE = 1280;

/**
 * Shrink a picked photo before it is stored. A full-resolution
 * phone photo is megabytes of base64; re-encoded at backdrop
 * size it is a few hundred KB — small enough to ride the layer's
 * settings record without crowding out everything else the
 * device stores. Falls back to the original on any failure.
 */
function downscalePhoto(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const longest = Math.max(img.width, img.height);
        const scale = Math.min(1, MAX_PHOTO_EDGE / longest);
        if (scale === 1 && dataUrl.length < 700_000) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

const chipStyle = (active: boolean) => ({
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: active ? "rgba(34,211,238,0.85)" : "rgba(148,163,184,0.35)",
  backgroundColor: active ? "rgba(2,132,199,0.22)" : "transparent",
});

const chipText = (active: boolean) => ({
  color: active ? "#22d3ee" : "#e5e7eb",
  fontWeight: "700" as const,
});

export default function BackgroundControls() {
  const { state, updateConfig } = useExperience();
  const haptics = useHaptics();
  const toast = useToast();
  const snapInputRef = useRef<HTMLInputElement | null>(null);
  const pickInputRef = useRef<HTMLInputElement | null>(null);

  const common = state.experienceConfig.common;
  const bg = common.backgroundColor;
  const source = common.backgroundSource ?? "preset";
  // The front camera is the default (Terrell, Nov 3).
  const facing = common.backgroundCameraFacing ?? "user";

  // The backdrop store carries the failure caption (the surface
  // fell back already; this row explains it) until the next pick.
  const [backdrop, setBackdrop] = useState<FluidBackdropSnapshot>(() =>
    getFluidBackdropSnapshot()
  );
  useEffect(() => subscribeFluidBackdrop(setBackdrop), []);

  const setBg = (value: string) => {
    updateConfig({
      common: { ...common, backgroundColor: value, backgroundSource: "preset" },
    });
    publishFluidBackdrop({ error: null });
    haptics.impactLight();
    toast.show("Background updated");
  };

  const setSource = (next: "camera") => {
    updateConfig({ common: { ...common, backgroundSource: next } });
    publishFluidBackdrop({ error: null });
    haptics.impactLight();
  };

  const setFacing = (next: "user" | "environment") => {
    updateConfig({ common: { ...common, backgroundCameraFacing: next } });
    haptics.impactLight();
  };

  const readPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : null;
      if (!raw) return;
      void downscalePhoto(raw).then((dataUrl) => {
        updateConfig({
          common: { ...common, backgroundSource: "photo", backgroundPhoto: dataUrl },
        });
        publishFluidBackdrop({ error: null });
        haptics.impactLight();
        toast.show("Your photo is behind the fluid");
      });
    };
    reader.readAsDataURL(file);
  };

  const onPhotoFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) readPhoto(file);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#e5e7eb", fontWeight: "700" }}>Background</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PRESETS.map((p) => {
          const active = source === "preset" && bg === p.value;
          return (
            <Pressable
              key={p.value}
              onPress={() => setBg(p.value)}
              style={chipStyle(active)}
            >
              <Text style={chipText(active)}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {Platform.OS === "web" ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              onPress={() => snapInputRef.current?.click()}
              style={chipStyle(source === "photo")}
            >
              <Text style={chipText(source === "photo")}>Snap a photo</Text>
            </Pressable>
            <Pressable
              onPress={() => pickInputRef.current?.click()}
              style={chipStyle(source === "photo")}
            >
              <Text style={chipText(source === "photo")}>Pick a photo</Text>
            </Pressable>
            <Pressable
              onPress={() => setSource("camera")}
              style={chipStyle(source === "camera")}
            >
              <Text style={chipText(source === "camera")}>Live camera</Text>
            </Pressable>
          </View>

          {/* The snap input asks the OS camera for the FRONT
              camera (capture="user"); the pick input opens the
              photo library with no capture hint. */}
          <input
            ref={snapInputRef as any}
            type="file"
            accept="image/*"
            capture="user"
            style={{ display: "none" }}
            onChange={onPhotoFile as any}
          />
          <input
            ref={pickInputRef as any}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={onPhotoFile as any}
          />
        </>
      ) : null}

      {source === "camera" ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              onPress={() => setFacing("user")}
              style={chipStyle(facing === "user")}
            >
              <Text style={chipText(facing === "user")}>Front camera</Text>
            </Pressable>
            <Pressable
              onPress={() => setFacing("environment")}
              style={chipStyle(facing === "environment")}
            >
              <Text style={chipText(facing === "environment")}>Rear camera</Text>
            </Pressable>
          </View>
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            Your camera stays on this device — it is never recorded and never
            sent anywhere. The fluid just swims over it.
          </Text>
        </View>
      ) : null}

      {source === "photo" ? (
        <Text style={{ color: "#9ca3af", fontSize: 12 }}>
          Your photo stays on this device, behind the fluid.
        </Text>
      ) : null}

      {backdrop.error ? (
        <Text style={{ color: "#f0b429", fontSize: 12 }}>{backdrop.error}</Text>
      ) : null}
    </View>
  );
}
