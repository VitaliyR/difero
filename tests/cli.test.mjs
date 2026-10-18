import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startServer } from '../server/index.mjs';

const cli = fileURLToPath(new URL('../bin/difero.mjs', import.meta.url));
const { version } = JSON.parse(
  await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);

test('-h and --help print usage without starting the server', () => {
  const outputs = ['-h', '--help'].map((flag) =>
    execFileSync(process.execPath, [cli, flag], { cwd: tmpdir(), encoding: 'utf8' }),
  );
  assert.equal(outputs[0], outputs[1]);
  assert.match(outputs[0], new RegExp(`difero v${version.replaceAll('.', '\\.')}\\n`));
  assert.match(outputs[0], /Usage: difero \[options\]/);
  assert.match(outputs[0], /--no-open/);
  assert.match(outputs[0], /--port <n>/);
  assert.match(outputs[0], /-h, --help/);
});

test('--no-open starts a versioned local server without launching a browser', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difero-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);

  const launcherDir = join(root, 'bin');
  const launcher = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const marker = join(root, 'browser-opened');
  if (process.platform !== 'win32') {
    await mkdir(launcherDir);
    await writeFile(join(launcherDir, launcher), '#!/bin/sh\ntouch "$DIFERO_OPEN_MARKER"\n', {
      mode: 0o755,
    });
  }

  const child = spawn(process.execPath, [cli, '--no-open'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PATH: `${launcherDir}:${process.env.PATH}`,
      DIFERO_OPEN_MARKER: marker,
    },
  });
  t.after(() => child.kill('SIGTERM'));
  let output = '';
  let errorOutput = '';
  child.stderr.on('data', (chunk) => (errorOutput += chunk));
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CLI did not start: ${errorOutput}`)), 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`CLI exited ${code}: ${errorOutput}`)));
  });
  assert.match(output, new RegExp(`difero v${version.replaceAll('.', '\\.')}`));
  const response = await fetch(new URL('/api/diff?mode=all', url));
  assert.equal(response.status, 200);
  if (process.platform !== 'win32') {
    await delay(50);
    await assert.rejects(stat(marker), { code: 'ENOENT' });
  }
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
});

async function makeRepo(t) {
  const root = await mkdtemp(join(tmpdir(), 'difero-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  return root;
}

function runCli(t, root, args) {
  const child = spawn(process.execPath, [cli, '--no-open', ...args], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  let output = '';
  let errorOutput = '';
  child.stderr.on('data', (chunk) => (errorOutput += chunk));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CLI did not start: ${errorOutput}`)), 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve({ child, url: match[0], port: Number(match[1]) });
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({ code, errorOutput });
    });
  });
}

async function occupyPort(t, port = 0) {
  const blocker = createServer();
  try {
    await new Promise((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) {
    // Something else, e.g. a running difero, already holds the port.
    if (error.code === 'EADDRINUSE') return port;
    throw error;
  }
  t.after(() => blocker.close());
  return blocker.address().port;
}

test('--port listens on the requested port', async (t) => {
  const root = await makeRepo(t);
  const free = createServer();
  await new Promise((resolve) => free.listen(0, '127.0.0.1', resolve));
  const wanted = free.address().port;
  await new Promise((resolve) => free.close(resolve));

  for (const args of [['--port', String(wanted)], [`--port=${wanted}`]]) {
    const result = await runCli(t, root, args);
    assert.equal(result.port, wanted, result.errorOutput);
    assert.equal((await fetch(new URL('/api/diff?mode=all', result.url))).status, 200);
    const exited = once(result.child, 'exit');
    result.child.kill('SIGTERM');
    await exited;
  }
});

test('--port fails when the requested port is taken', async (t) => {
  const root = await makeRepo(t);
  const port = await occupyPort(t);
  const result = await runCli(t, root, ['--port', String(port)]);
  assert.equal(result.code, 1);
  assert.match(result.errorOutput, /EADDRINUSE/);
});

test('tries the next ports when the default port is taken', async (t) => {
  const root = await makeRepo(t);
  await occupyPort(t, 4747);
  const result = await runCli(t, root, []);
  assert.ok(result.port > 4747 && result.port <= 4947, result.errorOutput);
});

test('falls back to a free port when no nearby port is available', async (t) => {
  const root = await makeRepo(t);
  await occupyPort(t, 65535);
  const { server } = await startServer({
    cwd: root,
    assetsDir: root,
    port: 65535,
    fallbackToFreePort: true,
  });
  t.after(() => server.close());
  assert.notEqual(server.address().port, 65535);
});

test('rejects an invalid --port value', async (t) => {
  const root = await makeRepo(t);
  for (const args of [['--port'], ['--port', 'abc'], ['--port=70000']]) {
    const result = await runCli(t, root, args);
    assert.equal(result.code, 1);
    assert.match(result.errorOutput, /invalid --port value/);
  }
});
