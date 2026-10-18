<script>
  import closeIcon from './assets/close.svg';
  import { version } from '../package.json';

  let { open = $bindable(false) } = $props();
  let dialog;
  const shortcuts = [
    ['Working changes', '1'],
    ['Staged changes', '2'],
    ['Unstaged changes', '3'],
    ['Base branch changes', '4'],
    ['Next file', 'J'],
    ['Previous file', 'K'],
    ['Reload changes', 'R'],
    ['Copy comments', 'C'],
    ['Copy and clear comments', 'Alt+C'],
    ['Show shortcuts', '?'],
  ];

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  id="shortcuts-dialog"
  class="shortcuts-dialog"
  aria-labelledby="shortcuts-title"
  bind:this={dialog}
  oncancel={() => (open = false)}
  onclose={() => (open = false)}
>
  <div class="dialog-heading">
    <h2 id="shortcuts-title">Keyboard shortcuts</h2>
    <button
      id="close-shortcuts"
      type="button"
      aria-label="Close shortcuts"
      onclick={() => (open = false)}
    >
      <span class="close-icon" style={`mask-image:url('${closeIcon}')`} aria-hidden="true"></span>
    </button>
  </div>
  {#each shortcuts as [label, key] (label)}<div class="shortcut-row">
      <span>{label}</span>
      <kbd>{key}</kbd>
    </div>{/each}
  <div class="shortcuts-footer">
    <p>
      Made with ❤️ by <a href="https://ribachenko.com" target="_blank" rel="noopener noreferrer">
        Vitalii Rybachenko
      </a>
    </p>
    <span class="app-version">v{version}</span>
  </div>
</dialog>

<style>
  .shortcuts-dialog {
    width: min(410px, calc(100vw - 32px));
    padding: 0 22px 20px;
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: 0 25px 90px var(--shadow);
  }
  .shortcuts-dialog::backdrop {
    background: var(--overlay);
  }
  .dialog-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .dialog-heading h2 {
    font-size: 18px;
    letter-spacing: -0.3px;
  }
  .dialog-heading button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    aspect-ratio: 1;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    background: var(--surface-control);
    color: var(--text-subtle);
  }
  .dialog-heading button .close-icon {
    display: block;
    width: 16px;
    height: 16px;
    background: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
  }
  .dialog-heading button:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
  .dialog-heading button:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent-hover);
  }
  .shortcut-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid var(--border);
    font-size: 13px;
  }
  .shortcut-row kbd {
    min-width: 26px;
    padding: 3px 6px;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    background: var(--surface-control);
    color: var(--text-secondary);
    text-align: center;
    font:
      11px ui-monospace,
      SFMono-Regular,
      monospace;
  }
  .shortcuts-footer {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-top: 16px;
    color: var(--text-subtle);
    font-size: 12px;
  }
  .shortcuts-footer p {
    margin: 0;
  }
  .shortcuts-footer .app-version {
    flex: none;
    color: var(--text-subtle);
    font:
      11px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
  .shortcuts-footer a {
    color: var(--accent-text);
    text-decoration: none;
  }
  .shortcuts-footer a:hover {
    color: var(--accent-text);
    text-decoration: underline;
  }
  .shortcuts-footer a:focus-visible {
    outline: 2px solid var(--accent-hover);
    outline-offset: 3px;
    border-radius: 2px;
  }
</style>
