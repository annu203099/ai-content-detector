import { TextInput, TextDetectionResult, ChunkScore } from './types';
import { Tokenizer } from './tokenizer';
import { chunkText } from './chunker';
import { calculatePerplexity, calculateBurstiness } from './metrics';
import { ModelLoader } from '../core/loader';
import { getDefaultModelForProfile, getModelEntry, ModelEntry } from '../core/manifest';
import { calibrateLogit, determineVerdict } from '../core/calibration';
import { RuntimeTarget } from '../core/types';

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const uuid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

export interface TextDetectorOptions {
  modelId?: string;
  threshold?: number;
  runtime?: RuntimeTarget;
  loader?: ModelLoader;
}

export class TextDetectorAdapter {
  private session: any = null;
  private tokenizer: Tokenizer;
  private modelEntry: ModelEntry;
  private runtime: string;
  private loader: ModelLoader;
  private isColdStart = true;
  private isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

  constructor(options: TextDetectorOptions = {}) {
    this.runtime = options.runtime || (this.isNode ? 'node-cpu' : 'wasm');
    this.loader = options.loader || new ModelLoader();
    this.modelEntry = options.modelId
      ? getModelEntry(options.modelId)
      : getDefaultModelForProfile('text', 'fast', this.runtime as any);
    this.tokenizer = new Tokenizer();
  }

  /**
   * Lazily loads tokenizer and model session.
   */
  public async initSession(customBuffer?: ArrayBuffer): Promise<void> {
    await this.tokenizer.load();
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

  public async detect(
    input: TextInput,
    options: { threshold?: number } = {}
  ): Promise<TextDetectionResult> {
    const startTime = now();
    const threshold = options.threshold ?? this.modelEntry.threshold ?? 0.5;
    const resultId = uuid();
    const rawText = typeof input === 'string' ? input : String(input || '');

    // 1. Diagnostics & stats
    const diagnostics = this.tokenizer.inspectDiagnostics(rawText);
    const words = rawText.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const charCount = rawText.length;
    const shortInput = wordCount < 50;

    if (shortInput && !diagnostics.warning) {
      diagnostics.warning = 'Input under 50 words: statistical confidence is constrained; score is best-effort.';
    }

    try {
      const coldStart = this.isColdStart;
      await this.initSession();
      this.isColdStart = false;

      // 2. Statistical heuristics (perplexity proxy and burstiness)
      const tokenList = this.tokenizer.tokenize(rawText);
      const perplexity = calculatePerplexity(tokenList);
      const burstiness = calculateBurstiness(rawText);

      // 3. Segment into overlapping chunks
      const preprocStart = now();
      const chunks = chunkText(rawText, 400, 50);
      const preprocEnd = now();

      const ort = this.isNode ? await import('onnxruntime-node') : await import('onnxruntime-web');
      const inputName = this.session.inputNames[0];
      const maskName = this.session.inputNames.length > 1 ? this.session.inputNames[1] : null;

      const chunkScores: ChunkScore[] = [];
      const inferStart = now();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const { input_ids, attention_mask } = this.tokenizer.encode(chunk.text, 512);

        const inputTensor = new ort.Tensor('int64', BigInt64Array.from(input_ids, x => BigInt(x)), [1, 512]);
        const feeds: Record<string, any> = { [inputName]: inputTensor };

        if (maskName) {
          feeds[maskName] = new ort.Tensor('int64', BigInt64Array.from(attention_mask, x => BigInt(x)), [1, 512]);
        }

        const results = await this.session.run(feeds);
        const outputName = this.session.outputNames[0];
        const logits = results[outputName].data as Float32Array;

        // Activation / calibration for chunk
        let rawChunkScore = 0.5;
        if (logits.length >= 2) {
          const maxLogit = Math.max(logits[0], logits[1]);
          const exp0 = Math.exp(logits[0] - maxLogit);
          const exp1 = Math.exp(logits[1] - maxLogit);
          rawChunkScore = exp1 / (exp0 + exp1); // index 1 is AI class
        } else {
          rawChunkScore = calibrateLogit(logits[0], {
            method: this.modelEntry.calibration?.method || 'temperature',
            temperature: this.modelEntry.calibration?.temperature ?? 1.0
          });
        }

        chunkScores.push({
          chunkIndex: i,
          score: rawChunkScore,
          start: chunk.start,
          end: chunk.end,
          text: chunk.text
        });
      }
      const inferEnd = now();

      // 4. Robust aggregation (Median + 75th percentile blend)
      const sortedScores = chunkScores.map(c => c.score).sort((a, b) => a - b);
      const mid = Math.floor(sortedScores.length / 2);
      const medianScore = sortedScores.length % 2 !== 0
        ? sortedScores[mid]
        : (sortedScores[mid - 1] + sortedScores[mid]) / 2;

      const p75Index = Math.min(sortedScores.length - 1, Math.floor(sortedScores.length * 0.75));
      const p75Score = sortedScores[p75Index];

      let rawProbability = 0.5 * medianScore + 0.5 * p75Score;

      // 5. Short-text adjustment per grill-me decision
      let confidence = rawProbability;
      if (shortInput) {
        // Downscale confidence toward neutral 0.5 for very short snippets
        confidence = 0.5 + (rawProbability - 0.5) * 0.65;
      }

      const verdict = determineVerdict(confidence, threshold);
      const endTime = now();

      return {
        id: resultId,
        modality: 'text',
        status: 'ok',
        verdict,
        score: rawProbability,
        probability: rawProbability,
        confidence,
        thresholdUsed: threshold,
        input: {
          words: wordCount,
          characters: charCount,
          tokens: tokenList.length,
          shortInput
        },
        diagnostics,
        segments: chunkScores.map(c => ({
          start: c.start || 0,
          end: c.end || 0,
          score: c.score,
          text: c.text
        })),
        perplexity,
        burstiness,
        model: {
          id: this.modelEntry.id,
          revision: this.modelEntry.revision,
          runtime: this.runtime
        },
        timing: {
          startTime,
          endTime,
          totalMs: endTime - startTime,
          tokenizationMs: preprocEnd - preprocStart,
          inferenceMs: inferEnd - inferStart,
          coldStart
        }
      };
    } catch (err: any) {
      const endTime = now();
      return {
        id: resultId,
        modality: 'text',
        status: 'inference_error',
        verdict: 'uncertain',
        score: 0,
        confidence: 0,
        thresholdUsed: threshold,
        input: {
          words: wordCount,
          characters: charCount,
          shortInput
        },
        diagnostics,
        segments: [],
        model: {
          id: this.modelEntry.id,
          revision: this.modelEntry.revision,
          runtime: this.runtime
        },
        error: err.message || 'Unknown text inference error',
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
