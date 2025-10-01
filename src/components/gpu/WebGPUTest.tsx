import React, { useEffect, useRef, useState } from "react";
import { WebGPUContext } from "../../gpu/webgpu-context";

function hsvToRgb(h: number, s: number, v: number) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;
  const map = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ];
  return map[mod] as [number, number, number];
}

export default function WebGPUTest() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<WebGPUContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const [supported, setSupported] = useState<boolean>(true);
  const [ready, setReady] = useState<boolean>(false);

  // Create canvas and init WebGPU
  useEffect(() => {
    if (!wrapRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    wrapRef.current.appendChild(canvas);
    canvasRef.current = canvas;

    const gpuctx = new WebGPUContext();
    ctxRef.current = gpuctx;

    let mounted = true;
    (async () => {
      const ok = await gpuctx.initialize(canvas);
      if (!mounted) return;
      setSupported(ok);
      setReady(ok);
      if (!ok) return;

      const resizeObs = new ResizeObserver(() => gpuctx.configure());
      resizeObs.observe(wrapRef.current!);

      const loop = () => {
        const device = gpuctx.getDevice();
        const context = gpuctx.getContext();

        // Animate hue
        const t = (performance.now() % 5000) / 5000;
        const [r, g, b] = hsvToRgb(t, 0.75, 0.9);

        const encoder = device.createCommandEncoder();
        const view = context.getCurrentTexture().createView();

        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view,
              loadOp: "clear",
              storeOp: "store",
              clearValue: [r, g, b, 1],
            },
          ],
        });
        pass.end();

        device.queue.submit([encoder.finish()]);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

      return () => {
        resizeObs.disconnect();
      };
    })();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (wrapRef.current && canvasRef.current) {
        try {
          wrapRef.current.removeChild(canvasRef.current);
        } catch {
          // ignore
        }
      }
      ctxRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "transparent",
      }}
      ref={wrapRef}
    >
      {!supported ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(2,8,23,0.7)",
            border: "1px solid rgba(234,179,8,0.6)",
            padding: "6px 10px",
            borderRadius: 10,
            color: "#fde68a",
            fontWeight: 700,
          }}
        >
          WebGPU not supported — using Fabric (WebGL) elsewhere
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(2,8,23,0.7)",
            border: "1px solid rgba(34,211,238,0.6)",
            padding: "6px 10px",
            borderRadius: 10,
            color: "#e5e7eb",
            fontWeight: 700,
          }}
        >
          WebGPU {ready ? "Active" : "Initializing..."}
        </div>
      )}
    </div>
  );
}