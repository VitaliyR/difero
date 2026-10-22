<script>
  let { value, onChange } = $props();

  const styles = [
    { id: 'unified', label: 'Unified' },
    { id: 'split', label: 'Split' },
  ];
</script>

<div class="diff-style-toggle" role="group" aria-label="Diff layout">
  {#each styles as style (style.id)}
    <button
      type="button"
      class:active={value === style.id}
      aria-pressed={value === style.id}
      onclick={() => onChange(style.id)}
    >
      {style.label}
    </button>
  {/each}
</div>

<style>
  .diff-style-toggle {
    flex: none;
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  button {
    border: 0;
    border-radius: 6px;
    padding: 4px 10px;
    background: transparent;
    color: var(--text-subtle);
    font-size: 12px;
    font-weight: 600;
  }
  button:hover {
    background: var(--surface-control);
    color: var(--text);
  }
  button.active {
    background: var(--accent-bg);
    color: var(--accent-text);
  }
</style>
