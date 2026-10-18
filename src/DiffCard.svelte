<script>
  import { tick, untrack } from 'svelte';
  import { estimatedHeight, fileId, hasSameContents, isRenderable } from './review.js';
  import { createDiff } from './pierre.js';
  import { scheduleRender } from './renderScheduler.js';

  let {
    file,
    order,
    mode,
    base,
    collapsed,
    comments,
    draft,
    loadDiff,
    onToggle,
    onBegin,
    onCancel,
    onAdd,
    onEdit,
    onDelete,
  } = $props();

  function imageUrl(side) {
    return `/api/image?${new URLSearchParams({ mode, path: file.path, side, ...(base ? { base } : {}) })}`;
  }

  let card;
  let container = $state(null);
  let metadata = $state.raw(null);
  let instance = $state.raw(null);

  let placeholderHeight = $derived(estimatedHeight(file));
  let modeChanged = $derived(
    Boolean(file.oldMode && file.newMode && file.oldMode !== file.newMode),
  );

  let heightBefore = null;

  // A card above the viewport changes height when it renders in the background; scroll
  // by the difference so the content being read stays put.
  $effect.pre(() => {
    void metadata;
    heightBefore = untrack(() => {
      if (!card) return null;
      const bounds = card.getBoundingClientRect();
      const readingLine = parseFloat(getComputedStyle(card).scrollMarginTop) || 0;
      return bounds.bottom <= readingLine ? bounds.height : null;
    });
  });

  $effect(() => {
    const source = file;
    if (collapsed || !isRenderable(source)) {
      metadata = null;
      return;
    }
    let cancelled = false;
    const cancel = scheduleRender(
      card,
      { order, weight: source.additions + source.deletions },
      () =>
        loadDiff(source).then(
          (value) => {
            if (cancelled) return;
            metadata = value;
            return tick();
          },
          () => {},
        ),
    );
    return () => {
      cancelled = true;
      cancel();
    };
  });

  $effect(() => {
    const target = container;
    const value = metadata;
    if (!target || !value) return;
    const diff = untrack(() =>
      createDiff({
        file,
        metadata: value,
        container: target,
        getComments: () => comments,
        getDraft: () => draft,
        onBegin,
        onCancel,
        onAdd,
        onEdit,
        onDelete,
      }),
    );
    instance = diff;
    if (heightBefore !== null) {
      window.scrollBy({ top: card.offsetHeight - heightBefore, behavior: 'instant' });
      heightBefore = null;
    }
    return () => {
      instance = null;
      diff.cleanUp();
    };
  });

  $effect(() => {
    const currentComments = comments;
    const currentDraft = draft;
    untrack(() => instance)?.setAnnotations(currentComments, currentDraft);
  });
</script>

<article id={fileId(file.path)} class="diff-card" class:collapsed bind:this={card}>
  <div class="diff-card-heading">
    <button
      type="button"
      class="diff-card-toggle"
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${file.path}`}
      onclick={() => onToggle(file)}
    >
      <span class="card-chevron">{collapsed ? '▸' : '▾'}</span>
      <span class={`status-pill ${file.status}`}>
        {file.untracked ? 'UNTRACKED' : file.status.toUpperCase()}
      </span>
      <span class="diff-path">{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</span>
      {#if !file.binary && !file.tooLarge}
        <span class="card-changes">
          <span class="added">+{file.additions}</span>
          <span class="deleted">−{file.deletions}</span>
        </span>
      {/if}
    </button>
  </div>
  {#if !collapsed}
    {#if modeChanged}
      <div class="mode-change">File mode changed: {file.oldMode} → {file.newMode}</div>
    {/if}
    {#if file.imageMime}
      <div class="image-previews" class:single-image={file.oldExists !== file.newExists}>
        {#if file.oldExists}
          <figure class="image-preview">
            <figcaption>Before</figcaption>
            <div class="image-frame">
              <img src={imageUrl('old')} alt={`Before: ${file.path}`} />
            </div>
          </figure>
        {/if}
        {#if file.newExists}
          <figure class="image-preview">
            <figcaption>After</figcaption>
            <div class="image-frame"><img src={imageUrl('new')} alt={`After: ${file.path}`} /></div>
          </figure>
        {/if}
      </div>
    {:else if file.binary || file.tooLarge}
      <div class="unsupported-file">
        {file.binary
          ? 'Binary file — preview unavailable'
          : 'File is larger than 2 MB — preview unavailable'}
      </div>
    {:else if hasSameContents(file)}
      {#if !modeChanged}
        <div class="unsupported-file">No content changes</div>
      {/if}
    {:else}
      <div
        class="pierre-container"
        style:min-height={metadata ? null : `${placeholderHeight}px`}
        bind:this={container}
      ></div>
    {/if}
  {/if}
</article>

<style>
  .image-previews {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--border);
  }
  .image-previews.single-image {
    grid-template-columns: minmax(0, 1fr);
  }
  .image-preview {
    min-width: 0;
    margin: 0;
    background: var(--surface);
  }
  .image-preview figcaption {
    padding: 9px 14px;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 650;
  }
  .image-frame {
    display: grid;
    place-items: center;
    min-height: 160px;
    padding: 20px;
    background-color: var(--surface);
    background-image:
      linear-gradient(45deg, var(--surface-raised) 25%, transparent 25%),
      linear-gradient(-45deg, var(--surface-raised) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--surface-raised) 75%),
      linear-gradient(-45deg, transparent 75%, var(--surface-raised) 75%);
    background-size: 20px 20px;
    background-position:
      0 0,
      0 10px,
      10px -10px,
      -10px 0;
  }
  .image-frame img {
    display: block;
    max-width: 100%;
    max-height: 480px;
    object-fit: contain;
  }
  .diff-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    margin: 0 0 20px;
    overflow: clip;
    scroll-margin-top: 86px;
    box-shadow: 0 10px 28px var(--shadow);
  }
  .diff-card-heading {
    position: sticky;
    top: 62px;
    z-index: 2;
    min-height: 44px;
    display: flex;
    align-items: center;
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border);
  }
  .diff-card-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    background: transparent;
    text-align: left;
    color: inherit;
  }
  .diff-card-toggle:hover {
    background: var(--surface-control);
  }
  .card-chevron {
    width: 12px;
    flex: none;
    color: var(--text-subtle);
  }
  .card-changes {
    display: flex;
    gap: 9px;
    margin-left: auto;
    font:
      11px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
  .diff-card.collapsed .diff-card-heading {
    border-bottom: 0;
  }
  .status-pill {
    font-size: 10px;
    font-weight: 760;
    letter-spacing: 0.5px;
  }
  .status-pill.added {
    color: var(--add);
  }
  .status-pill.deleted {
    color: var(--del);
  }
  .status-pill.modified {
    color: var(--accent-text);
  }
  .status-pill.renamed {
    color: var(--info);
  }
  .diff-path {
    font:
      12px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pierre-container {
    --diffs-gap-block: 0px;
    min-width: 0;
    overflow: auto;
  }
  .pierre-container :global([slot='gutter-utility-slot']) {
    z-index: 5;
    pointer-events: auto;
  }

  .card-changes .added {
    color: var(--add);
  }
  .card-changes .deleted {
    color: var(--del);
  }

  @media (max-width: 760px) {
    .diff-card {
      scroll-margin-top: 66px;
    }
    .diff-card-heading {
      top: 52px;
    }
  }
  .mode-change {
    padding: 9px 14px;
    color: var(--text-muted);
    font:
      12px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
  .mode-change:not(:last-child) {
    border-bottom: 1px solid var(--border);
  }
  .unsupported-file {
    padding: 34px;
    color: var(--text-subtle);
    font-size: 13px;
  }
</style>
