"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

// Shared by the evening ritual and workshop: keep their rhythm and gestures identical.
const SCENE_MS = 2000;
const FADE_MS = 1600;
type Frame = { index: number; key: number; failed: boolean; ready: boolean };

export function usePhotoStory(scenes: readonly { image: string }[]) {
  const count = scenes.length;
  const firstImage = scenes[0].image;
  const wrap = useCallback((index: number) => ((index % count) + count) % count, [count]);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const heldPointer = useRef<number | null>(null);
  const [requested, setRequested] = useState({ index: 0, revision: 0 });
  const [frames, setFrames] = useState<{ current: Frame; previous: Frame | null }>({ current: { index: 0, key: 0, failed: false, ready: false }, previous: null });
  const [reduced, setReduced] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [holding, setHolding] = useState(false);
  const [playing, setPlaying] = useState(true);
  const currentIndex = frames.current.index;
  const currentKey = frames.current.key;
  const busy = requested.index !== currentIndex;
  const paused = holding || !playing || reduced || !pageVisible || busy || !frames.current.ready;
  const select = useCallback((index: number) => setRequested(last => ({ index: wrap(index), revision: last.revision + 1 })), [wrap]);
  const move = useCallback((direction: number) => setRequested(last => ({ index: wrap(last.index + direction), revision: last.revision + 1 })), [wrap]);
  const releasePointer = useCallback((pointerId?: number) => {
    if (pointerId === undefined || heldPointer.current === pointerId) {
      heldPointer.current = null;
      setHolding(false);
    }
    const start = gesture.current;
    if (start && (pointerId === undefined || start.id === pointerId)) {
      gesture.current = null;
      setDragging(false);
      if (root.current?.hasPointerCapture?.(start.id)) root.current.releasePointerCapture(start.id);
    }
  }, []);

  useEffect(() => {
    // Text remains selectable, so it does not capture the pointer. Release there,
    // outside the carousel or after switching windows must still end the hold.
    const onRelease = (event: globalThis.PointerEvent) => releasePointer(event.pointerId);
    const onBlur = () => releasePointer();
    const onVisibility = () => { if (document.hidden) releasePointer(); };
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [releasePointer]);

  useEffect(() => {
    let cancelled = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReduced(motion.matches);
    const onVisibility = () => setPageVisible(!document.hidden);
    void Promise.resolve().then(() => { if (!cancelled) { onMotion(); onVisibility(); } });
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { cancelled = true; motion.removeEventListener("change", onMotion); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    // The eager server-rendered image can finish before React attaches onLoad.
    // A cached image request also reports readiness without needing to scroll here.
    let cancelled = false;
    const first = new window.Image();
    const ready = (failed: boolean) => {
      if (!cancelled) setFrames(last => last.current.key === 0 ? { ...last, current: { ...last.current, ready: true, failed } } : last);
    };
    first.onload = () => ready(false);
    first.onerror = () => ready(true);
    first.src = firstImage;
    return () => { cancelled = true; first.onload = null; first.onerror = null; };
  }, [firstImage]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let distance = 0, lastEvent = 0, consumed = false, lockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const horizontal = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      if (!horizontal || (!event.shiftKey && Math.abs(horizontal) <= Math.abs(event.deltaY))) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastEvent > 220) { distance = 0; consumed = false; }
      lastEvent = now;
      // One scene per gesture: trackpad inertia must not race through the story.
      if (consumed || now < lockedUntil) return;
      const delta = horizontal * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      if (Math.sign(delta) !== Math.sign(distance)) distance = 0;
      distance += delta;
      if (Math.abs(distance) >= 45) {
        move(distance > 0 ? 1 : -1);
        consumed = true;
        lockedUntil = now + 900;
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [move]);

  useEffect(() => {
    if (holding || requested.index === currentIndex) return;
    let cancelled = false;
    const image = new window.Image();
    const show = (failed: boolean) => {
      if (!cancelled && heldPointer.current === null) setFrames(last => ({ current: { index: requested.index, key: requested.revision, failed, ready: true }, previous: reduced ? null : last.current }));
    };
    image.onload = async () => { try { await image.decode?.(); } catch { /* A loaded photograph can still be shown. */ } show(false); };
    image.onerror = () => show(true);
    image.src = scenes[requested.index].image;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [requested, currentIndex, reduced, holding, scenes]);

  useEffect(() => {
    const next = new window.Image();
    next.src = scenes[wrap(currentIndex + 1)].image;
  }, [currentIndex, scenes, wrap]);

  useEffect(() => {
    if (holding || !frames.previous) return;
    const timer = setTimeout(() => setFrames(last => ({ ...last, previous: null })), FADE_MS + 100);
    return () => clearTimeout(timer);
  }, [frames.previous, holding]);

  useEffect(() => {
    if (paused) return;
    // The story keeps its rhythm while scrolling, hovering or outside the viewport.
    const timer = setTimeout(() => { if (heldPointer.current === null) select(currentIndex + 1); }, SCENE_MS);
    return () => clearTimeout(timer);
  }, [paused, currentIndex, currentKey, requested.revision, select]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "Home") { event.preventDefault(); select(0); }
    if (event.key === "End") { event.preventDefault(); select(scenes.length - 1); }
    if (event.key === " " && event.target === event.currentTarget) {
      event.preventDefault();
      setPlaying(value => !value);
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false || heldPointer.current !== null || (event.target as HTMLElement).closest("button, a")) return;
    heldPointer.current = event.pointerId;
    setHolding(true);
    // Touch can swipe over the caption too; mouse users can still select its text.
    if (event.pointerType !== "touch" && (event.target as HTMLElement).closest(".ritual-story-copy, .photo-story-copy")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };
  const finishGesture = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = gesture.current;
    releasePointer(event.pointerId);
    if (cancelled || !start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1);
  };
  const layers = [frames.previous, frames.current].filter((frame): frame is Frame => frame !== null);

  return { root, frames, setFrames, currentIndex, busy, paused, dragging, holding, layers, onKey, onPointerDown, finishGesture, releasePointer };
}
