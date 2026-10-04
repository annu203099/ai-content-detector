const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

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
  let pathname = urlObj.pathname;

  // 1. Landing Page
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const filePath = path.join(ROOT_DIR, 'index.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // 2. Documentation Page
  if (req.method === 'GET' && (pathname === '/docs' || pathname === '/docs/' || pathname === '/docs.html')) {
    let filePath = path.join(ROOT_DIR, 'public', 'docs.html');
    if (!fs.existsSync(filePath)) {
      filePath = path.join(ROOT_DIR, 'docs.html');
    }
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  // 3. Playground Route (Redirect to demo simulation)
  if (req.method === 'GET' && (pathname === '/playground' || pathname === '/playground/')) {
    res.writeHead(302, { 'Location': '/#demo-simulation' });
    res.end();
    return;
  }

  // 4. Static Asset Lookup
  // Check in ROOT_DIR/public, then ROOT_DIR
  const cleanPath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const candidatePaths = [
    path.join(ROOT_DIR, cleanPath),
    path.join(ROOT_DIR, 'public', cleanPath.replace(/^\/public\//, '')),
    path.join(ROOT_DIR, 'public', cleanPath)
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = path.extname(candidate).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(candidate));
      return;
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: pathname }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Local static preview server running at http://localhost:${PORT}`);
  console.log(` - Landing & Demo: http://localhost:${PORT}/`);
  console.log(` - Documentation:  http://localhost:${PORT}/docs`);
});
