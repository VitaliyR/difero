<script>
  import { onMount } from 'svelte';
  import Topbar from './Topbar.svelte';
  import Sidebar from './Sidebar.svelte';
  import DiffCard from './DiffCard.svelte';
  import ContentHeader from './ContentHeader.svelte';
  import EmptyState from './EmptyState.svelte';
  import HelpDialog from './HelpDialog.svelte';
  import SidebarResizer from './SidebarResizer.svelte';
  import Toast from './Toast.svelte';
  import { ReviewState } from './reviewState.svelte.js';
  import { tooltip } from './tooltip.js';
  import closeIcon from './assets/close.svg';

  const review = new ReviewState();

  let sidebarWidth = $state(270);
  let shortcutsOpen = $state(false);
  let sidebarOpen = $state(false);
  let repoName = $derived(review.root.split('/').at(-1));

  onMount(() => {
    review.start();
    return () => review.destroy();
  });

  $effect(() => {
    document.documentElement.classList.toggle('sidebar-open', sidebarOpen);
  });

  function handleKeyDown(event) {
    if (shortcutsOpen) return;
    if (sidebarOpen && event.key === 'Escape') {
      sidebarOpen = false;
      return;
    }
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.target.closest('input,textarea,[contenteditable="true"]')
    )
      return;
    if ((event.key.toLowerCase() === 'c' || event.code === 'KeyC') && !event.repeat) {
      event.preventDefault();
      review.copyComments({ clear: !event.altKey, scope: event.shiftKey ? 'repo' : 'all' });
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
    if (event.key === '4') review.setMode('base');
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

<svelte:window onkeydown={handleKeyDown} onscroll={handleScroll} />

<Topbar
  root={review.root}
  mode={review.mode}
  base={review.base}
  branches={review.branches}
  loading={review.loading}
  staging={review.staging}
  workspace={Boolean(review.workspace)}
  commentCount={review.comments.length}
  otherCommentCount={review.otherComments.reduce((sum, { comments }) => sum + comments.length, 0)}
  onModeChange={(mode) => review.setMode(mode)}
  onBaseChange={(base) => review.setBase(base)}
  onReload={() => review.reload()}
  onStage={() => review.stageAll()}
  onCopy={(options) => review.copyComments(options)}
  onHelp={() => (shortcutsOpen = true)}
  onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
/>

<div
  id="layout"
  class="layout"
  class:sidebar-open={sidebarOpen}
  style={`--sidebar-width:${sidebarWidth}px`}
>
  <div class="sidebar-shell">
    <div class="drawer-heading">
      <img class="drawer-logo" src="/logo.png" alt="Difero" />
      {#if repoName && repoName.toLowerCase() !== 'difero'}
        <span class="drawer-repo" {@attach tooltip(review.root)}>{repoName}</span>
      {/if}
      <button
        type="button"
        class="drawer-close"
        aria-label="Close files"
        onclick={() => (sidebarOpen = false)}
      >
        <span class="close-icon" style={`mask-image:url('${closeIcon}')`} aria-hidden="true"></span>
      </button>
    </div>
    <Sidebar
      workspace={review.workspace}
      repos={review.repos}
      repo={review.repo}
      onSelectRepo={(name) => {
        sidebarOpen = false;
        review.setRepo(name);
      }}
      files={review.files}
      loaded={review.loaded}
      commentsByPath={review.commentsByPath}
      activeFile={review.activeFile}
      search={review.search}
      collapsedFolders={review.collapsedFolders}
      onSearch={(value) => (review.search = value)}
      onToggleFolder={(path) => review.toggleFolder(path)}
      onNavigate={(path) => {
        sidebarOpen = false;
        review.navigateToFile(path);
      }}
    />
  </div>
  <button
    type="button"
    class="sidebar-backdrop"
    tabindex="-1"
    aria-label="Close files"
    onclick={() => (sidebarOpen = false)}
  ></button>
  <SidebarResizer bind:width={sidebarWidth} />
  <main id="content" class="content" class:empty-content={review.loaded && !review.files.length}>
    {#if review.files.length === 0 && review.loaded}
      <EmptyState
        workspace={review.workspace}
        repo={review.repo}
        mode={review.loadedMode}
        base={review.loadedBase}
      />
    {:else if review.files.length}
      <ContentHeader
        mode={review.loadedMode}
        base={review.loadedBase}
        fileCount={review.files.length}
        diffStyle={review.diffStyle}
        onDiffStyleChange={(style) => review.setDiffStyle(style)}
      />
      {#each review.files as file, index (file.path)}
        <DiffCard
          {file}
          order={index}
          mode={review.loadedMode}
          diffStyle={review.diffStyle}
          base={review.loadedBase}
          repo={review.loadedRepo}
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

<HelpDialog bind:open={shortcutsOpen} workspace={Boolean(review.workspace)} />
<Toast
  message={review.toastMessage}
  visible={review.toastVisible}
  action={review.toastAction}
  onHold={() => review.holdToast()}
  onRelease={() => review.releaseToast()}
  onHide={() => review.hideToast()}
/>

<style>
  .layout {
    display: grid;
    grid-template-columns: var(--sidebar-width, 270px) 5px minmax(0, 1fr);
    min-height: calc(100vh - 62px);
  }
  .sidebar-shell {
    min-width: 0;
  }
  .drawer-heading,
  .sidebar-backdrop {
    display: none;
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
  @media (max-width: 850px) {
    .layout {
      grid-template-columns: var(--sidebar-width, 210px) 5px minmax(0, 1fr);
    }
    .content {
      padding: 18px 12px 70px;
    }
  }
  @media (max-width: 760px) {
    .layout {
      display: block;
    }
    .sidebar-shell {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 30;
      width: min(320px, 85vw);
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border-right: 1px solid var(--border);
      box-shadow: 0 12px 28px var(--shadow);
      transform: translateX(-100%);
      visibility: hidden;
      transition:
        transform 0.2s ease,
        visibility 0.2s;
    }
    .layout.sidebar-open .sidebar-shell {
      transform: none;
      visibility: visible;
    }
    .drawer-heading {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 0 8px 0 15px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .drawer-logo {
      display: block;
      width: 90px;
      height: auto;
    }
    .drawer-repo {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-subtle);
      border-left: 1px solid var(--border);
      padding-left: 12px;
      font-size: 13px;
    }
    .drawer-close {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      margin-left: auto;
      flex: none;
      padding: 0;
      border: 0;
      border-radius: 7px;
      background: none;
      color: var(--text-secondary);
    }
    .drawer-close:hover {
      background: var(--surface-control);
    }
    .close-icon {
      width: 18px;
      height: 18px;
      background: currentColor;
      mask-position: center;
      mask-size: contain;
      mask-repeat: no-repeat;
    }
    .sidebar-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 25;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: var(--overlay);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .layout.sidebar-open .sidebar-backdrop {
      opacity: 1;
      pointer-events: auto;
    }
    :global(html.sidebar-open) {
      overflow: hidden;
    }
    .content.empty-content {
      min-height: calc(100dvh - 52px);
    }
    .content {
      padding: 22px 2px 60px;
    }
  }
</style>
