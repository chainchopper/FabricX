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
 * discipline the camera layers set). The ghost's scene tools
 * arrive in Slice B, driving the same recipe through the
 * agent-scene revision contract; nothing in this file is a
 * mock of them — there is simply no tool surface yet.
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
        // are the scene author's; only the angle moves.
        const eye0 = scene.camera.eye;
        const target = scene.camera.target;
        const dx = eye0[0] - target[0];
        const dz = eye0[2] - target[2];
        const radius = Math.hypot(dx, dz);
        const baseAngle = Math.atan2(dz, dx);
        const eyeY = eye0[1];
        const started = performance.now();

        const frame = () => {
          if (disposed || !renderer) return;
          raf = requestAnimationFrame(frame);
          if (document.hidden) return;
          const t = (performance.now() - started) / 1000;
          const a = baseAngle + t * ORBIT_SPEED;
          renderer.render({
            ...scene.camera,
            eye: [
              target[0] + radius * Math.cos(a),
              eyeY,
              target[2] + radius * Math.sin(a),
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
