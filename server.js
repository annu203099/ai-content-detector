const http = require('http');
const fs = require('fs');
const path = require('path');
const { AIDetector } = require('./dist');

const detector = new AIDetector({
  runtime: 'node-cpu',
  provenance: true
});

const server = http.createServer(async (req, res) => {
  // 1. Static Playground HTML
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // 2. Info / Diagnostics Endpoint
  if (req.method === 'GET' && req.url === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(detector.info()));
    return;
  }

  // 3. Text Detection Endpoint (/api/detect/text and legacy /api/detect)
  if (req.method === 'POST' && (req.url === '/api/detect/text' || req.url === '/api/detect')) {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const text = payload.text || '';
        const threshold = payload.threshold;
        const result = await detector.detectText(text, { threshold });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Error detecting text' }));
      }
    });
    return;
  }

  // 4. Image Detection Endpoint (/api/detect/image)
  if (req.method === 'POST' && req.url === '/api/detect/image') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const rawBuffer = Buffer.concat(chunks);
        if (rawBuffer.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No image data received' }));
          return;
        }

        const result = await detector.detectImage(rawBuffer);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Error detecting image' }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Multimodal AI Detector Playground running at http://localhost:${PORT}`);
});