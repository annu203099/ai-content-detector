import { ImageInput, ImageDetectionResult } from './types';
import { extractProvenance } from './provenance';
import { preprocessImage } from './preprocessor';
import { ModelLoader } from '../core/loader';
import { getDefaultModelForProfile, getModelEntry, ModelEntry, ImageInputConfig } from '../core/manifest';
import { calibrateLogit, determineVerdict } from '../core/calibration';
import { RuntimeTarget } from '../core/types';

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const uuid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

export interface ImageDetectorOptions {
  modelId?: string;
  threshold?: number;
  runtime?: RuntimeTarget;
  loader?: ModelLoader;
  provenance?: boolean;
}

export class ImageDetectorAdapter {
  private session: any = null;
  private modelEntry: ModelEntry;
  private runtime: string;
  private loader: ModelLoader;
  private isColdStart = true;
  private isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

  constructor(options: ImageDetectorOptions = {}) {
    this.runtime = options.runtime || (this.isNode ? 'node-cpu' : 'wasm');
    this.loader = options.loader || new ModelLoader();
    this.modelEntry = options.modelId
      ? getModelEntry(options.modelId)
      : getDefaultModelForProfile('image', 'fast', this.runtime as any);
  }

  /**
   * Lazily loads the model session if not already initialized.
   */
  public async initSession(customBuffer?: ArrayBuffer): Promise<void> {
    if (this.session) return;

    let buffer = customBuffer;
    if (!buffer) {
      buffer = await this.loader.loadModelBuffer(this.modelEntry);
    }

    if (this.isNode) {
      const ort = await import('onnxruntime-node');
      this.session = await ort.InferenceSession.create(Buffer.from(buffer));
    } else {
      const ort = await import('onnxruntime-web');
      const eps = this.runtime === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];
      this.session = await ort.InferenceSession.create(buffer, { executionProviders: eps });
    }
  }

  /**
   * Runs the complete image detection pipeline according to the spec:
   * 1. C2PA provenance analysis
   * 2. Shortest-edge resize & center-crop (384x384)
   * 3. ONNX inference (Sieve/WaterSpy)
   * 4. Platt calibration & evidence structure
   */
  public async detect(
    input: ImageInput,
    options: { threshold?: number; provenance?: boolean } = {}
  ): Promise<ImageDetectionResult> {
    const startTime = now();
    const threshold = options.threshold ?? this.modelEntry.threshold ?? 0.65;
    const resultId = uuid();
    const checkProvenance = options.provenance !== false;

    try {
      // 1. Provenance extraction
      let provenanceResult: import('./types').ProvenanceResult = { status: 'none' };
      if (checkProvenance) {
        provenanceResult = await extractProvenance(input);
      }

      // 2. Ensure model session is initialized
      const coldStart = this.isColdStart;
      await this.initSession();
      this.isColdStart = false;

      // 3. Preprocessing with manifest parameters (e.g. 384x384, 440 resize for Sieve)
      const inputCfg = (this.modelEntry.input as ImageInputConfig) || {
        width: 384,
        height: 384,
        channels: 3,
        layout: 'NCHW',
        resizeShorterSide: 440,
        mean: [0.485, 0.456, 0.406],
        std: [0.229, 0.224, 0.225]
      };

      const preprocStart = now();
      const tensorData = await preprocessImage(input, {
        targetSize: [inputCfg.width, inputCfg.height],
        resizeShorterSide: inputCfg.resizeShorterSide,
        mean: inputCfg.mean as [number, number, number],
        std: inputCfg.std as [number, number, number]
      });
      const preprocEnd = now();

      // 4. ONNX Model Inference
      const ort = this.isNode ? await import('onnxruntime-node') : await import('onnxruntime-web');
      const inputName = this.session.inputNames[0];
      const tensor = new ort.Tensor('float32', tensorData, [1, 3, inputCfg.height, inputCfg.width]);

      const inferStart = now();
      const results = await this.session.run({ [inputName]: tensor });
      const inferEnd = now();

      // 5. Activation & Calibration
      const outputName = this.session.outputNames[0];
      const outputTensor = results[outputName];
      const logits = outputTensor.data as Float32Array;
      const rawLogit = logits[0];

      // Calibrate logit via Platt scaling
      const probability = calibrateLogit(rawLogit, {
        method: this.modelEntry.calibration?.method || 'platt',
        a: this.modelEntry.calibration?.a ?? 1.0,
        b: this.modelEntry.calibration?.b ?? 0.0
      });

      // If cryptographically validated AI provenance is confirmed, reinforce verdict
      let verdict = determineVerdict(probability, threshold);
      if (provenanceResult.status === 'validated_ai') {
        verdict = 'likely_ai';
      }

      const endTime = now();

      return {
        id: resultId,
        modality: 'image',
        status: 'ok',
        verdict,
        score: rawLogit,
        probability,
        confidence: probability,
        thresholdUsed: threshold,
        provenance: provenanceResult,
        evidence: {
          pixelModel: probability,
          c2pa: provenanceResult.status,
          metadataHints: provenanceResult.source ? [{ type: 'source', value: provenanceResult.source }] : []
        },
        model: {
          id: this.modelEntry.id,
          revision: this.modelEntry.revision,
          runtime: this.runtime
        },
        timing: {
          startTime,
          endTime,
          totalMs: endTime - startTime,
          preprocessingMs: preprocEnd - preprocStart,
          inferenceMs: inferEnd - inferStart,
          coldStart
        }
      };
    } catch (err: any) {
      const endTime = now();
      return {
        id: resultId,
        modality: 'image',
        status: 'inference_error',
        verdict: 'uncertain',
        score: 0,
        confidence: 0,
        thresholdUsed: threshold,
        provenance: { status: 'invalid' },
        evidence: {
          pixelModel: 0,
          c2pa: 'invalid',
          metadataHints: []
        },
        model: {
          id: this.modelEntry.id,
          revision: this.modelEntry.revision,
          runtime: this.runtime
        },
        error: err.message || 'Unknown image inference error',
        timing: {
          startTime,
          endTime,
          totalMs: endTime - startTime,
          coldStart: false
        }
      };
    }
  }
}
