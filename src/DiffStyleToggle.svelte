<script>
  import { tooltip } from './tooltip.js';
  import splitIcon from './assets/split.svg';
  import unifiedIcon from './assets/unified.svg';

  let { value, onChange } = $props();

  const styles = [
    { id: 'unified', label: 'Unified', icon: unifiedIcon },
    { id: 'split', label: 'Split', icon: splitIcon },
  ];

  let current = $derived(styles.find((style) => style.id === value) ?? styles[0]);
  let next = $derived(styles.find((style) => style.id !== current.id));
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
<button
  type="button"
  class="diff-style-icon-toggle"
  aria-label={`${current.label} view, switch to ${next.label.toLowerCase()}`}
  {@attach tooltip(`Switch to ${next.label.toLowerCase()} view`)}
  onclick={() => onChange(next.id)}
>
  <span class="mask-icon" style={`mask-image:url('${current.icon}')`} aria-hidden="true"></span>
</button>

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
  .diff-style-icon-toggle {
    display: none;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--accent-text);
  }
  .mask-icon {
    width: 18px;
    height: 18px;
    background: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
  }
  @media (max-width: 760px) {
    .diff-style-toggle {
      display: none;
    }
    .diff-style-icon-toggle {
      display: grid;
    }
  }
</style>
