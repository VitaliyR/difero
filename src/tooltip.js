import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { flushSync, mount, unmount } from 'svelte';
import Tooltip from './Tooltip.svelte';

let nextId = 0;

export function tooltip(text) {
  return (node) => {
    let bubble;
    let host;
    let component;
    let cleanupPosition;
    let showTimer;
    const id = `difero-tooltip-${++nextId}`;

    function place() {
      if (!bubble) return;
      computePosition(node, bubble, {
        strategy: 'fixed',
        placement: 'bottom',
        middleware: [offset(7), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (!bubble) return;
        Object.assign(bubble.style, { left: `${x}px`, top: `${y}px` });
      });
    }

    function show() {
      clearTimeout(showTimer);
      if (!text || bubble) return;
      host = document.createElement('div');
      document.body.append(host);
      component = mount(Tooltip, { target: host, props: { id, text } });
      flushSync();
      bubble = host.firstElementChild;
      node.setAttribute('aria-describedby', id);
      cleanupPosition = autoUpdate(node, bubble, place);
    }

    function hide() {
      clearTimeout(showTimer);
      cleanupPosition?.();
      cleanupPosition = null;
      if (component) unmount(component);
      component = null;
      host?.remove();
      host = null;
      bubble = null;
      node.removeAttribute('aria-describedby');
    }

    function onEnter() {
      clearTimeout(showTimer);
      showTimer = setTimeout(show, 300);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') hide();
    }

    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', hide);
    node.addEventListener('focus', show);
    node.addEventListener('blur', hide);
    node.addEventListener('keydown', onKeyDown);

    return () => {
      hide();
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', hide);
      node.removeEventListener('focus', show);
      node.removeEventListener('blur', hide);
      node.removeEventListener('keydown', onKeyDown);
    };
  };
}
