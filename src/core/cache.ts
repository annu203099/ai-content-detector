/**
 * Universal model cache for browser and Node.js environments.
 * - Browser: Cache API / OPFS / IndexedDB
 * - Node.js: Filesystem cache in ~/.cache/ai-detector/<cacheName> or process.env.AI_DETECTOR_CACHE_DIR
 */
export class ModelCache {
  private cacheName: string;
  private isNode: boolean;
  private nodeCacheDir: string | null = null;

  constructor(cacheName = 'ai-detector-models-v1') {
    this.cacheName = cacheName;
    this.isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

    if (this.isNode) {
      try {
        const os = require('os');
        const path = require('path');
        const customDir = process.env.AI_DETECTOR_CACHE_DIR;
        const baseDir = customDir || path.join(os.homedir(), '.cache', 'ai-detector');
        this.nodeCacheDir = path.join(baseDir, this.cacheName);
      } catch {
        this.nodeCacheDir = null;
      }
    }
  }

  /**
   * Retrieves a model from the cache
   * @param id The unique identifier of the model
   * @returns The model as an ArrayBuffer, or null if not found
   */
  async getModel(id: string): Promise<ArrayBuffer | null> {
    // 1. Node.js Filesystem Cache
    if (this.isNode && this.nodeCacheDir) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const safeName = id.replace(/[^a-zA-Z0-9._-]/g, '_') + '.onnx';
        const filePath = path.join(this.nodeCacheDir, safeName);
        const buffer = await fs.readFile(filePath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } catch {
        return null;
      }
    }

    // 2. Browser Cache API
    if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
      try {
        const cache = await caches.open(this.cacheName);
        const response = await cache.match(id);
        if (!response) return null;
        return await response.arrayBuffer();
      } catch (error) {
        console.warn(`Failed to get model ${id} from browser cache:`, error);
        return null;
      }
    }

    return null;
  }

  /**
   * Stores a model in the cache
   * @param id The unique identifier of the model
   * @param buffer The model data as an ArrayBuffer
   */
  async putModel(id: string, buffer: ArrayBuffer): Promise<void> {
    // 1. Node.js Filesystem Cache
    if (this.isNode && this.nodeCacheDir) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        await fs.mkdir(this.nodeCacheDir, { recursive: true });
        const safeName = id.replace(/[^a-zA-Z0-9._-]/g, '_') + '.onnx';
        const filePath = path.join(this.nodeCacheDir, safeName);
        await fs.writeFile(filePath, Buffer.from(buffer));
        return;
      } catch (error) {
        console.warn(`Failed to write model ${id} to disk cache:`, error);
      }
    }

    // 2. Browser Cache API
    if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
      try {
        const cache = await caches.open(this.cacheName);
        const response = new Response(buffer, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': buffer.byteLength.toString(),
          },
        });
        await cache.put(id, response);
      } catch (error) {
        console.warn(`Failed to put model ${id} into browser cache:`, error);
      }
    }
  }

  /**
   * Clears models from this specific cache namespace
   */
  async clearCache(): Promise<void> {
    // 1. Node.js Filesystem Cache (clears only this cache namespace directory)
    if (this.isNode && this.nodeCacheDir) {
      try {
        const fs = await import('fs/promises');
        await fs.rm(this.nodeCacheDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to clear node model cache:', error);
      }
    }

    // 2. Browser Cache API
    if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
      try {
        await caches.delete(this.cacheName);
      } catch (error) {
        console.warn('Failed to clear browser model cache:', error);
      }
    }
  }
}
