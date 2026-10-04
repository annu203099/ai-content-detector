import fs from 'node:fs';
import sharp from 'sharp';

async function checkExif() {
  const buf = fs.readFileSync('C:\\Users\\Asus\\Downloads\\1000313211.jpg');
  const meta = await sharp(buf).metadata();
  console.log('Format:', meta.format);
  console.log('Size:', meta.width, 'x', meta.height);
  console.log('Space:', meta.space);
  console.log('Channels:', meta.channels);
  console.log('Density:', meta.density);
  console.log('Has Alpha:', meta.hasAlpha);
  console.log('Exif buffer length:', meta.exif ? meta.exif.length : 0);
  if (meta.exif) {
    console.log('Exif text representation:', meta.exif.toString('ascii').replace(/[^\x20-\x7E]/g, ' ').slice(0, 300));
  }
}

checkExif().catch(console.error);
