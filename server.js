const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = urlObj.pathname;

  // 1. Landing Page
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const filePath = path.join(__dirname, 'public', 'landing.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // 2. Documentation Page
  if (req.method === 'GET' && (pathname === '/docs' || pathname === '/docs/')) {
    const filePath = path.join(__dirname, 'public', 'docs.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // 3. Playground Route (Redirects to interactive demo simulation)
  if (req.method === 'GET' && (pathname === '/playground' || pathname === '/playground/')) {
    const filePath = path.join(__dirname, 'public', 'playground.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // 4. Static Public Assets (/public/*)
  if (req.method === 'GET' && pathname.startsWith('/public/')) {
    const relativePath = pathname.replace(/^\/public\//, '');
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(__dirname, 'public', safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // 5. Sample Images
  if (req.method === 'GET' && pathname.startsWith('/api/samples/image/')) {
    const sampleName = pathname.replace('/api/samples/image/', '');
    const safeName = path.basename(sampleName);
    const filePath = path.join(__dirname, 'public', 'samples', safeName);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found', path: pathname }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`AI Detector Developer Portal running at http://localhost:${PORT}`);
  console.log(` - Landing & Demo: http://localhost:${PORT}/`);
  console.log(` - Documentation:  http://localhost:${PORT}/docs`);
});