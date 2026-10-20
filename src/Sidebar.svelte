<script>
  import { treeRows } from './review.js';
  import folderIcon from './assets/folder.svg';
  import plusIcon from './assets/plus.svg';
  import { tooltip } from './tooltip.js';

  let {
    workspace,
    repos,
    repo,
    onSelectRepo,
    files,
    loaded,
    commentsByPath,
    activeFile,
    search,
    collapsedFolders,
    onSearch,
    onToggleFolder,
    onNavigate,
  } = $props();

  let rows = $derived(treeRows(files, collapsedFolders, search));
  let workspaceName = $derived(workspace.split(/[\\/]/).filter(Boolean).at(-1) ?? workspace);
  let visibleRepos = $derived(
    repos.filter(({ name }) => name.toLowerCase().includes(search.toLowerCase())),
  );
  let additions = $derived(files.reduce((total, file) => total + file.additions, 0));
  let deletions = $derived(files.reduce((total, file) => total + file.deletions, 0));
</script>

<aside class="sidebar">
  <div class="search-wrap">
    <span aria-hidden="true">⌕</span>
    <input
      id="file-search"
      type="search"
      placeholder={workspace ? 'Filter repositories and files' : 'Filter files'}
      aria-label={workspace ? 'Filter repositories and files' : 'Filter files'}
      value={search}
      oninput={(event) => onSearch(event.currentTarget.value)}
    />
  </div>
  {#if workspace}
    <div class="sidebar-heading">
      <span class="workspace-name" {@attach tooltip(workspace)}>{workspaceName.toUpperCase()}</span>
      <span class="file-count">{repos.length}</span>
    </div>
    <div id="repo-list" class="repo-list">
      {#each visibleRepos as item (item.name)}
        <button
          type="button"
          class="repo-row"
          style="--depth:0"
          class:active={item.name === repo}
          aria-pressed={item.name === repo}
          data-repo={item.name}
          {@attach tooltip(item.path)}
          onclick={() => onSelectRepo(item.name)}
        >
          <span
            class="folder-icon"
            style={`mask-image:url('${folderIcon}')`}
            aria-hidden="true"
          ></span>
          <span class="file-name">{item.name}</span>
          {#if item.changes}<span class="repo-changes">{item.changes}</span>{/if}
        </button>
      {:else}
        <div class="sidebar-empty">
          {repos.length ? 'No matching repositories' : 'No repositories'}
        </div>
      {/each}
    </div>
  {/if}
  <div class="sidebar-heading">
    <span>FILES</span>
    <span id="file-count" class="file-count" style:visibility={loaded ? null : 'hidden'}>
      {files.length}
    </span>
  </div>
  <div id="file-list" class="file-list">
    {#each rows as row (row.kind + row.path)}
      {#if row.kind === 'folder'}
        <button
          type="button"
          class="folder-row"
          style={`--depth:${row.depth}`}
          {@attach tooltip(row.path)}
          aria-expanded={!row.collapsed}
          onclick={() => onToggleFolder(row.path)}
        >
          <span class="folder-chevron">{row.collapsed ? '▸' : '▾'}</span>
          <span
            class="folder-icon"
            style={`mask-image:url('${folderIcon}')`}
            aria-hidden="true"
          ></span>
          <span class="folder-name">{row.name}</span>
          <span class="folder-count">{row.count}</span>
        </button>
      {:else}
        {@const commentCount = commentsByPath.get(row.path)?.length ?? 0}
        <button
          type="button"
          class:active={activeFile === row.path}
          class="file-row"
          style={`--depth:${row.depth}`}
          {@attach tooltip(row.file.oldPath ? `${row.file.oldPath} → ${row.path}` : row.path)}
          data-path={row.path}
          onclick={() => onNavigate(row.path)}
        >
          <span class={`status-dot ${row.file.status}`}>
            {#if row.file.status === 'added'}
              <span
                class="plus-icon"
                style={`mask-image:url('${plusIcon}')`}
                aria-hidden="true"
              ></span>
            {:else if row.file.status === 'deleted'}−{:else if row.file.status === 'renamed'}→{:else}•{/if}
          </span>
          <span class="file-name">{row.name}</span>
          {#if commentCount}<span class="comment-count">{commentCount}</span>{/if}
        </button>
      {/if}
    {:else}
      {#if loaded}
        <div class="sidebar-empty">{files.length ? 'No matching files' : 'No changed files'}</div>
      {/if}
    {/each}
  </div>
  {#if loaded}
    <div id="sidebar-stats" class="sidebar-stats">
      <h2>Diff stats</h2>
      <div class="stat-row">
        <span>Files</span>
        <strong>{files.length}</strong>
      </div>
      <div class="stat-row">
        <span>Additions</span>
        <strong class="added">+{additions}</strong>
      </div>
      <div class="stat-row">
        <span>Deletions</span>
        <strong class="deleted">−{deletions}</strong>
      </div>
      <div class="stat-row">
        <span>Lines</span>
        <strong>{additions + deletions}</strong>
      </div>
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    position: sticky;
    top: 62px;
    height: calc(100vh - 62px);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    min-width: 0;
  }
  .sidebar-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 6px;
    color: var(--text-subtle);
    font-size: 11px;
    font-weight: 760;
    letter-spacing: 1.2px;
  }
  .workspace-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-count {
    background: var(--surface-control);
    padding: 3px 7px;
    border-radius: 5px;
    letter-spacing: 0;
    color: var(--text-muted);
  }
  .search-wrap {
    margin: 12px 9px 0;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface-raised);
    color: var(--text-subtle);
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 9px;
  }
  .search-wrap span {
    font-size: 22px;
    line-height: 30px;
  }
  .search-wrap input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: none;
    outline: none;
    color: var(--text);
    font-size: 12px;
  }
  .search-wrap input::placeholder {
    color: var(--text-subtle);
  }
  .search-wrap input::-webkit-search-cancel-button {
    filter: grayscale(1) brightness(3);
  }
  .file-list {
    overflow: auto;
    flex: 1;
    padding: 2px 5px 10px;
  }
  .repo-list {
    flex: none;
    max-height: 30vh;
    overflow: auto;
    padding: 0 5px 8px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .repo-row.active {
    background: var(--accent-bg);
    color: var(--text);
  }
  .repo-changes {
    color: var(--text-subtle);
    font-size: 11px;
  }
  .repo-row,
  .file-row,
  .folder-row {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text-secondary);
    padding: 4px 8px 4px calc(8px + var(--depth) * 14px);
    min-height: 29px;
  }
  .repo-row:hover,
  .file-row:hover,
  .folder-row:hover {
    background: var(--surface-control);
  }
  .file-row.active {
    background: var(--accent-bg);
  }
  .file-row {
    padding-left: calc(12px + var(--depth) * 14px);
  }
  .folder-row {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 650;
  }
  .folder-chevron {
    width: 11px;
    flex: none;
    color: var(--text-subtle);
  }
  .folder-icon {
    color: var(--accent);
    background: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
    width: 16px;
    height: 16px;
    flex: none;
  }
  .folder-name,
  .file-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .folder-count {
    color: var(--text-subtle);
    font-size: 11px;
    font-weight: 500;
  }
  .status-dot {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    flex: none;
    border-radius: 5px;
    font-weight: 750;
    font-size: 13px;
  }
  .status-dot.added {
    background: var(--add-bg);
    color: var(--add);
  }
  .status-dot .plus-icon {
    display: block;
    width: 11px;
    height: 11px;
    background: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
  }
  .status-dot.deleted {
    background: var(--del-bg);
    color: var(--del);
  }
  .status-dot.modified {
    background: var(--accent-bg);
    color: var(--accent-text);
  }
  .status-dot.renamed {
    background: var(--info-bg);
    color: var(--info);
  }
  .file-name {
    font-size: 12px;
    font-weight: 610;
  }
  .comment-count {
    border-radius: 10px;
    background: var(--accent);
    color: var(--text);
    padding: 2px 6px;
    font-size: 10px;
  }
  .sidebar-empty {
    padding: 6px 12px;
    color: var(--text-subtle);
    font-size: 12px;
  }
  .sidebar-stats {
    border-top: 1px solid var(--border-subtle);
    padding: 14px 16px 17px;
    color: var(--text-muted);
    font-size: 12px;
  }
  .sidebar-stats h2 {
    margin: 0 0 10px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }
  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  .stat-row strong {
    color: var(--text-secondary);
    font-weight: 550;
  }
  .stat-row strong.added {
    color: var(--add);
  }
  .stat-row strong.deleted {
    color: var(--del);
  }

  @media (max-width: 760px) {
    .sidebar {
      position: static;
      flex: 1;
      min-height: 0;
      height: auto;
    }
    .repo-row,
    .file-row,
    .folder-row {
      min-height: 36px;
    }
  }
</style>
