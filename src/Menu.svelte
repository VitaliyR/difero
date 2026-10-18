<script>
  let { label, triggerClass = '', align = 'left', trigger, children } = $props();
  let open = $state(false);
  let root;

  const close = () => (open = false);

  function closeOnOutsidePointer(event) {
    if (open && !root.contains(event.target)) close();
  }

  function closeOnEscape(event) {
    if (!open || event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  }
</script>

<svelte:window onpointerdown={closeOnOutsidePointer} onkeydowncapture={closeOnEscape} />

<div class="menu" bind:this={root}>
  <button
    type="button"
    class={['menu-trigger', triggerClass]}
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {@render trigger()}
  </button>
  {#if open}
    <div class="menu-popover" class:align-right={align === 'right'} role="menu">
      {@render children(close)}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    display: flex;
  }
  .menu-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 20;
    min-width: 200px;
    padding: 5px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 9px;
    box-shadow: 0 12px 28px var(--shadow);
  }
  .menu-popover.align-right {
    left: auto;
    right: 0;
  }
  .menu-popover :global([role^='menuitem']) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text-secondary);
    font-size: 14px;
    text-align: left;
    white-space: nowrap;
  }
  .menu-popover :global([role^='menuitem']:hover:not(:disabled)) {
    background: var(--surface-control);
  }
  .menu-popover :global([role^='menuitem'][aria-checked='true']) {
    background: var(--accent-bg);
    color: var(--accent-text);
    font-weight: 600;
  }
  .menu-popover :global([role^='menuitem']:disabled) {
    opacity: 0.45;
    cursor: default;
  }
  .menu-popover :global(hr) {
    margin: 5px 4px;
    border: 0;
    border-top: 1px solid var(--border-subtle);
  }
</style>
