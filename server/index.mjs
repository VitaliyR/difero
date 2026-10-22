import { createServer } from 'node:http';
import { serveAsset } from './assets.mjs';
import { countChanges, findRepo, findRepos, findRoot, stageAll, undoStageAll } from './git.mjs';
import { createSnapshots, serveDiff, serveFile } from './routes/diff.mjs';
import { createEvents } from './routes/events.mjs';
import { serveImage } from './routes/image.mjs';

async function openWorkspace(cwd) {
  try {
    return { root: await findRoot(cwd), repos: null };
  } catch (error) {
    const repos = await findRepos(cwd).catch(() => []);
    if (!repos.length) throw error;
    return { root: cwd, repos };
  }
}

function isSameOrigin(request) {
  return request.headers['sec-fetch-site'] === 'same-origin';
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request.setEncoding('utf8')) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function sendJson(response, value) {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

async function serveRepos(response, { root, workspace }) {
  const repos = workspace
    ? await Promise.all(
        (await findRepos(root)).map(async ({ name, path }) => ({
          name,
          path,
          changes: await countChanges(path).catch(() => null),
        })),
      )
    : [];
  sendJson(response, { workspace: workspace ? root : null, repos });
}

export async function startServer({ cwd, assetsDir, port = 0, fallbackToFreePort = false }) {
  const { root, repos } = await openWorkspace(cwd);
  const workspace = Boolean(repos);
  const snapshots = createSnapshots();
  const events = createEvents();
  async function repoRoot(url) {
    if (!workspace) return root;
    const repo = await findRepo(root, url.searchParams.get('repo'));
    if (!repo) throw Object.assign(new Error('Unknown repository'), { status: 400 });
    return repo.path;
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'POST' && url.pathname.startsWith('/api/stage')) {
        if (!isSameOrigin(request)) {
          response.writeHead(403).end('Forbidden');
          return;
        }
        if (url.pathname === '/api/stage') {
          sendJson(response, await stageAll(await repoRoot(url)));
          return;
        }
        if (url.pathname === '/api/stage/undo') {
          await undoStageAll(await repoRoot(url), await readJson(request));
          response.writeHead(204).end();
          return;
        }
      }
      if (request.method !== 'GET') {
        response.writeHead(405).end('Method not allowed');
        return;
      }
      if (url.pathname === '/api/repos') {
        await serveRepos(response, { root, workspace });
        return;
      }
      if (url.pathname === '/api/diff') {
        const repo = await repoRoot(url);
        await serveDiff(response, url, { root: repo, cwd: workspace ? repo : cwd, snapshots });
        return;
      }
      if (url.pathname === '/api/events') {
        await events.serve(response, await repoRoot(url));
        return;
      }
      if (url.pathname === '/api/file') {
        serveFile(response, url, { snapshots });
        return;
      }
      if (url.pathname === '/api/image') {
        await serveImage(response, url, { root: await repoRoot(url) });
        return;
      }
      await serveAsset(response, url, assetsDir);
    } catch (error) {
      response.writeHead(error.status ?? (error.code === 'ENOENT' ? 404 : 500), {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(error.code === 'ENOENT' ? 'Not found' : error.message);
    }
  });
  const close = server.close.bind(server);
  server.close = (callback) => {
    events.close();
    return close(callback);
  };
  await listenWithFallback(server, port, fallbackToFreePort);
  return { server, root, repos, url: `http://127.0.0.1:${server.address().port}/` };
}

const FALLBACK_PORT_ATTEMPTS = 200;

async function listenWithFallback(server, port, fallbackToFreePort) {
  const lastPort = fallbackToFreePort ? Math.min(port + FALLBACK_PORT_ATTEMPTS, 65535) : port;
  for (let candidate = port; candidate <= lastPort; candidate++) {
    try {
      await listen(server, candidate);
      return;
    } catch (error) {
      if (!fallbackToFreePort || error.code !== 'EADDRINUSE') throw error;
    }
  }
  await listen(server, 0);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
}
