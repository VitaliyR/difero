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
import { canReveal } from '../server/reveal.mjs';

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

function withoutSsh(env) {
  const dropped = ['SSH_CONNECTION', 'SSH_CLIENT', 'SSH_TTY', 'BROWSER'];
  return Object.fromEntries(Object.entries(env).filter(([key]) => !dropped.includes(key)));
}

function runCli(t, root, args, { env = {}, open = false } = {}) {
  const child = spawn(process.execPath, [cli, ...(open ? [] : ['--no-open']), ...args], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...withoutSsh(process.env), ...env },
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
        resolve({ child, url: match[0], port: Number(match[1]), output: () => output });
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

test('over SSH it prints a port forwarding hint instead of opening a browser', async (t) => {
  const root = await makeRepo(t);
  const launcherDir = join(root, 'bin');
  const marker = join(root, 'browser-opened');
  await mkdir(launcherDir);
  for (const launcher of ['open', 'xdg-open']) {
    await writeFile(join(launcherDir, launcher), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
  }
  const result = await runCli(t, root, [], {
    open: true,
    env: { SSH_CONNECTION: '10.0.0.1 1 10.0.0.2 22', PATH: `${launcherDir}:${process.env.PATH}` },
  });
  await delay(100);
  const { port } = result;
  assert.ok(result.output().includes(`ssh -L ${port}:127.0.0.1:${port} <host>`), result.output());
  await assert.rejects(stat(marker), { code: 'ENOENT' });
});

test(
  'over SSH with Tailscale installed it also suggests tailscale serve',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await makeRepo(t);
    const launcherDir = join(root, 'bin');
    await mkdir(launcherDir);
    await writeFile(join(launcherDir, 'tailscale'), '#!/bin/sh\n', { mode: 0o755 });
    const result = await runCli(t, root, [], {
      env: { SSH_CONNECTION: '10.0.0.1 1 10.0.0.2 22', PATH: `${launcherDir}:${process.env.PATH}` },
    });
    await delay(100);
    const { port } = result;
    const output = result.output();
    assert.ok(
      output.includes(`tailscale serve --bg --https=${port} http://127.0.0.1:${port}`),
      output,
    );
    assert.ok(output.includes(`ssh -L ${port}:127.0.0.1:${port} <host>`), output);
  },
);

test(
  'BROWSER is used to open the URL, even over SSH',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await makeRepo(t);
    const marker = join(root, 'browser-opened');
    const browser = join(root, 'browser.sh');
    await writeFile(browser, `#!/bin/sh\nprintf %s "$1" > "${marker}"\n`, { mode: 0o755 });
    const result = await runCli(t, root, [], {
      open: true,
      env: { SSH_CONNECTION: '10.0.0.1 1 10.0.0.2 22', BROWSER: browser },
    });
    let opened;
    for (let attempt = 0; attempt < 50 && !opened; attempt++) {
      await delay(20);
      opened = await readFile(marker, 'utf8').catch(() => undefined);
    }
    assert.equal(opened, result.url);
    assert.ok(!result.output().includes('ssh -L'));
  },
);

test('a folder of repositories serves each one by name', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'difero-workspace-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  for (const name of ['api', 'web']) execFileSync('git', ['init', '-q', join(parent, name)]);
  await writeFile(join(parent, 'web', 'page.html'), '<p>hi</p>\n');

  const { server, root, repos } = await startServer({ cwd: parent, assetsDir: parent });
  t.after(() => server.close());
  assert.equal(root, parent);
  assert.deepEqual(
    repos.map(({ name }) => name),
    ['api', 'web'],
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const listing = await (await fetch(`${base}/api/repos`)).json();
  assert.equal(listing.workspace, parent);
  assert.deepEqual(
    listing.repos.map(({ name, changes }) => [name, changes]),
    [
      ['api', 0],
      ['web', 1],
    ],
  );
  const diff = await (await fetch(`${base}/api/diff?mode=all&repo=web`)).json();
  assert.deepEqual(
    diff.files.map(({ path }) => path),
    ['page.html'],
  );
  for (const repo of ['', '..', 'missing']) {
    const response = await fetch(`${base}/api/diff?mode=all&repo=${repo}`);
    assert.equal(response.status, 400);
  }
});

test('staging all changes in a repository of a folder can be undone', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'difero-workspace-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  for (const name of ['api', 'web']) execFileSync('git', ['init', '-q', join(parent, name)]);
  for (const name of ['api', 'web']) await writeFile(join(parent, name, 'new.txt'), 'new\n');

  const { server } = await startServer({ cwd: parent, assetsDir: parent });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
      body: body && JSON.stringify(body),
    });
  const staged = async (name) =>
    (await (await fetch(`${base}/api/diff?mode=staged&repo=${name}`)).json()).files.length;

  const crossSite = await fetch(`${base}/api/stage?repo=web`, {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  assert.equal(crossSite.status, 403);
  assert.equal(await staged('web'), 0);

  const { changed, ...snapshot } = await (await post('/api/stage?repo=web')).json();
  assert.equal(changed, true);
  assert.equal(await staged('web'), 1);
  assert.equal(await staged('api'), 0);

  assert.equal((await post('/api/stage/undo?repo=web', snapshot)).status, 204);
  assert.equal(await staged('web'), 0);
  assert.equal((await post('/api/stage/undo?repo=web', snapshot)).status, 409);
});

test('a repository is served directly, without the repository list', async (t) => {
  const root = await makeRepo(t);
  execFileSync('git', ['init', '-q', join(root, 'nested')]);
  const { server, repos } = await startServer({ cwd: root, assetsDir: root, reveal: false });
  t.after(() => server.close());
  assert.equal(repos, null);
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${base}/api/repos`)).json(), {
    workspace: null,
    repos: [],
    reveal: false,
  });
});

test('a folder without repositories fails to start', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'difero-empty-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await mkdir(join(parent, 'plain'));
  await assert.rejects(startServer({ cwd: parent, assetsDir: parent }), /not a git repository/);
});

test('the events stream reports a new version when files change', async (t) => {
  const root = await makeRepo(t);
  execFileSync('git', ['-C', root, 'config', 'core.excludesFile', '/dev/null']);
  await writeFile(join(root, 'a.txt'), 'one\n');
  const { server } = await startServer({ cwd: root, assetsDir: root });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const { version } = await (await fetch(`${base}/api/diff?mode=all`)).json();
  assert.match(version, /^[0-9a-f]{40}$/);

  const response = await fetch(`${base}/api/events`);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const versions = [];
  const reading = (async () => {
    let buffer = '';
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      for (const [, data] of buffer.matchAll(/^data: (.*)\n\n/gm)) {
        versions.push(JSON.parse(data).version);
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2);
    }
  })();
  t.after(() => reading.catch(() => {}));
  const waitFor = async (count) => {
    while (versions.length < count) await delay(20);
  };

  await waitFor(1);
  assert.deepEqual(versions, [version]);
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'node_modules', 'dep.js'), 'x\n');
  await delay(1000);
  assert.deepEqual(versions, [version]);

  await writeFile(join(root, 'a.txt'), 'one\ntwo\n');
  await waitFor(2);
  assert.notEqual(versions[1], version);
  assert.equal((await (await fetch(`${base}/api/diff?mode=all`)).json()).version, versions[1]);
});

test('reveal is refused when disabled, cross-origin, or outside the repository', async (t) => {
  const root = await makeRepo(t);
  await writeFile(join(root, 'file.txt'), 'hello\n');
  const disabled = await startServer({ cwd: root, assetsDir: root, reveal: false });
  t.after(() => disabled.server.close());
  const sameOrigin = { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } };
  assert.equal((await fetch(`${disabled.url}api/reveal?path=file.txt`, sameOrigin)).status, 403);

  const enabled = await startServer({ cwd: root, assetsDir: root, reveal: true });
  t.after(() => enabled.server.close());
  const crossSite = { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } };
  assert.equal((await fetch(`${enabled.url}api/reveal?path=file.txt`, crossSite)).status, 403);
  assert.equal((await fetch(`${enabled.url}api/reveal?path=../x`, sameOrigin)).status, 400);
  assert.equal((await fetch(`${enabled.url}api/reveal?path=missing.txt`, sameOrigin)).status, 404);
});

test('canReveal is off over SSH and on headless Linux', () => {
  assert.equal(canReveal({ SSH_CONNECTION: '1 2 3 4' }, 'darwin'), false);
  assert.equal(canReveal({}, 'darwin'), true);
  assert.equal(canReveal({}, 'win32'), true);
  assert.equal(canReveal({}, 'linux'), false);
  assert.equal(canReveal({ WAYLAND_DISPLAY: 'wayland-0' }, 'linux'), true);
});

test('svg files stay as code and can be previewed as a sandboxed image', async (t) => {
  const root = await makeRepo(t);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>\n';
  await writeFile(join(root, 'icon.svg'), svg);
  const { server, url } = await startServer({ cwd: root, assetsDir: root, reveal: false });
  t.after(() => server.close());
  const { files } = await (await fetch(`${url}api/diff`)).json();
  assert.equal(files[0].imageMime, null);
  assert.equal(files[0].binary, false);
  const image = await fetch(`${url}api/image?mode=all&path=icon.svg&side=new`);
  assert.equal(image.headers.get('content-type'), 'image/svg+xml');
  assert.match(image.headers.get('content-security-policy'), /sandbox/);
  assert.equal(await image.text(), svg);
});
