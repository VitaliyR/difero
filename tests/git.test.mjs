import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { findRoot, getChanges, getImage } from '../server/git.mjs';

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
}

test('all, staged, and unstaged use the right snapshots and include untracked files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difff-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'changed.txt'), 'original\n');
  await writeFile(join(root, 'removed.txt'), 'gone\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');

  await writeFile(join(root, 'changed.txt'), 'staged\n');
  await writeFile(join(root, 'new.txt'), 'staged new\n');
  git(root, 'add', 'changed.txt', 'new.txt');
  await writeFile(join(root, 'changed.txt'), 'working\n');
  await writeFile(join(root, 'new.txt'), 'working new\n');
  await writeFile(join(root, 'fresh.txt'), 'untracked\n');
  await rm(join(root, 'removed.txt'));

  await mkdir(join(root, 'nested'));
  assert.equal(await findRoot(join(root, 'nested')), await realpath(root));

  const staged = await getChanges(root, 'staged');
  assert.deepEqual(
    staged.files.map((file) => file.path),
    ['changed.txt', 'new.txt'],
  );
  assert.deepEqual(
    staged.files.find((file) => file.path === 'changed.txt'),
    {
      path: 'changed.txt',
      oldPath: null,
      status: 'modified',
      oldFile: 'original\n',
      newFile: 'staged\n',
      binary: false,
      tooLarge: false,
      oldExists: true,
      newExists: true,
      oldMode: '100644',
      newMode: '100644',
      imageMime: null,
      untracked: false,
      lines: 1,
      additions: 1,
      deletions: 1,
    },
  );
  assert.equal(staged.files.find((file) => file.path === 'new.txt').oldFile, null);

  const unstaged = await getChanges(root, 'unstaged');
  assert.deepEqual(
    unstaged.files.map((file) => file.path),
    ['changed.txt', 'fresh.txt', 'new.txt', 'removed.txt'],
  );
  assert.equal(unstaged.files.find((file) => file.path === 'changed.txt').oldFile, 'staged\n');
  assert.equal(unstaged.files.find((file) => file.path === 'changed.txt').newFile, 'working\n');
  assert.equal(unstaged.files.find((file) => file.path === 'new.txt').oldFile, 'staged new\n');
  assert.equal(unstaged.files.find((file) => file.path === 'fresh.txt').untracked, true);
  assert.equal(unstaged.files.find((file) => file.path === 'removed.txt').newFile, null);
  assert.equal(unstaged.files.find((file) => file.path === 'removed.txt').deletions, 1);
  assert.equal(unstaged.files.find((file) => file.path === 'fresh.txt').additions, 1);

  const all = await getChanges(root, 'all');
  assert.equal(all.files.find((file) => file.path === 'changed.txt').oldFile, 'original\n');
  assert.equal(all.files.find((file) => file.path === 'changed.txt').newFile, 'working\n');
  assert.equal(all.files.find((file) => file.path === 'fresh.txt').oldFile, null);
});

test('tracked renames retain their original path in staged and all views', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difff-renames-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'before.txt'), 'same contents\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  await writeFile(join(root, 'after.txt'), 'same contents\n');
  await rm(join(root, 'before.txt'));
  git(root, 'add', '-A');

  for (const mode of ['staged', 'all']) {
    const { files } = await getChanges(root, mode);
    assert.equal(files.length, 1);
    assert.equal(files[0].status, 'renamed');
    assert.equal(files[0].oldPath, 'before.txt');
    assert.equal(files[0].path, 'after.txt');
    assert.equal(files[0].oldFile, 'same contents\n');
    assert.equal(files[0].newFile, 'same contents\n');
    assert.equal(files[0].additions, 0);
    assert.equal(files[0].deletions, 0);
  }
});

test('image snapshots follow all, staged, and unstaged modes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difff-images-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  const original = Buffer.from([137, 80, 78, 71, 0, 1]);
  const staged = Buffer.from([137, 80, 78, 71, 0, 2]);
  const working = Buffer.from([137, 80, 78, 71, 0, 3]);
  await writeFile(join(root, 'image.png'), original);
  git(root, 'add', 'image.png');
  git(root, 'commit', '-qm', 'initial');
  await writeFile(join(root, 'image.png'), staged);
  git(root, 'add', 'image.png');
  await writeFile(join(root, 'image.png'), working);
  for (const [mode, before, after] of [
    ['staged', original, staged],
    ['unstaged', staged, working],
    ['all', original, working],
  ]) {
    const { files } = await getChanges(root, mode);
    assert.equal(files[0].imageMime, 'image/png');
    assert.equal(files[0].oldExists, true);
    assert.equal(files[0].newExists, true);
    assert.deepEqual((await getImage(root, mode, 'image.png', 'old')).bytes, before);
    assert.deepEqual((await getImage(root, mode, 'image.png', 'new')).bytes, after);
  }
  assert.equal(await getImage(root, 'all', '../image.png', 'new'), null);
  assert.equal(await getImage(root, 'all', 'image.png', 'wrong'), null);
});

test('an unborn repository shows staged and untracked additions', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difff-unborn-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  await writeFile(join(root, 'staged.txt'), 'in index\n');
  await writeFile(join(root, 'untracked.txt'), 'on disk\n');
  git(root, 'add', 'staged.txt');

  const staged = await getChanges(root, 'staged');
  assert.deepEqual(
    staged.files.map((file) => file.path),
    ['staged.txt'],
  );
  const unstaged = await getChanges(root, 'unstaged');
  assert.deepEqual(
    unstaged.files.map((file) => file.path),
    ['untracked.txt'],
  );
  const all = await getChanges(root, 'all');
  assert.deepEqual(
    all.files.map((file) => file.path),
    ['staged.txt', 'untracked.txt'],
  );
});

test('a tracked file larger than the git output buffer is reported as too large', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difff-huge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'huge.txt'), 'x'.repeat(33 * 1024 * 1024));
  await writeFile(join(root, 'small.txt'), 'before\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  await writeFile(join(root, 'huge.txt'), 'small now\n');
  await writeFile(join(root, 'small.txt'), 'after\n');
  git(root, 'add', '.');

  for (const mode of ['all', 'staged']) {
    const { files } = await getChanges(root, mode);
    const huge = files.find((file) => file.path === 'huge.txt');
    assert.equal(huge.tooLarge, true);
    assert.equal(huge.oldFile, null);
    assert.equal(files.find((file) => file.path === 'small.txt').newFile, 'after\n');
  }
});

test('permission-only changes are listed with their file modes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difff-mode-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.fileMode', 'true');
  await writeFile(join(root, 'script.sh'), 'echo hi\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  await chmod(join(root, 'script.sh'), 0o755);

  for (const mode of ['all', 'unstaged']) {
    const { files } = await getChanges(root, mode);
    assert.equal(files.length, 1);
    assert.equal(files[0].oldMode, '100644');
    assert.equal(files[0].newMode, '100755');
    assert.equal(files[0].additions, 0);
    assert.equal(files[0].deletions, 0);
  }
  assert.equal((await getChanges(root, 'staged')).files.length, 0);
});
