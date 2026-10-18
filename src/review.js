import { parseDiffFromFile } from '@pierre/diffs';

export const LARGE_FILE_LINES = 500;

function lineCount(contents) {
  if (contents === null || contents === '') return 0;
  const lines = contents.split('\n').length;
  return contents.endsWith('\n') ? lines - 1 : lines;
}

export function prepareFile(file) {
  const lines = Math.max(lineCount(file.oldFile), lineCount(file.newFile));
  if (file.imageMime || file.binary || file.tooLarge)
    return { ...file, lines, additions: 0, deletions: 0 };
  const oldFile =
    file.oldFile === null ? null : { name: file.oldPath || file.path, contents: file.oldFile };
  const newFile = file.newFile === null ? null : { name: file.path, contents: file.newFile };
  const metadata = parseDiffFromFile(oldFile, newFile);
  let additions = 0;
  let deletions = 0;
  for (const hunk of metadata.hunks) {
    for (const part of hunk.hunkContent) {
      if (part.type === 'change') {
        additions += part.additions;
        deletions += part.deletions;
      }
    }
  }
  return { ...file, metadata, lines, additions, deletions };
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
