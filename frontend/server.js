import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DIST = path.join(__dirname, 'dist');
const PUBLIC = path.join(__dirname, 'public');
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.txt': 'text/plain',
};

function mime(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

function isHash(name) {
  return /[a-f0-9]{8,}/i.test(path.basename(name, path.extname(name)));
}

function gzip(buf) {
  return new Promise((resolve, reject) => {
    zlib.gzip(buf, { level: 6 }, (err, result) => err ? reject(err) : resolve(result));
  });
}

function br(buf) {
  return new Promise((resolve, reject) => {
    zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }, (err, result) => err ? reject(err) : resolve(result));
  });
}

async function compress(buf, accept) {
  if (accept.includes('br')) return { data: await br(buf), encoding: 'br' };
  if (accept.includes('gzip')) return { data: await gzip(buf), encoding: 'gzip' };
  return { data: buf, encoding: null };
}

const CSP = "default-src 'self' http: https: data: blob:; script-src 'self' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: http: https:; connect-src 'self' http://localhost:8001 http://127.0.0.1:8001 https://open.er-api.com; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'";

function writeHeaders(res, filePath, maxAge) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (maxAge) res.setHeader('Cache-Control', `public, max-age=${maxAge}, immutable`);
  else res.setHeader('Cache-Control', 'no-cache');
}

function serveFile(res, filePath, accept, maxAge) {
  fs.readFile(filePath, async (err, buf) => {
    if (err) return notFound(res, 'File not found');
    const { data, encoding } = await compress(buf, accept);
    res.writeHead(200, {
      'Content-Type': mime(filePath),
      'Content-Length': data.length,
      'Content-Encoding': encoding || undefined,
    });
    writeHeaders(res, filePath, maxAge);
    res.end(data);
  });
}

function notFound(res, msg) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(msg || 'Not found');
}

function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

function findFile(urlPath) {
  const candidates = [
    path.join(DIST, urlPath),
    path.join(DIST, urlPath, 'index.html'),
    path.join(ROOT, urlPath),
    path.join(PUBLIC, urlPath),
  ];
  for (const c of candidates) {
    const resolved = path.resolve(c);
    if (resolved.startsWith(DIST) || resolved.startsWith(ROOT)) {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const accept = req.headers['accept-encoding'] || '';

  if (p === '/' || p === '/index.html') {
    const distIndex = path.join(DIST, 'index.html');
    if (fs.existsSync(distIndex)) return serveFile(res, distIndex, accept);
    return redirect(res, '/index.babel.html');
  }

  if (p.startsWith('/assets/')) {
    const file = path.join(DIST, p);
    if (fs.existsSync(file)) {
      const maxAge = isHash(p) ? 31536000 : 86400;
      return serveFile(res, file, accept, maxAge);
    }
  }

  if (p === '/sw.js') {
    const sw = path.join(DIST, 'sw.js');
    if (fs.existsSync(sw)) return serveFile(res, sw, accept);
    return notFound(res);
  }

  if (p === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  const file = findFile(p);
  if (file) return serveFile(res, file, accept, file.startsWith(DIST) && isHash(p) ? 31536000 : 86400);

  const distIndex = path.join(DIST, 'index.html');
  if (fs.existsSync(distIndex)) return serveFile(res, distIndex, accept);
  notFound(res);
});

server.listen(PORT, () => {
  console.log(`Blackbox BOM production server`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Serving: ${DIST}`);
});
