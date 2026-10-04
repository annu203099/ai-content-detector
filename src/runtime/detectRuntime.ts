import { RuntimeTarget } from '../core/types.js';

export async function detectBestRuntime(): Promise<RuntimeTarget> {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return 'node-cpu';
  }

  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }) : undefined;
  if (nav?.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      // Degrades to WASM if WebGPU context initialization fails
    }
  }

  return 'wasm';
}
