import React, { useEffect, useRef, useState } from "react";
import { WebGPUContext } from "../../gpu/webgpu-context";

const computeWGSL = `
struct Params {
  pointer: vec2<f32>;
  radius: f32;
  time: f32;
  resolution: vec2<f32>;
  _pad: vec2<f32>;
};
@group(0) @binding(0) var dyeOut : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> params : Params;

@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let res = params.resolution;
  if (gid.x >= u32(res.x) || gid.y >= u32(res.y)) { return; }

  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / res;

  let t = params.time * 0.25;
  let g = uv.y;
  var base = vec3<f32>(0.03, 0.08, 0.15) + vec3<f32>(0.1, 0.6, 0.74) * (g * 0.22);
  base += 0.08 * vec3<f32>(
    sin(12.0 * (uv.x + uv.y) + t),
    sin(12.0 * (uv.x - uv.y) + t * 1.2),
    sin(12.0 * (uv.x * 0.5 + uv.y * 0.75) + t * 0.8)
  );

  let d = distance(uv, params.pointer);
  let r = params.radius;
  let splat = smoothstep(r, 0.0, d);
  let color = base + vec3<f32>(0.15, 0.85, 0.95) * pow(splat, 1.8);

  textureStore(dyeOut, vec2<i32>(gid.xy), vec4<f32>(color, 1.0));
}
`;

const renderWGSL = `
@group(0) @binding(0) var dyeTex : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );
  var uvmap = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0)
  );
  var o: VSOut;
  o.pos = vec4<f32>(positions[vi], 0.0, 1.0);
  o.uv = uvmap[vi];
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let c = textureSample(dyeTex, samp, i.uv).rgb;
  return vec4<f32>(c, 1.0);
}
`;

type Props = { width?: number; height?: number };

export default function WebGPUFabric({ width, height }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<WebGPUContext | null>(null);

  const deviceRef = useRef<GPUDevice | null>(null);
  const computePipelineRef = useRef<GPUComputePipeline | null>(null);
  const renderPipelineRef = useRef<GPURenderPipeline | null>(null);

  const dyeTexRef = useRef<GPUTexture | null>(null);
  const dyeViewRef = useRef<GPUTextureView | null>(null);
  const samplerRef = useRef<GPUSampler | null>(null);

  const paramsBufRef = useRef<GPUBuffer | null>(null);
  const computeBGRef = useRef<GPUBindGroup | null>(null);
  const renderBGRef = useRef<GPUBindGroup | null>(null);

  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef<[number, number]>([0.5, 0.5]);
  const radiusRef = useRef<number>(0.0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const ensureDye = (device: GPUDevice, w: number, h: number, format: GPUTextureFormat) => {
    if (dyeTexRef.current) dyeTexRef.current.destroy();
    const tex = device.createTexture({
      size: [w, h],
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    dyeTexRef.current = tex;
    dyeViewRef.current = tex.createView();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    if (width && height) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = new WebGPUContext();
    ctxRef.current = ctx;

    let mounted = true;

    (async () => {
      const ok = await ctx.initialize(canvas);
      if (!mounted) return;
      if (!ok) {
        setFailed("WebGPU unavailable");
        return;
      }

      const device = ctx.getDevice() as GPUDevice | null;
      const format = ctx.getFormat() as GPUTextureFormat;
      if (!device) {
        setFailed("No GPU device");
        return;
      }
      deviceRef.current = device;

      try {
        const cModule = device.createShaderModule({ code: computeWGSL });
        if (typeof (cModule as any).getCompilationInfo === "function") {
          const info = await (cModule as GPUShaderModule).getCompilationInfo();
          const errs = (info?.messages ?? []).filter((m: any) => m.type === "error");
          if (errs.length) console.warn("WGSL compute errors:", errs.map((m: any) => m.message).join("\n"));
        }
        computePipelineRef.current = device.createComputePipeline({
          layout: "auto",
          compute: { module: cModule, entryPoint: "main" },
        });
      } catch (e) {
        console.warn("Compute pipeline failed:", e);
        setFailed("Compute pipeline failed");
        return;
      }

      try {
        const rModule = device.createShaderModule({ code: renderWGSL });
        if (typeof (rModule as any).getCompilationInfo === "function") {
          const info = await (rModule as GPUShaderModule).getCompilationInfo();
          const errs = (info?.messages ?? []).filter((m: any) => m.type === "error");
          if (errs.length) console.warn("WGSL render errors:", errs.map((m: any) => m.message).join("\n"));
        }
        renderPipelineRef.current = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: rModule, entryPoint: "vs" },
          fragment: { module: rModule, entryPoint: "fs", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });
      } catch (e) {
        console.warn("Render pipeline failed:", e);
        setFailed("Render pipeline failed");
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
      const h = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
      ensureDye(device, w, h, "rgba8unorm" as GPUTextureFormat);

      samplerRef.current = device.createSampler({ magFilter: "linear", minFilter: "linear" });

      paramsBufRef.current = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

      computeBGRef.current = device.createBindGroup({
        layout: computePipelineRef.current!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: (dyeViewRef.current as GPUTextureView) },
          { binding: 1, resource: { buffer: paramsBufRef.current! } },
        ],
      });

      renderBGRef.current = device.createBindGroup({
        layout: renderPipelineRef.current!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: (dyeViewRef.current as GPUTextureView) },
          { binding: 1, resource: samplerRef.current! },
        ],
      });

      const ro = new ResizeObserver(() => {
        ctx.configure();
        const cw = canvas.width;
        const ch = canvas.height;
        ensureDye(device, cw, ch, "rgba8unorm" as GPUTextureFormat);
        computeBGRef.current = device.createBindGroup({
          layout: computePipelineRef.current!.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: (dyeViewRef.current as GPUTextureView) },
            { binding: 1, resource: { buffer: paramsBufRef.current! } },
          ],
        });
        renderBGRef.current = device.createBindGroup({
          layout: renderPipelineRef.current!.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: (dyeViewRef.current as GPUTextureView) },
            { binding: 1, resource: samplerRef.current! },
          ],
        });
      });
      if (hostRef.current) {
        ro.observe(hostRef.current);
      }

      const loop = () => {
        const device = deviceRef.current;
        const context = ctx.getContext();
        if (!device || !context || !computePipelineRef.current || !renderPipelineRef.current || !paramsBufRef.current || !computeBGRef.current || !renderBGRef.current) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        const cw = canvas.width;
        const ch = canvas.height;

        const time = performance.now() / 1000;
        const [px, py] = pointerRef.current;
        const r = radiusRef.current;
        const data = new Float32Array([px, py, r, time, cw, ch, 0, 0]);
        device.queue.writeBuffer(paramsBufRef.current, 0, data.buffer);

        const encoder = device.createCommandEncoder();

        {
          const pass = encoder.beginComputePass();
          pass.setPipeline(computePipelineRef.current);
          pass.setBindGroup(0, computeBGRef.current);
          pass.dispatchWorkgroups(Math.ceil(cw / 8), Math.ceil(ch / 8));
          pass.end();
        }
        {
          const view = context.getCurrentTexture().createView();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }],
          });
          pass.setPipeline(renderPipelineRef.current);
          pass.setBindGroup(0, renderBGRef.current);
          pass.draw(6, 1, 0, 0);
          pass.end();
        }

        device.queue.submit([encoder.finish()]);

        radiusRef.current = Math.max(0, r * 0.92);
        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
      setReady(true);

      const onMove = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = 1 - (e.clientY - rect.top) / rect.height;
        pointerRef.current = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
        radiusRef.current = Math.max(radiusRef.current, 0.06);
      };
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerdown", onMove);

      return () => {
        ro.disconnect();
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerdown", onMove);
      };
    })();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (host && canvasRef.current) {
        try { host.removeChild(canvasRef.current); } catch {}
      }
      dyeTexRef.current?.destroy();
      dyeTexRef.current = null;
      dyeViewRef.current = null;
      samplerRef.current = null;
      paramsBufRef.current = null;
      computePipelineRef.current = null;
      renderPipelineRef.current = null;
      ctxRef.current = null;
      canvasRef.current = null;
    };
  }, [width, height]);

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0, background: "transparent", pointerEvents: "auto" }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(2,8,23,0.7)",
          border: `1px solid ${failed ? "rgba(234,179,8,0.6)" : "rgba(34,211,238,0.6)"}`,
          padding: "6px 10px",
          borderRadius: 10,
          color: "#e5e7eb",
          fontWeight: 700,
        }}
      >
        {failed ? `WebGPU error: ${failed}` : `WebGPU ${ready ? "Active" : "Initializing..."}`}
      </div>
    </div>
  );
}