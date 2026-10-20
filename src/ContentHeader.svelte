<script>
  import DiffStyleToggle from './DiffStyleToggle.svelte';

  let { mode, base, fileCount, diffStyle, onDiffStyleChange } = $props();

  const titles = { all: 'Working changes', staged: 'Staged changes', unstaged: 'Unstaged changes' };
  let title = $derived(mode === 'base' ? `Changes since ${base}` : titles[mode]);
</script>

<div class="content-intro">
  <div class="content-title">
    <h1>{title}</h1>
    <DiffStyleToggle value={diffStyle} onChange={onDiffStyleChange} />
  </div>
  <p>{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
</div>

<style>
  .content-intro {
    margin: 0 0 17px;
  }
  .content-title {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 6px;
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
</style>
