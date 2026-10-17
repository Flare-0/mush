import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { normalize, extname, join } from 'node:path';

const ROOT = 'E:\\mush';
const PORT = 4599;

const MIME = {
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Access-Control-Allow-Origin': '*' });
      return res.end('Method Not Allowed');
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/docs/';
    const filePath = normalize(join(ROOT, p));
    if (!filePath.toLowerCase().startsWith(ROOT.toLowerCase())) {
      res.writeHead(403, { 'Access-Control-Allow-Origin': '*' });
      return res.end('Forbidden');
    }
    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    res.end('Not found: ' + e.message);
  }
}).listen(PORT, '127.0.0.1', () => console.log('docs server on http://127.0.0.1:' + PORT));
