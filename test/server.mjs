/**
 * Minimal static file server for Playwright tests.
 * No dependencies — uses Node's built-in http module.
 * Serves the project root at http://localhost:7474
 */
import { createServer } from 'http';
import { readFile, access } from 'fs/promises';
import { join, extname, sep } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 7474;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const filePath = join(ROOT, urlPath === '/' ? '/index.html' : urlPath);

  // Prevent path traversal — resolved path must stay inside ROOT.
  // ROOT ends with sep already (from URL resolution), so no need to append sep.
  if (!filePath.startsWith(ROOT) && filePath !== ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    await access(filePath);
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Test server: http://localhost:${PORT}`);
});
