<script>
  let { message, visible, action, onHold, onRelease, onHide } = $props();
</script>

<div
  id="toast"
  class="toast"
  class:visible
  class:has-action={action}
  role="status"
  aria-live="polite"
  onpointerenter={() => action && onHold()}
  onpointerleave={() => action && onRelease()}
>
  {message}
  {#if action}
    <button
      type="button"
      class="toast-action"
      onclick={() => {
        const { run } = action;
        onHide();
        run();
      }}
    >
      {action.label}
    </button>
  {/if}
</div>

<style>
  .toast {
    position: fixed;
    z-index: 100;
    bottom: 25px;
    right: 25px;
    background: var(--surface-control);
    border: 1px solid var(--border-strong);
    color: var(--text);
    padding: 11px 15px;
    border-radius: 8px;
    box-shadow: 0 12px 28px var(--shadow);
    opacity: 0;
    transform: translateY(7px);
    pointer-events: none;
    transition: 0.18s;
    font-size: 12px;
  }
  .toast.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .toast.visible.has-action {
    pointer-events: auto;
  }
  .toast-action {
    margin-left: 12px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-text);
    font: inherit;
    font-weight: 700;
  }
  .toast-action:hover {
    text-decoration: underline;
  }
</style>
