import React, { useEffect, useRef } from "react";

function isMobile() {
  return typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);
}

function clamp01(input: number) {
  return Math.min(Math.max(input, 0), 1);
}

function HSVtoRGB(h: number, s: number, v: number) {
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r, g, b };
}

type GL = WebGLRenderingContext & { HALF_FLOAT_OES?: number } | WebGL2RenderingContext;

export default function LegacyFluid() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const config = {
      SIM_RESOLUTION: 128,
      DYE_RESOLUTION: 1024,
      CAPTURE_RESOLUTION: 512,
      DENSITY_DISSIPATION: 1,
      VELOCITY_DISSIPATION: 0.2,
      PRESSURE: 0.8,
      PRESSURE_ITERATIONS: 20,
      CURL: 30,
      SPLAT_RADIUS: 0.25,
      SPLAT_FORCE: 6000,
      SHADING: true,
      COLORFUL: true,
      COLOR_UPDATE_SPEED: 10,
      PAUSED: false,
      BACK_COLOR: { r: 0, g: 0, b: 0 },
      TRANSPARENT: false,
      BLOOM: true,
      BLOOM_ITERATIONS: 8,
      BLOOM_RESOLUTION: 256,
      BLOOM_INTENSITY: 0.8,
      BLOOM_THRESHOLD: 0.6,
      BLOOM_SOFT_KNEE: 0.7,
      SUNRAYS: true,
      SUNRAYS_RESOLUTION: 196,
      SUNRAYS_WEIGHT: 1.0,
    };

    function getWebGLContext(target: HTMLCanvasElement) {
      const params: WebGLContextAttributes = {
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
        premultipliedAlpha: true,
        desynchronized: true,
      };
      let gl = target.getContext("webgl2", params) as GL | null;
      const isWebGL2 = !!gl;
      if (!isWebGL2) {
        gl = (target.getContext("webgl", params) ||
          target.getContext("experimental-webgl", params)) as GL | null;
      }
      if (!gl) throw new Error("WebGL not supported");

      let halfFloat: any;
      let supportLinearFiltering: boolean;
      if (isWebGL2) {
        (gl as WebGL2RenderingContext).getExtension("EXT_color_buffer_float");
        supportLinearFiltering = !!(gl as WebGL2RenderingContext).getExtension("OES_texture_float_linear");
      } else {
        halfFloat = (gl as any).getExtension("OES_texture_half_float");
        supportLinearFiltering = !!(gl as any).getExtension("OES_texture_half_float_linear");
      }

      (gl as WebGLRenderingContext).clearColor(0.0, 0.0, 0.0, 1.0);

      const halfFloatTexType = (gl as WebGL2RenderingContext).HALF_FLOAT ?? (halfFloat?.HALF_FLOAT_OES ?? 0);

      function supportRenderTextureFormat(
        glx: GL,
        internalFormat: number,
        format: number,
        type: number
      ) {
        const texture = (glx as WebGLRenderingContext).createTexture()!;
        (glx as WebGLRenderingContext).bindTexture((glx as WebGLRenderingContext).TEXTURE_2D, texture);
        (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_MIN_FILTER, (glx as WebGLRenderingContext).NEAREST);
        (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_MAG_FILTER, (glx as WebGLRenderingContext).NEAREST);
        (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_WRAP_S, (glx as WebGLRenderingContext).CLAMP_TO_EDGE);
        (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_WRAP_T, (glx as WebGLRenderingContext).CLAMP_TO_EDGE);
        (glx as WebGLRenderingContext).texImage2D((glx as WebGLRenderingContext).TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

        const fbo = (glx as WebGLRenderingContext).createFramebuffer()!;
        (glx as WebGLRenderingContext).bindFramebuffer((glx as WebGLRenderingContext).FRAMEBUFFER, fbo);
        (glx as WebGLRenderingContext).framebufferTexture2D((glx as WebGLRenderingContext).FRAMEBUFFER, (glx as WebGLRenderingContext).COLOR_ATTACHMENT0, (glx as WebGLRenderingContext).TEXTURE_2D, texture, 0);

        const status = (glx as WebGLRenderingContext).checkFramebufferStatus((glx as WebGLRenderingContext).FRAMEBUFFER);
        (glx as WebGLRenderingContext).deleteFramebuffer(fbo);
        (glx as WebGLRenderingContext).deleteTexture(texture);
        return status === (glx as WebGLRenderingContext).FRAMEBUFFER_COMPLETE;
      }

      function getSupportedFormat(
        glx: GL,
        internalFormat: number,
        format: number,
        type: number
      ) {
        if (!supportRenderTextureFormat(glx, internalFormat, format, type)) {
          switch (internalFormat) {
            case (glx as WebGL2RenderingContext).R16F:
              return getSupportedFormat(glx, (glx as WebGL2RenderingContext).RG16F, (glx as WebGL2RenderingContext).RG, type);
            case (glx as WebGL2RenderingContext).RG16F:
              return getSupportedFormat(glx, (glx as WebGL2RenderingContext).RGBA16F, (glx as WebGL2RenderingContext).RGBA, type);
            default:
              return null;
          }
        }
        return { internalFormat, format };
      }

      const is2 = isWebGL2;
      let formatRGBA: any, formatRG: any, formatR: any;
      if (is2) {
        const gl2 = gl as WebGL2RenderingContext;
        formatRGBA = getSupportedFormat(gl2 as GL, gl2.RGBA16F, gl2.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl2 as GL, gl2.RG16F, gl2.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl2 as GL, gl2.R16F, gl2.RED, halfFloatTexType);
      } else {
        const gl1 = gl as WebGLRenderingContext;
        formatRGBA = getSupportedFormat(gl1 as GL, gl1.RGBA, gl1.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl1 as GL, gl1.RGBA, gl1.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl1 as GL, gl1.RGBA, gl1.RGBA, halfFloatTexType);
      }

      if (isMobile()) {
        config.DYE_RESOLUTION = 512;
      }
      if (!supportLinearFiltering) {
        config.DYE_RESOLUTION = 512;
        config.SHADING = false;
        config.BLOOM = false;
        config.SUNRAYS = false;
      }

      return {
        gl: gl as GL,
        isWebGL2: is2,
        ext: {
          formatRGBA,
          formatRG,
          formatR,
          halfFloatTexType,
          supportLinearFiltering,
        },
      };
    }

    // ... rest of the file unchanged ...
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: "transparent",
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