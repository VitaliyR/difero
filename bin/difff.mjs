#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.mjs';

const assetsDir = fileURLToPath(new URL('../dist/', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);

function printHelp() {
  console.log(`difff v${version}

Usage: difff [options]

Options:
  --no-open    Start the server without opening a browser
  -h, --help   Show this help`);
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    console.error(`Could not open a browser automatically. Open ${url} yourself.`);
  });
  child.unref();
}

if (args.includes('-h') || args.includes('--help')) {
  printHelp();
} else {
  try {
    const { server, url, root } = await startServer({ cwd: resolve(process.cwd()), assetsDir });
    console.log(
      `difff v${version}  ${root}\n              ${url}\n              Press Ctrl+C to stop.`,
    );
    if (!args.includes('--no-open')) openBrowser(url);
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => server.close(() => process.exit(0)));
    }
  } catch (error) {
    console.error(`difff: ${error.message}`);
    process.exitCode = 1;
  }
}
