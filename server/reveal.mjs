import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function canReveal(env = process.env, platform = process.platform) {
  if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY) return false;
  if (platform === 'darwin' || platform === 'win32') return true;
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      ...options,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolvePromise(child);
    });
  });
}

function exited(child) {
  return new Promise((resolvePromise) => {
    child.once('error', () => resolvePromise(1));
    child.once('exit', (code) => resolvePromise(code));
  });
}

async function revealOnLinux(target) {
  const child = spawn(
    'dbus-send',
    [
      '--session',
      '--print-reply',
      '--dest=org.freedesktop.FileManager1',
      '/org/freedesktop/FileManager1',
      'org.freedesktop.FileManager1.ShowItems',
      `array:string:${pathToFileURL(target).href}`,
      'string:',
    ],
    { stdio: 'ignore' },
  );
  if ((await exited(child)) === 0) return;
  await run('xdg-open', [dirname(target)]);
}

export async function revealFile(root, path) {
  if (typeof path !== 'string' || !path) {
    throw Object.assign(new Error('Missing path'), { status: 400 });
  }
  const target = resolve(root, path);
  const relativePath = relative(root, target);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw Object.assign(new Error('Path is outside the repository'), { status: 400 });
  }
  await stat(target);
  if (process.platform === 'darwin') await run('open', ['-R', target]);
  else if (process.platform === 'win32') {
    // Explorer only understands the path quoted after the comma, so skip Node's quoting.
    await run('explorer.exe', [`/select,"${target}"`], { windowsVerbatimArguments: true });
  } else await revealOnLinux(target);
}
