"use client";
import { ReactNode, useEffect, useRef } from "react";

export function Modal({ children, onClose, label, className }: { children: ReactNode; onClose: () => void; label: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') ?? []).filter(e => e.getClientRects().length > 0 && !e.closest("[inert]"));
    (focusable()[0] ?? ref.current)?.focus();
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
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", handle); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>;
}
