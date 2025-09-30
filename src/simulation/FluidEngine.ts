import { FluidConfig, FluidInteraction } from "../types/fluid";

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export class FluidEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private config: FluidConfig;
  private initialized = false;

  private lastHue = 0;
  private splatFlash = 0;

  constructor(canvas: HTMLCanvasElement, config: FluidConfig) {
    this.canvas = canvas;
    this.config = config;
    this.gl = this.initGL(canvas);
    this.init();
  }

  private initGL(el: HTMLCanvasElement) {
    const params: WebGLContextAttributes = {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      premultipliedAlpha: true,
      desynchronized: true,
    };
    const gl2 = el.getContext("webgl2", params as WebGLContextAttributes);
    if (gl2) return gl2;
    const gl = (el.getContext("webgl", params) ||
      el.getContext("experimental-webgl", params)) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL not supported");
    return gl;
  }

  private init() {
    this.resize();
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0.04, 0.07, 0.13, 1);
    this.initialized = true;
  }

  resize() {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = Math.floor((this.canvas.clientWidth || window.innerWidth) * dpr);
    const height = Math.floor((this.canvas.clientHeight || window.innerHeight) * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      // Recreate buffers here when full pipeline is ported
    }
  }

  updateCustomization(customization: Partial<FluidConfig>) {
    this.config = { ...this.config, ...customization };
  }

  private hueFromUser(userId: string) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash << 5) - hash + userId.charCodeAt(i);
    return ((hash % 360) + 360) % 360;
  }

  applySplatFromUser(userId: string, interaction: Omit<FluidInteraction, "userId" | "timestamp">) {
    this.lastHue = this.hueFromUser(userId);
    this.splatFlash = clamp01(interaction.pressure);
    // Hook for full splat logic (velocity/dye) when ported
  }

  step(dt: number) {
    if (!this.initialized || this.config.PAUSED) return;
    const gl = this.gl;

    const t = (performance.now() % 2000) / 2000;
    const base = 0.08 + Math.sin(t * Math.PI * 2) * 0.02;

    const h = this.lastHue / 60;
    const c = 0.15 + this.splatFlash * 0.6;
    const x = c * (1 - Math.abs((h % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 1) { r = c; g = x; b = 0; }
    else if (h < 2) { r = x; g = c; b = 0; }
    else if (h < 3) { r = 0; g = c; b = x; }
    else if (h < 4) { r = 0; g = x; b = c; }
    else if (h < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    this.splatFlash = Math.max(0, this.splatFlash - dt * 2);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(base + r, 0.08 + g, 0.2 + b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  cleanup() {
    // Dispose resources when full engine is integrated
  }
}