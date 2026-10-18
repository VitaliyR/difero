import { tick } from 'svelte';
import {
  diffKey,
  estimatedHeight,
  fileId,
  formatComments,
  isRenderable,
  LARGE_FILE_LINES,
  orderFiles,
  parseContents,
} from './review.js';
import { primeHighlight } from './pierre.js';
import { resetRenderBudget } from './renderScheduler.js';
import { scrollToCard } from './scrollToCard.js';

const NO_COMMENTS = [];
const PRELOAD_MARGIN = 1500;
const PRELOAD_TIMEOUT = 1500;

const validModes = new Set(['all', 'staged', 'unstaged']);
const initialMode = new URLSearchParams(window.location.search).get('mode');

export class ReviewState {
  mode = $state(validModes.has(initialMode) ? initialMode : 'all');
  loadedMode = $state(this.mode);
  root = $state('');
  files = $state.raw([]);
  comments = $state.raw([]);
  draft = $state.raw(null);
  loading = $state(false);
  loaded = $state(false);
  activeFile = $state(null);
  search = $state('');
  collapsedFolders = $state.raw(new Set());
  collapsedFiles = $state.raw({});
  toastMessage = $state('');
  toastVisible = $state(false);
  commentsByPath = $derived(groupByPath(this.comments, this.previousGroups));
  previousGroups = new Map();
  request = 0;
  snapshot = null;
  expiredSnapshot = null;
  navigation = null;
  diffs = new Map();
  toastTimer;

  commentsFor(path) {
    return this.commentsByPath.get(path) ?? NO_COMMENTS;
  }

  draftFor(path) {
    return this.draft?.path === path ? this.draft : null;
  }

  loadDiff(file, snapshot = this.snapshot) {
    const key = diffKey(file);
    let diff = this.diffs.get(key);
    if (!diff) {
      const params = new URLSearchParams({ snapshot, path: file.path });
      diff = fetch(`/api/file?${params}`, { cache: 'no-store' })
        .then(async (response) => {
          if (response.status === 404 && snapshot === this.snapshot) {
            this.reloadExpiredSnapshot(snapshot);
            throw new Error('Snapshot expired');
          }
          if (!response.ok) throw new Error(await response.text());
          return parseContents(file, await response.json());
        })
        .catch((error) => {
          if (this.diffs.get(key) === diff) this.diffs.delete(key);
          if (snapshot === this.snapshot && snapshot !== this.expiredSnapshot)
            this.toast(`Could not load ${file.path}: ${error.message}`);
          throw error;
        });
      this.diffs.set(key, diff);
    }
    return diff;
  }

  reloadExpiredSnapshot(snapshot) {
    if (this.expiredSnapshot === snapshot) return;
    this.expiredSnapshot = snapshot;
    this.reload();
  }

  // Waits for the diffs that will be on screen so the new list doesn't flash empty cards.
  async preloadDiffs(files, snapshot) {
    const top = window.scrollY - PRELOAD_MARGIN;
    const bottom = window.scrollY + window.innerHeight + PRELOAD_MARGIN;
    const pending = [];
    let offset = 0;
    for (const file of files) {
      if (offset > bottom) break;
      const collapsed = this.isFileCollapsed(file);
      const height = 64 + (collapsed || !isRenderable(file) ? 0 : estimatedHeight(file));
      if (offset + height >= top && !collapsed && isRenderable(file)) {
        pending.push(
          this.loadDiff(file, snapshot)
            .then(primeHighlight)
            .catch(() => {}),
        );
      }
      offset += height;
    }
    await Promise.race([
      Promise.all(pending),
      new Promise((resolve) => setTimeout(resolve, PRELOAD_TIMEOUT)),
    ]);
  }

  commentsKey() {
    return `difero:comments:${this.root}`;
  }

  collapsedFilesKey() {
    return `difero:collapsed-files:${this.root}`;
  }

  loadComments() {
    try {
      const value = JSON.parse(localStorage.getItem(this.commentsKey()) || '[]');
      this.comments = Array.isArray(value)
        ? value.filter(
            (item) =>
              typeof item.path === 'string' &&
              Number.isInteger(item.line) &&
              typeof item.text === 'string',
          )
        : [];
    } catch {
      this.comments = [];
    }
  }

  loadCollapsedFiles() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(this.collapsedFilesKey()) || '{}');
      this.collapsedFiles = Object.fromEntries(
        Object.entries(saved).filter(([, collapsed]) => typeof collapsed === 'boolean'),
      );
    } catch {
      this.collapsedFiles = {};
    }
  }

  saveComments() {
    localStorage.setItem(this.commentsKey(), JSON.stringify(this.comments));
  }

  toast(message) {
    this.toastMessage = message;
    this.toastVisible = true;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastVisible = false), 2800);
  }

  async reload() {
    const currentRequest = ++this.request;
    this.loading = true;
    try {
      const response = await fetch(`/api/diff?mode=${this.mode}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      if (currentRequest !== this.request) return;
      const rootChanged = this.root !== result.root;
      this.root = result.root;
      if (rootChanged) {
        this.loadComments();
        this.loadCollapsedFiles();
      }
      const parts = result.cwd.split(/[\\/]/).filter(Boolean);
      document.title = `Difero - ${parts.slice(-2).join('/')}`;
      const files = orderFiles(result.files);
      const keys = new Set(files.map(diffKey));
      for (const key of this.diffs.keys()) if (!keys.has(key)) this.diffs.delete(key);
      await this.preloadDiffs(files, result.snapshot);
      if (currentRequest !== this.request) return;
      this.snapshot = result.snapshot;
      this.loadedMode = result.mode;
      this.files = files;
      resetRenderBudget();
      this.activeFile = this.files[0]?.path || null;
      await tick();
      this.updateActiveFile();
    } catch (error) {
      if (currentRequest === this.request) this.toast(`Could not load diff: ${error.message}`);
    } finally {
      if (currentRequest === this.request) {
        this.loading = false;
        this.loaded = true;
      }
    }
  }

  setMode(nextMode) {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    const url = new URL(window.location.href);
    url.searchParams.set('mode', nextMode);
    history.replaceState(null, '', url);
    this.draft = null;
    this.reload();
  }

  async copyComments({ clear }) {
    if (!this.comments.length) return;
    try {
      await navigator.clipboard.writeText(formatComments(this.comments));
      if (clear) {
        this.comments = [];
        this.draft = null;
        this.saveComments();
      }
      this.toast(clear ? 'Comments copied and cleared' : 'Comments copied');
    } catch {
      this.toast('Clipboard access failed. Check browser permissions.');
    }
  }

  async navigateToFile(path) {
    this.activeFile = path;
    const parts = path.split('/');
    const expanded = new Set(this.collapsedFolders);
    for (let index = 1; index < parts.length; index++) {
      expanded.delete(parts.slice(0, index).join('/'));
    }
    this.collapsedFolders = expanded;
    await tick();
    const card = document.getElementById(fileId(path));
    if (!card) return;
    this.navigation?.abort();
    const navigation = (this.navigation = new AbortController());
    const { signal } = navigation;
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
      window.addEventListener(type, () => navigation.abort(), { once: true, signal });
    }
    await scrollToCard(card, signal);
    navigation.abort();
    if (this.navigation === navigation) this.navigation = null;
  }

  moveFile(direction) {
    if (!this.files.length) return;
    const index = this.files.findIndex((file) => file.path === this.activeFile);
    const next = Math.max(0, Math.min(this.files.length - 1, index + direction));
    this.navigateToFile(this.files[next].path);
  }

  updateActiveFile() {
    if (!this.files.length || this.navigation) return;
    const threshold = 87;
    let low = 0;
    let high = this.files.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      const card = document.getElementById(fileId(this.files[middle].path));
      if (card && card.getBoundingClientRect().bottom > threshold) high = middle;
      else low = middle + 1;
    }
    this.activeFile = this.files[low].path;
  }

  toggleFolder(path) {
    const next = new Set(this.collapsedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.collapsedFolders = next;
  }

  isFileCollapsed(file) {
    return this.collapsedFiles[file.path] ?? file.lines > LARGE_FILE_LINES;
  }

  async toggleFile(file) {
    const card = document.getElementById(fileId(file.path));
    const bounds = card?.getBoundingClientRect();
    const wasSticky = bounds && bounds.top < 86 && bounds.bottom > 86;
    this.collapsedFiles = {
      ...this.collapsedFiles,
      [file.path]: !this.isFileCollapsed(file),
    };
    sessionStorage.setItem(this.collapsedFilesKey(), JSON.stringify(this.collapsedFiles));
    if (wasSticky && this.isFileCollapsed(file)) {
      await tick();
      requestAnimationFrame(() => {
        const top = card.getBoundingClientRect().top + window.scrollY - 86;
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        this.updateActiveFile();
      });
    }
  }

  beginComment(path, line, side) {
    if (!line) return;
    this.draft = { path, line, side: side || 'additions', text: '' };
  }

  editComment(id) {
    const comment = this.comments.find((item) => item.id === id);
    if (comment) this.draft = { ...comment, editingId: id };
  }

  addComment() {
    if (!this.draft?.text.trim()) return;
    const { editingId, ...comment } = this.draft;
    this.comments = editingId
      ? this.comments.map((item) =>
          item.id === editingId ? { ...comment, text: comment.text.trim() } : item,
        )
      : [...this.comments, { ...comment, id: crypto.randomUUID(), text: comment.text.trim() }];
    this.draft = null;
    this.saveComments();
    this.toast(editingId ? 'Comment updated' : 'Comment added');
  }

  deleteComment(id) {
    this.comments = this.comments.filter((item) => item.id !== id);
    this.saveComments();
  }

  destroy() {
    clearTimeout(this.toastTimer);
  }
}

// Reuses unchanged arrays so only diffs whose comments changed re-render.
function groupByPath(comments, previous) {
  const groups = new Map();
  for (const comment of comments) {
    const group = groups.get(comment.path);
    if (group) group.push(comment);
    else groups.set(comment.path, [comment]);
  }
  for (const [path, group] of groups) {
    const old = previous.get(path);
    if (old?.length === group.length && old.every((item, index) => item === group[index])) {
      groups.set(path, old);
    }
  }
  previous.clear();
  for (const [path, group] of groups) previous.set(path, group);
  return groups;
}
