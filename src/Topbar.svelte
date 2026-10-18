<script>
  import { tooltip } from './tooltip.js';

  let {
    root,
    mode,
    base,
    branches,
    loading,
    commentCount,
    onModeChange,
    onBaseChange,
    onReload,
    onCopy,
    onHelp,
  } = $props();

  const modes = [
    { id: 'all', label: 'Working', key: '1' },
    { id: 'staged', label: 'Staged', key: '2' },
    { id: 'unstaged', label: 'Unstaged', key: '3' },
    { id: 'base', label: 'Base', key: '4' },
  ];
  let repoName = $derived(root.split('/').at(-1));
</script>

<header id="topbar" class="topbar">
  <div class="brand">
    <img class="brand-logo" src="/logo.png" alt="Difero" />
    {#if repoName && repoName.toLowerCase() !== 'difero'}<span
        class="repo-name"
        {@attach tooltip(root)}
      >
        {repoName}
      </span>{/if}
  </div>
  <nav class="mode-tabs" aria-label="Diff mode">
    {#each modes as tab (tab.id)}
      <button
        type="button"
        class="mode-tab"
        class:active={mode === tab.id}
        aria-pressed={mode === tab.id}
        onclick={() => onModeChange(tab.id)}
      >
        {tab.label}
        <kbd>{tab.key}</kbd>
      </button>
    {/each}
  </nav>
  {#if mode === 'base' && branches.length}
    <span class="base-picker">
      <select
        class="base-select"
        aria-label="Base branch"
        value={base}
        onchange={(event) => onBaseChange(event.currentTarget.value)}
      >
        {#each branches as branch (branch)}<option value={branch}>{branch}</option>{/each}
      </select>
    </span>
  {/if}
  <div class="top-actions">
    <button
      type="button"
      class="icon-button"
      class:loading
      aria-label="Reload changes"
      {@attach tooltip('Reload changes (R)')}
      onclick={onReload}
    >
      <span class="reload-icon">↻</span>
    </button>
    <button
      type="button"
      class="copy-button"
      disabled={!commentCount}
      {@attach tooltip(
        'Click — copy & clear\nAlt+click — copy only\nC — copy only\nAlt+C — copy & clear',
      )}
      onclick={(event) => onCopy({ clear: !event.altKey })}
    >
      Copy & clear comments{commentCount ? `  ·  ${commentCount}` : ''}
    </button>
    <button
      type="button"
      class="help-button"
      aria-label="Keyboard shortcuts"
      {@attach tooltip('Keyboard shortcuts (?)')}
      onclick={onHelp}
    >
      ?
    </button>
  </div>
</header>

<style>
  .topbar {
    height: 62px;
    display: flex;
    align-items: center;
    gap: 28px;
    padding: 0 22px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 250px;
    white-space: nowrap;
  }
  .brand-logo {
    display: block;
    width: 108px;
    height: auto;
  }
  .repo-name {
    margin-left: 11px;
    color: var(--text-subtle);
    border-left: 1px solid var(--border);
    padding-left: 17px;
    font-size: 13px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mode-tabs {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .mode-tab {
    display: flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    color: var(--text-subtle);
    border: 0;
    border-radius: 7px;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .mode-tab:hover {
    background: var(--surface-control);
    color: var(--text);
  }
  .mode-tab.active {
    background: var(--accent-bg);
    color: var(--accent-text);
  }
  .mode-tab kbd {
    font:
      11px ui-monospace,
      SFMono-Regular,
      monospace;
    border: 1px solid var(--border-strong);
    color: var(--text-muted);
    border-radius: 4px;
    min-width: 17px;
    text-align: center;
    padding: 1px 3px;
  }
  .mode-tab.active kbd {
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .top-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .base-picker {
    position: relative;
    display: inline-flex;
    max-width: 180px;
    margin-left: -18px;
  }
  .base-picker::after {
    content: '';
    position: absolute;
    right: 14px;
    top: 50%;
    width: 7px;
    height: 7px;
    border-right: 1.5px solid var(--text);
    border-bottom: 1.5px solid var(--text);
    transform: translateY(-70%) rotate(45deg);
    pointer-events: none;
  }
  .base-select {
    appearance: none;
    field-sizing: content;
    min-width: 120px;
    max-width: 180px;
    padding: 7px 34px 7px 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface-control);
    color: var(--text);
  }
  .icon-button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    background: var(--surface-control);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    border-radius: 7px;
    font-size: 23px;
  }
  .reload-icon {
    display: block;
    line-height: 1;
  }
  .icon-button:hover {
    background: var(--surface-hover);
  }
  .help-button {
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface-control);
    color: var(--text-secondary);
    font-size: 16px;
    font-weight: 700;
  }
  .help-button:hover {
    background: var(--surface-hover);
  }
  .icon-button.loading .reload-icon {
    animation: spin 1.2s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .copy-button {
    background: var(--accent);
    border: 1px solid var(--accent-hover);
    color: var(--text);
    border-radius: 7px;
    padding: 8px 13px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .copy-button:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .copy-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (max-width: 850px) {
    .topbar {
      gap: 10px;
      padding: 0 12px;
    }
    .base-picker {
      margin-left: 0;
    }
    .brand {
      min-width: 0;
    }
    .repo-name {
      display: none;
    }
    .mode-tab {
      padding: 7px;
      gap: 5px;
    }
  }
  @media (max-width: 620px) {
    .topbar {
      height: auto;
      min-height: 58px;
      flex-wrap: wrap;
      padding: 10px;
      justify-content: space-between;
    }
    .top-actions {
      margin: 0;
    }
    .copy-button {
      max-width: 145px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mode-tabs {
      order: 3;
      width: 100%;
      justify-content: center;
    }
  }
</style>
