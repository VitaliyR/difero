<script>
  let { workspace, repo, mode, base } = $props();

  let noRepos = $derived(workspace && !repo);
  let message = $derived.by(() => {
    if (noRepos) return 'Add a Git repository to this folder, then press R to reload.';
    if (mode === 'staged') return 'Stage some changes, then press R to reload.';
    if (mode === 'base')
      return base
        ? `No changes since branching from ${base}.`
        : 'No other branch is available. Create a branch to compare against.';
    return 'Make a change or add a new file, then press R to reload.';
  });
</script>

<div class="empty-state">
  <img class="empty-logo" src="/logo.png" alt="Difero" />
  <h2>{noRepos ? 'No repositories' : 'Nothing to review'}</h2>
  <p>{message}</p>
</div>

<style>
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
  h2 {
    font-size: 20px;
    margin: 16px 0 4px;
  }
  p {
    color: var(--text-subtle);
    font-size: 13px;
  }
</style>
