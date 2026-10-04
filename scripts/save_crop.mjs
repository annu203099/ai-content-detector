import fs from 'node:fs';
import sharp from 'sharp';

async function saveCrop() {
  const buf = fs.readFileSync('C:\\Users\\Asus\\Downloads\\1000313211.jpg');
  const metadata = await sharp(buf).metadata();
  const w = metadata.width;
  const h = metadata.height;
  const scale = 440 / Math.min(w, h);
  const rw = Math.max(384, Math.round(w * scale));
  const rh = Math.max(384, Math.round(h * scale));
  const left = Math.floor((rw - 384) / 2);
  const top = Math.floor((rh - 384) / 2);

  await sharp(buf)
    .resize(rw, rh)
    .extract({ left, top, width: 384, height: 384 })
    .toFile('scripts/crop_test.jpg');

  console.log('Saved crop_test.jpg, size:', fs.statSync('scripts/crop_test.jpg').size);
}

saveCrop().catch(console.error);
