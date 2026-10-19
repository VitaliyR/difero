import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from '../server/index.mjs';

const assetsDir = fileURLToPath(new URL('../dist/', import.meta.url));

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
}

test('long diff lines remain horizontally scrollable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difero-browser-scroll-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'long.txt'), `${'a'.repeat(600)}\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  await writeFile(join(root, 'long.txt'), `${'b'.repeat(600)}\n`);

  const { server, url } = await startServer({ cwd: root, assetsDir });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(url);
  await page.locator('.pierre-container [data-code]').waitFor();
  const scroll = await page.locator('.pierre-container [data-code]').evaluate((code) => {
    const width = code.scrollWidth - code.clientWidth;
    code.scrollLeft = 100;
    return { width, left: code.scrollLeft };
  });
  assert.ok(scroll.width > 100);
  assert.ok(scroll.left > 0);
});

test('base branch selector reviews committed changes against a chosen branch', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difd-browser-base-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'file.txt'), 'main\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  git(root, 'branch', '-M', 'main');
  git(root, 'switch', '-qc', 'parent');
  await writeFile(join(root, 'file.txt'), 'parent\n');
  git(root, 'commit', '-qam', 'parent');
  git(root, 'switch', '-qc', 'feature');
  await writeFile(join(root, 'file.txt'), 'feature\n');
  git(root, 'commit', '-qam', 'feature');

  const { server, url } = await startServer({ cwd: root, assetsDir });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByRole('button', { name: 'Base 4' }).click();
  await page.getByRole('heading', { name: 'Changes since main' }).waitFor();
  await page.getByRole('combobox', { name: 'Base branch' }).selectOption('parent');
  await page.getByRole('heading', { name: 'Changes since parent' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('base'), 'parent');
  assert.equal(await page.locator('.diff-card').count(), 1);
});

test('browser review flow: tree, navigation, resize, comments, and shortcuts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difero-browser-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'tracked.js'), 'const value = 1;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  await writeFile(join(root, 'tracked.js'), 'const value = 2;\n');
  git(root, 'add', 'tracked.js');
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/fresh.js'), 'const fresh = true;\nconst second = 2;\n');

  const { server, url } = await startServer({ cwd: join(root, 'src'), assetsDir });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('heading', { name: 'Working changes' }).waitFor();
  const logo = page.locator('.brand-logo');
  assert.equal(await logo.getAttribute('alt'), 'Difero');
  assert.equal(await logo.evaluate((node) => node.naturalWidth), 1500);
  for (const [path, type] of [
    ['/favicon.ico', 'image/x-icon'],
    ['/favicon-32x32.png', 'image/png'],
    ['/favicon-16x16.png', 'image/png'],
  ]) {
    const response = await page.request.get(new URL(path, url).href);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['content-type'], type);
  }
  assert.equal(await page.title(), `Difero - ${root.split('/').at(-1)}/src`);
  assert.equal(await page.locator('.repo-name').count(), 1);
  assert.equal(await page.locator('[title]').count(), 0);
  await page.getByRole('button', { name: 'Reload changes' }).hover();
  await page.getByRole('tooltip', { name: 'Reload changes (R)' }).waitFor();
  await page.mouse.move(800, 800);
  assert.equal(await page.getByRole('tooltip').count(), 0);
  assert.ok(await page.locator('.folder-icon').count());
  for (const selector of ['.folder-icon', '.file-row[data-path="src/fresh.js"] .plus-icon']) {
    const mask = await page
      .locator(selector)
      .first()
      .evaluate((node) => getComputedStyle(node).maskImage);
    assert.match(mask, /\/assets\/(folder|plus)-[^"/]+\.svg/);
  }
  const folderIconX = await page
    .locator('.folder-row', { hasText: 'src' })
    .locator('.folder-icon')
    .evaluate((node) => node.getBoundingClientRect().left);
  const fileIconX = await page
    .locator('.file-row[data-path="src/fresh.js"] .status-dot')
    .evaluate((node) => node.getBoundingClientRect().left);
  assert.ok(Math.abs(folderIconX - fileIconX) <= 1);
  const sidebarPlusOffset = await page
    .locator('.file-row[data-path="src/fresh.js"] .status-dot')
    .evaluate((node) => {
      const badge = node.getBoundingClientRect();
      const plus = node.querySelector('.plus-icon').getBoundingClientRect();
      return [
        plus.x + plus.width / 2 - (badge.x + badge.width / 2),
        plus.y + plus.height / 2 - (badge.y + badge.height / 2),
      ];
    });
  assert.ok(sidebarPlusOffset.every((offset) => Math.abs(offset) < 1));
  assert.equal(await page.locator('#sidebar-stats .stat-row').count(), 4);
  assert.match(await page.locator('#sidebar-stats').innerText(), /Additions\s+\+3/);
  assert.match(await page.locator('#sidebar-stats').innerText(), /Deletions\s+−1/);
  const firstLineGap = await page
    .locator('.diff-card')
    .first()
    .evaluate((card) => {
      const headerBottom = card.querySelector('.diff-card-heading').getBoundingClientRect().bottom;
      const firstLine = card
        .querySelector('.pierre-container')
        .firstElementChild.shadowRoot.querySelector('[data-line]');
      return firstLine.getBoundingClientRect().top - headerBottom;
    });
  assert.ok(firstLineGap <= 1, `First diff line has ${firstLineGap}px of top spacing`);
  if (process.env.DIFERO_SCREENSHOT) await page.screenshot({ path: process.env.DIFERO_SCREENSHOT });

  await page.keyboard.press('2');
  await page.getByRole('heading', { name: 'Staged changes' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('mode'), 'staged');
  await page.reload();
  await page.getByRole('heading', { name: 'Staged changes' }).waitFor();
  assert.equal(await page.locator('.file-row').count(), 1);
  const stagedCard = page.locator('.diff-card').filter({ hasText: 'tracked.js' });
  const oldLine = stagedCard.locator('[data-line="1"][data-line-type="change-deletion"]').first();
  await oldLine.hover();
  await stagedCard.locator('button[data-difero-comment]').click();
  await stagedCard.getByText('Comment on tracked.js:1 (old)').waitFor();
  await page.getByPlaceholder('Write a review comment…').fill('Check removed value');
  await page.getByPlaceholder('Write a review comment…').press('ControlOrMeta+Enter');
  await stagedCard.getByText('Comment · tracked.js:1 (old)').waitFor();
  await page.reload();
  await stagedCard.getByText('Comment · tracked.js:1 (old)').waitFor();
  await stagedCard
    .locator('[data-column-number="1"][data-line-type="change-deletion"]')
    .first()
    .click();
  await stagedCard.getByText('Comment on tracked.js:1 (old)').waitFor();
  await page.getByPlaceholder('Write a review comment…').fill('Check old line number');
  await page.getByPlaceholder('Write a review comment…').press('ControlOrMeta+Enter');
  await page.keyboard.press('c');
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /tracked\.js:1 \(old\) Check removed value/,
  );
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /tracked\.js:1 \(old\) Check old line number/,
  );
  await page.keyboard.press('3');
  await page.getByRole('heading', { name: 'Unstaged changes' }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('mode'), 'unstaged');
  assert.equal(await page.locator('.file-row').count(), 1);
  const folder = page.locator('.folder-row', { hasText: 'src' });
  await folder.click();
  assert.equal(await page.locator('.file-row').count(), 0);
  await folder.click();
  assert.equal(await page.locator('.file-row').count(), 1);

  await writeFile(join(root, 'src/later.js'), 'const later = true;\n'.repeat(100));
  await writeFile(join(root, 'src/large.js'), 'const value = 1;\n'.repeat(501));
  await writeFile(
    join(root, 'src/icon.png'),
    await readFile(fileURLToPath(new URL('../public/favicon-32x32.png', import.meta.url))),
  );
  await writeFile(join(root, 'a.txt'), 'root file\n');
  await page.keyboard.press('r');
  await page.getByText('src/large.js', { exact: true }).first().waitFor();
  const imageCard = page.locator('.diff-card').filter({ hasText: 'src/icon.png' });
  const image = imageCard.getByRole('img', { name: 'After: src/icon.png' });
  await image.waitFor();
  assert.equal(await image.evaluate((node) => node.naturalWidth), 32);
  assert.equal(await imageCard.getByText('Before').count(), 0);
  const imageResponse = await page.request.get(new URL(await image.getAttribute('src'), url).href);
  assert.equal(imageResponse.status(), 200);
  assert.equal(imageResponse.headers()['content-type'], 'image/png');
  assert.equal(
    (
      await page.request.get(
        new URL('/api/image?mode=unstaged&path=../../etc/passwd&side=new', url).href,
      )
    ).status(),
    404,
  );
  assert.deepEqual(
    await page.locator('.file-row').evaluateAll((nodes) => nodes.map((node) => node.dataset.path)),
    await page.locator('.diff-card .diff-path').allTextContents(),
  );
  const largeCard = page.locator('.diff-card').filter({ hasText: 'src/large.js' });
  assert.equal(await largeCard.locator('.diff-card-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await largeCard.locator('.pierre-container').count(), 0);
  assert.equal(await largeCard.locator('.collapsed-summary').count(), 0);
  await largeCard.locator('.diff-card-toggle').click();
  assert.equal(await largeCard.locator('.diff-card-toggle').getAttribute('aria-expanded'), 'true');
  await largeCard.evaluate((node) =>
    window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top + 350),
  );
  const stickyTop = await largeCard
    .locator('.diff-card-heading')
    .evaluate((node) => node.getBoundingClientRect().top);
  assert.ok(Math.abs(stickyTop - 62) <= 1, `File heading stopped at ${stickyTop}px`);
  await page.waitForFunction(
    () => document.querySelector('.file-row.active')?.dataset.path === 'src/large.js',
  );
  await largeCard.locator('.diff-card-toggle').click();
  await page.waitForFunction(() => {
    const card = [...document.querySelectorAll('.diff-card')].find((node) =>
      node.querySelector('.diff-path')?.textContent.includes('src/large.js'),
    );
    return (
      card?.classList.contains('collapsed') && Math.abs(card.getBoundingClientRect().top - 86) <= 2
    );
  });
  assert.equal(await page.locator('.file-row.active').getAttribute('data-path'), 'src/large.js');
  await largeCard.locator('.diff-card-toggle').click();
  await largeCard.evaluate((node) =>
    window.scrollTo(0, window.scrollY + node.getBoundingClientRect().bottom - 15),
  );
  const releasedTop = await largeCard
    .locator('.diff-card-heading')
    .evaluate((node) => node.getBoundingClientRect().top);
  assert.ok(releasedTop < 62, `File heading did not release: ${releasedTop}px`);
  await page.evaluate(() => window.scrollTo(0, 0));

  const sidebar = page.locator('.sidebar');
  const originalWidth = await sidebar.evaluate((node) => node.getBoundingClientRect().width);
  const handle = await page.locator('#sidebar-resize').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 120);
  await page.mouse.down();
  await page.mouse.move(handle.x + 85, handle.y + 120);
  await page.mouse.up();
  const resizedWidth = await sidebar.evaluate((node) => node.getBoundingClientRect().width);
  assert.ok(resizedWidth > originalWidth + 50);
  await page.reload();
  await page.getByRole('heading', { name: 'Unstaged changes' }).waitFor();
  assert.equal(await largeCard.locator('.diff-card-toggle').getAttribute('aria-expanded'), 'true');
  await largeCard.locator('.diff-card-toggle').click();
  await page.reload();
  await page.getByRole('heading', { name: 'Unstaged changes' }).waitFor();
  assert.equal(await largeCard.locator('.diff-card-toggle').getAttribute('aria-expanded'), 'false');
  const freshCard = page.locator('.diff-card').filter({ hasText: 'src/fresh.js' });
  await freshCard.locator('.diff-card-toggle').click();
  await page.reload();
  await page.getByRole('heading', { name: 'Unstaged changes' }).waitFor();
  assert.equal(await freshCard.locator('.diff-card-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(
    await sidebar.evaluate((node) => Math.round(node.getBoundingClientRect().width)),
    Math.round(resizedWidth),
  );
  await page.keyboard.press('3');
  await page.getByRole('heading', { name: 'Unstaged changes' }).waitFor();

  await page.keyboard.press('?');
  assert.equal(await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).isVisible(), true);
  const packageJson = JSON.parse(
    await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  );
  assert.equal(await page.locator('.app-version').innerText(), `v${packageJson.version}`);
  assert.equal(
    await page.getByRole('link', { name: 'Vitalii Rybachenko' }).getAttribute('href'),
    'https://ribachenko.com',
  );
  const closeButton = page.getByRole('button', { name: 'Close shortcuts' });
  assert.deepEqual(
    await closeButton.evaluate((node) => [node.offsetWidth, node.offsetHeight]),
    [32, 32],
  );
  assert.equal(await closeButton.evaluate((node) => getComputedStyle(node).borderStyle), 'solid');
  const iconOffset = await closeButton.evaluate((node) => {
    const button = node.getBoundingClientRect();
    const icon = node.querySelector('.close-icon').getBoundingClientRect();
    return [
      icon.x + icon.width / 2 - (button.x + button.width / 2),
      icon.y + icon.height / 2 - (button.y + button.height / 2),
    ];
  });
  assert.ok(iconOffset.every((offset) => Math.abs(offset) < 1));
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).isVisible(), false);
  assert.equal(
    await page.locator('.top-actions button').last().getAttribute('aria-label'),
    'Keyboard shortcuts',
  );

  const firstPath = await page.locator('.file-row.active').getAttribute('data-path');
  await page.keyboard.press('j');
  assert.notEqual(await page.locator('.file-row.active').getAttribute('data-path'), firstPath);
  await page.keyboard.press('k');
  assert.equal(await page.locator('.file-row.active').getAttribute('data-path'), firstPath);

  await freshCard.locator('.diff-card-toggle').click();
  for (const [line, comment] of [
    [1, 'Check first line'],
    [2, 'Check second line'],
  ]) {
    await freshCard
      .locator(`[data-line="${line}"][data-line-type="change-addition"]`)
      .first()
      .hover();
    const addCommentButton = freshCard.locator('button[data-difero-comment]');
    const commentPlusOffset = await addCommentButton.evaluate((node) => {
      const button = node.getBoundingClientRect();
      const plus = node.querySelector('.plus-icon').getBoundingClientRect();
      return [
        plus.x + plus.width / 2 - (button.x + button.width / 2),
        plus.y + plus.height / 2 - (button.y + button.height / 2),
      ];
    });
    assert.ok(commentPlusOffset.every((offset) => Math.abs(offset) < 1));
    await addCommentButton.click();
    const input = page.getByPlaceholder('Write a review comment…');
    assert.equal(await input.evaluate((node) => getComputedStyle(node).minHeight), '42px');
    assert.equal(await input.evaluate((node) => node.getBoundingClientRect().height), 84);
    const cancel = page.getByRole('button', { name: 'Cancel' });
    const save = page.getByRole('button', { name: 'Add comment' });
    const cancelColor = await cancel.evaluate((node) => getComputedStyle(node).backgroundColor);
    const saveColor = await save.evaluate((node) => getComputedStyle(node).backgroundColor);
    await cancel.hover();
    assert.notEqual(
      await cancel.evaluate((node) => getComputedStyle(node).backgroundColor),
      cancelColor,
    );
    await save.hover();
    assert.notEqual(
      await save.evaluate((node) => getComputedStyle(node).backgroundColor),
      saveColor,
    );
    await input.fill(comment);
    await input.press('ControlOrMeta+Enter');
    await freshCard.getByText(`Comment · src/fresh.js:${line}`).waitFor();
  }
  const deleteComment = freshCard.getByRole('button', { name: 'Delete comment on src/fresh.js:2' });
  assert.ok(await deleteComment.locator('.trash-icon').count());
  await page.keyboard.press('c');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /src\/fresh\.js:1 Check first line/);
  assert.match(copied, /src\/fresh\.js:2 Check second line/);
  assert.equal(await page.locator('.copy-button').isEnabled(), true);
  const editComment = freshCard.getByRole('button', { name: 'Edit comment on src/fresh.js:1' });
  await editComment.click();
  const editingInput = page.getByPlaceholder('Write a review comment…');
  assert.equal(await editingInput.inputValue(), 'Check first line');
  await editingInput.fill('Check updated first line');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await freshCard.getByText('Check updated first line').waitFor();
  await page.reload();
  await freshCard.getByText('Check updated first line').waitFor();
  await page.keyboard.press('c');
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /src\/fresh\.js:1 Check updated first line/,
  );
  await deleteComment.click();
  assert.equal(await freshCard.getByText('Comment · src/fresh.js:2').count(), 0);
  await page.keyboard.press('Alt+c');
  await page.waitForFunction(() => document.querySelector('.copy-button')?.disabled);
  git(root, 'reset', '-q', 'HEAD');
  await page.keyboard.press('2');
  await page.getByRole('heading', { name: 'Nothing to review' }).waitFor();
  assert.equal(await page.locator('.empty-logo').evaluate((node) => node.naturalWidth), 1500);
  const emptyOffset = await page.locator('.empty-state').evaluate((node) => {
    const content = node.closest('.content').getBoundingClientRect();
    const empty = node.getBoundingClientRect();
    return empty.y + empty.height / 2 - (content.y + content.height / 2);
  });
  assert.ok(Math.abs(emptyOffset) < 1, `Empty state is ${emptyOffset}px off center`);
  assert.deepEqual(errors, []);
});

test('a review whose snapshot expired reloads instead of failing', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difero-expired-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  await writeFile(join(root, 'large.js'), 'const value = 1;\n'.repeat(501));

  const { server, url } = await startServer({ cwd: root, assetsDir });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const card = page.locator('.diff-card').filter({ hasText: 'large.js' });
  await card.locator('.diff-card-toggle').waitFor();
  assert.equal(await card.locator('.diff-card-toggle').getAttribute('aria-expanded'), 'false');

  for (let index = 0; index < 5; index++) {
    await page.request.get(new URL('/api/diff?mode=all', url).href);
  }
  const reloaded = page.waitForResponse((response) => response.url().includes('/api/diff'));
  await card.locator('.diff-card-toggle').click();
  await reloaded;
  await card.locator('[data-line="501"]').first().waitFor();
  assert.equal(await page.locator('#toast').innerText(), '');
  assert.deepEqual(errors, []);
});

test('clicking a separator bar reveals 30 lines next to the change', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'difero-browser-expand-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'commit.gpgsign', 'false');
  const lines = Array.from({ length: 110 }, (_, index) => `line ${index + 1}`);
  await writeFile(join(root, 'file.txt'), `${lines.join('\n')}\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'initial');
  lines[104] = 'changed';
  await writeFile(join(root, 'file.txt'), `${lines.join('\n')}\n`);

  const { server, url } = await startServer({ cwd: root, assetsDir });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(url);
  const code = page.locator('.pierre-container [data-code]');
  await code.waitFor();
  await code.getByText('100 unmodified lines').first().waitFor();
  for (const remaining of [70, 40, 10]) {
    const bar = code.locator('[data-separator-content]').first();
    const box = await bar.boundingBox();
    await bar.click({ position: { x: box.width - 10, y: box.height / 2 } });
    await code.getByText(`${remaining} unmodified lines`).first().waitFor();
  }
  assert.equal(await code.getByText('line 71', { exact: true }).count(), 1);
  assert.equal(await code.getByText('line 10', { exact: true }).count(), 0);
});

test('a folder of repositories switches between them from the sidebar', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'difero-browser-workspace-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  for (const name of ['api', 'web']) {
    const root = join(parent, name);
    git(parent, 'init', '-q', name);
    await writeFile(join(root, `${name}.txt`), `${name}\n`);
  }

  const { server, url } = await startServer({ cwd: parent, assetsDir });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  await page.locator('.file-row[data-path="api.txt"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('repo'), 'api');
  assert.equal(await page.locator('.repo-row').count(), 2);
  assert.equal(await page.locator('.repo-row.active').getAttribute('data-repo'), 'api');
  assert.equal(await page.locator('.repo-name').innerText(), 'api');

  const filter = page.getByLabel('Filter repositories and files');
  await filter.fill('we');
  assert.deepEqual(
    await page.locator('.repo-row').evaluateAll((rows) => rows.map((row) => row.dataset.repo)),
    ['web'],
  );
  await filter.fill('xyz');
  assert.equal(await page.locator('.repo-row').count(), 0);
  await page.locator('#repo-list').getByText('No matching repositories').waitFor();
  assert.equal(await page.locator('.file-row').count(), 0);
  await filter.fill('web');
  await page.locator('.repo-row[data-repo="web"]').click();
  assert.equal(await filter.inputValue(), '');
  await page.locator('.file-row[data-path="web.txt"]').waitFor();
  assert.equal(await page.locator('.file-row').count(), 1);
  assert.equal(new URL(page.url()).searchParams.get('repo'), 'web');
  assert.equal(await page.title(), `Difero - ${parent.split('/').at(-1)}/web`);

  await page.goto(url);
  await page.locator('.file-row[data-path="web.txt"]').waitFor();

  await rm(join(parent, 'web'), { recursive: true, force: true });
  await page.keyboard.press('r');
  await page.locator('.file-row[data-path="api.txt"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('repo'), 'api');
  assert.equal(await page.locator('.repo-row.active').getAttribute('data-repo'), 'api');
  assert.equal(await page.locator('.repo-row').count(), 1);

  await rm(join(parent, 'api'), { recursive: true, force: true });
  await page.keyboard.press('r');
  await page.getByRole('heading', { name: 'No repositories' }).waitFor();
  assert.equal(await page.locator('.file-row').count(), 0);
  assert.equal(await page.locator('.repo-row').count(), 0);
  await page.locator('#repo-list').getByText('No repositories').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('repo'), null);
  assert.equal(await page.locator('.repo-name').count(), 0);

  git(parent, 'init', '-q', 'docs');
  await writeFile(join(parent, 'docs', 'guide.md'), '# guide\n');
  await page.keyboard.press('r');
  await page.locator('.file-row[data-path="guide.md"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('repo'), 'docs');
});
