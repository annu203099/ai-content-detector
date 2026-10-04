import { describe, it, expect } from 'vitest';
import { Tokenizer, chunkText, calculatePerplexity, calculateBurstiness } from '../src/text';

describe('Text Processing & Analytics', () => {
  it('detects and counts invisible zero-width evasion characters', () => {
    const tokenizer = new Tokenizer();
    const sneakyText = 'The\u200B quick\u200C brown\u200D fox\uFEFF jumped.';
    const diagnostics = tokenizer.inspectDiagnostics(sneakyText);

    expect(diagnostics.invisibleCharacters).toBe(4);
    expect(diagnostics.warning).toContain('zero-width');
  });

  it('detects mixed-script homoglyph evasion attempts', () => {
    const tokenizer = new Tokenizer();
    // 'а' is Cyrillic U+0430 inside English word
    const homoglyphText = 'p\u0430ypal account verification';
    const diagnostics = tokenizer.inspectDiagnostics(homoglyphText);

    expect(diagnostics.mixedScriptFlags).toBeGreaterThan(0);
  });

  it('chunks text preserving exact character start and end spans', () => {
    const text = 'First sentence here. Second sentence continues! Third sentence concludes.';
    const chunks = chunkText(text, 5, 2);

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.start).toBeDefined();
      expect(chunk.end).toBeDefined();
      expect(chunk.end).toBeGreaterThan(chunk.start);
      expect(text.substring(chunk.start, chunk.end)).toBe(chunk.text);
    }
  });

  it('calculates perplexity proxy and burstiness metrics', () => {
    const sample = 'A quick movement. An unexpectedly elongated subsequent observation followed by standard text.';
    const tokens = sample.toLowerCase().split(/\s+/);
    const p = calculatePerplexity(tokens);
    const b = calculateBurstiness(sample);

    expect(p).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });
});