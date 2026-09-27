"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMobileLayout } from "../../lib/use-mobile-layout";
import { Modal } from "./modal";

/** One option list: anchored below its trigger on desktop, a full-screen sheet on touch layouts. */
export function CatalogFilter({ id, label, value, preview, open, onToggle, onClose, children }: {
  id: string; label: string; value: string; preview?: ReactNode; open: boolean;
  onToggle: () => void; onClose: () => void; children: ReactNode;
}) {
  const mobile = useMobileLayout();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const dismiss = useCallback(() => {
    close.current();
    document.getElementById(`filter-${id}`)?.focus({ preventScroll: true });
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const selected = panel.current?.querySelector<HTMLElement>('[data-selected="true"]');
    selected?.focus({ preventScroll: true });
    if (selected && panel.current) panel.current.scrollTop = Math.max(0, selected.offsetTop - panel.current.offsetTop - 12);
    if (mobile) return;
    const outside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close.current();
    };
    const measure = () => {
      const trigger = root.current?.querySelector("button");
      if (!trigger || !panel.current) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      panel.current.style.maxHeight = `${Math.max(48, Math.min(520, bottom - trigger.getBoundingClientRect().bottom - 20))}px`;
    };
    measure();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open, mobile]);

  useEffect(() => {
    const element = sheet.current;
    if (!open || !mobile || !element) return;
    let start: { x: number; y: number; id: number; header: boolean } | null = null;
    let distance = 0;
    let dragging = false;
    let closing = false;
    let suppressClick = false;
    const reset = () => {
      start = null; dragging = false; distance = 0;
      element.style.transition = "transform 220ms ease";
      element.style.transform = "";
    };
    const begin = (event: TouchEvent) => {
      if (closing || event.touches.length !== 1) { if (!closing) reset(); return; }
      const touch = event.touches[0];
      suppressClick = false;
      const header = (event.target as Element).closest(".catalog-filter-sheet-header") !== null;
      start = header || (panel.current?.scrollTop ?? 0) <= 0
        ? { x: touch.clientX, y: touch.clientY, id: touch.identifier, header } : null;
      distance = 0; dragging = false;
    };
    const move = (event: TouchEvent) => {
      if (!start || closing || event.touches.length !== 1) return;
      const touch = Array.from(event.touches).find(item => item.identifier === start?.id);
      if (!touch) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (!dragging && (Math.abs(dx) > 12 || dy < -8 || (!start.header && (panel.current?.scrollTop ?? 0) > 0))) { start = null; return; }
      if (!dragging && dy > 10 && dy > Math.abs(dx) * 1.2) dragging = true;
      if (!dragging) return;
      if (event.cancelable) event.preventDefault();
      distance = Math.max(0, dy);
      element.style.transition = "none";
      element.style.transform = `translateY(${distance}px)`;
    };
    const finish = (event: TouchEvent) => {
      if (!start || closing) return;
      suppressClick = dragging;
      if (event.type === "touchcancel" || distance < 90) { reset(); return; }
      closing = true;
      if (event.cancelable) event.preventDefault();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.style.transition = reduced ? "none" : "transform 240ms cubic-bezier(.22,1,.36,1)";
      element.style.transform = "translateY(105%)";
      timer.current = setTimeout(dismiss, reduced ? 0 : 240);
    };
    const stopClick = (event: MouseEvent) => {
      if (dragging || closing || suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
    };
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", finish, { passive: false });
    element.addEventListener("touchcancel", finish);
    element.addEventListener("click", stopClick, true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", finish);
      element.removeEventListener("touchcancel", finish);
      element.removeEventListener("click", stopClick, true);
    };
  }, [open, mobile, dismiss]);

  const options = <div ref={panel} id={`filter-panel-${id}`} className={`catalog-filter-panel filter-panel-${id}`} role="region" aria-label={`Выбор: ${label.toLowerCase()}`}>{children}</div>;
  return <div ref={root} className={`catalog-dropdown ${open ? "is-open" : ""}`}
    onBlur={event => { if (open && !mobile && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close.current(); }}
    onKeyDown={event => { if (open && !mobile && event.key === "Escape") { event.preventDefault(); dismiss(); } }}>
    <button type="button" id={`filter-${id}`} className="catalog-filter-trigger" aria-expanded={open} aria-controls={open ? `filter-panel-${id}` : undefined} aria-haspopup={mobile ? "dialog" : undefined} onClick={onToggle}>
      <span className="filter-caption">{label}</span><span className="filter-value">{preview}{value}<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor"><path d="m4 6 4 4 4-4" /></svg></span>
    </button>
    {open && (mobile ? createPortal(<div className="tiho-site catalog-filter-portal"><Modal label={`Выбор: ${label.toLowerCase()}`} className="catalog-filter-dialog" onClose={dismiss}>
      <div ref={sheet} className="catalog-filter-sheet">
        <header className="catalog-filter-sheet-header"><span className="filter-drag-handle" aria-hidden="true" /><div><h2>{label}</h2><button type="button" onClick={dismiss} aria-label="Закрыть фильтр"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div><p>Выберите вариант или смахните вниз, чтобы закрыть</p></header>
        {options}
      </div>
    </Modal></div>, document.body) : options)}
  </div>;
}
