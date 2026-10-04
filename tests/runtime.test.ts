import { describe, it, expect } from 'vitest';
import { detectBestRuntime } from '../src/runtime/detectRuntime';
import { verifyModelIntegrity } from '../src/core/integrity';
import { ModelCache } from '../src/core/cache';

describe('Runtime & Integrity System', () => {
  it('detects Node.js runtime environment correctly', async () => {
    const runtime = await detectBestRuntime();
    expect(runtime).toBe('node-cpu');
  });

  it('computes SHA-256 and detects integrity tampering', async () => {
    const originalText = 'ai-content-detector-model-payload-v1';
    const encoder = new TextEncoder();
    const originalBuffer = encoder.encode(originalText);

    // Compute expected hash using crypto
    const cryptoModule = await import('crypto');
    const expectedHash = cryptoModule.createHash('sha256').update(originalBuffer).digest('hex');

    const isValid = await verifyModelIntegrity(originalBuffer.buffer, expectedHash);
    expect(isValid).toBe(true);

    // Tampered buffer
    const tamperedBuffer = encoder.encode('tampered-payload');
    const isTamperedValid = await verifyModelIntegrity(tamperedBuffer.buffer, expectedHash);
    expect(isTamperedValid).toBe(false);
  });

  it('stores and retrieves model buffers from ModelCache', async () => {
    const cache = new ModelCache('test-cache');
    const dummyBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;

    await cache.putModel('test-model-1', dummyBuffer);
    const retrieved = await cache.getModel('test-model-1');

    expect(retrieved).not.toBeNull();
    expect(new Uint8Array(retrieved!)).toEqual(new Uint8Array(dummyBuffer));

    await cache.clearCache();
  });
});