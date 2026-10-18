import { execFile, spawn } from 'node:child_process';
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

export async function getBaseBranches(root) {
  const output = await git(
    root,
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'],
    {
      encoding: 'utf8',
    },
  );
  const current = (await git(root, ['branch', '--show-current'], { encoding: 'utf8' })).trim();
  const branches = output
    .split('\n')
    .filter((name) => name && !name.endsWith('/HEAD') && name !== current);
  const remoteHead = await git(
    root,
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
    {
      encoding: 'utf8',
      allowMissing: true,
    },
  );
  const suggested =
    [remoteHead?.trim(), 'main', 'origin/main', 'master', 'origin/master'].find((name) =>
      branches.includes(name),
    ) ??
    branches[0] ??
    null;
  return { branches, suggested };
}

async function baseCommit(root, base, available = null) {
  const { branches, suggested } = available ?? (await getBaseBranches(root));
  const selected = base || suggested;
  if (!selected || !branches.includes(selected)) throw new Error('Choose an available base branch');
  const commit = await git(root, ['merge-base', selected, 'HEAD'], {
    encoding: 'utf8',
    allowMissing: true,
  });
  if (!commit) throw new Error(`No common ancestor with ${selected}`);
  return { base: selected, commit: commit.trim(), branches };
}

function paths(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function objectId(value) {
  return /^0+$/.test(value) ? null : value;
}

function fileMode(value) {
  return value === '000000' ? null : value;
}

function diffEntries(buffer) {
  const fields = paths(buffer);
  const entries = [];
  for (let index = 0; index < fields.length;) {
    const [oldMode, newMode, oldBlob, newBlob, status] = fields[index++].slice(1).split(' ');
    const oldPath = fields[index++];
    const path = /^[RC]/.test(status) ? fields[index++] : oldPath;
    entries.push({
      path,
      oldPath: oldPath === path ? null : oldPath,
      oldMode: fileMode(oldMode),
      newMode: fileMode(newMode),
      oldBlob: objectId(oldBlob),
      newBlob: objectId(newBlob),
    });
  }
  return entries;
}

function blobSizes(root, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return Promise.resolve(new Map());
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['-C', root, 'cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file failed: ${stderr.trim()}`));
        return;
      }
      const sizes = new Map();
      for (const line of stdout.split('\n')) {
        const [id, type, size] = line.split(' ');
        if (type === 'blob') sizes.set(id, Number(size));
      }
      resolve(sizes);
    });
    child.stdin.end(unique.map((id) => `${id}\n`).join(''));
  });
}

async function blobFile(root, id, sizes, maxBytes) {
  if (!id || !sizes.has(id)) return null;
  if (sizes.get(id) > maxBytes) return { tooLarge: true };
  return git(root, ['cat-file', 'blob', id]);
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

function lineCount(contents) {
  if (!contents) return 0;
  const lines = contents.split('\n').length;
  return contents.endsWith('\n') ? lines - 1 : lines;
}

function numstatEntries(buffer) {
  const stats = new Map();
  if (!buffer) return stats;
  const fields = buffer.toString('utf8').split('\0');
  for (let index = 0; index < fields.length;) {
    const field = fields[index++];
    if (!field) continue;
    let [additions, deletions, path] = field.split('\t');
    // Renames have an empty path followed by separate old and new path fields.
    if (!path) {
      index++;
      path = fields[index++];
    }
    stats.set(path, { additions: Number(additions) || 0, deletions: Number(deletions) || 0 });
  }
  return stats;
}

async function changeStats(root, mode, comparison) {
  const args = ['--numstat', '-z', '-M', '--no-ext-diff'];
  const value =
    mode === 'staged'
      ? await git(root, ['diff', '--cached', ...args])
      : mode === 'unstaged'
        ? await git(root, ['diff', ...args])
        : await git(root, ['diff', comparison ?? 'HEAD', ...args], { allowMissing: true });
  return numstatEntries(value);
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

async function changedPaths(root, mode, comparison) {
  const args = ['--raw', '-z', '-M', '--no-abbrev', '--no-ext-diff'];
  const [staged, unstaged, all, untracked] = await Promise.all([
    git(root, ['diff', '--cached', ...args]),
    git(root, ['diff', ...args]),
    mode === 'all' || mode === 'base'
      ? git(root, ['diff', comparison ?? 'HEAD', ...args], { allowMissing: true })
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
          ? [...diffEntries(staged), ...diffEntries(unstaged)].map((entry) => ({
              ...entry,
              oldMode: null,
              oldBlob: null,
            }))
          : diffEntries(all);
  const entries = new Map(tracked.map((entry) => [entry.path, entry]));
  if (mode !== 'staged') {
    for (const path of untrackedPaths) {
      if (!entries.has(path)) {
        entries.set(path, {
          path,
          oldPath: null,
          oldMode: null,
          newMode: null,
          oldBlob: null,
          newBlob: null,
        });
      }
    }
  }
  return {
    entries: [...entries.values()].sort((a, b) => a.path.localeCompare(b.path)),
    untrackedPaths,
  };
}

export async function getChanges(root, mode = 'all', base = null) {
  if (!['all', 'base', 'staged', 'unstaged'].includes(mode)) throw new Error('Invalid diff mode');
  const available = mode === 'base' ? await getBaseBranches(root) : null;
  if (available && !available.branches.length) {
    return { root, mode, base: null, branches: [], files: [] };
  }
  const baseInfo = mode === 'base' ? await baseCommit(root, base, available) : null;
  const comparison = baseInfo?.commit;
  const [{ entries, untrackedPaths }, stats] = await Promise.all([
    changedPaths(root, mode, comparison),
    changeStats(root, mode, comparison),
  ]);
  const sizes = await blobSizes(
    root,
    entries.flatMap((entry) => [entry.oldBlob, mode === 'staged' ? entry.newBlob : null]),
  );
  const files = await mapLimit(
    entries,
    8,
    async ({ path, oldPath, oldMode, newMode, oldBlob, newBlob }) => {
      const possibleImageMime = IMAGE_MIME[extname(path).toLowerCase()];
      const maxBytes = possibleImageMime ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      const [before, after] = await Promise.all([
        blobFile(root, oldBlob, sizes, maxBytes),
        mode === 'staged'
          ? blobFile(root, newBlob, sizes, maxBytes)
          : workingFile(root, path, maxBytes),
      ]);
      const oldFile = toText(before);
      const newFile = toText(after);
      if (!oldFile.exists && !newFile.exists) return null;
      const modeChanged = Boolean(oldMode && newMode && oldMode !== newMode);
      if (
        !oldPath &&
        !modeChanged &&
        oldFile.contents !== null &&
        oldFile.contents === newFile.contents
      )
        return null;
      const binary = oldFile.binary || newFile.binary;
      const tooLarge = oldFile.tooLarge || newFile.tooLarge;
      const imageMime =
        possibleImageMime &&
        [before, after].every(
          (value) => value === null || (Buffer.isBuffer(value) && value.length <= MAX_IMAGE_BYTES),
        )
          ? possibleImageMime
          : null;
      const lines = Math.max(lineCount(oldFile.contents), lineCount(newFile.contents));
      const counted = !imageMime && !binary && !tooLarge;
      const stat = counted
        ? oldFile.contents === null || newFile.contents === null
          ? { additions: lineCount(newFile.contents), deletions: lineCount(oldFile.contents) }
          : (stats.get(path) ?? { additions: 0, deletions: 0 })
        : { additions: 0, deletions: 0 };
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
        oldMode,
        newMode,
        imageMime,
        untracked: untrackedPaths.includes(path),
        lines,
        ...stat,
      };
    },
  );
  return {
    root,
    mode,
    base: baseInfo?.base ?? null,
    branches: baseInfo?.branches ?? null,
    files: files.filter(Boolean),
  };
}

export async function getImage(root, mode, path, side, base = null) {
  if (!['all', 'base', 'staged', 'unstaged'].includes(mode) || !['old', 'new'].includes(side))
    return null;
  const mime = typeof path === 'string' ? IMAGE_MIME[extname(path).toLowerCase()] : null;
  if (!mime) return null;
  if (mode === 'base' && !(await getBaseBranches(root)).branches.length) return null;
  const comparison = mode === 'base' ? (await baseCommit(root, base)).commit : null;
  const entry = (await changedPaths(root, mode, comparison)).entries.find(
    (item) => item.path === path,
  );
  if (!entry) return null;
  const blob = side === 'old' ? entry.oldBlob : entry.newBlob;
  const value =
    side === 'new' && mode !== 'staged'
      ? await workingFile(root, path, MAX_IMAGE_BYTES)
      : await blobFile(root, blob, await blobSizes(root, [blob]), MAX_IMAGE_BYTES);
  if (!Buffer.isBuffer(value) || value.length > MAX_IMAGE_BYTES) return null;
  return { bytes: value, mime };
}
