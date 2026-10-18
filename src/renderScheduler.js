const NEAR_MARGIN = '1500px';
const BACKGROUND_LINE_BUDGET = 20000;

const pending = new Map();
let observer;
let draining = false;
let budget = BACKGROUND_LINE_BUDGET;

function idle() {
  return new Promise((resolve) =>
    'requestIdleCallback' in window
      ? requestIdleCallback(resolve, { timeout: 200 })
      : setTimeout(resolve, 16),
  );
}

function take(element) {
  const entry = pending.get(element);
  if (!entry) return null;
  pending.delete(element);
  observer.unobserve(element);
  return entry;
}

function nextInOrder() {
  let next = null;
  for (const [element, entry] of pending) {
    if (!next || entry.order < next.entry.order) next = { element, entry };
  }
  return next;
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (pending.size) {
      await idle();
      const next = nextInOrder();
      if (!next || next.entry.weight > budget) break;
      budget -= next.entry.weight;
      take(next.element);
      await next.entry.run();
    }
  } finally {
    draining = false;
  }
}

export function resetRenderBudget() {
  budget = BACKGROUND_LINE_BUDGET;
  queueMicrotask(drain);
}

// Runs `run` as soon as `element` is near the viewport, or earlier in idle time, in
// `order`, until the background budget of changed lines is spent.
export function scheduleRender(element, { order, weight }, run) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) take(entry.target)?.run();
    },
    { rootMargin: `${NEAR_MARGIN} 0px` },
  );
  const entry = { order, weight, run };
  pending.set(element, entry);
  observer.observe(element);
  queueMicrotask(drain);
  return () => {
    if (pending.get(element) !== entry) return;
    pending.delete(element);
    observer.unobserve(element);
  };
}
