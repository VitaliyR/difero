<script>
  import { tooltip } from './tooltip.js';
  import Menu from './Menu.svelte';
  import menuIcon from './assets/menu.svg';
  import moreIcon from './assets/more.svg';
  import stageIcon from './assets/stage.svg';

  let {
    root,
    mode,
    base,
    branches,
    loading,
    stale,
    staging,
    commentCount,
    otherCommentCount,
    workspace,
    onModeChange,
    onBaseChange,
    onReload,
    onStage,
    onCopy,
    onHelp,
    onToggleSidebar,
  } = $props();

  const modes = [
    { id: 'all', label: 'Working', key: '1' },
    { id: 'staged', label: 'Staged', key: '2' },
    { id: 'unstaged', label: 'Unstaged', key: '3' },
    { id: 'base', label: 'Base', key: '4' },
  ];
  let repoName = $derived(root.split('/').at(-1));
  let modeLabel = $derived(modes.find((tab) => tab.id === mode)?.label);

  let altKey = $state(false);
  let shiftKey = $state(false);
  let repoOnly = $derived(workspace && shiftKey);
  let copyCount = $derived(commentCount + (repoOnly ? 0 : otherCommentCount));

  function syncModifiers(event) {
    altKey = event.altKey;
    shiftKey = event.shiftKey;
  }

  function resetModifiers() {
    altKey = false;
    shiftKey = false;
  }
</script>

<svelte:window
  onkeydown={syncModifiers}
  onkeyup={syncModifiers}
  onpointermove={syncModifiers}
  onblur={resetModifiers}
/>

<header id="topbar" class="topbar">
  <button
    type="button"
    class="icon-button sidebar-toggle mobile-only"
    aria-label="Show files"
    onclick={onToggleSidebar}
  >
    <span class="mask-icon" style={`mask-image:url('${menuIcon}')`} aria-hidden="true"></span>
  </button>
  <div class="brand desktop-only">
    <img class="brand-logo" src="/logo.png" alt="Difero" />
    {#if repoName && repoName.toLowerCase() !== 'difero'}<span
        class="repo-name"
        {@attach tooltip(root)}
      >
        {repoName}
      </span>{/if}
  </div>
  <nav class="mode-tabs desktop-only" aria-label="Diff mode">
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
  <div class="mobile-only">
    <Menu label={`Diff mode: ${modeLabel}`} triggerClass="mode-menu-button">
      {#snippet trigger()}
        {modeLabel}
        <span class="chevron" aria-hidden="true"></span>
      {/snippet}
      {#snippet children(close)}
        {#each modes as tab (tab.id)}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === tab.id}
            onclick={() => {
              close();
              onModeChange(tab.id);
            }}
          >
            {tab.label}
          </button>
        {/each}
      {/snippet}
    </Menu>
  </div>
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
  <div class="top-actions desktop-only">
    <button
      type="button"
      class="copy-button"
      class:copy-only={altKey}
      disabled={!copyCount}
      {@attach tooltip(
        `Click or C — copy & clear\nAlt — keep comments${workspace ? '\nShift — this repo only' : ''}`,
      )}
      onclick={(event) => onCopy({ clear: !event.altKey, scope: event.shiftKey ? 'repo' : 'all' })}
    >
      Copy
      {#if !altKey}<span class="copy-clear">& clear</span>{/if}
      {#if workspace}<span class="copy-scope">{repoOnly ? 'repo' : 'all'}</span>{/if}
      <span class="copy-suffix">comments</span>
      {copyCount ? `  ·  ${copyCount}` : ''}
    </button>
    <button
      type="button"
      class="icon-button"
      aria-label="Stage all changes"
      disabled={staging}
      {@attach tooltip(`Stage all changes${workspace ? ' in this repo' : ''} (git add .)`)}
      onclick={onStage}
    >
      <span class="mask-icon" style={`mask-image:url('${stageIcon}')`} aria-hidden="true"></span>
    </button>
    <button
      type="button"
      class="icon-button"
      class:loading
      aria-label={stale ? 'Reload changes (files changed)' : 'Reload changes'}
      {@attach tooltip(stale ? 'Files changed — reload (R)' : 'Reload changes (R)')}
      onclick={onReload}
    >
      <span class="reload-icon">↻</span>
      {#if stale}<span class="stale-dot" aria-hidden="true"></span>{/if}
    </button>
    <button
      type="button"
      class="help-button"
      aria-label="Help"
      {@attach tooltip('Help (?)')}
      onclick={onHelp}
    >
      ?
    </button>
  </div>
  <div class="mobile-only mobile-actions">
    <Menu label="Actions" triggerClass="icon-button actions-button" align="right">
      {#snippet trigger()}
        <span class="mask-icon" style={`mask-image:url('${moreIcon}')`} aria-hidden="true"></span>
        {#if commentCount}<span class="badge">{commentCount}</span>
        {:else if stale}<span class="stale-dot" aria-hidden="true"></span>{/if}
      {/snippet}
      {#snippet children(close)}
        <button
          type="button"
          role="menuitem"
          disabled={!commentCount && !otherCommentCount}
          onclick={() => {
            close();
            onCopy({ clear: true });
          }}
        >
          Copy & clear {workspace ? 'all ' : ''}comments{commentCount + otherCommentCount
            ? ` · ${commentCount + otherCommentCount}`
            : ''}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!commentCount && !otherCommentCount}
          onclick={() => {
            close();
            onCopy({ clear: false });
          }}
        >
          Copy {workspace ? 'all ' : ''}comments
        </button>
        {#if workspace}
          <button
            type="button"
            role="menuitem"
            disabled={!commentCount}
            onclick={() => {
              close();
              onCopy({ clear: false, scope: 'repo' });
            }}
          >
            Copy repo comments{commentCount ? ` · ${commentCount}` : ''}
          </button>
        {/if}
        <hr />
        <button
          type="button"
          role="menuitem"
          disabled={staging}
          onclick={() => {
            close();
            onStage();
          }}
        >
          Stage all changes{workspace ? ' in repo' : ''}
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={() => {
            close();
            onReload();
          }}
        >
          Reload changes{#if stale}<span class="stale-dot inline" aria-hidden="true"></span>{/if}
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={() => {
            close();
            onHelp();
          }}
        >
          Help
        </button>
      {/snippet}
    </Menu>
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
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 250px;
    white-space: nowrap;
  }
  .brand-logo {
    flex: none;
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
    min-width: 0;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mode-tabs {
    flex: none;
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
    flex: none;
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
  .icon-button,
  .mobile-actions :global(.actions-button) {
    display: grid;
    place-items: center;
    place-content: center;
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
  .icon-button {
    position: relative;
  }
  .stale-dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--surface);
  }
  .stale-dot.inline {
    position: static;
    display: inline-block;
    margin-left: 8px;
    vertical-align: middle;
    box-shadow: none;
  }
  .icon-button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .icon-button:hover:not(:disabled),
  .mobile-actions :global(.actions-button:hover) {
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
  .copy-button.copy-only {
    background: transparent;
  }
  .copy-button.copy-only:hover:not(:disabled) {
    background: var(--accent);
  }
  .copy-button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (max-width: 1200px) {
    .topbar {
      gap: 18px;
    }
    .brand {
      min-width: 0;
    }
    .base-picker {
      margin-left: -8px;
    }
    .copy-suffix {
      display: none;
    }
  }
  @media (max-width: 1100px) {
    .mode-tab kbd {
      display: none;
    }
  }
  @media (max-width: 1000px) {
    .topbar {
      gap: 14px;
    }
    .brand-logo {
      width: 92px;
    }
    .repo-name {
      margin-left: 3px;
      padding-left: 12px;
    }
  }
  @media (max-width: 850px) {
    .topbar {
      gap: 10px;
      padding: 0 12px;
    }
    .base-picker {
      margin-left: 0;
    }
    .brand-logo {
      width: 80px;
    }
    .mode-tab {
      padding: 7px 9px;
    }
  }
  @media (max-width: 900px) {
    .copy-clear {
      display: none;
    }
    .base-select {
      min-width: 0;
      max-width: 140px;
      text-overflow: ellipsis;
    }
  }
  .mobile-only {
    display: none;
  }
  .mask-icon {
    display: block;
    width: 20px;
    height: 20px;
    background: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
  }
  .mobile-actions {
    margin-left: auto;
  }
  .mobile-actions :global(.actions-button) {
    position: relative;
  }
  .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 17px;
    padding: 2px 5px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--text);
    font-size: 10px;
    font-weight: 700;
    line-height: 13px;
  }
  .mobile-only :global(.mode-menu-button) {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--accent-bg);
    color: var(--accent-text);
    font-size: 13px;
    font-weight: 600;
  }
  .chevron {
    width: 7px;
    height: 7px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
  }

  @media (max-width: 760px) {
    .topbar {
      height: 52px;
      gap: 8px;
      padding: 0 12px;
    }
    .desktop-only {
      display: none;
    }
    .mobile-only {
      display: flex;
    }
    .base-picker {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 140px;
    }
    .base-select {
      min-width: 0;
      max-width: 140px;
      height: 34px;
      text-overflow: ellipsis;
    }
  }
</style>
