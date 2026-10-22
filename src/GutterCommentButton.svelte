<svelte:options css="injected" />

<script>
  import plusIcon from './assets/plus.svg';
  import { tooltip } from './tooltip.js';

  let { path, getHoveredLine, onBegin } = $props();

  function begin(event) {
    event.stopPropagation();
    const hovered = getHoveredLine();
    onBegin(path, hovered.lineNumber, hovered.side);
  }
</script>

<button
  type="button"
  class="gutter-comment-button"
  data-difero-comment
  aria-label="Add comment"
  {@attach tooltip('Add comment')}
  onclick={begin}
>
  <span class="plus-icon" style={`mask-image:url('${plusIcon}')`} aria-hidden="true"></span>
</button>

<style>
  .gutter-comment-button {
    position: absolute;
    top: calc(50% - 9px);
    right: 0;
    z-index: 4;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: var(--accent);
    color: var(--text);
    /* Rendered in the diff's shadow root, out of reach of the global button rule. */
    cursor: pointer;
  }
  .gutter-comment-button:hover {
    background: var(--accent-hover);
  }
  .gutter-comment-button .plus-icon {
    display: block;
    width: 12px;
    height: 12px;
    background: currentColor;
    mask-position: center;
    mask-size: contain;
    mask-repeat: no-repeat;
  }
</style>
