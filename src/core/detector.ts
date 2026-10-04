import { TextDetectorAdapter } from '../text/adapter';
import { ImageDetectorAdapter } from '../image/adapter';
import { TextInput, TextDetectionResult } from '../text/types';
import { ImageInput, ImageDetectionResult } from '../image/types';
import { RuntimeTarget } from './types';
import { ModelLoader } from './loader';
import { ModelCache } from './cache';
import { detectBestRuntime } from '../runtime/detectRuntime';

export interface DetectorOptions {
  runtime?: RuntimeTarget;
  profile?: 'fast' | 'balanced' | 'accuracy';
  provenance?: boolean;
  threshold?: number;
  mode?: 'online' | 'offline' | 'strict-offline';
  modelHost?: string;
  cache?: ModelCache;
  imageModelId?: string;
  textModelId?: string;
}

export class AIDetector {
  private options: DetectorOptions;
  private textAdapter: TextDetectorAdapter;
  private imageAdapter: ImageDetectorAdapter;
  private loader: ModelLoader;
  private resolvedRuntime: string = 'wasm';

  constructor(options: DetectorOptions = {}) {
    this.options = options;
    const cache = options.cache || new ModelCache();
    this.loader = new ModelLoader({
      cache,
      mode: options.mode || 'online',
      modelHost: options.modelHost
    });

    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    this.resolvedRuntime = options.runtime && options.runtime !== 'auto'
      ? options.runtime
      : (isNode ? 'node-cpu' : 'wasm');

    this.textAdapter = new TextDetectorAdapter({
      modelId: options.textModelId,
      threshold: options.threshold,
      runtime: this.resolvedRuntime as any,
      loader: this.loader
    });

    this.imageAdapter = new ImageDetectorAdapter({
      modelId: options.imageModelId,
      threshold: options.threshold,
      runtime: this.resolvedRuntime as any,
      loader: this.loader,
      provenance: options.provenance !== false
    });
  }

  /**
   * Initializes detector runtimes and ensures runtime detection has completed.
   */
  public async init(): Promise<this> {
    if (this.options.runtime === 'auto') {
      const best = await detectBestRuntime();
      this.resolvedRuntime = best;
    }
    return this;
  }

  /**
   * Detects AI generation in text inputs.
   */
  async detectText(
    input: TextInput,
    options: { threshold?: number } = {}
  ): Promise<TextDetectionResult> {
    return this.textAdapter.detect(input, options);
  }

  /**
   * Alias for detectText
   */
  async text(
    input: TextInput,
    options: { threshold?: number } = {}
  ): Promise<TextDetectionResult> {
    return this.detectText(input, options);
  }

  /**
   * Detects AI generation in image inputs.
   */
  async detectImage(
    input: ImageInput,
    options: { threshold?: number; provenance?: boolean } = {}
  ): Promise<ImageDetectionResult> {
    return this.imageAdapter.detect(input, options);
  }

  /**
   * Alias for detectImage
   */
  async image(
    input: ImageInput,
    options: { threshold?: number; provenance?: boolean } = {}
  ): Promise<ImageDetectionResult> {
    return this.detectImage(input, options);
  }

  /**
   * Batch image detection reusing model sessions.
   */
  async imageBatch(
    inputs: ImageInput[],
    options: { threshold?: number; provenance?: boolean } = {}
  ): Promise<ImageDetectionResult[]> {
    const results: ImageDetectionResult[] = [];
    for (const input of inputs) {
      results.push(await this.detectImage(input, options));
    }
    return results;
  }

  /**
   * Batch text detection reusing model sessions.
   */
  async textBatch(
    inputs: TextInput[],
    options: { threshold?: number } = {}
  ): Promise<TextDetectionResult[]> {
    const results: TextDetectionResult[] = [];
    for (const input of inputs) {
      results.push(await this.detectText(input, options));
    }
    return results;
  }

  /**
   * Diagnostics API matching spec Section 41.
   */
  info(): Record<string, unknown> {
    return {
      runtime: this.resolvedRuntime,
      profile: this.options.profile || 'fast',
      sdkVersion: '1.0.0',
      provenanceEnabled: this.options.provenance !== false,
      models: {
        image: this.options.imageModelId || 'image.sieve.ft1',
        text: this.options.textModelId || 'text.distilbert.int8'
      }
    };
  }

  /**
   * Clears persisted model caches.
   */
  async clearCache(): Promise<void> {
    await this.loader['cache'].clearCache();
  }
}

/**
 * Creates and initializes a configured AIDetector instance.
 */
export async function createDetector(options: DetectorOptions = {}): Promise<AIDetector> {
  const detector = new AIDetector(options);
  await detector.init();
  return detector;
}

// Global default singleton for zero-config detectImage and detectText
let defaultDetector: AIDetector | null = null;

function getDefaultDetector(): AIDetector {
  if (!defaultDetector) {
    defaultDetector = new AIDetector({ runtime: 'auto', provenance: true });
  }
  return defaultDetector;
}

/**
 * Convenience zero-config top-level image detection.
 */
export async function detectImage(
  input: ImageInput,
  options: { threshold?: number; provenance?: boolean } = {}
): Promise<ImageDetectionResult> {
  return getDefaultDetector().detectImage(input, options);
}

/**
 * Convenience zero-config top-level text detection.
 */
export async function detectText(
  input: TextInput,
  options: { threshold?: number } = {}
): Promise<TextDetectionResult> {
  return getDefaultDetector().detectText(input, options);
}