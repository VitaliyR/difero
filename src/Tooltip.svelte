<script>
  let { id, text } = $props();

  const display = $derived(text.replaceAll('/', '/​'));
</script>

<div {id} class="difero-tooltip" role="tooltip">{display}</div>

<style>
  .difero-tooltip {
    position: fixed;
    z-index: 1000;
    max-width: min(320px, calc(100vw - 16px));
    padding: 6px 9px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface-control);
    box-shadow: 0 8px 24px var(--shadow);
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
    pointer-events: none;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
</style>
