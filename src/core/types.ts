export type DetectionModality = 'image' | 'text';

export type RuntimeTarget = 'webgpu' | 'wasm' | 'node-cpu' | 'node-gpu' | 'auto';

export type DetectionStatus =
  | 'ok'
  | 'insufficient_evidence'
  | 'model_unavailable'
  | 'runtime_unavailable'
  | 'unsupported_input'
  | 'inference_error';

export type Verdict = 'likely_ai' | 'likely_human' | 'uncertain' | 'insufficient_evidence';

export type ProvenanceStatus =
  | 'validated_ai'
  | 'validated_edit'
  | 'present_unknown'
  | 'none'
  | 'invalid'
  | 'provenance_unavailable';

export interface ProvenanceResult {
  status: ProvenanceStatus;
  source?: string;
  details?: Record<string, unknown>;
}

export interface ModelMetadata {
  id: string;
  revision: string;
  runtime: string;
}

export interface PerformanceTiming {
  startTime: number;
  endTime: number;
  totalMs: number;
  decodeMs?: number;
  preprocessingMs?: number;
  tokenizationMs?: number;
  inferenceMs?: number;
  coldStart: boolean;
}

export interface BaseDetectionResult {
  id: string;
  modality: DetectionModality;
  status: DetectionStatus;
  verdict: Verdict;
  score: number;
  probability?: number;
  confidence: number;
  thresholdUsed: number;
  model: ModelMetadata;
  timing: PerformanceTiming;
  error?: string;
}

export interface ImageEvidence {
  pixelModel: number;
  c2pa: ProvenanceStatus;
  metadataHints: Array<{ type: string; value: string }>;
}

export interface ImageDetectionResult extends BaseDetectionResult {
  modality: 'image';
  provenance: ProvenanceResult;
  evidence: ImageEvidence;
}

export interface TextSegment {
  start: number;
  end: number;
  score: number;
  text?: string;
}

export interface TextDiagnostics {
  invisibleCharacters: number;
  mixedScriptFlags: number;
  suspiciousUnicodeFlags: number;
  warning?: string;
}

export interface TextInputStats {
  words: number;
  characters: number;
  tokens?: number;
  shortInput: boolean;
}

export interface TextDetectionResult extends BaseDetectionResult {
  modality: 'text';
  input: TextInputStats;
  diagnostics: TextDiagnostics;
  segments?: TextSegment[];
  perplexity?: number;
  burstiness?: number;
}
