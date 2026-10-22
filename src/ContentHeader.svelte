<script>
  import DiffStyleToggle from './DiffStyleToggle.svelte';

  let { mode, base, fileCount, diffStyle, onDiffStyleChange } = $props();

  const titles = { all: 'Working changes', staged: 'Staged changes', unstaged: 'Unstaged changes' };
  let title = $derived(mode === 'base' ? `Changes since ${base}` : titles[mode]);
</script>

<div class="diff-style-dock">
  <DiffStyleToggle value={diffStyle} onChange={onDiffStyleChange} />
</div>
<div class="content-intro">
  <div class="content-title">
    <h1>{title}</h1>
  </div>
  <p>{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
</div>

<style>
  /* Zero-height so it overlays the title row, then sticks inside the sticky file heading row. */
  .diff-style-dock {
    position: sticky;
    top: 69px;
    z-index: 3;
    height: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding-right: 8px;
    pointer-events: none;
  }
  .diff-style-dock > :global(*) {
    pointer-events: auto;
  }
  .content-intro {
    margin: 0 0 17px;
  }
  .content-title {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 6px;
    padding-right: var(--diff-style-dock-space);
  }
  h1 {
    font-size: 24px;
    letter-spacing: -0.6px;
    margin: 0;
    font-weight: 700;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  p {
    color: var(--text-subtle);
    font-size: 13px;
    margin: 0;
  }
  @media (max-width: 760px) {
    .diff-style-dock {
      top: 59px;
    }
    .content-intro {
      padding: 0 9px;
    }
  }
</style>
