<script>
  import { onMount } from 'svelte';
  import Topbar from './Topbar.svelte';
  import Sidebar from './Sidebar.svelte';
  import DiffCard from './DiffCard.svelte';
  import HelpDialog from './HelpDialog.svelte';
  import { ReviewState } from './reviewState.svelte.js';

  const SIDEBAR_KEY = 'difff:sidebar-width';
  const review = new ReviewState();

  let sidebarWidth = $state(270);
  let shortcutsOpen = $state(false);
  let resizeHandle;
  let sidebar;
  let layout;

  onMount(() => {
    const savedWidth = Number(sessionStorage.getItem(SIDEBAR_KEY));
    if (savedWidth >= 190 && savedWidth <= 560) setSidebarWidth(savedWidth);
    review.reload();
    return () => review.destroy();
  });

  function setSidebarWidth(width) {
    const maxWidth = Math.min(560, window.innerWidth - 400);
    sidebarWidth = Math.round(Math.max(190, Math.min(maxWidth, width)));
    return sidebarWidth;
  }

  function onResize() {
    if (sidebarWidth > window.innerWidth - 400) setSidebarWidth(sidebarWidth);
  }

  function startResize(event) {
    resizeHandle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-sidebar');
  }

  function moveResize(event) {
    if (!resizeHandle.hasPointerCapture(event.pointerId)) return;
    setSidebarWidth(event.clientX - layout.getBoundingClientRect().left);
  }

  function finishResize(event) {
    if (!resizeHandle.hasPointerCapture(event.pointerId)) return;
    resizeHandle.releasePointerCapture(event.pointerId);
    document.body.classList.remove('resizing-sidebar');
    sessionStorage.setItem(SIDEBAR_KEY, String(Math.round(sidebar.getBoundingClientRect().width)));
  }

  function resizeWithKeyboard(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -20 : 20;
    const width = setSidebarWidth(sidebar.getBoundingClientRect().width + delta);
    sessionStorage.setItem(SIDEBAR_KEY, String(width));
  }

  function handleKeyDown(event) {
    if (shortcutsOpen) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.target.closest('input,textarea,[contenteditable="true"]')
    )
      return;
    if ((event.key.toLowerCase() === 'c' || event.code === 'KeyC') && !event.repeat) {
      event.preventDefault();
      review.copyComments({ clear: event.altKey });
      return;
    }
    if (event.altKey) return;
    if (event.key === '?') {
      event.preventDefault();
      shortcutsOpen = true;
    }
    if (event.key === '1') review.setMode('all');
    if (event.key === '2') review.setMode('staged');
    if (event.key === '3') review.setMode('unstaged');
    if (event.key.toLowerCase() === 'r') review.reload();
    if (event.key.toLowerCase() === 'j') review.moveFile(1);
    if (event.key.toLowerCase() === 'k') review.moveFile(-1);
  }

  let scrollFrame = 0;
  function handleScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      review.updateActiveFile();
    });
  }
</script>

<svelte:window onkeydown={handleKeyDown} onresize={onResize} onscroll={handleScroll} />

<Topbar
  root={review.root}
  mode={review.mode}
  loading={review.loading}
  commentCount={review.comments.length}
  onModeChange={(mode) => review.setMode(mode)}
  onReload={() => review.reload()}
  onCopy={(options) => review.copyComments(options)}
  onHelp={() => (shortcutsOpen = true)}
/>

<div id="layout" class="layout" style={`--sidebar-width:${sidebarWidth}px`} bind:this={layout}>
  <div class="sidebar-shell" bind:this={sidebar}>
    <Sidebar
      files={review.files}
      loaded={review.loaded}
      commentsByPath={review.commentsByPath}
      activeFile={review.activeFile}
      search={review.search}
      collapsedFolders={review.collapsedFolders}
      onSearch={(value) => (review.search = value)}
      onToggleFolder={(path) => review.toggleFolder(path)}
      onNavigate={(path) => review.navigateToFile(path)}
    />
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    id="sidebar-resize"
    class="sidebar-resize"
    role="separator"
    aria-label="Resize sidebar"
    aria-orientation="vertical"
    tabindex="0"
    bind:this={resizeHandle}
    onpointerdown={startResize}
    onpointermove={moveResize}
    onpointerup={finishResize}
    onpointercancel={() => document.body.classList.remove('resizing-sidebar')}
    onkeydown={resizeWithKeyboard}
  ></div>
  <main id="content" class="content" class:empty-content={review.loaded && !review.files.length}>
    {#if review.files.length === 0 && review.loaded}
      <div class="empty-state">
        <img class="empty-logo" src="/logo.png" alt="Difff" />
        <h2>Nothing to review</h2>
        <p>
          {review.loadedMode === 'staged'
            ? 'Stage some changes, then press R to reload.'
            : 'Make a change or add a new file, then press R to reload.'}
        </p>
      </div>
    {:else if review.files.length}
      <div class="content-intro">
        <h1>
          {review.loadedMode === 'all'
            ? 'All changes'
            : review.loadedMode === 'staged'
              ? 'Staged changes'
              : 'Unstaged changes'}
        </h1>
        <p>{review.files.length} {review.files.length === 1 ? 'file' : 'files'}</p>
      </div>
      {#each review.files as file, index (file.path)}
        <DiffCard
          {file}
          order={index}
          mode={review.loadedMode}
          collapsed={review.isFileCollapsed(file)}
          comments={review.commentsFor(file.path)}
          draft={review.draftFor(file.path)}
          loadDiff={(file) => review.loadDiff(file)}
          onToggle={(file) => review.toggleFile(file)}
          onBegin={(path, line, side) => review.beginComment(path, line, side)}
          onCancel={() => (review.draft = null)}
          onAdd={() => review.addComment()}
          onEdit={(id) => review.editComment(id)}
          onDelete={(id) => review.deleteComment(id)}
        />
      {/each}
    {/if}
  </main>
</div>

<HelpDialog bind:open={shortcutsOpen} />
<div id="toast" class="toast" class:visible={review.toastVisible} role="status" aria-live="polite">
  {review.toastMessage}
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: var(--sidebar-width, 270px) 5px minmax(0, 1fr);
    min-height: calc(100vh - 62px);
  }
  .sidebar-shell {
    min-width: 0;
  }
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

  .content {
    min-width: 0;
    max-width: 100%;
    padding: 20px 16px 80px;
  }
  .content.empty-content {
    display: grid;
    place-items: center;
    min-height: calc(100dvh - 62px);
    padding: 20px 16px;
  }
  .content-intro {
    margin: 0 0 17px;
  }
  .content-intro h1 {
    font-size: 24px;
    letter-spacing: -0.6px;
    margin: 0 0 6px;
    font-weight: 700;
  }
  .content-intro p {
    color: var(--text-subtle);
    font-size: 13px;
    margin: 0;
  }
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    text-align: center;
  }
  .empty-logo {
    display: block;
    width: 150px;
    height: auto;
  }
  .empty-state h2 {
    font-size: 20px;
    margin: 16px 0 4px;
  }
  .empty-state p {
    color: var(--text-subtle);
    font-size: 13px;
  }
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
  @media (max-width: 850px) {
    .layout {
      grid-template-columns: var(--sidebar-width, 210px) 5px minmax(0, 1fr);
    }
    .content {
      padding: 18px 12px 70px;
    }
  }
  @media (max-width: 620px) {
    .layout {
      display: block;
    }
    .content.empty-content {
      min-height: calc(100dvh - 270px);
    }
    .sidebar-resize {
      display: none;
    }
    .content {
      padding: 22px 11px 60px;
    }
  }
</style>
