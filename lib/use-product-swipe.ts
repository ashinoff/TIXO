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
    const start = (event: TouchEvent) => {
      const target = event.target instanceof window.Element ? event.target : null;
      if (event.touches.length !== 1 || target?.closest("input,select,textarea,[contenteditable=true],.photo-thumbnails")) { gesture = null; return; }
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, photo: !!target?.closest(".detail-gallery"), atTop: dialog.scrollTop <= 1, axis: null, dx: 0, dy: 0 };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { gesture = null; return; }
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
        latest.current.onClose();
      }
    };
    const cancel = () => { gesture = null; };
    const click = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    element.addEventListener("touchstart", start, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: false });
    element.addEventListener("touchcancel", cancel, { passive: true });
    element.addEventListener("click", click, true);
    return () => {
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", cancel);
      element.removeEventListener("click", click, true);
    };
  }, []);
  return ref;
}
