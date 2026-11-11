/**
 * ForgeLayer — the Forge fabric's canvas (Slice A).
 *
 * The Forge is a fabric of its own, in the realignment's terms:
 * it declares its own canvas kind ("forge67") and
 * ExperienceRenderer routes that declaration here, the way
 * Slice 64 routed See's "camera" declaration to its surfaces —
 * never by id. The fluid is NOT this fabric's ground and does
 * not mount beneath it; the canvas is a 67js WebGL2 scene —
 * plain data (an agent-scene recipe) the renderer draws — the
 * first Fabric canvas an agent can author as data.
 *
 * Slice A's layer is deliberately the smallest honest version:
 * the starter scene from forgeScene.ts (a floor and five
 * primitives in studio light), a slow camera orbit as the
 * fabric's idle life (its registry entry declares the idle
 * contract: "breathe"), correct resize, dispose on unmount,
 * and a render loop that runs only while this fabric is front
 * (the component exists only then — the renderer's branch
 * mounts it — and it pauses while the tab is hidden, the
 * discipline the camera layers set).
 *
 * Slice B: the ghost's scene tools drive this scene from
 * outside — through the seam, never into the component. On
 * mount the layer publishes a small handle (the live scene,
 * the renderer, and a camera re-sync hook) to forgeSceneStore
 * and clears it on unmount; the forge performer applies its
 * ops through that handle. The layer still owns the engine
 * outright — construction, the frame loop, disposal — and the
 * one courtesy it owes the tools is refreshCamera: a
 * forge-camera act moves the scene's AUTHORED camera, so the
 * breathe orbit re-derives its frame from scene.camera and
 * continues from where the ghost put the view.
 *
 * The engine loads through a WEB-ONLY dynamic import inside
 * the effect, never a static import: module evaluation of
 * this file then touches no 67js code at all, so the layer is
 * safe to sit in the shared renderer tree on native, where
 * Slice A does not run the Forge (it shows the labeled panel
 * below). Metro still follows the dynamic import statically —
 * the bundling proof exercises exactly this graph.
 *
 * WebGL2 is the engine's floor: where it is unavailable (an
 * old WebView, a disabled GPU path) the layer renders a
 * LABELED fallback panel in product language instead of a
 * silent blank canvas — the Trauma rule's shape (a failure
 * says so) applied to a renderer.
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { Renderer67 } from "67js";
import { buildForgeStarterScene } from "./forgeScene";
import { registerForgeScene } from "./forgeSceneStore";

/** Idle life: the camera's slow orbit, radians per second. */
const ORBIT_SPEED = 0.05;

function webgl2Available(): boolean {
  try {
    const probe = document.createElement("canvas");
    return !!probe.getContext("webgl2");
  } catch {
    return false;
  }
}

function ForgeFallback() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1020",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          style={{
            color: "#e8ecf4",
            fontSize: 17,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          The Forge needs WebGL2
        </div>
        <div style={{ color: "#9aa5b8", fontSize: 14, lineHeight: 1.5 }}>
          This fabric is a 3D canvas, and this screen doesn't have WebGL2
          available, so the canvas can't open here. A current Chrome, Edge,
          Firefox or Safari will show it — every other fabric still works as
          it always did.
        </div>
      </div>
    </div>
  );
}

export default function ForgeLayer({
  onReady,
}: {
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!webgl2Available()) {
      setFailed(true);
      return;
    }

    let renderer: Renderer67 | null = null;
    let raf = 0;
    let disposed = false;
    let fit: (() => void) | null = null;

    (async () => {
      try {
        const [{ Renderer67 }, agentScene] = await Promise.all([
          import("67js"),
          import("67js/addons/agent-scene"),
        ]);
        if (disposed) return;

        const scene = buildForgeStarterScene(agentScene.createAgentScene);
        renderer = new Renderer67(canvas, scene.parts, {
          ground: false,
          hdr: true,
          depth: true,
          samples: 4,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          world: scene.environment.world,
          environment: scene.environment,
          shadowBounds: agentScene.resolveAgentShadow(
            scene.shadow,
            scene.environment.lightDirection
          ),
        });

        fit = () => {
          if (!renderer || disposed) return;
          const w = canvas.clientWidth || window.innerWidth;
          const h = canvas.clientHeight || window.innerHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.max(1, Math.round(w * dpr));
          canvas.height = Math.max(1, Math.round(h * dpr));
          renderer.resize();
        };
        fit();
        window.addEventListener("resize", fit);

        // The breathe orbit: the authored eye's spherical position
        // around the target, advanced slowly. Radius and height
        // are the scene author's; only the angle moves. The frame
        // lives in a mutable object (Slice B) because a
        // forge-camera act can move the authored camera mid-life:
        // refreshCamera re-derives the frame from scene.camera,
        // phase-matched so the orbit continues from the new eye
        // without a jump.
        const eye0 = scene.camera.eye;
        const orbit = {
          target: [...scene.camera.target],
          radius: Math.hypot(
            eye0[0] - scene.camera.target[0],
            eye0[2] - scene.camera.target[2]
          ),
          baseAngle: Math.atan2(
            eye0[2] - scene.camera.target[2],
            eye0[0] - scene.camera.target[0]
          ),
          eyeY: eye0[1],
          started: performance.now(),
        };
        const refreshCamera = () => {
          const eye = scene.camera.eye;
          const target = scene.camera.target;
          const dx = eye[0] - target[0];
          const dz = eye[2] - target[2];
          const tNow = (performance.now() - orbit.started) / 1000;
          orbit.target = [...target];
          orbit.radius = Math.hypot(dx, dz);
          orbit.eyeY = eye[1];
          orbit.baseAngle = Math.atan2(dz, dx) - tNow * ORBIT_SPEED;
        };

        // The scene seam (Slice B): publish the live handle for
        // the ghost's scene tools; the cleanup clears it before
        // the renderer is disposed, so no act can ever land on a
        // tearing-down scene.
        registerForgeScene({ scene, renderer, refreshCamera });

        const frame = () => {
          if (disposed || !renderer) return;
          raf = requestAnimationFrame(frame);
          if (document.hidden) return;
          const t = (performance.now() - orbit.started) / 1000;
          const a = orbit.baseAngle + t * ORBIT_SPEED;
          renderer.render({
            ...scene.camera,
            eye: [
              orbit.target[0] + orbit.radius * Math.cos(a),
              orbit.eyeY,
              orbit.target[2] + orbit.radius * Math.sin(a),
            ],
            environment: scene.environment,
            effects: scene.effects,
            exposure: scene.effects.exposure,
            time: t,
          });
          if (!readyRef.current) {
            readyRef.current = true;
            onReady?.();
          }
        };
        raf = requestAnimationFrame(frame);
      } catch (err) {
        // Engine load, construction or first-frame failure (a
        // WebGL2 context the probe passed but the engine cannot
        // use, an OOM on a small device): the labeled fallback,
        // never a blank.
        // eslint-disable-next-line no-console
        console.error("[ForgeLayer] 67js renderer failed to start:", err);
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      // The seam clears FIRST: from here the scene is being torn
      // down, and the ghost's tools must find no handle.
      registerForgeScene(null);
      cancelAnimationFrame(raf);
      if (fit) window.removeEventListener("resize", fit);
      renderer?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (Platform.OS !== "web" || failed) return <ForgeFallback />;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: "#0b1020",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
      />
    </div>
  );
}
