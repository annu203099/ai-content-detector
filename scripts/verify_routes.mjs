import fs from 'node:fs';

async function testAllRoutes() {
  const routes = [
    { url: 'http://localhost:3000/', expectedStatus: 200, check: (t) => t.includes('On-Device AI Detection') },
    { url: 'http://localhost:3000/docs', expectedStatus: 200, check: (t) => t.includes('class AIDetector') },
    { url: 'http://localhost:3000/playground', expectedStatus: 200, check: (t) => t.includes('Forensic Intelligence Playground') },
    { url: 'http://localhost:3000/public/css/apple-theme.css', expectedStatus: 200, check: (t) => t.includes('--accent: #0071E3') },
    { url: 'http://localhost:3000/api/samples/image/1000313211.jpg', expectedStatus: 200, check: () => true },
    { url: 'http://localhost:3000/api/info', expectedStatus: 200, check: (t) => t.includes('sdkVersion') }
  ];

  console.log('Testing server routes:');
  for (const r of routes) {
    try {
      const res = await fetch(r.url);
      const text = await res.text();
      const passed = res.status === r.expectedStatus && r.check(text);
      console.log(`[${passed ? 'PASS' : 'FAIL'}] ${r.url} -> Status: ${res.status}`);
      if (!passed) {
        console.error('Check failed for:', r.url);
      }
    } catch (err) {
      console.error(`[ERROR] ${r.url}:`, err.message);
    }
  }

  // Test Text Inference
  console.log('\nTesting Text Inference Endpoint (/api/detect/text):');
  const textRes = await fetch('http://localhost:3000/api/detect/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'This is a test of the multimodal forensic intelligence pipeline.' })
  });
  const textData = await textRes.json();
  console.log('Text result:', { verdict: textData.verdict, confidence: textData.confidence, latency: textData.timing?.totalMs });

  // Test Image Inference
  console.log('\nTesting Image Inference Endpoint (/api/detect/image):');
  const sampleBuf = fs.readFileSync('public/samples/1000313211.jpg');
  const imgRes = await fetch('http://localhost:3000/api/detect/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: sampleBuf
  });
  const imgData = await imgRes.json();
  console.log('Image result:', { verdict: imgData.verdict, probability: (imgData.probability * 100).toFixed(2) + '%', logit: imgData.score });
}

testAllRoutes().catch(console.error);
