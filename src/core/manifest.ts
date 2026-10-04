import registryJson from './model-registry.json';

export interface ModelArtifactDetails {
  url: string;
  sizeBytes: number;
  sha256: string;
}

export interface ImageInputConfig {
  width: number;
  height: number;
  channels: number;
  layout: 'NCHW' | 'NHWC';
  mean: number[];
  std: number[];
  resizeShorterSide?: number;
}

export interface TextInputConfig {
  maxTokens: number;
}

export interface ModelEntry {
  id: string;
  modality: 'image' | 'text';
  revision: string;
  license: string;
  source: string;
  runtimes: string[];
  dtype: 'int8' | 'fp16' | 'fp32';
  artifact: ModelArtifactDetails;
  tokenizer?: {
    url: string;
    vocabUrl?: string;
  };
  input?: ImageInputConfig | TextInputConfig;
  output?: {
    type: string;
    aiLabel: string;
  };
  threshold: number;
  calibration?: {
    method: 'platt' | 'temperature';
    a?: number;
    b?: number;
    temperature?: number;
  };
}

export interface ModelRegistry {
  version: string;
  models: Record<string, ModelEntry>;
}

export const DEFAULT_MODEL_REGISTRY: ModelRegistry = registryJson as unknown as ModelRegistry;

export function getModelEntry(modelId: string, customRegistry?: ModelRegistry): ModelEntry {
  const registry = customRegistry || DEFAULT_MODEL_REGISTRY;
  const entry = registry.models[modelId];
  if (!entry) {
    throw new Error(`Model '${modelId}' not found in registry. Available models: ${Object.keys(registry.models).join(', ')}`);
  }
  return entry;
}

export function getDefaultModelForProfile(
  modality: 'image' | 'text',
  profile: 'fast' | 'balanced' | 'accuracy' = 'fast',
  runtime: 'webgpu' | 'wasm' | 'node-cpu' = 'wasm'
): ModelEntry {
  if (modality === 'image') {
    if (runtime === 'webgpu') {
      return getModelEntry('image.sieve.ft1.fp16');
    }
    return getModelEntry('image.sieve.ft1.int8');
  }

  // Text modality
  return getModelEntry('text.distilbert.int8');
}
