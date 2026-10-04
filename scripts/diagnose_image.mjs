import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

const MODEL_PATH = path.join(process.env.USERPROFILE, '.cache', 'ai-detector', 'ai-detector-models-v1', 'image.sieve.ft1.int8.onnx');
const TEST_IMAGE_PATH = path.join(process.env.USERPROFILE, 'Downloads', '1000313211.jpg');

async function run() {
  console.log('Model exists:', fs.existsSync(MODEL_PATH));
  console.log('Image exists:', fs.existsSync(TEST_IMAGE_PATH));

  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    console.error('Test image not found at', TEST_IMAGE_PATH);
    return;
  }

  const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
  const metadata = await sharp(imageBuffer).metadata();
  console.log('Image Metadata:', {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    space: metadata.space
  });

  const session = await ort.InferenceSession.create(MODEL_PATH);
  console.log('Session inputs:', session.inputNames);
  console.log('Session outputs:', session.outputNames);

  // METHOD 1: CURRENT CODE (mean=0.5, std=0.5, direct 384x384 cover)
  {
    const rawRgb = await sharp(imageBuffer)
      .resize(384, 384, { fit: 'cover', position: 'centre' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const tensorData = new Float32Array(3 * 384 * 384);
    const numPixels = 384 * 384;
    for (let i = 0; i < numPixels; i++) {
      const r = rawRgb[i * 3 + 0] / 255.0;
      const g = rawRgb[i * 3 + 1] / 255.0;
      const b = rawRgb[i * 3 + 2] / 255.0;
      tensorData[i] = (r - 0.5) / 0.5;
      tensorData[numPixels + i] = (g - 0.5) / 0.5;
      tensorData[2 * numPixels + i] = (b - 0.5) / 0.5;
    }

    const tensor = new ort.Tensor('float32', tensorData, [1, 3, 384, 384]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const logits = results[session.outputNames[0]].data;
    const rawLogit = logits[0];
    const prob = 1 / (1 + Math.exp(-rawLogit));
    console.log('\n--- METHOD 1 (Current Code: mean=0.5, std=0.5, direct 384 cover) ---');
    console.log('Raw logit:', rawLogit);
    console.log('Sigmoid probability:', prob);
    console.log('Percentage:', (prob * 100).toFixed(2) + '%');
  }

  // METHOD 2: ImageNet Norm with sharp cover 384x384
  {
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const rawRgb = await sharp(imageBuffer)
      .resize(384, 384, { fit: 'cover', position: 'centre' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const tensorData = new Float32Array(3 * 384 * 384);
    const numPixels = 384 * 384;
    for (let i = 0; i < numPixels; i++) {
      const r = rawRgb[i * 3 + 0] / 255.0;
      const g = rawRgb[i * 3 + 1] / 255.0;
      const b = rawRgb[i * 3 + 2] / 255.0;
      tensorData[i] = (r - mean[0]) / std[0];
      tensorData[numPixels + i] = (g - mean[1]) / std[1];
      tensorData[2 * numPixels + i] = (b - mean[2]) / std[2];
    }

    const tensor = new ort.Tensor('float32', tensorData, [1, 3, 384, 384]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const logits = results[session.outputNames[0]].data;
    const rawLogit = logits[0];
    const prob = 1 / (1 + Math.exp(-rawLogit));
    console.log('\n--- METHOD 2 (ImageNet Norm, direct 384 cover) ---');
    console.log('Raw logit:', rawLogit);
    console.log('Sigmoid probability:', prob);
    console.log('Percentage:', (prob * 100).toFixed(2) + '%');
  }

  // METHOD 3: Sieve upstream specification (ImageNet Norm, resize shorter side 440, center crop 384)
  {
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const w = metadata.width;
    const h = metadata.height;
    const scale = 440 / Math.min(w, h);
    const rw = Math.max(384, Math.round(w * scale));
    const rh = Math.max(384, Math.round(h * scale));
    const left = Math.floor((rw - 384) / 2);
    const top = Math.floor((rh - 384) / 2);

    // Sharp resize shorter side 440, center crop 384
    const rawRgb = await sharp(imageBuffer)
      .resize(rw, rh)
      .extract({ left, top, width: 384, height: 384 })
      .removeAlpha()
      .raw()
      .toBuffer();

    const tensorData = new Float32Array(3 * 384 * 384);
    const numPixels = 384 * 384;
    for (let i = 0; i < numPixels; i++) {
      const r = rawRgb[i * 3 + 0] / 255.0;
      const g = rawRgb[i * 3 + 1] / 255.0;
      const b = rawRgb[i * 3 + 2] / 255.0;
      tensorData[i] = (r - mean[0]) / std[0];
      tensorData[numPixels + i] = (g - mean[1]) / std[1];
      tensorData[2 * numPixels + i] = (b - mean[2]) / std[2];
    }

    const tensor = new ort.Tensor('float32', tensorData, [1, 3, 384, 384]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const logits = results[session.outputNames[0]].data;
    const rawLogit = logits[0];
    const zCalib = rawLogit + 0.2;
    const probRaw = 1 / (1 + Math.exp(-rawLogit));
    const probCalib = 1 / (1 + Math.exp(-zCalib));
    console.log('\n--- METHOD 3 (Sharp: ImageNet norm, resize shorter side 440, center crop 384) ---');
    console.log('Raw logit:', rawLogit);
    console.log('Raw Sigmoid probability:', probRaw, `(${(probRaw * 100).toFixed(2)}%)`);
    console.log('Calibrated Sigmoid (+0.2):', probCalib, `(${(probCalib * 100).toFixed(2)}%)`);
  }

  // METHOD 4: Exact resamplePIL from Sieve upstream
  {
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const { data: rawRgba, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    function resamplePIL(src, dw, dh) {
      const pass = (data, sw, sh, dsize, horizontal) => {
        const srcSize = horizontal ? sw : sh;
        const scale = srcSize / dsize;
        const filterscale = Math.max(scale, 1.0);
        const support = filterscale;
        const ow = horizontal ? dsize : sw;
        const oh = horizontal ? sh : dsize;
        const out = new Float32Array(ow * oh * 4);
        const bounds = [];
        for (let i = 0; i < dsize; i++) {
          const center = (i + 0.5) * scale;
          const lo = Math.max(0, Math.floor(center - support));
          const hi = Math.min(srcSize, Math.ceil(center + support));
          const w = new Float32Array(hi - lo);
          let sum = 0;
          for (let k = lo; k < hi; k++) {
            const t = Math.abs((k + 0.5 - center) / filterscale);
            const v = t < 1 ? 1 - t : 0;
            w[k - lo] = v;
            sum += v;
          }
          if (sum > 0) for (let k = 0; k < w.length; k++) w[k] /= sum;
          bounds.push([lo, w]);
        }
        for (let y = 0; y < oh; y++) {
          for (let x = 0; x < ow; x++) {
            const [lo, w] = bounds[horizontal ? x : y];
            let r = 0, g = 0, b = 0;
            for (let k = 0; k < w.length; k++) {
              const j = horizontal ? (y * sw + lo + k) * 4 : ((lo + k) * sw + x) * 4;
              r += data[j] * w[k];
              g += data[j + 1] * w[k];
              b += data[j + 2] * w[k];
            }
            const o = (y * ow + x) * 4;
            out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
          }
        }
        return out;
      };
      let d = pass(src.data, src.width, src.height, dw, true);
      d = pass(d, dw, src.height, dh, false);
      const clamped = new Uint8ClampedArray(dw * dh * 4);
      for (let i = 0; i < d.length; i++) clamped[i] = Math.round(d[i]);
      return { data: clamped, width: dw, height: dh };
    }

    function cropRGBA(src, x0, y0, C) {
      const out = new Uint8ClampedArray(C * C * 4);
      for (let y = 0; y < C; y++) {
        const s = ((y0 + y) * src.width + x0) * 4;
        out.set(src.data.subarray(s, s + C * 4), y * C * 4);
      }
      return out;
    }

    const w = info.width;
    const h = info.height;
    const S = 440;
    const C = 384;
    const scale = S / Math.min(w, h);
    const rw = Math.max(C, Math.round(w * scale));
    const rh = Math.max(C, Math.round(h * scale));
    const resized = resamplePIL({ data: rawRgba, width: w, height: h }, rw, rh);
    const cropped = cropRGBA(resized, Math.floor((rw - C) / 2), Math.floor((rh - C) / 2), C);

    const tensorData = new Float32Array(3 * C * C);
    for (let i = 0; i < C * C; i++) {
      const j = i * 4;
      tensorData[i] = (cropped[j] / 255.0 - mean[0]) / std[0];
      tensorData[C * C + i] = (cropped[j + 1] / 255.0 - mean[1]) / std[1];
      tensorData[2 * C * C + i] = (cropped[j + 2] / 255.0 - mean[2]) / std[2];
    }

    const tensor = new ort.Tensor('float32', tensorData, [1, 3, C, C]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const logits = results[session.outputNames[0]].data;
    const rawLogit = logits[0];
    const zCalib = rawLogit + 0.2;
    const probRaw = 1 / (1 + Math.exp(-rawLogit));
    const probCalib = 1 / (1 + Math.exp(-zCalib));
    console.log('\n--- METHOD 4 (Sieve exact resamplePIL: ImageNet norm, 440 resize, 384 crop) ---');
    console.log('Raw logit:', rawLogit);
    console.log('Raw Sigmoid probability:', probRaw, `(${(probRaw * 100).toFixed(2)}%)`);
    console.log('Calibrated Sigmoid (+0.2):', probCalib, `(${(probCalib * 100).toFixed(2)}%)`);
  }

  // METHOD 5: Native-crop (no resampling) and TTA (Test-Time Augmentation)
  {
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const C = 384;
    const w = metadata.width;
    const h = metadata.height;
    const left = Math.floor((w - C) / 2);
    const top = Math.floor((h - C) / 2);

    const rawRgb = await sharp(imageBuffer)
      .extract({ left, top, width: C, height: C })
      .removeAlpha()
      .raw()
      .toBuffer();

    const tensorData = new Float32Array(3 * C * C);
    for (let i = 0; i < C * C; i++) {
      const r = rawRgb[i * 3 + 0] / 255.0;
      const g = rawRgb[i * 3 + 1] / 255.0;
      const b = rawRgb[i * 3 + 2] / 255.0;
      tensorData[i] = (r - mean[0]) / std[0];
      tensorData[C * C + i] = (g - mean[1]) / std[1];
      tensorData[2 * C * C + i] = (b - mean[2]) / std[2];
    }

    const tensor = new ort.Tensor('float32', tensorData, [1, 3, C, C]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const logits = results[session.outputNames[0]].data;
    const rawLogit = logits[0];
    const probRaw = 1 / (1 + Math.exp(-rawLogit));
    console.log('\n--- METHOD 5 (Native Crop: no downsampling, original camera pixels) ---');
    console.log('Native raw logit:', rawLogit);
    console.log('Native Sigmoid probability:', probRaw, `(${(probRaw * 100).toFixed(2)}%)`);

    // TTA combination: average standard view logit (from Method 3) and native view logit
    const zStd = 0.300876;
    const zTTA = (zStd + rawLogit) / 2;
    const probTTA = 1 / (1 + Math.exp(-(zTTA + 0.2)));
    console.log('Combined TTA logit:', zTTA);
    console.log('Combined TTA probability (+0.2):', probTTA, `(${(probTTA * 100).toFixed(2)}%)`);
  }
}

run().catch(console.error);
