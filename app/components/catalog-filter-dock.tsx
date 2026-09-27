"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Keep the original slot in the page while offering filters during an upward browse. */
export function CatalogFilterDock({ children, open, onLeave }: { children: ReactNode; open: boolean; onLeave: () => void }) {
  const slot = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState({ floating: false, visible: false });
  const latest = useRef({ open, onLeave, dock });
  useLayoutEffect(() => { latest.current = { open, onLeave, dock }; });
  useLayoutEffect(() => {
    const anchor = slot.current, content = panel.current;
    if (!anchor || !content || dock.floating) return;
    const measure = () => {
      const height = content.getBoundingClientRect().height;
      if (height > 0) anchor.style.height = `${height}px`;
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(content);
    return () => observer?.disconnect();
  }, [dock.floating]);
  useEffect(() => {
    const anchor = slot.current;
    const catalog = anchor?.closest<HTMLElement>("#collection");
    if (!anchor || !catalog) return;
    const nextSection = catalog.parentElement?.querySelector<HTMLElement>('[data-section-anchor="aromas"]');
    let lastY = window.scrollY, travel = 0, visible = false;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const y = Math.max(0, window.scrollY), delta = y - lastY;
      lastY = y;
      if (delta) travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      const bounds = catalog.getBoundingClientRect();
      // Sticky sections remain geometrically visible underneath later panels.
      const catalogBottom = Math.min(bounds.bottom, nextSection?.getBoundingClientRect().top ?? bounds.bottom);
      const inCatalog = bounds.top < 0 && catalogBottom > (panel.current?.getBoundingClientRect().height ?? 100) + 28;
      const floating = anchor.getBoundingClientRect().top < 12 && inCatalog;
      if (!floating) visible = false;
      else if (travel <= -10) visible = true;
      else if (travel >= 14 && !latest.current.open) visible = false;
      if (floating && latest.current.open) visible = true;
      if (!inCatalog && latest.current.dock.floating && latest.current.open) latest.current.onLeave();
      setDock(current => current.floating === floating && current.visible === visible ? current : { floating, visible });
    };
    const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return <div className="catalog-filter-slot" ref={slot}>
    <div ref={panel} className={`catalog-filter-bar${dock.floating ? " is-floating" : ""}${dock.visible ? " is-visible" : ""}`} inert={dock.floating && !dock.visible}>{children}</div>
  </div>;
}
