<script>
  import pencilIcon from './assets/pencil.svg';
  import trashIcon from './assets/trash.svg';
  import { tooltip } from './tooltip.js';

  let { path, draft = null, comment = null, onCancel, onSave, onEdit, onDelete } = $props();
  let input = $state(null);

  $effect(() => {
    if (draft && input) queueMicrotask(() => input?.isConnected && input.focus());
  });

  function handleKeyDown(event) {
    event.stopPropagation();
    if (event.key === 'Escape') onCancel();
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSave();
  }
</script>

<div class="comment-card">
  {#if draft}
    <div class="comment-heading">
      {draft.editingId ? 'Edit comment' : 'Comment on'}
      {path}:{draft.line}{draft.side === 'deletions' ? ' (old)' : ''}
    </div>
    <textarea
      bind:this={input}
      value={draft.text}
      oninput={(event) => (draft.text = event.currentTarget.value)}
      onkeydown={handleKeyDown}
      placeholder="Write a review comment…"
      rows="1"></textarea>
    <div class="comment-actions">
      <button type="button" class="comment-action" onclick={onCancel}>Cancel</button>
      <button
        type="button"
        class="comment-action primary"
        {@attach tooltip('Save comment (⌘/Ctrl+Enter)')}
        onclick={onSave}
      >
        {draft.editingId ? 'Save changes' : 'Add comment'}
      </button>
    </div>
  {:else if comment}
    <div class="comment-heading">
      <span>Comment · {path}:{comment.line}{comment.side === 'deletions' ? ' (old)' : ''}</span>
      <span class="comment-heading-actions">
        <button
          type="button"
          class="comment-icon-button edit-comment"
          aria-label={`Edit comment on ${path}:${comment.line}`}
          {@attach tooltip('Edit comment')}
          onclick={() => onEdit(comment.id)}
        >
          <span
            class="pencil-icon"
            style={`mask-image:url('${pencilIcon}')`}
            aria-hidden="true"
          ></span>
        </button>
        <button
          type="button"
          class="comment-icon-button delete-comment"
          aria-label={`Delete comment on ${path}:${comment.line}`}
          {@attach tooltip('Delete comment')}
          onclick={() => onDelete(comment.id)}
        >
          <span
            class="trash-icon"
            style={`mask-image:url('${trashIcon}')`}
            aria-hidden="true"
          ></span>
        </button>
      </span>
    </div>
    <div class="comment-body">{comment.text}</div>
  {/if}
</div>

<style>
  .comment-card {
    box-sizing: border-box;
    max-width: 640px;
    margin: 10px 16px 12px 48px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-raised);
    color: var(--text);
    font:
      13px/1.5 Inter,
      ui-sans-serif,
      system-ui,
      sans-serif;
    box-shadow: 0 8px 25px var(--shadow);
  }
  .comment-card textarea {
    box-sizing: border-box;
    display: block;
    width: 100%;
    height: 84px;
    min-height: 42px;
    resize: vertical;
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    padding: 10px;
    font: inherit;
    outline: none;
  }
  .comment-card textarea:focus-visible {
    border-color: var(--accent-hover);
  }
  .comment-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 9px;
  }
  .comment-action {
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface-control);
    color: var(--text);
    padding: 6px 10px;
  }
  .comment-action:hover,
  .comment-action:focus-visible {
    background: var(--surface-hover);
  }
  .comment-action.primary {
    background: var(--accent);
  }
  .comment-action.primary:hover,
  .comment-action.primary:focus-visible {
    background: var(--accent-hover);
  }
  .comment-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    color: var(--accent-text);
    font-weight: 650;
  }
  .comment-heading-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .comment-icon-button {
    display: grid;
    place-items: center;
    width: 27px;
    height: 27px;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
  }
  .comment-icon-button:hover {
    background: var(--surface-hover);
  }
  .delete-comment:hover {
    background: var(--surface-hover);
    color: var(--del);
  }
  .pencil-icon,
  .trash-icon {
    width: 17px;
    height: 17px;
    background: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
  }
  .edit-comment:hover {
    color: var(--accent-text);
  }
  .comment-body {
    white-space: pre-wrap;
  }
</style>
