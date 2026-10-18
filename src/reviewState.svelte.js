import { tick } from 'svelte';
import { fileId, formatComments, LARGE_FILE_LINES, orderFiles, prepareFile } from './review.js';

const validModes = new Set(['all', 'staged', 'unstaged']);
const initialMode = new URLSearchParams(window.location.search).get('mode');

export class ReviewState {
  mode = $state(validModes.has(initialMode) ? initialMode : 'all');
  root = $state('');
  files = $state.raw([]);
  comments = $state.raw([]);
  draft = $state.raw(null);
  loading = $state(false);
  activeFile = $state(null);
  search = $state('');
  collapsedFolders = $state.raw(new Set());
  collapsedFiles = $state.raw({});
  toastMessage = $state('');
  toastVisible = $state(false);
  request = 0;
  toastTimer;

  commentsKey() {
    return `difff:comments:${this.root}`;
  }

  collapsedFilesKey() {
    return `difff:collapsed-files:${this.root}`;
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
      document.title = `Difff - ${parts.slice(-2).join('/')}`;
      this.files = orderFiles(result.files.map(prepareFile));
      this.activeFile = this.files[0]?.path || null;
      await tick();
      this.updateActiveFile();
    } catch (error) {
      if (currentRequest === this.request) this.toast(`Could not load diff: ${error.message}`);
    } finally {
      if (currentRequest === this.request) this.loading = false;
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
    document.getElementById(fileId(path))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  moveFile(direction) {
    if (!this.files.length) return;
    const index = this.files.findIndex((file) => file.path === this.activeFile);
    const next = Math.max(0, Math.min(this.files.length - 1, index + direction));
    this.navigateToFile(this.files[next].path);
  }

  updateActiveFile() {
    if (!this.files.length) return;
    const threshold = 87;
    let visible = this.files.at(-1).path;
    for (const file of this.files) {
      const card = document.getElementById(fileId(file.path));
      if (!card) continue;
      const bounds = card.getBoundingClientRect();
      if (bounds.top <= threshold && bounds.bottom > threshold) {
        visible = file.path;
        break;
      }
      if (bounds.top > threshold) {
        visible = file.path;
        break;
      }
    }
    this.activeFile = visible;
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
