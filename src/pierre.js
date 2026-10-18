import { FileDiff } from '@pierre/diffs';
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker';
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker';
import { flushSync, mount, unmount } from 'svelte';
import CommentAnnotation from './CommentAnnotation.svelte';
import GutterCommentButton from './GutterCommentButton.svelte';

const THEME = 'pierre-dark';

let workerPool;

function getWorkerPool() {
  workerPool ??= getOrCreateWorkerPoolSingleton({
    poolOptions: {
      workerFactory: () => new DiffsWorker(),
      poolSize: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
    },
    highlighterOptions: { theme: THEME },
  });
  return workerPool;
}

export function primeHighlight(metadata) {
  return getWorkerPool().primeDiffHighlightCache(metadata);
}

function annotationsFor(comments, draft) {
  const annotations = comments
    .filter((item) => item.id !== draft?.editingId)
    .map((item) => ({
      side: item.side,
      lineNumber: item.line,
      metadata: { id: item.id, kind: 'comment' },
    }));
  if (draft) {
    annotations.push({
      side: draft.side,
      lineNumber: draft.line,
      metadata: { id: 'draft', kind: 'draft' },
    });
  }
  return annotations;
}

export function createDiff({
  file,
  metadata,
  container,
  getComments,
  getDraft,
  onBegin,
  onCancel,
  onAdd,
  onEdit,
  onDelete,
}) {
  const mounted = [];
  const gutterMounted = [];

  function renderAnnotation(annotation) {
    const draft = annotation.metadata.kind === 'draft' ? getDraft() : null;
    const comment = draft ? null : getComments().find((item) => item.id === annotation.metadata.id);
    const host = document.createElement('div');
    if (!draft && !comment) return host;
    mounted.push(
      mount(CommentAnnotation, {
        target: host,
        props: { path: file.path, draft, comment, onCancel, onSave: onAdd, onEdit, onDelete },
      }),
    );
    flushSync();
    return host;
  }

  const instance = new FileDiff(
    {
      theme: THEME,
      themeType: 'dark',
      diffStyle: 'unified',
      disableFileHeader: true,
      hunkSeparators: 'line-info',
      expansionLineCount: 30,
      enableGutterUtility: true,
      lineHoverHighlight: 'both',
      // The library's overscroll-behavior-x: none makes Chrome latch any wheel
      // gesture that starts with a horizontal component to the code block, which
      // can't scroll vertically, so the page ignores the rest of the gesture.
      unsafeCSS:
        '[data-code] { overscroll-behavior-x: auto; } [data-separator-content] { cursor: pointer; }',
      renderGutterUtility(getHoveredLine) {
        const host = document.createElement('span');
        gutterMounted.push(
          mount(GutterCommentButton, {
            target: host,
            props: { path: file.path, getHoveredLine, onBegin },
          }),
        );
        flushSync();
        return host;
      },
      onLineNumberClick({ lineNumber, annotationSide }) {
        onBegin(file.path, lineNumber, annotationSide);
      },
      renderAnnotation,
    },
    getWorkerPool(),
  );

  function clearAnnotations() {
    for (const component of mounted.splice(0)) unmount(component);
  }

  function expandFromSeparator(event) {
    const path = event.composedPath();
    if (path.some((node) => node instanceof Element && node.hasAttribute('data-expand-button')))
      return;
    const separator = path.find(
      (node) => node instanceof Element && node.hasAttribute('data-expand-index'),
    );
    if (!separator) return;
    event.stopPropagation();
    const hunkIndex = Number(separator.getAttribute('data-expand-index'));
    instance.expandHunk(hunkIndex, separator.hasAttribute('data-separator-last') ? 'up' : 'down');
  }
  container.addEventListener('click', expandFromSeparator, true);

  instance.render({
    fileDiff: metadata,
    lineAnnotations: annotationsFor(getComments(), getDraft()),
    containerWrapper: container,
  });

  return {
    setAnnotations(comments, draft) {
      clearAnnotations();
      instance.setLineAnnotations(annotationsFor(comments, draft));
      instance.rerender();
    },
    cleanUp() {
      clearAnnotations();
      container.removeEventListener('click', expandFromSeparator, true);
      for (const component of gutterMounted) unmount(component);
      instance.cleanUp();
    },
  };
}
