import { createServer } from 'node:http';
import { serveAsset } from './assets.mjs';
import { findRoot } from './git.mjs';
import { createSnapshots, serveDiff, serveFile } from './routes/diff.mjs';
import { serveImage } from './routes/image.mjs';

export async function startServer({ cwd, assetsDir }) {
  const root = await findRoot(cwd);
  const snapshots = createSnapshots();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET') {
        response.writeHead(405).end('Method not allowed');
        return;
      }
      if (url.pathname === '/api/diff') {
        await serveDiff(response, url, { root, cwd, snapshots });
        return;
      }
      if (url.pathname === '/api/file') {
        serveFile(response, url, { snapshots });
        return;
      }
      if (url.pathname === '/api/image') {
        await serveImage(response, url, { root });
        return;
      }
      await serveAsset(response, url, assetsDir);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(error.code === 'ENOENT' ? 'Not found' : error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, root, url: `http://127.0.0.1:${server.address().port}/` };
}
