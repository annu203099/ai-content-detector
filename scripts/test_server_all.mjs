import fs from 'node:fs';

async function testAll() {
  const tests = [
    { label: 'Real Camera Photo (Reddit)', path: 'scripts/samples/unsure_ft44s_reddit_031.jpg' },
    { label: 'Real Camera Photo (COCO)', path: 'scripts/samples/000000578093.jpg' },
    { label: 'AI Generated Image', path: 'scripts/samples/fake_r1f1178cet.png' }
  ];

  for (const t of tests) {
    const buf = fs.readFileSync(t.path);
    const res = await fetch('http://localhost:3000/api/detect/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buf
    });
    const d = await res.json();
    console.log(`${t.label}: Verdict=${d.verdict}, Probability=${(d.probability * 100).toFixed(1)}%, RawLogit=${d.score.toFixed(3)}`);
  }
}

testAll().catch(console.error);
