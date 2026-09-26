/** Sticky panels need their original flow position when jumping back to a section. */
export function scrollToSection(id: string, behavior: ScrollBehavior = "smooth") {
  const section = document.getElementById(id);
  if (!section) return;
  const anchor = section.previousElementSibling;
  if (section.parentElement?.classList.contains("stack-ready") && anchor instanceof HTMLElement && anchor.dataset.sectionAnchor === id) {
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - padding), behavior });
  } else {
    section.scrollIntoView({ behavior });
  }
}
