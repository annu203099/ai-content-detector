# AI Detector SDK

> High-performance on-device multimodal forensic intelligence for text, images, and C2PA cryptographic provenance. Zero cloud latency. Zero data leakage.

[![npm version](https://img.shields.io/npm/v/@annapurna12/ai-detector.svg?style=flat-square)](https://www.npmjs.com/package/@annapurna12/ai-detector)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

---

## Highlights

- **100% Local Inference:** Models run entirely within your application process via ONNX Runtime WebAssembly and Node.js. No private documents or images ever leave your security perimeter (GDPR & HIPAA compliant).
- **Dual-Modality Forensics:** Unified API covering fine-tuned DistilBERT text detection (token perplexity & burstiness) and Vision Transformer image forensics (Sieve ViT-S/16 384x384 patch analysis).
- **Cryptographic Provenance:** Deep inspection of JUMBF metadata manifests, signature verification, and digital source type declarations (C2PA / Content Credentials).
- **Sub-150ms Performance:** Quantized INT8 weights compiled for WASM SIMD, WebGPU, and Node.js CPU execution.
- **Calibrated Probabilities:** Empirical Platt scaling with uncertainty bands. Zero arbitrary heuristics.
- **Universal Distribution:** Dual CommonJS and ESM bundles with complete TypeScript declaration files (`dist/index.d.ts`).

---

## Installation

```bash
# npm
npm install @annapurna12/ai-detector

# pnpm
pnpm add @annapurna12/ai-detector

# yarn
yarn add @annapurna12/ai-detector

# bun
bun add @annapurna12/ai-detector
```

### Optional Node.js High-Throughput Accelerators

For maximum throughput and SIMD decoding in Node.js server environments:

```bash
npm install sharp @contentauth/c2pa-node onnxruntime-node
```

---

## Quick Start

### 1. Zero-Config Text Detection

```typescript
import { detectText } from '@annapurna12/ai-detector';

const result = await detectText(
  'The systematic integration of transformer models facilitates multifaceted reasoning...'
);

console.log(result.verdict);    // 'likely_ai' | 'likely_human' | 'uncertain'
console.log(result.confidence); // 0.985 (calibrated probability P(AI))
console.log(result.perplexity); // 14.2
console.log(result.burstiness); // 0.12
```

### 2. Unified Multimodal Forensics Instance

```typescript
import { AIDetector } from '@annapurna12/ai-detector';
import fs from 'node:fs/promises';

const detector = new AIDetector({
  runtime: 'node-cpu', // 'node-cpu' | 'wasm' | 'webgpu'
  provenance: true
});

// Analyze an image (JPEG, PNG, WebP)
const imageBuffer = await fs.readFile('sample.jpg');
const imageResult = await detector.detectImage(imageBuffer);

console.log(imageResult.verdict);          // 'likely_human' | 'likely_ai' | 'uncertain'
console.log(imageResult.confidence);       // Calibrated probability
console.log(imageResult.provenance.status);// 'none' | 'validated_ai' | 'validated_edit'
console.log(imageResult.evidence);         // Detailed evidence breakdown
```

### 3. Batch Text Processing

```typescript
const texts = [
  'Human written paragraph...',
  'Synthetic generative text...'
];

const batchResults = await detector.textBatch(texts);
batchResults.forEach(r => console.log(r.verdict, r.confidence));
```

---

## Architecture & Specifications

### Vision Pipeline (ViT-S/16)
- **Model Lineage:** Sieve Vision Transformer (ViT-S/16), fine-tuned from Community Forensics.
- **Preprocessing Protocol:** Shortest edge scaled to **440px** bilinear, center-cropped to **384x384px**, standardized with ImageNet parameters:
  $$\text{mean} = [0.485, 0.456, 0.406], \quad \text{std} = [0.229, 0.224, 0.225]$$
- **Calibration:** Platt scaling: $P(\text{AI}) = \frac{1}{1 + e^{-(1.0 \cdot \text{logit} + 0.2)}}$.

### Text Pipeline (DistilBERT INT8)
- **Model Lineage:** Quantized DistilBERT transformer sequence classifier.
- **Sliding Window:** 512 tokens with 64-token stride across long documents.
- **Statistical Features:** Token-level cross-entropy perplexity ($PPL$) and sentence-level variance burstiness ($BST$).

---

## API Reference

### `new AIDetector(options?)`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `runtime` | `'node-cpu' \| 'wasm' \| 'webgpu'` | Auto-detected | Execution provider target |
| `provenance` | `boolean` | `true` | Enables C2PA JUMBF / EXIF inspection |
| `mode` | `'online' \| 'strict-offline'` | `'online'` | In offline mode, uses cached weights only |

### `detector.detectText(text, options?)`
- `text`: string (plain text)
- `options.threshold`: number (0.0 to 1.0, default: `0.50`)
- **Returns:** `Promise<TextDetectionResult>`

### `detector.detectImage(input, options?)`
- `input`: `Buffer | Uint8Array | ArrayBuffer | Blob | string (path)`
- `options.threshold`: number (0.0 to 1.0, default: `0.65`)
- **Returns:** `Promise<ImageDetectionResult>`

---

## Air-Gapped / Offline Deployment

For secure, isolated corporate networks with no outbound internet access:

1. Pre-cache model weights in your container image:
   ```bash
   ~/.cache/ai-detector/ai-detector-models-v1/
   ```
2. Set `mode: 'strict-offline'` when instantiating `AIDetector`.
3. All network fetches are bypassed and weights are loaded with cryptographic SHA-256 verification.

---

## License

MIT © 2026 AI Content Detector Contributors
