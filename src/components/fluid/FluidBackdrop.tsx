/**
 * FluidBackdrop — Slice 62: the liquid canvas wears your world.
 *
 * Terrell (Nov 3): "Can I take a photo to replace background of
 * the liquid canvas with my snap or camera feed or no? The front
 * camera should be default of course."
 *
 * COMPOSITING (the See layer's proven route, Hotfix 2.4): this
 * surface renders UNDER the fluid canvas (zIndex -1 inside
 * ExperienceRenderer's stacking context) and the engine runs its
 * transparent-backdrop mode while a picture is live beneath it —
 * so the photo/feed is the backdrop and the fluid stays the
 * foreground presence, drawn OVER your world. Nothing about the
 * renderer had to change: the dye already composites over what's
 * beneath the canvas; this component is what's beneath.
 *
 * SOURCES (THIS LAYER › Fluid › Background, per-layer persisted
 * in the layer's own config by LayerSettingsMirror):
 * - "photo": your snap/pick, stored in the config as a data URL
 *   (downscaled at pick time in BackgroundControls).
 * - "camera": your live feed. FRONT camera by default
 *   (backgroundCameraFacing absent = "user"); the rear camera is
 *   one switch in the same Background row.
 *
 * PRIVACY: the feed is local-only — it renders into this <video>
 * element and nowhere else. It is never recorded, never captured
 * to a frame, never sent. The panel copy says so in plain words.
 *
 * GRANTS + FALLBACK (Slice 50's memory): a started feed remembers
 * its grant; a denied one remembers the denial. ANY failure to
 * start — denied, no camera, no API — falls back to the previous
 * color preset (the config's backgroundSource returns to "preset";
 * the color itself never moved) and leaves its caption in the
 * backdrop store for the Background row to show. The canvas is
 * never left transparent over nothing: the engine only goes
 * transparent while this store says a picture is live.
 *
 * LIFECYCLE: the stream/img exist only while the fluid layer is
 * front AND its background source asks for them. Leaving the
 * layer, switching the source, flipping the camera, hiding the
 * tab (pause), or unmounting stops every track and removes the
 * element — no orphan stream, ever (the check pins the teardown).
 *
 * Pointer events: the surface and its elements are "none" — a
 * background must never swallow a touch meant for the fluid.
 *
 * Powered by Nirvana
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { useExperience } from "../../contexts/ExperienceContext";
import { rememberHardwareGrant } from "../../sensors/hardwareGrants";
import {
  backdropErrorCaption,
  PHOTO_LOST_CAPTION,
  publishFluidBackdrop,
} from "./fluidBackdropStore";
import type { ExperienceConfig } from "../../types/experience";

type Facing = "user" | "environment";

export default function FluidBackdrop() {
  const { state, updateConfig } = useExperience();
  const isFluid = state.activeExperience?.id === "default-fluid";
  const common = state.experienceConfig?.common;
  const source: "preset" | "photo" | "camera" =
    common?.backgroundSource ?? "preset";
  const photo =
    typeof common?.backgroundPhoto === "string" && common.backgroundPhoto
      ? common.backgroundPhoto
      : null;
  // The front camera is the default (Terrell, Nov 3) — an absent
  // setting means "user", here and in the Background row alike.
  const facing: Facing = common?.backgroundCameraFacing ?? "user";
  const active =
    Platform.OS === "web" && isFluid && (source === "photo" || source === "camera");

  const hostRef = useRef<View | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Session token: every (re)start and every teardown increments
  // it, so a getUserMedia promise resolving after its session was
  // torn down drops its stream instead of resurrecting a camera
  // nobody asked for anymore.
  const sessionRef = useRef(0);
  // The latest config, for the fallback write — reverting must
  // spread the CURRENT common (a setting changed mid-start must
  // not be clobbered by a stale closure).
  const configRef = useRef<ExperienceConfig>(state.experienceConfig);
  configRef.current = state.experienceConfig;
  const updateRef = useRef(updateConfig);
  updateRef.current = updateConfig;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const teardown = useCallback(() => {
    sessionRef.current += 1;
    stopStream();
    if (videoRef.current) {
      videoRef.current.remove();
      videoRef.current = null;
    }
    if (imgRef.current) {
      imgRef.current.remove();
      imgRef.current = null;
    }
    publishFluidBackdrop({ live: false, kind: null });
  }, [stopStream]);

  /** Fall back to the color preset + leave the caption behind. */
  const fallBack = useCallback(
    (caption: string) => {
      teardown();
      publishFluidBackdrop({ status: "error", error: caption });
      const cfg = configRef.current;
      updateRef.current({
        common: { ...cfg.common, backgroundSource: "preset" },
      });
    },
    [teardown]
  );

  const startCamera = useCallback(
    async (facingMode: Facing) => {
      const session = ++sessionRef.current;
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        fallBack(backdropErrorCaption(null));
        return;
      }
      publishFluidBackdrop({ status: "starting", error: null, kind: "camera" });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode },
          audio: false,
        });
        if (session !== sessionRef.current) {
          // Torn down (or restarted) while the browser decided:
          // this stream belongs to nobody — stop it on the spot.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const host = hostRef.current as unknown as HTMLElement | null;
        if (!host) {
          stopStream();
          return;
        }
        if (!videoRef.current) {
          const el = document.createElement("video");
          el.setAttribute("playsinline", "true");
          el.muted = true;
          el.style.position = "absolute";
          el.style.inset = "0";
          el.style.width = "100%";
          el.style.height = "100%";
          // Cover, as the See layer's camera (Hotfix 2.4): the
          // picture fills the canvas, overflow cropped.
          el.style.objectFit = "cover";
          // A background: never a touch target, never chrome.
          el.style.pointerEvents = "none";
          host.appendChild(el);
          videoRef.current = el;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (session !== sessionRef.current) return;
        publishFluidBackdrop({ live: true, status: "live", error: null });
        // Slice 50: the grant stands in the app's memory now.
        rememberHardwareGrant("camera", "granted");
      } catch (err) {
        if (session !== sessionRef.current) return;
        if (err instanceof Error && err.name === "NotAllowedError") {
          rememberHardwareGrant("camera", "denied");
        }
        fallBack(
          backdropErrorCaption(err instanceof Error ? err.name : null)
        );
      }
    },
    [fallBack, stopStream]
  );

  // The one lifecycle effect: it owns setup AND teardown for
  // every transition — layer entered/left, source flipped,
  // camera flipped, photo swapped. Cleanup always tears down, so
  // no path out of this component leaves a stream or an element
  // behind.
  useEffect(() => {
    if (!active) {
      publishFluidBackdrop({ live: false, kind: null, status: "idle" });
      return undefined;
    }
    if (source === "camera") {
      void startCamera(facing);
      const onVis = () => {
        if (document.hidden) {
          // A hidden tab's feed pauses (the See/Hands discipline):
          // tracks stop, liveness drops, the canvas goes opaque.
          sessionRef.current += 1;
          stopStream();
          publishFluidBackdrop({ live: false });
        } else if (!streamRef.current) {
          // Visible again and this effect is still the camera's
          // owner (its cleanup removes this listener when it
          // isn't): restart the paused feed.
          void startCamera(facing);
        }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        document.removeEventListener("visibilitychange", onVis);
        teardown();
      };
    }
    // source === "photo"
    if (!photo) {
      fallBack(PHOTO_LOST_CAPTION);
      return undefined;
    }
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return undefined;
    const el = document.createElement("img");
    el.src = photo;
    el.alt = "";
    el.draggable = false;
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.objectFit = "cover";
    el.style.pointerEvents = "none";
    el.onload = () => {
      publishFluidBackdrop({
        live: true,
        kind: "photo",
        status: "live",
        error: null,
      });
    };
    el.onerror = () => {
      fallBack(PHOTO_LOST_CAPTION);
    };
    host.appendChild(el);
    imgRef.current = el;
    publishFluidBackdrop({ status: "starting", error: null, kind: "photo" });
    return () => {
      teardown();
    };
  }, [active, source, photo, facing, startCamera, stopStream, teardown, fallBack]);

  if (!active) return null;

  return (
    <View
      ref={hostRef}
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Below the fluid canvas (zIndex 0) inside the renderer's
        // stacking context: the picture is the background, the
        // fluid draws over it. Transparent itself — the renderer's
        // own root paints the preset color beneath everything,
        // which is what shows until the first frame lands.
        zIndex: -1,
        backgroundColor: "transparent",
      }}
    />
  );
}
