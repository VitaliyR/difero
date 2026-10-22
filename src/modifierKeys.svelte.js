export const modifierKeys = $state({ alt: false, shift: false });

function sync(event) {
  modifierKeys.alt = event.altKey;
  modifierKeys.shift = event.shiftKey;
}

function reset() {
  modifierKeys.alt = false;
  modifierKeys.shift = false;
}

window.addEventListener('keydown', sync);
window.addEventListener('keyup', sync);
window.addEventListener('pointermove', sync);
window.addEventListener('blur', reset);
