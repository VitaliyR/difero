import { createHash, randomUUID } from 'node:crypto';
import { getChanges } from '../git.mjs';

const MAX_SNAPSHOTS = 4;

function hash(contents) {
  return contents === null ? null : createHash('sha1').update(contents).digest('hex');
}

export function createSnapshots() {
  return new Map();
}

export async function serveDiff(response, url, { root, cwd, snapshots }) {
  const mode = url.searchParams.get('mode') || 'all';
  if (!['all', 'base', 'staged', 'unstaged'].includes(mode)) {
    response.writeHead(400).end('Invalid mode');
    return;
  }
  const data = await getChanges(root, mode, url.searchParams.get('base'));
  const snapshot = randomUUID();
  const contents = new Map();
  const files = data.files.map((file) => {
    contents.set(file.path, { oldFile: file.oldFile, newFile: file.newFile });
    const summary = { ...file, oldHash: hash(file.oldFile), newHash: hash(file.newFile) };
    delete summary.oldFile;
    delete summary.newFile;
    return summary;
  });
  snapshots.set(snapshot, contents);
  for (const id of snapshots.keys()) {
    if (snapshots.size <= MAX_SNAPSHOTS) break;
    snapshots.delete(id);
  }
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify({ ...data, files, snapshot, cwd }));
}

export function serveFile(response, url, { snapshots }) {
  const id = url.searchParams.get('snapshot');
  const snapshot = snapshots.get(id);
  if (snapshot) {
    snapshots.delete(id);
    snapshots.set(id, snapshot);
  }
  const contents = snapshot?.get(url.searchParams.get('path'));
  if (!contents) {
    response.writeHead(404).end('File not found in snapshot');
    return;
  }
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(contents));
}
