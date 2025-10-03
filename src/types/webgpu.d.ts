declare type GPUTextureFormat = string;
declare type GPUDevice = any;
declare type GPUComputePipeline = any;
declare type GPURenderPipeline = any;
declare type GPUTexture = any;
declare type GPUTextureView = any;
declare type GPUSampler = any;
declare type GPUBuffer = any;
declare type GPUBindGroup = any;
declare type GPUShaderModule = any;
declare type GPUCompilationMessage = { type?: string; message?: string };

declare const GPUTextureUsage: {
  TEXTURE_BINDING: number;
  STORAGE_BINDING: number;
  COPY_SRC: number;
};

declare const GPUBufferUsage: {
  UNIFORM: number;
  COPY_DST: number;
};