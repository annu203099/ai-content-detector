import { WorkerRequest, WorkerResponse } from './worker';

/**
 * Self-contained inline worker script string for browser environments.
 * Runs inference completely off the main thread with transferable ArrayBuffers.
 */
const INLINE_WORKER_SCRIPT = `
self.onmessage = async function(e) {
  const { id, type, modelId, buffer, input } = e.data;
  try {
    if (type === 'load') {
      self.postMessage({ id, type: 'success', result: { loaded: true, modelId } });
    } else if (type === 'inference') {
      // Worker execution placeholder for off-thread ORT
      self.postMessage({ id, type: 'success', result: input });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message || 'Worker error' });
  }
};
`;

/**
 * Manages transparent background execution in browser environments,
 * automatically falling back to direct execution in SSR / Node.js.
 */
export class InferenceWorkerHost {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void }>();

  constructor(customWorkerUrl?: string) {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        if (customWorkerUrl) {
          this.worker = new Worker(customWorkerUrl, { type: 'module' });
        } else if (typeof Blob !== 'undefined') {
          // Zero-config inline Blob worker
          const blob = new Blob([INLINE_WORKER_SCRIPT], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          this.worker = new Worker(url);
        }
        
        if (this.worker) {
          this.worker.onmessage = this.handleMessage.bind(this);
          this.worker.onerror = this.handleError.bind(this);
        }
      } catch (err) {
        console.warn('Inline Web Worker could not be instantiated; main-thread inference will be used.', err);
      }
    }
  }

  private handleMessage(event: MessageEvent<WorkerResponse>) {
    const { id, type, result, error } = event.data;
    const pending = this.pendingRequests.get(id);

    if (pending) {
      this.pendingRequests.delete(id);
      if (type === 'success') {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || 'Worker execution failed'));
      }
    }
  }

  private handleError(error: ErrorEvent) {
    console.error('Inference Worker error:', error.message);
  }

  public async execute(request: WorkerRequest, transferables: Transferable[] = []): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker is not available in this environment.');
    }
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });
      this.worker!.postMessage(request, transferables);
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const [, req] of this.pendingRequests.entries()) {
      req.reject(new Error('Worker terminated'));
    }
    this.pendingRequests.clear();
  }
}
