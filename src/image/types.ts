import { ImageDetectionResult, ProvenanceResult, ProvenanceStatus } from '../core/types';

export type ImageInput =
  | Blob
  | File
  | ArrayBuffer
  | Uint8Array
  | ImageBitmap
  | HTMLImageElement
  | string; // Also allow file path or data URI on Node

export type { ImageDetectionResult, ProvenanceResult, ProvenanceStatus };
