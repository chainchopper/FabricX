import type { GL, FBO, DoubleFBO } from "./types.ts";

export function createFBO(gl: GL, w: number, h: number, internalFormat: number, format: number, type: number, param: number): FBO {
  (gl as WebGLRenderingContext).activeTexture((gl as WebGLRenderingContext).TEXTURE0);
  const texture = (gl as WebGLRenderingContext).createTexture()!;
  (gl as WebGLRenderingContext).bindTexture((gl as WebGLRenderingContext).TEXTURE_2D, texture);
  (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_MIN_FILTER, param);
  (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_MAG_FILTER, param);
  (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_WRAP_S, (gl as WebGLRenderingContext).CLAMP_TO_EDGE);
  (gl as WebGLRenderingContext).texParameteri((gl as WebGLRenderingContext).TEXTURE_2D, (gl as WebGLRenderingContext).TEXTURE_WRAP_T, (gl as WebGLRenderingContext).CLAMP_TO_EDGE);
  (gl as WebGLRenderingContext).texImage2D((gl as WebGLRenderingContext).TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  const fbo = (gl as WebGLRenderingContext).createFramebuffer()!;
  (gl as WebGLRenderingContext).bindFramebuffer((gl as WebGLRenderingContext).FRAMEBUFFER, fbo);
  (gl as WebGLRenderingContext).framebufferTexture2D((gl as WebGLRenderingContext).FRAMEBUFFER, (gl as WebGLRenderingContext).COLOR_ATTACHMENT0, (gl as WebGLRenderingContext).TEXTURE_2D, texture, 0);
  (gl as WebGLRenderingContext).viewport(0, 0, w, h);
  (gl as WebGLRenderingContext).clear((gl as WebGLRenderingContext).COLOR_BUFFER_BIT);

  return {
    texture,
    fbo,
    width: w,
    height: h,
    texelSizeX: 1 / w,
    texelSizeY: 1 / h,
    attach(id: number) {
      (gl as WebGLRenderingContext).activeTexture((gl as WebGLRenderingContext).TEXTURE0 + id);
      (gl as WebGLRenderingContext).bindTexture((gl as WebGLRenderingContext).TEXTURE_2D, texture);
      return id;
    },
  };
}

export function createDoubleFBO(gl: GL, w: number, h: number, internalFormat: number, format: number, type: number, param: number): DoubleFBO {
  let fbo1 = createFBO(gl, w, h, internalFormat, format, type, param);
  let fbo2 = createFBO(gl, w, h, internalFormat, format, type, param);
  return {
    width: w,
    height: h,
    texelSizeX: fbo1.texelSizeX,
    texelSizeY: fbo1.texelSizeY,
    get read() { return fbo1; },
    set read(v: FBO) { fbo1 = v; },
    get write() { return fbo2; },
    set write(v: FBO) { fbo2 = v; },
    swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
  };
}

export function resizeFBO(gl: GL, target: FBO, w: number, h: number, internalFormat: number, format: number, type: number, param: number, copyProgram: { bind: () => void; uniforms: Record<string, WebGLUniformLocation | null> }, blit: (target: FBO | null, clear?: boolean) => void) {
  const newFBO = createFBO(gl, w, h, internalFormat, format, type, param);
  copyProgram.bind();
  (gl as WebGLRenderingContext).uniform1i(copyProgram.uniforms.uTexture!, target.attach(0));
  blit(newFBO);
  (gl as WebGLRenderingContext).deleteFramebuffer(target.fbo);
  (gl as WebGLRenderingContext).deleteTexture(target.texture);
  return newFBO;
}

export function resizeDoubleFBO(gl: GL, target: DoubleFBO, w: number, h: number, internalFormat: number, format: number, type: number, param: number, copyProgram: { bind: () => void; uniforms: Record<string, WebGLUniformLocation | null> }, blit: (target: FBO | null, clear?: boolean) => void) {
  if (target.width === w && target.height === h) return target;
  target.read = resizeFBO(gl, target.read, w, h, internalFormat, format, type, param, copyProgram, blit);
  target.write = createFBO(gl, w, h, internalFormat, format, type, param);
  target.width = w;
  target.height = h;
  target.texelSizeX = 1 / w;
  target.texelSizeY = 1 / h;
  return target;
}

export function blit(gl: GL, target: FBO | null, clear = false) {
  if (!target) {
    (gl as WebGLRenderingContext).viewport(0, 0, (gl as WebGLRenderingContext).drawingBufferWidth, (gl as WebGLRenderingContext).drawingBufferHeight);
    (gl as WebGLRenderingContext).bindFramebuffer((gl as WebGLRenderingContext).FRAMEBUFFER, null);
  } else {
    (gl as WebGLRenderingContext).viewport(0, 0, target.width, target.height);
    (gl as WebGLRenderingContext).bindFramebuffer((gl as WebGLRenderingContext).FRAMEBUFFER, target.fbo);
  }
  if (clear) {
    (gl as WebGLRenderingContext).clearColor(0, 0, 0, 1);
    (gl as WebGLRenderingContext).clear((gl as WebGLRenderingContext).COLOR_BUFFER_BIT);
  }
  (gl as WebGLRenderingContext).drawElements((gl as WebGLRenderingContext).TRIANGLES, 6, (gl as WebGLRenderingContext).UNSIGNED_SHORT, 0);
}