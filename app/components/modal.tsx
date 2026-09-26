"use client";
import { ReactNode, useEffect, useLayoutEffect, useRef } from "react";

export function Modal({ children, onClose, label, className }: { children: ReactNode; onClose: () => void; label: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const left = window.scrollX, top = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const rootSaved = { overflow: root.style.overflow, overscrollBehavior: root.style.overscrollBehavior };
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter > 0 && document.documentElement.clientWidth > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`;
    // Keep the document in its scroll coordinate system: fixed-body locking resets
    // sticky sections underneath a sheet while it is being dragged away.
    body.style.overflow = "hidden";
    Object.assign(root.style, { overflow: "hidden", overscrollBehavior: "none" });
    const preventBackgroundTouch = (event: TouchEvent) => {
      if (!ref.current?.contains(event.target as Node) && event.cancelable) event.preventDefault();
    };
    document.addEventListener("touchmove", preventBackgroundTouch, { passive: false });
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') ?? []).filter(e => e.getClientRects().length > 0 && !e.closest("[inert]"));
    (focusable()[0] ?? ref.current)?.focus({ preventScroll: true });
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const nodes = focusable(); const first = nodes[0]; const last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!ref.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => {
      Object.assign(body.style, saved);
      Object.assign(root.style, rootSaved);
      document.removeEventListener("touchmove", preventBackgroundTouch);
      document.removeEventListener("keydown", handle);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      window.scrollTo({ left, top, behavior: "instant" });
    };
  }, []);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>;
}
