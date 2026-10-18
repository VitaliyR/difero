import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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
