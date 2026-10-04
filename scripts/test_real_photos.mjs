import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

const MODEL_PATH = path.join(process.env.USERPROFILE, '.cache', 'ai-detector', 'ai-detector-models-v1', 'image.sieve.ft1.int8.onnx');

// Test URLs of genuine phone/camera photos from Wikimedia Commons
const realPhotos = [
  { name: 'cat_camera.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/800px-Cat03.jpg' },
  { name: 'street_camera.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg/800px-Good_Food_Display_-_NCI_Visuals_Online.jpg' },
  { name: 'landscape_camera.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Altja_j%C3%B5gi_Lahemaal.jpg/800px-Altja_j%C3%B5gi_Lahemaal.jpg' },
  { name: 'portrait_camera.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Shakespeare.jpg/480px-Shakespeare.jpg' }
];

async function run() {
  const session = await ort.InferenceSession.create(MODEL_PATH);
  for (const p of realPhotos) {
    const dest = path.join('scripts', 'samples', p.name);
    if (!fs.existsSync(dest)) {
      const res = await fetch(p.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    }
    const buf = fs.readFileSync(dest);
    const meta = await sharp(buf).metadata();

    // 1. OLD
    const oldRgb = await sharp(buf).resize(384, 384, { fit: 'cover' }).removeAlpha().raw().toBuffer();
    const oldTensor = new Float32Array(3 * 384 * 384);
    for (let i = 0; i < 384 * 384; i++) {
      oldTensor[i] = (oldRgb[i * 3 + 0] / 255 - 0.5) / 0.5;
      oldTensor[384 * 384 + i] = (oldRgb[i * 3 + 1] / 255 - 0.5) / 0.5;
      oldTensor[2 * 384 * 384 + i] = (oldRgb[i * 3 + 2] / 255 - 0.5) / 0.5;
    }
    const resOld = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', oldTensor, [1, 3, 384, 384]) });
    const logitOld = resOld[session.outputNames[0]].data[0];
    const pOld = 1 / (1 + Math.exp(-logitOld));

    // 2. NEW
    const S = 440, C = 384;
    const scale = S / Math.min(meta.width, meta.height);
    const rw = Math.max(C, Math.round(meta.width * scale));
    const rh = Math.max(C, Math.round(meta.height * scale));
    const left = Math.floor((rw - C) / 2);
    const top = Math.floor((rh - C) / 2);

    const newRgb = await sharp(buf)
      .resize(rw, rh)
      .extract({ left, top, width: C, height: C })
      .removeAlpha()
      .raw()
      .toBuffer();

    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const newTensor = new Float32Array(3 * C * C);
    for (let i = 0; i < C * C; i++) {
      newTensor[i] = (newRgb[i * 3 + 0] / 255 - mean[0]) / std[0];
      newTensor[C * C + i] = (newRgb[i * 3 + 1] / 255 - mean[1]) / std[1];
      newTensor[2 * C * C + i] = (newRgb[i * 3 + 2] / 255 - mean[2]) / std[2];
    }
    const resNew = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', newTensor, [1, 3, C, C]) });
    const logitNew = resNew[session.outputNames[0]].data[0];
    const pNew = 1 / (1 + Math.exp(-(logitNew + 0.2)));

    console.log(`\nReal Photo: ${p.name}`);
    console.log(`  OLD: logit = ${logitOld.toFixed(3)}, P(AI) = ${(pOld * 100).toFixed(1)}%`);
    console.log(`  NEW: logit = ${logitNew.toFixed(3)}, P(AI) = ${(pNew * 100).toFixed(1)}%`);
  }
}

run().catch(console.error);
