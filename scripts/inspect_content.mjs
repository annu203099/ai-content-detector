import fs from 'node:fs';
import sharp from 'sharp';

async function inspectContent() {
  const buf = fs.readFileSync('C:\\Users\\Asus\\Downloads\\1000313211.jpg');
  const stats = await sharp(buf).stats();
  console.log('Channels stats:');
  stats.channels.forEach((c, i) => {
    console.log(`Channel ${i}: mean=${c.mean.toFixed(2)}, stdev=${c.stdev.toFixed(2)}, min=${c.min}, max=${c.max}`);
  });
  console.log('Dominant color:', stats.dominant);
  console.log('Is entropy low or high?');
  const metadata = await sharp(buf).metadata();
  console.log('Orientation:', metadata.orientation);
}

inspectContent().catch(console.error);
