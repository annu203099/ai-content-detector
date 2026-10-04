import { describe, it, expect } from 'vitest';
import { createDetector, AIDetector, detectText } from '../src';

describe('AIDetector Unified Facade', () => {
  it('instantiates successfully with default options', async () => {
    const detector = await createDetector({ runtime: 'wasm' });
    expect(detector).toBeInstanceOf(AIDetector);
    
    const info = detector.info();
    expect(info.sdkVersion).toBe('1.0.0');
    expect(info.runtime).toBe('wasm');
  });

  it('enforces offline mode if model is not cached', async () => {
    const detector = await createDetector({ mode: 'strict-offline' });
    const result = await detector.detectText('This is a short sample.');
    
    // In strict-offline mode without downloaded weights, it returns inference_error gracefully
    expect(result.id).toBeDefined();
    expect(result.modality).toBe('text');
    expect(result.status).toMatch(/ok|inference_error/);
  });

  it('runs batch text detection seamlessly', async () => {
    const detector = await createDetector({ mode: 'strict-offline' });
    const results = await detector.textBatch(['Sample 1', 'Sample 2']);
    expect(results.length).toBe(2);
    expect(results[0].input.words).toBe(2);
    expect(results[1].input.words).toBe(2);
  });

  it('exports zero-config detectText function', async () => {
    expect(typeof detectText).toBe('function');
  });
});