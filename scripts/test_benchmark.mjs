import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

const MODEL_PATH = path.join(process.env.USERPROFILE, '.cache', 'ai-detector', 'ai-detector-models-v1', 'image.sieve.ft1.int8.onnx');
const SAMPLES_DIR = path.join('scripts', 'samples');

if (!fs.existsSync(SAMPLES_DIR)) {
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });
}

async function fetchSamplesList() {
  const res = await fetch('https://api.github.com/repos/Phineas1500/sieve-ai-image-detector/contents/eval/e2e/sample_images', {
    headers: { 'User-Agent': 'Node' }
  });
  const data = await res.json();
  if (Array.isArray(data)) {
    return data.filter(item => item.download_url && /\.(jpg|jpeg|png|webp)$/i.test(item.name));
  }
  return [];
}

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) return;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

// Upstream preprocessing:
// 1. resize shorter side to 440
// 2. center crop 384x384
// 3. ImageNet norm: mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
async function preprocessUpstream(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const w = metadata.width;
  const h = metadata.height;
  const S = 440;
  const C = 384;
  const scale = S / Math.min(w, h);
  const rw = Math.max(C, Math.round(w * scale));
  const rh = Math.max(C, Math.round(h * scale));
  const left = Math.floor((rw - C) / 2);
  const top = Math.floor((rh - C) / 2);

  const rawRgb = await sharp(imageBuffer)
    .resize(rw, rh)
    .extract({ left, top, width: C, height: C })
    .removeAlpha()
    .raw()
    .toBuffer();

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const tensorData = new Float32Array(3 * C * C);
  for (let i = 0; i < C * C; i++) {
    const r = rawRgb[i * 3 + 0] / 255.0;
    const g = rawRgb[i * 3 + 1] / 255.0;
    const b = rawRgb[i * 3 + 2] / 255.0;
    tensorData[i] = (r - mean[0]) / std[0];
    tensorData[C * C + i] = (g - mean[1]) / std[1];
    tensorData[2 * C * C + i] = (b - mean[2]) / std[2];
  }

  return new ort.Tensor('float32', tensorData, [1, 3, C, C]);
}

// Current implementation preprocessing:
// mean=0.5, std=0.5, direct 384 cover
async function preprocessCurrent(imageBuffer) {
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

  return new ort.Tensor('float32', tensorData, [1, 3, 384, 384]);
}

async function run() {
  const session = await ort.InferenceSession.create(MODEL_PATH);
  console.log('Fetching sample images from Sieve upstream repository...');
  const samples = await fetchSamplesList();
  console.log(`Found ${samples.length} sample images:`, samples.map(s => s.name));

  for (const sample of samples) {
    const filePath = path.join(SAMPLES_DIR, sample.name);
    await downloadFile(sample.download_url, filePath);
    const buf = fs.readFileSync(filePath);

    // Run Current Preprocessing
    const tensorOld = await preprocessCurrent(buf);
    const resOld = await session.run({ [session.inputNames[0]]: tensorOld });
    const logitOld = resOld[session.outputNames[0]].data[0];
    const probOld = 1 / (1 + Math.exp(-logitOld));

    // Run Upstream Preprocessing
    const tensorNew = await preprocessUpstream(buf);
    const resNew = await session.run({ [session.inputNames[0]]: tensorNew });
    const logitNew = resNew[session.outputNames[0]].data[0];
    const probNew = 1 / (1 + Math.exp(-(logitNew + 0.2)));

    console.log(`\nSample: ${sample.name}`);
    console.log(`  OLD Preprocessing (mean 0.5, std 0.5): logit = ${logitOld.toFixed(3)}, P(AI) = ${(probOld * 100).toFixed(1)}%`);
    console.log(`  NEW Preprocessing (ImageNet, 440->384): logit = ${logitNew.toFixed(3)}, P(AI) = ${(probNew * 100).toFixed(1)}%`);
  }
}

run().catch(console.error);
