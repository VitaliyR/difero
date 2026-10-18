import { parseDiffFromFile } from '@pierre/diffs';

export const LARGE_FILE_LINES = 500;

export function hasSameContents(file) {
  return file.oldHash !== null && file.oldHash === file.newHash;
}

export function isRenderable(file) {
  return !file.imageMime && !file.binary && !file.tooLarge && !hasSameContents(file);
}

export function diffKey(file) {
  return `${file.oldPath}\0${file.path}\0${file.oldHash}\0${file.newHash}`;
}

export function estimatedHeight(file) {
  return Math.min(file.lines, file.additions + file.deletions + 6) * 20 + 16;
}

export function parseContents(file, { oldFile, newFile }) {
  const oldName = file.oldPath || file.path;
  return parseDiffFromFile(
    oldFile === null
      ? null
      : { name: oldName, contents: oldFile, cacheKey: `${oldName}:${file.oldHash}` },
    newFile === null
      ? null
      : { name: file.path, contents: newFile, cacheKey: `${file.path}:${file.newHash}` },
  );
}

export function fileId(path) {
  return `file-${Array.from(new TextEncoder().encode(path), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function formatComments(comments) {
  return comments
    .map(
      ({ path, line, side, text }) =>
        `${path}:${line}${side === 'deletions' ? ' (old)' : ''} ${text.trim().replace(/\s*\n\s*/g, ' ')}`,
    )
    .join('\n');
}

export function treeRows(files, collapsedFolders, search) {
  const filtered = files.filter(({ path }) => path.toLowerCase().includes(search.toLowerCase()));
  const root = { folders: new Map(), files: [], count: 0 };
  for (const file of filtered) {
    const parts = file.path.split('/');
    let branch = root;
    branch.count++;
    for (const name of parts.slice(0, -1)) {
      if (!branch.folders.has(name)) {
        branch.folders.set(name, { folders: new Map(), files: [], count: 0 });
      }
      branch = branch.folders.get(name);
      branch.count++;
    }
    branch.files.push(file);
  }
  const rows = [];
  function visit(branch, parentPath, depth) {
    for (const [name, folder] of [...branch.folders.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const path = parentPath ? `${parentPath}/${name}` : name;
      const collapsed = collapsedFolders.has(path) && !search;
      rows.push({ kind: 'folder', path, name, depth, count: folder.count, collapsed });
      if (!collapsed) visit(folder, path, depth + 1);
    }
    for (const file of branch.files.sort((a, b) => a.path.localeCompare(b.path))) {
      rows.push({ kind: 'file', path: file.path, name: file.path.split('/').at(-1), depth, file });
    }
  }
  visit(root, '', 0);
  return rows;
}

export function orderFiles(files) {
  return treeRows(files, new Set(), '')
    .filter((row) => row.kind === 'file')
    .map((row) => row.file);
}
