import { TextDetectionResult, TextSegment, TextDiagnostics, TextInputStats } from '../core/types';

export type TextInput = string;

export interface ChunkScore {
  chunkIndex: number;
  score: number;
  start?: number;
  end?: number;
  text?: string;
}

export type { TextDetectionResult, TextSegment, TextDiagnostics, TextInputStats };
