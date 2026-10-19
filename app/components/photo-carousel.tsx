"use client";
/* eslint-disable @next/next/no-img-element -- photographs preserve uploaded URLs and proportions */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { ArrowIcon } from "./ui-icon";

export type PhotoCarouselHandle = { move: (offset: number) => void; drag: (distance: number) => void; cancel: () => void };
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// Decode before exposing an image: browsers otherwise briefly paint an old bitmap.
const cache = new Map<string, Promise<void>>();
const decoded = new Set<string>();
export function preparePhoto(url: string): Promise<void> {
  if (!url) return Promise.resolve();
  if (typeof window === "undefined" || typeof window.Image !== "function") {
    decoded.add(url);
    return Promise.resolve();
  }
  if (!cache.has(url)) {
    const loading = new Promise<void>(resolve => {
      const image = new window.Image();
      let done = false;
      const finish = () => { if (done) return; done = true; decoded.add(url); resolve(); };
      image.onload = () => { Promise.resolve(image.decode?.()).catch(() => {}).finally(finish); };
      image.onerror = finish;
      image.src = url;
      if (image.complete && image.naturalWidth > 0) image.onload?.(new Event("load"));
    });
    cache.set(url, loading);
    if (cache.size > 240) cache.delete(cache.keys().next().value!);
  }
  return cache.get(url)!;
}
export function usePhotoWarmup(photos: string[], index: number) {
  useEffect(() => {
    if (!photos.length) return;
    const ahead = [index, (index + 1) % photos.length, (index + photos.length - 1) % photos.length];
    for (const position of ahead) void preparePhoto(photos[position]);
  }, [photos, index]);
}

/** Shared motion keeps the catalog and detail gallery on the same moving strip. */
export function usePhotoCarousel<T extends HTMLElement = HTMLDivElement>(count: number, photos: string[] = []) {
  const [index, setIndex] = useState(0);
  const [motion, setMotion] = useState<{ target: number; direction: number } | null>(null);
  const track = useRef<T>(null);
  const busy = useRef(false);
  const serial = useRef(0);
  usePhotoWarmup(photos, index);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const paint = (distance: number, duration = 0) => {
    if (!track.current) return;
    track.current.style.transition = duration ? `transform ${duration}ms cubic-bezier(.22,.7,.25,1)` : "none";
    track.current.style.transform = `translate3d(${distance}px,0,0)`;
  };
  const navigate = (target: number, direction: number) => {
    if (busy.current || count < 2 || target === index) return;
    clearTimeout(timer.current);
    // Accessibility preference: skip async motion and swap the keyed image directly.
    if (reducedMotion()) { paint(0); setIndex(target); return; }
    busy.current = true;
    const token = ++serial.current;
    const start = () => {
      if (token !== serial.current) return;
      if (reducedMotion()) { paint(0); setIndex(target); busy.current = false; return; }
      setMotion({ target, direction });
    };
    // A decoded/cached destination navigates immediately, including keyboard and swipe.
    // A cold destination leaves the previous frame stable instead of flashing stale pixels.
    if (decoded.has(photos[target])) start();
    else void preparePhoto(photos[target] ?? "").then(start);
  };
  const cancel = () => {
    if (busy.current) return;
    clearTimeout(timer.current);
    paint(0, reducedMotion() ? 0 : 240);
  };
  const drag = (distance: number) => {
    if (busy.current || count < 2 || reducedMotion()) return;
    const width = track.current?.clientWidth ?? 0;
    paint(Math.max(-width * 0.95, Math.min(width * 0.95, distance)));
  };
  useLayoutEffect(() => {
    if (!track.current) return;
    if (!motion) { paint(0); return; }
    // A new thumbnail target is rendered in the adjacent slot before movement starts.
    const width = track.current.clientWidth;
    frame.current = requestAnimationFrame(() => {
      paint(-motion.direction * width, 280);
      timer.current = setTimeout(() => {
        setIndex(motion.target);
        setMotion(null);
        busy.current = false;
      }, 290);
    });
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      clearTimeout(timer.current);
    };
  }, [motion]);
  useEffect(() => () => { serial.current++; clearTimeout(timer.current); if (frame.current !== undefined) cancelAnimationFrame(frame.current); }, []);
  const previous = motion?.direction === -1 ? motion.target : (index + count - 1) % count;
  const next = motion?.direction === 1 ? motion.target : (index + 1) % count;
  const move = (offset: number) => navigate((index + offset + count) % count, offset < 0 ? -1 : 1);
  return { index, motion, track, previous, next, move, navigate, drag, cancel };
}

/** One moving strip: the current photo and its neighbours follow the same finger. */
export function PhotoCarousel({ photos, label, controlsRef }: { photos: string[]; label: string; controlsRef: Ref<PhotoCarouselHandle> }) {
  const count = photos.length;
  const { index, motion, track, previous, next, move, navigate, drag, cancel } = usePhotoCarousel(count, photos);
  useImperativeHandle(controlsRef, () => ({ move, drag, cancel }));
  return <div className="detail-gallery" role="region" aria-label="Фотографии свечи" onKeyDown={event => {
    if (count > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  }}>
    <div className="detail-photo">
      <div className="detail-photo-track" ref={track}>
        <img key={photos[index]} className="photo-current" src={photos[index]} alt={`${label}${count > 1 ? ` · фото ${index + 1}` : ""}`} decoding="async" draggable={false} />
        {count > 1 && <><img key={photos[previous]} className="photo-adjacent photo-previous" src={photos[previous]} alt="" aria-hidden="true" decoding="async" draggable={false} /><img key={photos[next]} className="photo-adjacent photo-next" src={photos[next]} alt="" aria-hidden="true" decoding="async" draggable={false} /></>}
      </div>
      {count > 1 && <div className="photo-tap-zones">
        <button type="button" className="photo-tap-target" aria-label="Предыдущее фото — левая половина" disabled={motion !== null} onClick={() => move(-1)} />
        <button type="button" className="photo-tap-target" aria-label="Следующее фото — правая половина" disabled={motion !== null} onClick={() => move(1)} />
      </div>}
      {count > 1 && <div className="photo-navigation"><button type="button" aria-label="Предыдущее фото" disabled={motion !== null} onClick={() => move(-1)}><ArrowIcon direction="left" /></button><span role="status" aria-live="polite">{index + 1} / {count}</span><button type="button" aria-label="Следующее фото" disabled={motion !== null} onClick={() => move(1)}><ArrowIcon direction="right" /></button></div>}
    </div>
    {count > 1 && <div className="photo-thumbnails">{photos.map((src, target) => <button key={src} type="button" aria-label={`Фото ${target + 1}`} aria-pressed={target === index} disabled={motion !== null} onClick={() => navigate(target, target < index ? -1 : 1)}><img src={src} alt="" width="70" height="82" loading="lazy" /></button>)}</div>}
  </div>;
}
