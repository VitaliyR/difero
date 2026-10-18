import { execFile } from 'node:child_process';
import { readFile, lstat, readlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

async function git(root, args, options = {}) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: options.encoding ?? 'buffer',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    if (options.allowMissing && (error.code === 128 || error.code === 1)) return null;
    throw new Error(`git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`, {
      cause: error,
    });
  }
}

export async function findRoot(cwd) {
  const root = await git(cwd, ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return root.trim();
}

function paths(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function diffEntries(buffer) {
  const fields = paths(buffer);
  const entries = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const oldPath = fields[index++];
    const path = /^[RC]/.test(status) ? fields[index++] : oldPath;
    entries.push({ path, oldPath: oldPath === path ? null : oldPath });
  }
  return entries;
}

async function revisionFile(root, revision, path) {
  const spec = revision === 'index' ? `:${path}` : `HEAD:${path}`;
  return git(root, ['show', spec], { allowMissing: true });
}

async function workingFile(root, path, maxBytes = MAX_FILE_BYTES) {
  const fullPath = join(root, path);
  try {
    const stat = await lstat(fullPath);
    if (stat.isSymbolicLink()) return Buffer.from(await readlink(fullPath));
    if (!stat.isFile()) return null;
    if (stat.size > maxBytes) return { tooLarge: true };
    return await readFile(fullPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function toText(value) {
  if (value === null) return { exists: false, contents: null };
  if (value?.tooLarge || value.length > MAX_FILE_BYTES)
    return { exists: true, contents: null, tooLarge: true };
  if (value.includes(0)) return { exists: true, contents: null, binary: true };
  return { exists: true, contents: value.toString('utf8') };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

async function changedPaths(root, mode) {
  const [staged, unstaged, all, untracked] = await Promise.all([
    git(root, ['diff', '--cached', '--name-status', '-z', '-M']),
    git(root, ['diff', '--name-status', '-z', '-M']),
    mode === 'all'
      ? git(root, ['diff', 'HEAD', '--name-status', '-z', '-M'], { allowMissing: true })
      : Promise.resolve(null),
    git(root, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  const untrackedPaths = paths(untracked);
  const tracked =
    mode === 'staged'
      ? diffEntries(staged)
      : mode === 'unstaged'
        ? diffEntries(unstaged)
        : all === null
          ? [...diffEntries(staged), ...diffEntries(unstaged)]
          : diffEntries(all);
  const entries = new Map(tracked.map((entry) => [entry.path, entry]));
  if (mode !== 'staged') {
    for (const path of untrackedPaths) {
      if (!entries.has(path)) entries.set(path, { path, oldPath: null });
    }
  }
  return {
    entries: [...entries.values()].sort((a, b) => a.path.localeCompare(b.path)),
    untrackedPaths,
  };
}

export async function getChanges(root, mode = 'all') {
  if (!['all', 'staged', 'unstaged'].includes(mode)) throw new Error('Invalid diff mode');
  const { entries, untrackedPaths } = await changedPaths(root, mode);
  const files = await mapLimit(entries, 8, async ({ path, oldPath }) => {
    const possibleImageMime = IMAGE_MIME[extname(path).toLowerCase()];
    const [before, after] = await Promise.all([
      mode === 'unstaged'
        ? revisionFile(root, 'index', oldPath || path)
        : revisionFile(root, 'head', oldPath || path),
      mode === 'staged'
        ? revisionFile(root, 'index', path)
        : workingFile(root, path, possibleImageMime ? MAX_IMAGE_BYTES : MAX_FILE_BYTES),
    ]);
    const oldFile = toText(before);
    const newFile = toText(after);
    if (!oldFile.exists && !newFile.exists) return null;
    if (!oldPath && oldFile.contents !== null && oldFile.contents === newFile.contents) return null;
    const binary = oldFile.binary || newFile.binary;
    const tooLarge = oldFile.tooLarge || newFile.tooLarge;
    const imageMime =
      possibleImageMime &&
      [before, after].every(
        (value) => value === null || (Buffer.isBuffer(value) && value.length <= MAX_IMAGE_BYTES),
      )
        ? possibleImageMime
        : null;
    return {
      path,
      oldPath,
      status: oldPath
        ? 'renamed'
        : !oldFile.exists
          ? 'added'
          : !newFile.exists
            ? 'deleted'
            : 'modified',
      oldFile: oldFile.contents,
      newFile: newFile.contents,
      binary: Boolean(binary),
      tooLarge: Boolean(tooLarge),
      oldExists: oldFile.exists,
      newExists: newFile.exists,
      imageMime,
      untracked: untrackedPaths.includes(path),
    };
  });
  return { root, mode, files: files.filter(Boolean) };
}

export async function getImage(root, mode, path, side) {
  if (!['all', 'staged', 'unstaged'].includes(mode) || !['old', 'new'].includes(side)) return null;
  const mime = typeof path === 'string' ? IMAGE_MIME[extname(path).toLowerCase()] : null;
  const entry = (await changedPaths(root, mode)).entries.find((item) => item.path === path);
  if (!mime || !entry) return null;
  const revision = side === 'old' ? (mode === 'unstaged' ? 'index' : 'head') : 'index';
  const value =
    side === 'new' && mode !== 'staged'
      ? await workingFile(root, path, MAX_IMAGE_BYTES)
      : await revisionFile(root, revision, side === 'old' ? entry.oldPath || path : path);
  if (!Buffer.isBuffer(value) || value.length > MAX_IMAGE_BYTES) return null;
  return { bytes: value, mime };
}
