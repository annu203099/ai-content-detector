import { Verdict } from './types';

export interface CalibrationOptions {
  method?: 'platt' | 'temperature';
  a?: number;
  b?: number;
  temperature?: number;
  threshold?: number;
  uncertaintyBand?: number; // e.g. 0.05 around threshold
}

/**
 * Calibrates raw model logit into a well-calibrated posterior probability P(AI).
 */
export function calibrateLogit(
  logit: number,
  options: CalibrationOptions = {}
): number {
  const method = options.method || 'platt';

  if (method === 'temperature') {
    const temp = options.temperature && options.temperature > 0 ? options.temperature : 1.0;
    const scaled = logit / temp;
    return 1.0 / (1.0 + Math.exp(-scaled));
  }

  // Platt scaling: P = 1 / (1 + exp(-(a * logit + b)))
  const a = options.a ?? 1.0;
  const b = options.b ?? 0.0;
  const scaled = a * logit + b;
  return 1.0 / (1.0 + Math.exp(-scaled));
}

/**
 * Softmax with temperature scaling for multi-class logits.
 * Assuming targetIndex is the AI class index.
 */
export function calibrateSoftmax(
  logits: number[] | Float32Array,
  targetIndex = 1,
  temperature = 1.0
): number {
  if (logits.length === 0) return 0.5;
  if (logits.length === 1) return calibrateLogit(logits[0], { temperature });

  const temp = temperature > 0 ? temperature : 1.0;
  const maxLogit = Math.max(...Array.from(logits));
  
  let sumExp = 0;
  const exps = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp((logits[i] - maxLogit) / temp);
    sumExp += exps[i];
  }

  const targetExp = exps[targetIndex] ?? exps[0];
  return sumExp > 0 ? targetExp / sumExp : 0.5;
}

/**
 * Maps a calibrated probability to a Verdict based on threshold and uncertainty margin.
 */
export function determineVerdict(
  probability: number,
  threshold = 0.65,
  uncertaintyBand = 0.08
): Verdict {
  if (Math.abs(probability - threshold) <= uncertaintyBand) {
    return 'uncertain';
  }
  return probability >= threshold ? 'likely_ai' : 'likely_human';
}
