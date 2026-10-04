/**
 * Request sent to the inference worker.
 */
export interface WorkerRequest {
  id: string;
  type: 'load' | 'inference';
  modelId?: string;
  buffer?: ArrayBuffer;
  input?: any; // The input data for inference
}

/**
 * Response received from the inference worker.
 */
export interface WorkerResponse {
  id: string;
  type: 'success' | 'error';
  result?: any; // The output data from inference or load status
  error?: string;
}
