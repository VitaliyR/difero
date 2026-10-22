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

    function onFocus() {
      if (node.matches(':focus-visible')) show();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') hide();
    }

    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', hide);
    node.addEventListener('pointerdown', hide);
    node.addEventListener('focus', onFocus);
    node.addEventListener('blur', hide);
    node.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', hide);

    return () => {
      hide();
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', hide);
      node.removeEventListener('pointerdown', hide);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', hide);
      node.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', hide);
    };
  };
}
