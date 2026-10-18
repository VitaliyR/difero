import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { createServer } from 'vite';

// Vite (with HMR) runs here for the whole session, so the browser opens once. The API server
// for the repo under review (defaults to cwd) runs in a child that restarts on server/ changes.
const cwd = resolve(process.argv[2] ?? process.cwd());
const port = await new Promise((done) => {
  const probe = createNetServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => done(port));
  });
});

const api = spawn(
  process.execPath,
  ['--watch-path=server', '--watch-preserve-output', 'scripts/dev-api.mjs', cwd],
  { stdio: 'inherit', env: { ...process.env, DIFERO_PORT: String(port) } },
);

const vite = await createServer({
  server: { open: true, proxy: { '/api': `http://127.0.0.1:${port}` } },
});
await vite.listen();
vite.printUrls();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    api.kill();
    await vite.close();
    process.exit(0);
  });
}
