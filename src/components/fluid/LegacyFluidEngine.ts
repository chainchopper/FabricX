import { GL, FBO, DoubleFBO, FluidConfig } from "./engine/types";
import { compileShader, createProgram, getUniforms, bindFullScreenQuad, hashCode } from "./engine/gl-utils";
import { createFBO, createDoubleFBO, resizeFBO, resizeDoubleFBO, blit as glBlit } from "./engine/fbo";
import {
  baseVertexShaderSrc, blurVertexShaderSrc,
  blurShaderSrc, copyShaderSrc, clearShaderSrc, colorShaderSrc,
  checkerboardShaderSrc, displayShaderSource, bloomPrefilterShaderSrc,
  bloomBlurShaderSrc, bloomFinalShaderSrc, sunraysMaskShaderSrc,
  sunraysShaderSrc, splatShaderSrc, advectionShaderSrc, divergenceShaderSrc,
  curlShaderSrc, vorticityShaderSrc, pressureShaderSrc, gradientSubtractShaderSrc
} from "./engine/shaders";

function clamp01(input: number) { return Math.min(Math.max(input, 0), 1); }
function isMobile() { return typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent); }
function HSVtoRGB(h: number, s: number, v: number) {
  let r=0,g=0,b=0; const i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
  return { r, g, b };
}

class ProgramWrap {
  gl: GL;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  constructor(gl: GL, vsSrc: string, fsSrc: string, fsKeywords: string[] | null = null) {
    this.gl = gl;
    const vs = compileShader(gl, (gl as WebGLRenderingContext).VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, (gl as WebGLRenderingContext).FRAGMENT_SHADER, fsSrc, fsKeywords);
    this.program = createProgram(gl, vs, fs);
    this.uniforms = getUniforms(gl, this.program);
  }
  bind() { (this.gl as WebGLRenderingContext).useProgram(this.program); }
}

class Material {
  gl: GL;
  vertex: WebGLShader;
  fragmentSrc: string;
  programs: Record<number, WebGLProgram> = {};
  activeProgram: WebGLProgram | null = null;
  uniforms: Record<string, WebGLUniformLocation | null> = {};
  constructor(gl: GL, vertexSrc: string, fragmentSrc: string) {
    this.gl = gl;
    this.vertex = compileShader(gl, (this.gl as WebGLRenderingContext).VERTEX_SHADER, vertexSrc);
    this.fragmentSrc = fragmentSrc;
  }
  setKeywords(keywords: string[]) {
    let hash = 0; for (const k of keywords) hash += hashCode(k);
    let program = this.programs[hash];
    if (!program) {
      const fs = compileShader(this.gl, (this.gl as WebGLRenderingContext).FRAGMENT_SHADER, this.fragmentSrc, keywords);
      program = createProgram(this.gl, this.vertex, fs);
      this.programs[hash] = program;
    }
    if (program === this.activeProgram) return;
    this.uniforms = getUniforms(this.gl, program);
    this.activeProgram = program;
  }
  bind() { if (this.activeProgram) (this.gl as WebGLRenderingContext).useProgram(this.activeProgram); }
}

export class LegacyFluidEngine {
  private canvas: HTMLCanvasElement;
  private container: HTMLDivElement | null;
  private gl!: GL;
  private ext!: any;
  private isWebGL2 = false;
  private raf: number | null = null;
  private dpr = 1;

  // Config
  private config: FluidConfig = {
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

  // Programs
  private blurProgram!: ProgramWrap;
  private copyProgram!: ProgramWrap;
  private clearProgram!: ProgramWrap;
  private colorProgram!: ProgramWrap;
  private checkerboardProgram!: ProgramWrap;
  private bloomPrefilterProgram!: ProgramWrap;
  private bloomBlurProgram!: ProgramWrap;
  private bloomFinalProgram!: ProgramWrap;
  private sunraysMaskProgram!: ProgramWrap;
  private sunraysProgram!: ProgramWrap;
  private splatProgram!: ProgramWrap;
  private advectionProgram!: ProgramWrap;
  private divergenceProgram!: ProgramWrap;
  private curlProgramWrap!: ProgramWrap;
  private vorticityProgramWrap!: ProgramWrap;
  private pressureProgramWrap!: ProgramWrap;
  private gradientSubtractProgram!: ProgramWrap;
  private displayMaterial!: Material;

  // FBOs
  private dye!: DoubleFBO;
  private velocity!: DoubleFBO;
  private divergence!: FBO;
  private curl!: FBO;
  private pressure!: DoubleFBO;
  private bloom!: FBO;
  private bloomFramebuffers: FBO[] = [];
  private sunrays!: FBO;
  private sunraysTemp!: FBO;
  private ditheringTex!: { texture: WebGLTexture; width: number; height: number; attach: (id: number) => number };

  // Interaction
  private pointers: Array<{
    id: number; texcoordX: number; texcoordY: number;
    prevTexcoordX: number; prevTexcoordY: number;
    deltaX: number; deltaY: number;
    down: boolean; moved: boolean;
    color: { r: number; g: number; b: number };
  }> = [];
  private splatStack: number[] = [];
  private lastUpdateTime = Date.now();

  constructor(canvas: HTMLCanvasElement, container: HTMLDivElement | null) {
    this.canvas = canvas;
    this.container = container;
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.initGL();
    this.initPrograms();
    this.updateKeywords();
    this.initFramebuffers();
    this.pointers.push({
      id: -1, texcoordX: 0, texcoordY: 0, prevTexcoordX: 0, prevTexcoordY: 0,
      deltaX: 0, deltaY: 0, down: false, moved: false, color: { r: 0.12, g: 0.0, b: 1.0 }
    });
    this.bindEvents();
    this.onResize();
    this.raf = requestAnimationFrame(this.update);
  }

  private initGL() {
    const params: WebGLContextAttributes = {
      alpha: true, depth: false, stencil: false, antialias: false,
      preserveDrawingBuffer: false, powerPreference: "high-performance",
      premultipliedAlpha: true, desynchronized: true,
    };
    let gl = this.canvas.getContext("webgl2", params) as GL | null;
    this.isWebGL2 = !!gl;
    if (!this.isWebGL2) gl = (this.canvas.getContext("webgl", params) || this.canvas.getContext("experimental-webgl", params)) as GL | null;
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    let halfFloat: any;
    let supportLinearFiltering: boolean;
    if (this.isWebGL2) {
      (gl as WebGL2RenderingContext).getExtension("EXT_color_buffer_float");
      supportLinearFiltering = !!(gl as WebGL2RenderingContext).getExtension("OES_texture_float_linear");
    } else {
      halfFloat = (gl as any).getExtension("OES_texture_half_float");
      supportLinearFiltering = !!(gl as any).getExtension("OES_texture_half_float_linear");
    }

    (gl as WebGLRenderingContext).clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = (gl as WebGL2RenderingContext).HALF_FLOAT ?? (halfFloat?.HALF_FLOAT_OES ?? 0);

    const supportRenderTextureFormat = (glx: GL, internal: number, format: number, type: number) => {
      const texture = (glx as WebGLRenderingContext).createTexture()!;
      (glx as WebGLRenderingContext).bindTexture((glx as WebGLRenderingContext).TEXTURE_2D, texture);
      (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_MIN_FILTER, (glx as WebGLRenderingContext).NEAREST);
      (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_MAG_FILTER, (glx as WebGLRenderingContext).NEAREST);
      (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_WRAP_S, (glx as WebGLRenderingContext).CLAMP_TO_EDGE);
      (glx as WebGLRenderingContext).texParameteri((glx as WebGLRenderingContext).TEXTURE_2D, (glx as WebGLRenderingContext).TEXTURE_WRAP_T, (glx as WebGLRenderingContext).CLAMP_TO_EDGE);
      (glx as WebGLRenderingContext).texImage2D((glx as WebGLRenderingContext).TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);

      const fbo = (glx as WebGLRenderingContext).createFramebuffer()!;
      (glx as WebGLRenderingContext).bindFramebuffer((glx as WebGLRenderingContext).FRAMEBUFFER, fbo);
      (glx as WebGLRenderingContext).framebufferTexture2D((glx as WebGLRenderingContext).FRAMEBUFFER, (glx as WebGLRenderingContext).COLOR_ATTACHMENT0, (glx as WebGLRenderingContext).TEXTURE_2D, texture, 0);
      const status = (glx as WebGLRenderingContext).checkFramebufferStatus((glx as WebGLRenderingContext).FRAMEBUFFER);
      (glx as WebGLRenderingContext).deleteFramebuffer(fbo);
      (glx as WebGLRenderingContext).deleteTexture(texture);
      return status === (glx as WebGLRenderingContext).FRAMEBUFFER_COMPLETE;
    };

    const getSupportedFormat = (glx: GL, internal: number, format: number, type: number): any => {
      if (!supportRenderTextureFormat(glx, internal, format, type)) {
        switch (internal) {
          case (glx as WebGL2RenderingContext).R16F:
            return getSupportedFormat(glx, (glx as WebGL2RenderingContext).RG16F, (glx as WebGL2RenderingContext).RG, type);
          case (glx as WebGL2RenderingContext).RG16F:
            return getSupportedFormat(glx, (glx as WebGL2RenderingContext).RGBA16F, (glx as WebGL2RenderingContext).RGBA, type);
          default:
            return null;
        }
      }
      return { internalFormat: internal, format };
    };

    let formatRGBA: any, formatRG: any, formatR: any;
    if (this.isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      formatRGBA = getSupportedFormat(gl2 as unknown as GL, gl2.RGBA16F, gl2.RGBA, halfFloatTexType);
      formatRG = getSupportedFormat(gl2 as unknown as GL, gl2.RG16F, gl2.RG, halfFloatTexType);
      formatR = getSupportedFormat(gl2 as unknown as GL, gl2.R16F, gl2.RED, halfFloatTexType);
    } else {
      const gl1 = gl as WebGLRenderingContext;
      formatRGBA = getSupportedFormat(gl1 as unknown as GL, gl1.RGBA, gl1.RGBA, halfFloatTexType);
      formatRG = getSupportedFormat(gl1 as unknown as GL, gl1.RGBA, gl1.RGBA, halfFloatTexType);
      formatR = getSupportedFormat(gl1 as unknown as GL, gl1.RGBA, gl1.RGBA, halfFloatTexType);
    }

    if (isMobile()) this.config.DYE_RESOLUTION = 512;
    // Use the computed supportLinearFiltering flag (avoid redeclaration)
    if (!supportLinearFiltering) {
      this.config.DYE_RESOLUTION = 512;
      this.config.SHADING = false;
      this.config.BLOOM = false;
      this.config.SUNRAYS = false;
    }

    this.ext = { formatRGBA, formatRG, formatR, halfFloatTexType: halfFloatTexType, supportLinearFiltering };

    bindFullScreenQuad(gl);
  }

  private initPrograms() {
    const gl = this.gl;
    this.blurProgram = new ProgramWrap(gl, blurVertexShaderSrc, blurShaderSrc);
    this.copyProgram = new ProgramWrap(gl, baseVertexShaderSrc, copyShaderSrc);
    this.clearProgram = new ProgramWrap(gl, baseVertexShaderSrc, clearShaderSrc);
    this.colorProgram = new ProgramWrap(gl, baseVertexShaderSrc, colorShaderSrc);
    this.checkerboardProgram = new ProgramWrap(gl, baseVertexShaderSrc, checkerboardShaderSrc);
    this.bloomPrefilterProgram = new ProgramWrap(gl, baseVertexShaderSrc, bloomPrefilterShaderSrc);
    this.bloomBlurProgram = new ProgramWrap(gl, baseVertexShaderSrc, bloomBlurShaderSrc);
    this.bloomFinalProgram = new ProgramWrap(gl, baseVertexShaderSrc, bloomFinalShaderSrc);
    this.sunraysMaskProgram = new ProgramWrap(gl, baseVertexShaderSrc, sunraysMaskShaderSrc);
    this.sunraysProgram = new ProgramWrap(gl, baseVertexShaderSrc, sunraysShaderSrc);
    this.splatProgram = new ProgramWrap(gl, baseVertexShaderSrc, splatShaderSrc);
    this.advectionProgram = new ProgramWrap(gl, baseVertexShaderSrc, advectionShaderSrc, this.ext.supportLinearFiltering ? null : ["MANUAL_FILTERING"]);
    this.divergenceProgram = new ProgramWrap(gl, baseVertexShaderSrc, divergenceShaderSrc);
    this.curlProgramWrap = new ProgramWrap(gl, baseVertexShaderSrc, curlShaderSrc);
    this.vorticityProgramWrap = new ProgramWrap(gl, baseVertexShaderSrc, vorticityShaderSrc);
    this.pressureProgramWrap = new ProgramWrap(gl, baseVertexShaderSrc, pressureShaderSrc);
    this.gradientSubtractProgram = new ProgramWrap(gl, baseVertexShaderSrc, gradientSubtractShaderSrc);
    this.displayMaterial = new Material(gl, baseVertexShaderSrc, displayShaderSource);
  }

  private updateKeywords() {
    const keywords: string[] = [];
    if (this.config.SHADING) keywords.push("SHADING");
    if (this.config.BLOOM) keywords.push("BLOOM");
    if (this.config.SUNRAYS) keywords.push("SUNRAYS");
    this.displayMaterial.setKeywords(keywords);
  }

  private createNoiseTexture(size = 256) {
    const gl = this.gl;
    const tex = (gl as WebGLRenderingContext).createTexture()!;
    const data = new Uint8Array(size * size);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
    (gl as WebGLRenderingContext).bindTexture((gl as WebGLRenderingContext).TEXTURE_2D, tex);
    (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_MIN_FILTER, (gl as WebGLRenderingContext).LINEAR);
    (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_MAG_FILTER, (gl as WebGLRenderingContext).LINEAR);
    (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_WRAP_S, (gl as WebGLRenderingContext).REPEAT);
    (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_WRAP_T, (gl as WebGLRenderingContext).REPEAT);
    (gl as WebGLRenderingContext).texImage2D((gl as WebGLRenderingContext).TEXTURE_2D, 0, (gl as WebGLRenderingContext).LUMINANCE, size, size, 0, (gl as WebGLRenderingContext).LUMINANCE, (gl as WebGLRenderingContext).UNSIGNED_BYTE, data);
    return {
      texture: tex, width: size, height: size,
      attach: (id: number) => {
        (gl as WebGLRenderingContext).activeTexture((gl as WebGLRenderingContext).TEXTURE0 + id);
        (gl as WebGLRenderingContext).bindTexture((gl as WebGLRenderingContext).TEXTURE_2D, tex);
        return id;
      }
    };
  }

  private getResolution(resolution: number) {
    const gl = this.gl as WebGLRenderingContext;
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
    return { width: min, height: max };
  }

  private initFramebuffers() {
    const gl = this.gl as WebGLRenderingContext;
    const simRes = this.getResolution(this.config.SIM_RESOLUTION);
    const dyeRes = this.getResolution(this.config.DYE_RESOLUTION);

    const texType = this.ext.halfFloatTexType;
    const rgba = this.ext.formatRGBA;
    const rg = this.ext.formatRG;
    const r = this.ext.formatR;
    const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (!this.dye) this.dye = createDoubleFBO(this.gl, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else this.dye = resizeDoubleFBO(this.gl, this.dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering, this.copyProgram, (t: FBO | null, c?: boolean) => glBlit(this.gl, t, c));

    if (!this.velocity) this.velocity = createDoubleFBO(this.gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else this.velocity = resizeDoubleFBO(this.gl, this.velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering, this.copyProgram, (t: FBO | null, c?: boolean) => glBlit(this.gl, t, c));

    this.divergence = createFBO(this.gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.curl = createFBO(this.gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.pressure = createDoubleFBO(this.gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    if (this.config.BLOOM) {
      const res = this.getResolution(this.config.BLOOM_RESOLUTION);
      this.bloom = createFBO(this.gl, res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);
      this.bloomFramebuffers.length = 0;
      for (let i = 0; i < this.config.BLOOM_ITERATIONS; i++) {
        const width = res.width >> (i + 1);
        const height = res.height >> (i + 1);
        if (width < 2 || height < 2) break;
        const fbo = createFBO(this.gl, width, height, rgba.internalFormat, rgba.format, texType, filtering);
        this.bloomFramebuffers.push(fbo);
      }
    }

    if (this.config.SUNRAYS) {
      const res = this.getResolution(this.config.SUNRAYS_RESOLUTION);
      this.sunrays = createFBO(this.gl, res.width, res.height, r.internalFormat, r.format, texType, filtering);
      this.sunraysTemp = createFBO(this.gl, res.width, res.height, r.internalFormat, r.format, texType, filtering);
    }

    this.ditheringTex = this.createNoiseTexture(256);
  }

  private resizeCanvas() {
    const width = Math.floor((this.canvas.clientWidth || window.innerWidth) * this.dpr);
    const height = Math.floor((this.canvas.clientHeight || window.innerHeight) * this.dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      return true;
    }
    return false;
  }

  private onResize = () => {
    if (this.container) {
      const rect = this.container.getBoundingClientRect();
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
    }
  };

  private update = () => {
    const now = Date.now();
    let dt = (now - this.lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    this.lastUpdateTime = now;

    if (this.resizeCanvas()) this.initFramebuffers();
    this.applyInputs();
    if (!this.config.PAUSED) this.step(dt);
    this.render(null);
    this.raf = requestAnimationFrame(this.update);
  };

  private applyInputs() {
    while (this.splatStack.length > 0) {
      this.multipleSplats(this.splatStack.pop() || 0);
    }
    this.pointers.forEach((p) => {
      if (p.moved) {
        p.moved = false;
        const dx = p.deltaX * this.config.SPLAT_FORCE;
        const dy = p.deltaY * this.config.SPLAT_FORCE;
        this.splat(p.texcoordX, p.texcoordY, dx, dy, p.color);
      }
    });
  }

  private step(dt: number) {
    const gl = this.gl as WebGLRenderingContext;
    gl.disable(gl.BLEND);

    this.curlProgramWrap.bind();
    gl.uniform2f(this.curlProgramWrap.uniforms.texelSize!, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.curlProgramWrap.uniforms.uVelocity!, this.velocity.read.attach(0));
    glBlit(this.gl, this.curl);

    this.vorticityProgramWrap.bind();
    gl.uniform2f(this.vorticityProgramWrap.uniforms.texelSize!, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.vorticityProgramWrap.uniforms.uVelocity!, this.velocity.read.attach(0));
    gl.uniform1i(this.vorticityProgramWrap.uniforms.uCurl!, this.curl.attach(1));
    gl.uniform1f(this.vorticityProgramWrap.uniforms.curl!, this.config.CURL);
    gl.uniform1f(this.vorticityProgramWrap.uniforms.dt!, dt);
    glBlit(this.gl, this.velocity.write);
    this.velocity.swap();

    this.divergenceProgram.bind();
    gl.uniform2f(this.divergenceProgram.uniforms.texelSize!, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.divergenceProgram.uniforms.uVelocity!, this.velocity.read.attach(0));
    glBlit(this.gl, this.divergence);

    this.clearProgram.bind();
    gl.uniform1i(this.clearProgram.uniforms.uTexture!, this.pressure.read.attach(0));
    gl.uniform1f(this.clearProgram.uniforms.value!, this.config.PRESSURE);
    glBlit(this.gl, this.pressure.write);
    this.pressure.swap();

    this.pressureProgramWrap.bind();
    gl.uniform2f(this.pressureProgramWrap.uniforms.texelSize!, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.pressureProgramWrap.uniforms.uDivergence!, this.divergence.attach(0));
    for (let i = 0; i < this.config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(this.pressureProgramWrap.uniforms.uPressure!, this.pressure.read.attach(1));
      glBlit(this.gl, this.pressure.write);
      this.pressure.swap();
    }

    this.gradientSubtractProgram.bind();
    gl.uniform2f(this.gradientSubtractProgram.uniforms.texelSize!, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.gradientSubtractProgram.uniforms.uPressure!, this.pressure.read.attach(0));
    gl.uniform1i(this.gradientSubtractProgram.uniforms.uVelocity!, this.velocity.read.attach(1));
    glBlit(this.gl, this.velocity.write);
    this.velocity.swap();

    this.advectionProgram.bind();
    gl.uniform2f(this.advectionProgram.uniforms.texelSize!, this.velocity.texelSizeX, this.velocity.texelSizeY);
    if (!this.ext.supportLinearFiltering) gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize!, this.velocity.texelSizeX, this.velocity.texelSizeY);
    const velocityId = this.velocity.read.attach(0);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity!, velocityId);
    gl.uniform1i(this.advectionProgram.uniforms.uSource!, velocityId);
    gl.uniform1f(this.advectionProgram.uniforms.dt!, dt);
    gl.uniform1f(this.advectionProgram.uniforms.dissipation!, this.config.VELOCITY_DISSIPATION);
    glBlit(this.gl, this.velocity.write);
    this.velocity.swap();

    if (!this.ext.supportLinearFiltering) gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize!, this.dye.texelSizeX, this.dye.texelSizeY);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity!, this.velocity.read.attach(0));
    gl.uniform1i(this.advectionProgram.uniforms.uSource!, this.dye.read.attach(1));
    gl.uniform1f(this.advectionProgram.uniforms.dissipation!, this.config.DENSITY_DISSIPATION);
    glBlit(this.gl, this.dye.write);
    this.dye.swap();
  }

  private render(target: FBO | null) {
    const gl = this.gl as WebGLRenderingContext;

    if (this.config.BLOOM) this.applyBloom(this.dye.read, this.bloom);
    if (this.config.SUNRAYS) {
      this.applySunrays(this.dye.read, this.dye.write, this.sunrays);

      this.blurProgram.bind();
      gl.uniform2f(this.blurProgram.uniforms.texelSize!, this.sunrays.texelSizeX, 0.0);
      gl.uniform1i(this.blurProgram.uniforms.uTexture!, this.sunrays.attach(0));
      glBlit(this.gl, this.sunraysTemp);
      gl.uniform2f(this.blurProgram.uniforms.texelSize!, 0.0, this.sunrays.texelSizeY);
      gl.uniform1i(this.blurProgram.uniforms.uTexture!, this.sunraysTemp.attach(0));
      glBlit(this.gl, this.sunrays);
    }

    if (target == null || !this.config.TRANSPARENT) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
    } else {
      gl.disable(gl.BLEND);
    }

    if (!this.config.TRANSPARENT) {
      this.colorProgram.bind();
      gl.uniform4f(this.colorProgram.uniforms.color!, this.config.BACK_COLOR.r / 255, this.config.BACK_COLOR.g / 255, this.config.BACK_COLOR.b / 255, 1);
      glBlit(this.gl, target);
    }
    if (target == null && this.config.TRANSPARENT) {
      this.checkerboardProgram.bind();
      gl.uniform1f(this.checkerboardProgram.uniforms.aspectRatio!, this.canvas.width / this.canvas.height);
      glBlit(this.gl, target);
    }

    this.displayMaterial.bind();
    if (this.config.SHADING) gl.uniform2f(this.displayMaterial.uniforms.texelSize!, 1 / (target ? target.width : gl.drawingBufferWidth), 1 / (target ? target.height : gl.drawingBufferHeight));
    gl.uniform1i(this.displayMaterial.uniforms.uTexture!, this.dye.read.attach(0));
    if (this.config.BLOOM) {
      gl.uniform1i(this.displayMaterial.uniforms.uBloom!, this.bloom.attach(1));
      gl.uniform1i(this.displayMaterial.uniforms.uDithering!, this.ditheringTex.attach(2));
      const width = target ? target.width : gl.drawingBufferWidth;
      const height = target ? target.height : gl.drawingBufferHeight;
      gl.uniform2f(this.displayMaterial.uniforms.ditherScale!, width / this.ditheringTex.width, height / this.ditheringTex.height);
    }
    if (this.config.SUNRAYS) gl.uniform1i(this.displayMaterial.uniforms.uSunrays!, this.sunrays.attach(3));
    glBlit(this.gl, target);
  }

  private applyBloom(source: FBO, destination: FBO) {
    const gl = this.gl as WebGLRenderingContext;
    if (this.bloomFramebuffers.length < 2) return;

    let last: FBO = destination;

    gl.disable(gl.BLEND);
    this.bloomPrefilterProgram.bind();
    const knee = this.config.BLOOM_THRESHOLD * this.config.BLOOM_SOFT_KNEE + 0.0001;
    const curve0 = this.config.BLOOM_THRESHOLD - knee;
    const curve1 = knee * 2;
    const curve2 = 0.25 / knee;
    gl.uniform3f(this.bloomPrefilterProgram.uniforms.curve!, curve0, curve1, curve2);
    gl.uniform1f(this.bloomPrefilterProgram.uniforms.threshold!, this.config.BLOOM_THRESHOLD);
    gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture!, source.attach(0));
    glBlit(this.gl, last);

    this.bloomBlurProgram.bind();
    for (let i = 0; i < this.bloomFramebuffers.length; i++) {
      const dest = this.bloomFramebuffers[i];
      gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize!, last.texelSizeX, last.texelSizeY);
      gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture!, last.attach(0));
      glBlit(this.gl, dest);
      last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = this.bloomFramebuffers.length - 2; i >= 0; i--) {
      const baseTex = this.bloomFramebuffers[i];
      gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize!, last.texelSizeX, last.texelSizeY);
      gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture!, last.attach(0));
      (gl as WebGLRenderingContext).viewport(0, 0, baseTex.width, baseTex.height);
      glBlit(this.gl, baseTex);
      last = baseTex;
    }

    gl.disable(gl.BLEND);
    this.bloomFinalProgram.bind();
    gl.uniform2f(this.bloomFinalProgram.uniforms.texelSize!, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(this.bloomFinalProgram.uniforms.uTexture!, last.attach(0));
    gl.uniform1f(this.bloomFinalProgram.uniforms.intensity!, this.config.BLOOM_INTENSITY);
    glBlit(this.gl, destination);
  }

  private applySunrays(source: FBO, mask: FBO, destination: FBO) {
    const gl = this.gl as WebGLRenderingContext;
    gl.disable(gl.BLEND);
    this.sunraysMaskProgram.bind();
    gl.uniform1i(this.sunraysMaskProgram.uniforms.uTexture!, source.attach(0));
    glBlit(this.gl, mask);

    this.sunraysProgram.bind();
    gl.uniform1f(this.sunraysProgram.uniforms.weight!, this.config.SUNRAYS_WEIGHT);
    gl.uniform1i(this.sunraysProgram.uniforms.uTexture!, mask.attach(0));
    glBlit(this.gl, destination);
  }

  private correctDeltaX(delta: number) {
    const aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
  }

  private correctDeltaY(delta: number) {
    const aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
  }

  private splat(x: number, y: number, dx: number, dy: number, color: { r: number; g: number; b: number }) {
    const gl = this.gl as WebGLRenderingContext;
    this.splatProgram.bind();
    gl.uniform1i(this.splatProgram.uniforms.uTarget!, this.velocity.read.attach(0));
    gl.uniform1f(this.splatProgram.uniforms.aspectRatio!, this.canvas.width / this.canvas.height);
    gl.uniform2f(this.splatProgram.uniforms.point!, x, y);
    gl.uniform3f(this.splatProgram.uniforms.color!, dx, dy, 0.0);
    gl.uniform1f(this.splatProgram.uniforms.radius!, this.correctRadius(this.config.SPLAT_RADIUS / 100.0));
    glBlit(this.gl, this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(this.splatProgram.uniforms.uTarget!, this.dye.read.attach(0));
    gl.uniform3f(this.splatProgram.uniforms.color!, color.r, color.g, color.b);
    glBlit(this.gl, this.dye.write);
    this.dye.swap();
  }

  private multipleSplats(amount: number) {
    for (let i = 0; i < amount; i++) {
      const c = HSVtoRGB(Math.random(), 1.0, 1.0);
      c.r *= 10.0; c.g *= 10.0; c.b *= 10.0;
      const x = Math.random();
      const y = Math.random();
      const dx = 1000 * (Math.random() - 0.5);
      const dy = 1000 * (Math.random() - 0.5);
      this.splat(x, y, dx, dy, c);
    }
  }

  private correctRadius(radius: number) {
    let aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }

  private bindEvents() {
    const canvas = this.canvas;
    const dpr = this.dpr;

    const updatePointerDownData = (pointer: any, id: number, posX: number, posY: number) => {
      pointer.id = id;
      pointer.down = true;
      pointer.moved = false;
      pointer.texcoordX = posX / canvas.width;
      pointer.texcoordY = 1.0 - posY / canvas.height;
      pointer.prevTexcoordX = pointer.texcoordX;
      pointer.prevTexcoordY = pointer.texcoordY;
      pointer.deltaX = 0;
      pointer.deltaY = 0;
      const c = HSVtoRGB(Math.random(), 1.0, 1.0);
      pointer.color = { r: c.r * 0.15, g: c.g * 0.15, b: c.b * 0.15 };
    };

    const updatePointerMoveData = (pointer: any, posX: number, posY: number) => {
      pointer.prevTexcoordX = pointer.texcoordX;
      pointer.prevTexcoordY = pointer.texcoordY;
      pointer.texcoordX = posX / canvas.width;
      pointer.texcoordY = 1.0 - posY / canvas.height;
      pointer.deltaX = this.correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
      pointer.deltaY = this.correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
      pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    };

    this.canvas.addEventListener("mousedown", (e) => {
      const posX = e.offsetX * dpr;
      const posY = e.offsetY * dpr;
      let pointer = this.pointers.find((p) => p.id === -1);
      if (!pointer) {
        pointer = { id: -1, texcoordX: 0, texcoordY: 0, prevTexcoordX: 0, prevTexcoordY: 0, deltaX: 0, deltaY: 0, down: false, moved: false, color: { r: 1, g: 0, b: 0 } };
        this.pointers.push(pointer);
      }
      updatePointerDownData(pointer, -1, posX, posY);
    });

    this.canvas.addEventListener("mousemove", (e) => {
      const pointer = this.pointers[0];
      if (!pointer.down) return;
      const posX = e.offsetX * dpr;
      const posY = e.offsetY * dpr;
      updatePointerMoveData(pointer, posX, posY);
    });

    window.addEventListener("mouseup", () => {
      this.pointers[0].down = false;
    });

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touches = e.targetTouches;
      while (touches.length >= this.pointers.length) {
        this.pointers.push({ id: -2, texcoordX: 0, texcoordY: 0, prevTexcoordX: 0, prevTexcoordY: 0, deltaX: 0, deltaY: 0, down: false, moved: false, color: { r: 1, g: 1, b: 1 } });
      }
      for (let i = 0; i < touches.length; i++) {
        const posX = touches[i].pageX * this.dpr;
        const posY = touches[i].pageY * this.dpr;
        updatePointerDownData(this.pointers[i + 1], touches[i].identifier, posX, posY);
      }
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touches = e.targetTouches;
      for (let i = 0; i < touches.length; i++) {
        const pointer = this.pointers[i + 1];
        if (!pointer.down) continue;
        const posX = touches[i].pageX * this.dpr;
        const posY = touches[i].pageY * this.dpr;
        updatePointerMoveData(pointer, posX, posY);
      }
    }, { passive: false });

    window.addEventListener("touchend", (e) => {
      const touches = e.changedTouches;
      for (let i = 0; i < touches.length; i++) {
        const pointer = this.pointers.find((p) => p.id === touches[i].identifier);
        if (!pointer) continue;
        pointer.down = false;
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyP") this.config.PAUSED = !this.config.PAUSED;
      if (e.key === " ") this.splatStack.push(Math.floor(Math.random() * 20) + 5);
    });

    window.addEventListener("resize", this.onResize);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    (this.gl as WebGLRenderingContext).bindFramebuffer((this.gl as WebGLRenderingContext).FRAMEBUFFER, null);
    (this.gl as WebGLRenderingContext).bindTexture((this.gl as WebGLRenderingContext).TEXTURE_2D, null);
  }
}