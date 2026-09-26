"use client";

import { useEffect } from "react";
import { scrollToSection } from "../../lib/section-scroll";

export function SectionAnchor({ section }: { section: string }) {
  return <div className="section-anchor" data-section-anchor={section} aria-hidden="true" />;
}

/** Native sticky scrolling, including panels taller than the phone screen. */
export function MobileSectionStack({ mobile }: { mobile: boolean }) {
  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".tiho-site main");
    if (!mobile || !main || !("ResizeObserver" in window)) return;
    const panels = [...main.querySelectorAll<HTMLElement>(":scope > section")];
    const media = window.matchMedia("(max-width: 760px) and (prefers-reduced-motion: no-preference)");
    let stop = () => {};

    const start = () => {
      stop();
      const stacking = media.matches;
      let frame = 0;
      let navigationFrame = 0;
      let following: string | null = null;
      const measure = () => {
        frame = 0;
        for (const panel of panels) {
          // A long panel scrolls all the way through before its bottom is pinned.
          panel.style.setProperty("--stack-panel-height", `${panel.getBoundingClientRect().height}px`);
        }
        // The catalog above a deep link can grow after its API request finishes.
        // Keep the chosen section aligned until the visitor takes over scrolling.
        if (following) scrollToSection(following, "instant");
      };
      const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
      panels.forEach((panel, index) => panel.style.setProperty("--stack-order", String(index + 1)));
      measure();
      if (stacking) main.classList.add("stack-ready");
      const observer = new ResizeObserver(schedule);
      panels.forEach(panel => observer.observe(panel));
      window.addEventListener("resize", schedule);

      const readHash = (hash: string) => {
        try {
          const id = decodeURIComponent(hash.slice(1));
          return panels.some(panel => panel.id === id) ? id : null;
        } catch { return null; }
      };
      const click = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
        if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
        const url = new URL(link.href);
        if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
        const id = readHash(url.hash);
        if (!id) return;
        event.preventDefault();
        if (location.hash !== url.hash) history.pushState(history.state, "", url.hash);
        following = id;
        scrollToSection(id, stacking ? "smooth" : "instant");
      };
      const followHash = () => {
        following = readHash(location.hash);
        window.cancelAnimationFrame(navigationFrame);
        navigationFrame = window.requestAnimationFrame(() => {
          if (following) scrollToSection(following, "instant");
        });
      };
      const stopFollowing = () => { following = null; };
      document.addEventListener("click", click);
      document.addEventListener("pointerdown", stopFollowing, { passive: true });
      document.addEventListener("keydown", stopFollowing);
      window.addEventListener("wheel", stopFollowing, { passive: true });
      window.addEventListener("hashchange", followHash);
      followHash();

      stop = () => {
        observer.disconnect();
        window.cancelAnimationFrame(frame);
        window.cancelAnimationFrame(navigationFrame);
        window.removeEventListener("resize", schedule);
        document.removeEventListener("click", click);
        document.removeEventListener("pointerdown", stopFollowing);
        document.removeEventListener("keydown", stopFollowing);
        window.removeEventListener("wheel", stopFollowing);
        window.removeEventListener("hashchange", followHash);
        main.classList.remove("stack-ready");
        panels.forEach(panel => {
          panel.style.removeProperty("--stack-panel-height");
          panel.style.removeProperty("--stack-order");
        });
      };
    };

    start();
    media.addEventListener("change", start);
    return () => { stop(); media.removeEventListener("change", start); };
  }, [mobile]);

  return null;
}
