let active: (() => void) | null = null;

export function cancelSectionScroll() { active?.(); }
export function isSectionScrollActive() { return active !== null; }

/** Follow the original flow position, even while a sticky panel's layout grows. */
export function scrollToSection(id: string, behavior: ScrollBehavior = "smooth") {
  const section = document.getElementById(id);
  if (!section) return;
  cancelSectionScroll();
  const destination = () => {
    const anchor = section.previousElementSibling;
    const target = section.parentElement?.classList.contains("stack-ready") && anchor instanceof HTMLElement && anchor.dataset.sectionAnchor === id ? anchor : section;
    const padding = parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const margin = parseFloat(window.getComputedStyle(section).scrollMarginTop) || 0;
    return Math.max(0, Math.min(window.scrollY + target.getBoundingClientRect().top - padding - margin, document.documentElement.scrollHeight - window.innerHeight));
  };
  const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const start = window.scrollY, left = window.scrollX, end = destination();
  if (behavior !== "smooth" || reduce() || !window.requestAnimationFrame || Math.abs(end - start) < 2) {
    window.scrollTo({ top: end, left, behavior: "instant" });
    return;
  }
  const duration = Math.min(2400, 1200 + Math.abs(end - start) * .12);
  const began = performance.now();
  let frame = 0;
  const stop = () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("pointerdown", stop);
    window.removeEventListener("keydown", key);
    if (active === stop) active = null;
  };
  const key = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape", "Tab"].includes(event.key)) stop();
  };
  const tick = (now: number) => {
    if (!section.isConnected) { stop(); return; }
    const progress = reduce() ? 1 : Math.min(1, Math.max(0, (now - began) / duration));
    const eased = progress * progress * (3 - 2 * progress);
    window.scrollTo({ top: start + (destination() - start) * eased, left, behavior: "instant" });
    if (progress < 1) frame = window.requestAnimationFrame(tick);
    else stop();
  };
  active = stop;
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("pointerdown", stop, { passive: true });
  window.addEventListener("keydown", key);
  frame = window.requestAnimationFrame(tick);
}
