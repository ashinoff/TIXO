"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type Actions = { onPhoto: (offset: number) => void; onProduct: (offset: number) => void; onClose: () => void };
type Gesture = { id: number; x: number; y: number; photo: boolean; atTop: boolean; axis: "x" | "y" | "scroll" | null; dx: number; dy: number };

/** Keep vertical reading native; only a downward pull at the top dismisses the sheet. */
export function useProductSwipe(actions: Actions) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(actions);
  useLayoutEffect(() => { latest.current = actions; });
  useLayoutEffect(() => {
    const dialog = ref.current?.closest<HTMLElement>(".product-dialog");
    if (dialog) dialog.scrollTop = 0;
  }, []);

  useEffect(() => {
    const element = ref.current;
    const dialog = element?.closest<HTMLElement>(".product-dialog");
    if (!element || !dialog) return;
    let gesture: Gesture | null = null;
    let suppressClickUntil = 0;
    let settling: ReturnType<typeof setTimeout> | undefined;
    let closing = false;
    const backdrop = dialog.parentElement;
    const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const paint = (distance: number, animate = false) => {
      dialog.style.animation = "none";
      dialog.style.transition = animate && !reduced() ? "transform 280ms cubic-bezier(.22,.7,.25,1)" : "none";
      dialog.style.transform = `translate3d(0,${distance}px,0)`;
      if (backdrop) {
        backdrop.style.transition = animate && !reduced() ? "background-color 280ms ease, backdrop-filter 280ms ease" : "none";
        const progress = Math.min(1, distance / Math.max(1, window.innerHeight));
        backdrop.style.backgroundColor = `rgba(8,13,8,${0.65 * (1 - progress)})`;
        backdrop.style.backdropFilter = `blur(${4 * (1 - progress)}px)`;
      }
    };
    const reset = () => {
      if (closing) return;
      clearTimeout(settling);
      paint(0, true);
      settling = setTimeout(() => { dialog.style.removeProperty("transition"); dialog.style.removeProperty("transform"); }, reduced() ? 0 : 280);
    };
    const dismiss = () => {
      if (closing) return;
      closing = true;
      clearTimeout(settling);
      if (reduced()) { latest.current.onClose(); return; }
      // Keep scroll locking until the sheet has completely left the viewport.
      paint(window.innerHeight + 40, true);
      settling = setTimeout(() => latest.current.onClose(), 290);
    };
    const start = (event: TouchEvent) => {
      if (closing) return;
      clearTimeout(settling);
      const target = event.target instanceof window.Element ? event.target : null;
      if (event.touches.length !== 1 || target?.closest("input,select,textarea,[contenteditable=true],.photo-thumbnails")) { gesture = null; reset(); return; }
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, photo: !!target?.closest(".detail-gallery"), atTop: dialog.scrollTop <= 1, axis: null, dx: 0, dy: 0 };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { gesture = null; reset(); return; }
      const touch = Array.from(event.touches).find(touch => touch.identifier === gesture!.id);
      if (!touch) return;
      gesture.dx = touch.clientX - gesture.x;
      gesture.dy = touch.clientY - gesture.y;
      const x = Math.abs(gesture.dx), y = Math.abs(gesture.dy);
      if (!gesture.axis && Math.max(x, y) >= 12) {
        if (x > y * 1.25) gesture.axis = "x";
        else if (y > x * 1.25) gesture.axis = gesture.dy > 0 && gesture.atTop && dialog.scrollTop <= 1 ? "y" : "scroll";
      }
      if (gesture.axis === "x" || gesture.axis === "y") {
        if (event.cancelable) event.preventDefault();
        suppressClickUntil = Date.now() + 500;
        if (gesture.axis === "y") paint(Math.max(0, gesture.dy) * 0.9);
      }
    };
    const end = (event: TouchEvent) => {
      const completed = gesture;
      gesture = null;
      if (!completed || event.touches.length || !Array.from(event.changedTouches).some(touch => touch.identifier === completed.id)) return;
      if (completed.axis === "x" && Math.abs(completed.dx) >= 56 && Math.abs(completed.dx) > Math.abs(completed.dy) * 1.25) {
        if (event.cancelable) event.preventDefault();
        (completed.photo ? latest.current.onPhoto : latest.current.onProduct)(completed.dx < 0 ? 1 : -1);
      } else if (completed.axis === "y" && completed.dy >= 80 && completed.dy > Math.abs(completed.dx) * 1.25) {
        if (event.cancelable) event.preventDefault();
        dismiss();
      } else if (completed.axis === "y") reset();
    };
    const cancel = () => { gesture = null; reset(); };
    const click = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    dialog.addEventListener("touchstart", start, { passive: true });
    dialog.addEventListener("touchmove", move, { passive: false });
    dialog.addEventListener("touchend", end, { passive: false });
    dialog.addEventListener("touchcancel", cancel, { passive: true });
    dialog.addEventListener("click", click, true);
    return () => {
      clearTimeout(settling);
      dialog.style.removeProperty("transform"); dialog.style.removeProperty("transition");
      backdrop?.style.removeProperty("background-color"); backdrop?.style.removeProperty("backdrop-filter");
      dialog.removeEventListener("touchstart", start);
      dialog.removeEventListener("touchmove", move);
      dialog.removeEventListener("touchend", end);
      dialog.removeEventListener("touchcancel", cancel);
      dialog.removeEventListener("click", click, true);
    };
  }, []);
  return ref;
}
