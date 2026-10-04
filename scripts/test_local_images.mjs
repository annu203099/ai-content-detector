import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

const MODEL_PATH = path.join(process.env.USERPROFILE, '.cache', 'ai-detector', 'ai-detector-models-v1', 'image.sieve.ft1.int8.onnx');

async function testImages() {
  const session = await ort.InferenceSession.create(MODEL_PATH);
  const images = [
    'C:\\Users\\Asus\\Downloads\\1000313211.jpg',
    'C:\\Users\\Asus\\Downloads\\ANNUISRO.jpg',
    'C:\\Users\\Asus\\Downloads\\iocl.jpg',
    'C:\\Users\\Asus\\Downloads\\signmain1.jpg'
  ];

  for (const imgPath of images) {
    if (!fs.existsSync(imgPath)) continue;
    const buf = fs.readFileSync(imgPath);
    const meta = await sharp(buf).metadata();

    // 1. OLD PIPELINE
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

    // 2. NEW PIPELINE (ImageNet norm, 440 shorter side, 384 crop)
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
    const pNew = 1 / (1 + Math.exp(-logitNew));

    console.log(`\nImage: ${path.basename(imgPath)} (${meta.width}x${meta.height})`);
    console.log(`  OLD: logit = ${logitOld.toFixed(3)}, P(AI) = ${(pOld * 100).toFixed(1)}%`);
    console.log(`  NEW: logit = ${logitNew.toFixed(3)}, P(AI) = ${(pNew * 100).toFixed(1)}%`);
  }
}

testImages().catch(console.error);
