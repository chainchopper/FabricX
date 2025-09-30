import type { GL } from "./types.ts";

export function addKeywords(source: string, keywords: string[] | null) {
  if (!keywords || keywords.length === 0) return source;
  let s = "";
  for (const k of keywords) s += `#define ${k}\n`;
  return s + source;
}

export function compileShader(gl: GL, type: number, source: string, keywords: string[] | null = null) {
  source = addKeywords(source, keywords);
  const shader = (gl as WebGLRenderingContext).createShader(type)!;
  (gl as WebGLRenderingContext).shaderSource(shader, source);
  (gl as WebGLRenderingContext).compileShader(shader);
  if (!(gl as WebGLRenderingContext).getShaderParameter(shader, (gl as WebGLRenderingContext).COMPILE_STATUS)) {
    // eslint-disable-next-line no-console
    console.trace((gl as WebGLRenderingContext).getShaderInfoLog(shader));
  }
  return shader;
}

export function createProgram(gl: GL, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
  const program = (gl as WebGLRenderingContext).createProgram()!;
  (gl as WebGLRenderingContext).attachShader(program, vertexShader);
  (gl as WebGLRenderingContext).attachShader(program, fragmentShader);
  // bind attribute location 0 to aPosition
  (gl as WebGLRenderingContext).bindAttribLocation(program, 0, "aPosition");
  (gl as WebGLRenderingContext).linkProgram(program);
  if (!(gl as WebGLRenderingContext).getProgramParameter(program, (gl as WebGLRenderingContext).LINK_STATUS)) {
    // eslint-disable-next-line no-console
    console.trace((gl as WebGLRenderingContext).getProgramInfoLog(program));
  }
  return program;
}

export function getUniforms(gl: GL, program: WebGLProgram) {
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = (gl as WebGLRenderingContext).getProgramParameter(program, (gl as WebGLRenderingContext).ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = (gl as WebGLRenderingContext).getActiveUniform(program, i)!;
    uniforms[info.name] = (gl as WebGLRenderingContext).getUniformLocation(program, info.name);
  }
  return uniforms;
}

export function hashCode(s: string) {
  if (s.length === 0) return 0;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function bindFullScreenQuad(gl: GL) {
  const vbo = (gl as WebGLRenderingContext).createBuffer()!;
  (gl as WebGLRenderingContext).bindBuffer((gl as WebGLRenderingContext).ARRAY_BUFFER, vbo);
  (gl as WebGLRenderingContext).bufferData(
    (gl as WebGLRenderingContext).ARRAY_BUFFER,
    new Float32Array([-1,-1, -1,1, 1,1, 1,-1]),
    (gl as WebGLRenderingContext).STATIC_DRAW
  );
  const ebo = (gl as WebGLRenderingContext).createBuffer()!;
  (gl as WebGLRenderingContext).bindBuffer((gl as WebGLRenderingContext).ELEMENT_ARRAY_BUFFER, ebo);
  (gl as WebGLRenderingContext).bufferData(
    (gl as WebGLRenderingContext).ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0,1,2, 0,2,3]),
    (gl as WebGLRenderingContext).STATIC_DRAW
  );
  (gl as WebGLRenderingContext).vertexAttribPointer(0, 2, (gl as WebGLRenderingContext).FLOAT, false, 0, 0);
  (gl as WebGLRenderingContext).enableVertexAttribArray(0);
}