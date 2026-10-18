import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export async function serveAsset(response, url, assetsDir) {
  const requested =
    url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filePath = normalize(join(assetsDir, requested));
  if (!filePath.startsWith(assetsDir.endsWith(sep) ? assetsDir : assetsDir + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const contents = await readFile(filePath);
  response.writeHead(200, {
    'content-type': MIME[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  response.end(contents);
}
