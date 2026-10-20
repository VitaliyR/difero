<script>
  import { onMount } from 'svelte';

  const SIDEBAR_KEY = 'difero:sidebar-width';

  let { width = $bindable(270) } = $props();
  let handle;

  onMount(() => {
    const savedWidth = Number(sessionStorage.getItem(SIDEBAR_KEY));
    if (savedWidth >= 190 && savedWidth <= 560) setWidth(savedWidth);
  });

  function setWidth(value) {
    const maxWidth = Math.min(560, window.innerWidth - 400);
    width = Math.round(Math.max(190, Math.min(maxWidth, value)));
    return width;
  }

  function onResize() {
    if (width > window.innerWidth - 400) setWidth(width);
  }

  function startResize(event) {
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-sidebar');
  }

  function moveResize(event) {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    setWidth(event.clientX - handle.parentElement.getBoundingClientRect().left);
  }

  function finishResize(event) {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    document.body.classList.remove('resizing-sidebar');
    sessionStorage.setItem(SIDEBAR_KEY, String(width));
  }

  function resizeWithKeyboard(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    sessionStorage.setItem(
      SIDEBAR_KEY,
      String(setWidth(width + (event.key === 'ArrowLeft' ? -20 : 20))),
    );
  }
</script>

<svelte:window onresize={onResize} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  id="sidebar-resize"
  class="sidebar-resize"
  role="separator"
  aria-label="Resize sidebar"
  aria-orientation="vertical"
  tabindex="0"
  bind:this={handle}
  onpointerdown={startResize}
  onpointermove={moveResize}
  onpointerup={finishResize}
  onpointercancel={() => document.body.classList.remove('resizing-sidebar')}
  onkeydown={resizeWithKeyboard}
></div>

<style>
  .sidebar-resize {
    background: var(--border-subtle);
    border: 0;
    border-radius: 0;
    padding: 0;
    cursor: col-resize;
    position: relative;
  }
  .sidebar-resize:hover,
  .sidebar-resize:focus-visible,
  :global(body.resizing-sidebar) .sidebar-resize {
    background: var(--accent);
    outline: none;
  }
  :global(body.resizing-sidebar) {
    cursor: col-resize;
    user-select: none;
  }
  @media (max-width: 760px) {
    .sidebar-resize {
      display: none;
    }
  }
</style>
