import { FileDiff } from '@pierre/diffs';
import { flushSync, mount, unmount } from 'svelte';
import CommentAnnotation from './CommentAnnotation.svelte';
import GutterCommentButton from './GutterCommentButton.svelte';

export function annotationsFor(path, comments, draft) {
  const annotations = comments
    .filter((item) => item.path === path && item.id !== draft?.editingId)
    .map((item) => ({
      side: item.side,
      lineNumber: item.line,
      metadata: { id: item.id, kind: 'comment' },
    }));
  if (draft?.path === path) {
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

  const instance = new FileDiff({
    theme: 'pierre-dark',
    themeType: 'dark',
    diffStyle: 'unified',
    disableFileHeader: true,
    hunkSeparators: 'simple',
    enableGutterUtility: true,
    lineHoverHighlight: 'both',
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
  });

  function clearAnnotations() {
    for (const component of mounted.splice(0)) unmount(component);
  }

  instance.render({
    fileDiff: file.metadata,
    lineAnnotations: annotationsFor(file.path, getComments(), getDraft()),
    containerWrapper: container,
  });

  return {
    setLineAnnotations: (value) => instance.setLineAnnotations(value),
    rerender() {
      clearAnnotations();
      instance.rerender();
    },
    cleanUp() {
      clearAnnotations();
      for (const component of gutterMounted) unmount(component);
      instance.cleanUp();
    },
  };
}
