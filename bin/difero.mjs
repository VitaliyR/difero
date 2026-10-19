#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.mjs';

const assetsDir = fileURLToPath(new URL('../dist/', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const DEFAULT_PORT = 4747;

function printHelp() {
  console.log(`difero v${version}

Usage: difero [options]

Options:
  --port <n>   Port to listen on (default ${DEFAULT_PORT}, or the next free one)
  --no-open    Start the server without opening a browser
  -h, --help   Show this help`);
}

function parsePort() {
  const index = args.findIndex((arg) => arg === '--port' || arg.startsWith('--port='));
  if (index === -1) return null;
  const value = args[index].includes('=') ? args[index].slice('--port='.length) : args[index + 1];
  const port = Number(value);
  if (!/^\d+$/.test(value ?? '') || port > 65535) {
    throw new Error(`invalid --port value: ${value ?? '(missing)'}`);
  }
  return port;
}

function openBrowser(url) {
  const platform = process.platform;
  // Editors like VS Code Remote set BROWSER to a helper that opens URLs on the local machine.
  const command =
    process.env.BROWSER ||
    (platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open');
  const args = platform === 'win32' && !process.env.BROWSER ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    console.error(`Could not open a browser automatically. Open ${url} yourself.`);
  });
  child.unref();
}

function isRemoteSession() {
  const { SSH_CONNECTION, SSH_CLIENT, SSH_TTY, BROWSER } = process.env;
  return Boolean((SSH_CONNECTION || SSH_CLIENT || SSH_TTY) && !BROWSER);
}

function hasCommand(name) {
  return (process.env.PATH ?? '').split(delimiter).some((dir) => {
    try {
      accessSync(join(dir, name), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

if (args.includes('-h') || args.includes('--help')) {
  printHelp();
} else {
  try {
    const port = parsePort();
    const { server, url, root, repos } = await startServer({
      cwd: resolve(process.cwd()),
      assetsDir,
      port: port ?? DEFAULT_PORT,
      fallbackToFreePort: port === null,
    });
    const header = `difero v${version}  `;
    const indent = ' '.repeat(header.length);
    const location = repos
      ? `${root}  (${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'})`
      : root;
    console.log(`${header}${location}\n${indent}${url}\n${indent}Press Ctrl+C to stop.`);
    if (isRemoteSession()) {
      const { port } = server.address();
      const ssh = `ssh -L ${port}:127.0.0.1:${port} <host>`;
      console.log(
        hasCommand('tailscale')
          ? `${indent}Over SSH? Publish it to your tailnet with Tailscale:\n` +
              `${indent}  tailscale serve --bg --https=${port} http://127.0.0.1:${port}\n` +
              `${indent}Or forward the port from your machine and open the URL there:\n` +
              `${indent}  ${ssh}`
          : `${indent}Over SSH? Forward the port from your machine, then open the URL there:\n` +
              `${indent}  ${ssh}`,
      );
    } else if (!args.includes('--no-open')) {
      openBrowser(url);
    }
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => server.close(() => process.exit(0)));
    }
  } catch (error) {
    console.error(`difero: ${error.message}`);
    process.exitCode = 1;
  }
}
