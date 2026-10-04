import fs from 'node:fs';
import sharp from 'sharp';

async function testQuality() {
  const buf = fs.readFileSync('C:\\Users\\Asus\\Downloads\\1000313211.jpg');
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // Sieve degradationStats
  const L = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const sy = Math.max(1, Math.floor(height / 192));
  let dxAll = 0, dxN = 0, dxB = 0, dxBN = 0, dyAll = 0, dyN = 0, dyB = 0, dyBN = 0, d2All = 0;
  for (let y = 1; y < height - 1; y += sy) {
    const row = y * width * 4, dn = (y + 1) * width * 4;
    let prev = L(row);
    for (let x = 1; x < width - 1; x++) {
      const i = row + x * 4;
      const c = L(i), r = L(i + 4), d = L(dn + x * 4);
      const dx = Math.abs(r - c), dy = Math.abs(d - c);
      dxAll += dx; dxN++; dyAll += dy; dyN++;
      d2All += Math.abs(r - prev);
      if (x % 8 === 7) { dxB += dx; dxBN++; }
      if (y % 8 === 7) { dyB += dy; dyBN++; }
      prev = c;
    }
  }
  const bx = dxBN ? (dxB / dxBN) / (dxAll / dxN + 1e-6) : 1;
  const by = dyBN ? (dyB / dyBN) / (dyAll / dyN + 1e-6) : 1;
  const block = (bx + by) / 2;
  const d12 = (dxAll / dxN) / (d2All / dxN + 1e-6);

  console.log('Degradation Stats:');
  console.log('Blockiness:', block.toFixed(4), '(clean ~1.0, heavy recompression >= 1.8)');
  console.log('d12 (upscale/smoothness metric):', d12.toFixed(4), '(upscaled/flat < 0.528, native photos 0.55-0.9)');

  // Sieve degenerateReason
  const syDegen = Math.max(1, height >> 7);
  let n = 0, sum = 0, sum2 = 0;
  let m = 0, sa = 0, sb = 0, sab = 0, sa2 = 0, sb2 = 0;
  for (let y = 0; y < height; y += syDegen) {
    const row = y * width * 4;
    let prev = -1;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++; sum += l; sum2 += l * l;
      if (prev >= 0) { m++; sa += prev; sb += l; sab += prev * l; sa2 += prev * prev; sb2 += l * l; }
      prev = l;
    }
  }
  const varL = sum2 / n - (sum / n) ** 2;
  const cov = sab / m - (sa / m) * (sb / m);
  const denom = Math.sqrt(Math.max((sa2 / m - (sa / m) ** 2) * (sb2 / m - (sb / m) ** 2), 1e-9));
  const corr = cov / denom;

  console.log('\nDegenerate Stats:');
  console.log('Luma variance:', varL.toFixed(2), '(flat fill < 4)');
  console.log('Neighbor correlation:', corr.toFixed(4), '(noise < 0.15)');
}

testQuality().catch(console.error);
