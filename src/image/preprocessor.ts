import { ImageInput } from './types';

export interface PreprocessOptions {
  targetSize?: [number, number]; // default [384, 384] for Sieve
  resizeShorterSide?: number;    // default 440 for Sieve/CommunityForensics
  mean?: [number, number, number]; // default [0.485, 0.456, 0.406] (ImageNet)
  std?: [number, number, number];  // default [0.229, 0.224, 0.225] (ImageNet)
}

/**
 * Preprocesses an image for AI detection:
 * - Decodes image safely in both Node.js (via sharp) and Browser (via Canvas / ImageBitmap)
 * - Scales shortest edge to resizeShorterSide (e.g. 440) and center-crops targetSize (384x384)
 * - Normalizes pixel values to NCHW Float32Array [1, 3, height, width] with ImageNet statistics
 */
export async function preprocessImage(
  input: ImageInput,
  options: PreprocessOptions = {}
): Promise<Float32Array> {
  const [width, height] = options.targetSize ?? [384, 384];
  const mean = options.mean ?? [0.485, 0.456, 0.406];
  const std = options.std ?? [0.229, 0.224, 0.225];
  const numPixels = width * height;
  const tensor = new Float32Array(3 * numPixels);
  const rOffset = 0;
  const gOffset = numPixels;
  const bOffset = 2 * numPixels;

  // 1. NODE.JS EXECUTION PATH (Using sharp)
  const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
  if (isNode) {
    try {
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default || sharpModule;

      let buffer: Buffer;
      if (typeof input === 'string') {
        buffer = await import('fs/promises').then(fs => fs.readFile(input));
      } else if (input instanceof Uint8Array) {
        buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
      } else if (input instanceof ArrayBuffer) {
        buffer = Buffer.from(input);
      } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
        buffer = Buffer.from(await input.arrayBuffer());
      } else {
        throw new Error('Unsupported image input type for Node environment.');
      }

      let rawRgb: Buffer;
      if (options.resizeShorterSide) {
        const meta = await sharp(buffer).metadata();
        const srcW = meta.width || width;
        const srcH = meta.height || height;
        const scale = options.resizeShorterSide / Math.min(srcW, srcH);
        const rw = Math.max(width, Math.round(srcW * scale));
        const rh = Math.max(height, Math.round(srcH * scale));
        const left = Math.floor((rw - width) / 2);
        const top = Math.floor((rh - height) / 2);

        rawRgb = await sharp(buffer)
          .resize(rw, rh)
          .extract({ left, top, width, height })
          .removeAlpha()
          .raw()
          .toBuffer();
      } else {
        rawRgb = await sharp(buffer)
          .resize(width, height, { fit: 'cover', position: 'centre' })
          .removeAlpha()
          .raw()
          .toBuffer();
      }

      for (let i = 0; i < numPixels; i++) {
        const r = rawRgb[i * 3 + 0] / 255.0;
        const g = rawRgb[i * 3 + 1] / 255.0;
        const b = rawRgb[i * 3 + 2] / 255.0;
        tensor[rOffset + i] = (r - mean[0]) / std[0];
        tensor[gOffset + i] = (g - mean[1]) / std[1];
        tensor[bOffset + i] = (b - mean[2]) / std[2];
      }

      return tensor;
    } catch (err: any) {
      if (!isNode) {
        // Fall through to browser logic if sharp fails outside of true node
      } else {
        throw new Error(`Node.js image preprocessing failed: ${err.message}`);
      }
    }
  }

  // 2. BROWSER EXECUTION PATH (Using OffscreenCanvas / HTMLCanvasElement)
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  } else {
    throw new Error('No Canvas API or sharp available in this execution environment.');
  }

  if (!ctx) {
    throw new Error('Failed to acquire 2D rendering context.');
  }

  let imageSource: CanvasImageSource;
  let srcWidth = width;
  let srcHeight = height;

  if (typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement) {
    imageSource = input;
    srcWidth = input.naturalWidth || input.width;
    srcHeight = input.naturalHeight || input.height;
  } else if (typeof ImageBitmap !== 'undefined' && input instanceof ImageBitmap) {
    imageSource = input;
    srcWidth = input.width;
    srcHeight = input.height;
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    if (typeof createImageBitmap !== 'undefined') {
      const bitmap = await createImageBitmap(input);
      imageSource = bitmap;
      srcWidth = bitmap.width;
      srcHeight = bitmap.height;
    } else {
      throw new Error('createImageBitmap API is required for Blob inputs in browser.');
    }
  } else if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    if (typeof Blob !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      const blob = new Blob([input as BlobPart]);
      const bitmap = await createImageBitmap(blob);
      imageSource = bitmap;
      srcWidth = bitmap.width;
      srcHeight = bitmap.height;
    } else {
      throw new Error('Blob / createImageBitmap API is required for raw buffer input in browser.');
    }
  } else {
    throw new Error('Unsupported ImageInput type in browser environment.');
  }

  // Calculate shortest-edge scale and center crop
  let scaledW: number;
  let scaledH: number;
  if (options.resizeShorterSide) {
    const scale = options.resizeShorterSide / Math.min(srcWidth, srcHeight);
    scaledW = Math.max(width, Math.round(srcWidth * scale));
    scaledH = Math.max(height, Math.round(srcHeight * scale));
  } else {
    const scale = Math.max(width / srcWidth, height / srcHeight);
    scaledW = Math.round(srcWidth * scale);
    scaledH = Math.round(srcHeight * scale);
  }
  const offsetX = Math.floor((scaledW - width) / 2);
  const offsetY = Math.floor((scaledH - height) / 2);

  ctx.drawImage(imageSource, -offsetX, -offsetY, scaledW, scaledH);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < numPixels; i++) {
    const r = data[i * 4 + 0] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;
    tensor[rOffset + i] = (r - mean[0]) / std[0];
    tensor[gOffset + i] = (g - mean[1]) / std[1];
    tensor[bOffset + i] = (b - mean[2]) / std[2];
  }

  return tensor;
}
