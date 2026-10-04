import fs from 'node:fs';
import path from 'node:path';

async function testEndpoint() {
  const imgPath = path.join(process.env.USERPROFILE, 'Downloads', '1000313211.jpg');
  if (!fs.existsSync(imgPath)) return;
  const buf = fs.readFileSync(imgPath);

  const res = await fetch('http://localhost:3000/api/detect/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buf
  });

  const data = await res.json();
  console.log('Server /api/detect/image response:', {
    verdict: data.verdict,
    probability: (data.probability * 100).toFixed(2) + '%',
    score: data.score
  });
}

testEndpoint().catch(console.error);
