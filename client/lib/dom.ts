/**
 * Scroll `el` into view inside its nearest `[data-scroll-container]` ONLY.
 * `el.scrollIntoView()` also scrolls every ancestor, including the page and neighbouring panels,
 * which made the event detail panel jump away from its heading.
 */
export function revealWithin(el: HTMLElement | null, align: 'nearest' | 'center' = 'nearest'): void {
  const box = el?.closest<HTMLElement>('[data-scroll-container]');
  if (!el || !box) return;
  const e = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (align === 'center') {
    box.scrollTop += e.top - b.top - (b.height - e.height) / 3;
  } else if (e.top < b.top) {
    box.scrollTop -= b.top - e.top + 8;
  } else if (e.bottom > b.bottom) {
    box.scrollTop += e.bottom - b.bottom + 8;
  }
}
