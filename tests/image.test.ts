import { describe, it, expect } from 'vitest';
import { preprocessImage } from '../src/image/preprocessor';
import { extractProvenance } from '../src/image/provenance';
import sharp from 'sharp';

describe('Image Preprocessing & Provenance', () => {
  it('preprocesses an image buffer into 384x384 NCHW Float32 tensor via sharp', async () => {
    // Generate a simple 100x200 test JPEG using sharp
    const testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 200,
        channels: 3,
        background: { r: 128, g: 128, b: 128 }
      }
    }).jpeg().toBuffer();

    const tensor = await preprocessImage(testImageBuffer, {
      targetSize: [384, 384],
      mean: [0.5, 0.5, 0.5],
      std: [0.5, 0.5, 0.5]
    });

    expect(tensor).toBeInstanceOf(Float32Array);
    // [1, 3, 384, 384] = 3 * 384 * 384 = 442,368 elements
    expect(tensor.length).toBe(3 * 384 * 384);
  });

  it('extractProvenance returns status none for clean images', async () => {
    const cleanImageBuffer = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toBuffer();

    const result = await extractProvenance(cleanImageBuffer);
    expect(result.status).toMatch(/none|present_unknown/);
  });
});