import { getChanges } from '../git.mjs';

export async function serveDiff(response, url, { root, cwd }) {
  const mode = url.searchParams.get('mode') || 'all';
  if (!['all', 'staged', 'unstaged'].includes(mode)) {
    response.writeHead(400).end('Invalid mode');
    return;
  }
  const data = await getChanges(root, mode);
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify({ ...data, cwd }));
}
