import { ModelCache } from './cache';
import { verifyModelIntegrity } from './integrity';
import { ModelEntry, getModelEntry } from './manifest';

export interface ModelLoaderOptions {
  cache?: ModelCache;
  mode?: 'online' | 'offline' | 'strict-offline';
  modelHost?: string;
  localPathOverride?: string;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

export class ModelLoader {
  private cache: ModelCache;
  private mode: 'online' | 'offline' | 'strict-offline';
  private modelHost?: string;

  constructor(options: ModelLoaderOptions = {}) {
    this.cache = options.cache || new ModelCache();
    this.mode = options.mode || 'online';
    this.modelHost = options.modelHost;
  }

  /**
   * Fetches or retrieves the model weights buffer, verifying SHA-256 integrity and caching.
   */
  async loadModelBuffer(
    modelOrId: string | ModelEntry,
    customLocalPath?: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<ArrayBuffer> {
    const entry: ModelEntry = typeof modelOrId === 'string' ? getModelEntry(modelOrId) : modelOrId;
    const modelId = entry.id;

    // 1. Check local file override if specified
    if (customLocalPath) {
      if (typeof process !== 'undefined' && process.versions?.node) {
        const fs = await import('fs/promises');
        const buffer = await fs.readFile(customLocalPath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      }
    }

    // 2. Check persistent cache
    const cached = await this.cache.getModel(modelId);
    if (cached) {
      const isValid = await verifyModelIntegrity(cached, entry.artifact.sha256, entry.artifact.sizeBytes);
      if (isValid) {
        return cached;
      }
      console.warn(`Cached model ${modelId} failed SHA-256 verification. Re-fetching.`);
    }

    // 3. Enforce offline policies
    if (this.mode === 'strict-offline' || this.mode === 'offline') {
      throw new Error(
        `Model '${modelId}' is not cached and cannot be downloaded in '${this.mode}' mode. Provide local weights or switch to 'online' mode.`
      );
    }

    // 4. Resolve download URL
    let downloadUrl = entry.artifact.url;
    if (this.modelHost) {
      const filename = downloadUrl.split('/').pop();
      downloadUrl = `${this.modelHost.replace(/\/$/, '')}/${filename}`;
    }

    // 5. Fetch model artifact with progress reporting
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download model '${modelId}' from ${downloadUrl} (HTTP ${response.status} ${response.statusText})`);
    }

    const contentLength = Number(response.headers.get('content-length')) || entry.artifact.sizeBytes;
    let arrayBuffer: ArrayBuffer;

    if (response.body && onProgress && typeof ReadableStream !== 'undefined') {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          onProgress(receivedBytes, contentLength);
        }
      }

      const merged = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      arrayBuffer = merged.buffer;
    } else {
      arrayBuffer = await response.arrayBuffer();
      if (onProgress) {
        onProgress(arrayBuffer.byteLength, arrayBuffer.byteLength);
      }
    }

    // 6. Verify SHA-256 integrity
    const isIntegrityPassed = await verifyModelIntegrity(
      arrayBuffer,
      entry.artifact.sha256,
      entry.artifact.sizeBytes
    );

    if (!isIntegrityPassed) {
      throw new Error(
        `Integrity check failed for model '${modelId}'. Expected SHA-256: ${entry.artifact.sha256}, got mismatch or size error.`
      );
    }

    // 7. Store in cache
    await this.cache.putModel(modelId, arrayBuffer);

    return arrayBuffer;
  }
}
