// Reports whether a `position: sticky` node is currently stuck to its top inset.
// The observer root starts 1px below that inset, so a stuck node is clipped by it.
export function stuck(onChange) {
  return (node) => {
    const top = parseFloat(getComputedStyle(node).top) + 1;
    const observer = new IntersectionObserver(
      ([entry]) =>
        onChange(
          entry.isIntersecting &&
            entry.intersectionRatio < 1 &&
            entry.boundingClientRect.top < entry.rootBounds.top,
        ),
      { rootMargin: `-${top}px 0px 0px 0px`, threshold: [0, 1] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      onChange(false);
    };
  };
}
