export class WebGPUContext {
  private device: any = null;
  private adapter: any = null;
  private context: any = null;
  private canvas: HTMLCanvasElement | null = null;
  private format: GPUTextureFormat | string = "bgra8unorm";

  async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
    this.canvas = canvas;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || !nav.gpu) {
      console.warn("WebGPU not supported (navigator.gpu missing)");
      return false;
    }

    try {
      this.adapter = await nav.gpu.requestAdapter();
      if (!this.adapter) {
        console.warn("WebGPU: no adapter found");
        return false;
      }

      this.device = await this.adapter.requestDevice();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preferred = (nav.gpu.getPreferredCanvasFormat
        ? nav.gpu.getPreferredCanvasFormat()
        : "bgra8unorm") as GPUTextureFormat;

      this.format = preferred;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (canvas.getContext("webgpu") as any) || null;
      if (!ctx) {
        console.warn("WebGPU: webgpu context unavailable");
        return false;
      }
      this.context = ctx;

      this.configure();
      return true;
    } catch (err) {
      console.error("WebGPU initialization error:", err);
      return false;
    }
  }

  configure() {
    if (!this.context || !this.device || !this.canvas) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = Math.max(1, Math.floor((this.canvas.clientWidth || window.innerWidth) * dpr));
    const h = Math.max(1, Math.floor((this.canvas.clientHeight || window.innerHeight) * dpr));
    this.canvas.width = w;
    this.canvas.height = h;

    this.context.configure({
      device: this.device,
      format: this.format as GPUTextureFormat,
      alphaMode: "premultiplied",
    });
  }

  getDevice(): any {
    return this.device;
  }

  getContext(): any {
    return this.context;
  }

  getFormat(): GPUTextureFormat | string {
    return this.format;
  }
}