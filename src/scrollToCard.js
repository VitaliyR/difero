const MIN_DURATION = 250;
const MAX_DURATION = 600;
const MAX_ANIMATED_SCREENS = 6;
const SETTLE_FRAMES = 10;
const SETTLE_TIMEOUT = 1000;

const ease = (progress) => 1 - (1 - progress) ** 3;

function targetFor(card) {
  const margin = parseFloat(getComputedStyle(card).scrollMarginTop) || 0;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return Math.max(0, Math.min(max, window.scrollY + card.getBoundingClientRect().top - margin));
}

// The target is measured again on every frame because cards render, and change
// height, as the scroll passes them.
export function scrollToCard(card, signal) {
  return new Promise((resolve) => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const screen = window.innerHeight;
    const initial = targetFor(card) - window.scrollY;
    if (Math.abs(initial) > screen * MAX_ANIMATED_SCREENS) {
      window.scrollTo({ top: targetFor(card) - Math.sign(initial) * screen, behavior: 'instant' });
    }
    const distance = targetFor(card) - window.scrollY;
    const duration = Math.min(MAX_DURATION, MIN_DURATION + (Math.abs(distance) / screen) * 60);
    let start = null;
    let previousTarget = null;
    let stableFrames = 0;
    const step = (now) => {
      if (signal.aborted || !card.isConnected) return resolve();
      start ??= now;
      const progress = reduceMotion ? 1 : Math.min(1, (now - start) / duration);
      const target = targetFor(card);
      window.scrollTo({ top: target - distance * (1 - ease(progress)), behavior: 'instant' });
      if (progress === 1) {
        stableFrames = Math.abs(target - previousTarget) < 1 ? stableFrames + 1 : 0;
        previousTarget = target;
        if (stableFrames >= SETTLE_FRAMES || now - start > duration + SETTLE_TIMEOUT) {
          return resolve();
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
