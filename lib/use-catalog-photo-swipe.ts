"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

type Actions = { move: (offset: number) => void; drag: (distance: number) => void; cancel: () => void };
type Gesture = { id: number; x: number; y: number; dx: number; dy: number; axis: "x" | "y" | null };

/** Horizontal drags belong to the photograph; vertical gestures keep scrolling the page. */
export function useCatalogPhotoSwipe(actions: Actions) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(actions);
  useLayoutEffect(() => { latest.current = actions; });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let gesture: Gesture | null = null;
    let suppressClickUntil = 0;
    const cancel = () => { gesture = null; latest.current.cancel(); };
    const start = (event: TouchEvent) => {
      const target = event.target instanceof window.Element ? event.target : null;
      if (event.touches.length !== 1 || target?.closest(".catalog-photo-navigation")) { cancel(); return; }
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, axis: null };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { cancel(); return; }
      const touch = Array.from(event.touches).find(touch => touch.identifier === gesture!.id);
      if (!touch) return;
      gesture.dx = touch.clientX - gesture.x;
      gesture.dy = touch.clientY - gesture.y;
      const x = Math.abs(gesture.dx), y = Math.abs(gesture.dy);
      if (!gesture.axis && Math.max(x, y) >= 12) {
        if (x > y * 1.25) gesture.axis = "x";
        else if (y > x * 1.25) gesture.axis = "y";
      }
      if (gesture.axis === "x") {
        if (event.cancelable) event.preventDefault();
        suppressClickUntil = Date.now() + 600;
        latest.current.drag(gesture.dx);
      }
    };
    const end = (event: TouchEvent) => {
      const completed = gesture;
      gesture = null;
      if (!completed) return;
      if (event.touches.length || !Array.from(event.changedTouches).some(touch => touch.identifier === completed.id)) { latest.current.cancel(); return; }
      if (completed.axis) suppressClickUntil = Date.now() + 600;
      if (completed.axis === "x") {
        if (event.cancelable) event.preventDefault();
        if (Math.abs(completed.dx) >= 56 && Math.abs(completed.dx) > Math.abs(completed.dy) * 1.25) latest.current.move(completed.dx < 0 ? 1 : -1);
        else latest.current.cancel();
      }
    };
    const click = (event: MouseEvent) => {
      // Keyboard activation has detail=0 and remains available after a gesture.
      if (event.detail !== 0 && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
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
