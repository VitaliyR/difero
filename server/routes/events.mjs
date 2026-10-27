import { watch } from 'node:fs';
import { changeVersion } from '../git.mjs';

const DEBOUNCE_MS = 250;
const KEEPALIVE_MS = 25_000;

function createWatcher(root, onEmpty) {
  const clients = new Set();
  let version = null;
  let timer = null;
  let running = null;
  let dirty = false;
  let watcher = null;

  function send(response) {
    if (version) response.write(`data: ${JSON.stringify({ version })}\n\n`);
  }

  async function refresh(broadcast = true) {
    if (running) {
      dirty = true;
      return running;
    }
    running = (async () => {
      do {
        dirty = false;
        const next = await changeVersion(root).catch(() => null);
        if (next && next !== version) {
          version = next;
          if (broadcast) for (const response of clients) send(response);
        }
      } while (dirty && clients.size);
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  }

  function schedule(_event, filename) {
    if (filename && filename.split(/[\\/]/).includes('node_modules')) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, DEBOUNCE_MS);
  }

  try {
    watcher = watch(root, { recursive: true }, schedule);
    watcher.on('error', () => watcher.close());
  } catch {
    watcher = null;
  }
  const ready = refresh(false);

  return {
    async add(response) {
      clients.add(response);
      await ready;
      if (clients.has(response)) send(response);
    },
    remove(response) {
      clients.delete(response);
      if (clients.size) return;
      clearTimeout(timer);
      watcher?.close();
      onEmpty();
    },
    close() {
      clearTimeout(timer);
      watcher?.close();
      for (const response of clients) response.end();
    },
  };
}

export function createEvents() {
  const watchers = new Map();
  return {
    async serve(response, root) {
      if (response.destroyed) return;
      let entry = watchers.get(root);
      if (!entry) {
        entry = createWatcher(root, () => watchers.delete(root));
        watchers.set(root, entry);
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      response.write(': connected\n\n');
      const keepalive = setInterval(() => response.write(': ping\n\n'), KEEPALIVE_MS);
      response.on('close', () => {
        clearInterval(keepalive);
        entry.remove(response);
      });
      await entry.add(response);
    },
    close() {
      for (const entry of watchers.values()) entry.close();
    },
  };
}
