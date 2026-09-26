"use client";
/* eslint-disable @next/next/no-img-element -- photographs preserve uploaded URLs and proportions */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { ArrowIcon } from "./ui-icon";

export type PhotoCarouselHandle = { move: (offset: number) => void; drag: (distance: number) => void; cancel: () => void };
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** One moving strip: the current photo and its neighbours follow the same finger. */
export function PhotoCarousel({ photos, label, controlsRef }: { photos: string[]; label: string; controlsRef: Ref<PhotoCarouselHandle> }) {
  const [index, setIndex] = useState(0);
  const [motion, setMotion] = useState<{ target: number; direction: number } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const count = photos.length;
  const paint = (distance: number, duration = 0) => {
    if (!track.current) return;
    track.current.style.transition = duration ? `transform ${duration}ms cubic-bezier(.22,.7,.25,1)` : "none";
    track.current.style.transform = `translate3d(${distance}px,0,0)`;
  };
  const navigate = (target: number, direction: number) => {
    if (busy.current || count < 2 || target === index) return;
    clearTimeout(timer.current);
    if (reducedMotion()) { paint(0); setIndex(target); return; }
    busy.current = true;
    setMotion({ target, direction });
  };
  const cancel = () => {
    if (busy.current) return;
    clearTimeout(timer.current);
    paint(0, reducedMotion() ? 0 : 240);
  };
  useImperativeHandle(controlsRef, () => ({
    move: offset => navigate((index + offset + count) % count, offset < 0 ? -1 : 1),
    drag: distance => {
      if (busy.current || count < 2 || reducedMotion()) return;
      const width = track.current?.clientWidth ?? 0;
      paint(Math.max(-width * 0.95, Math.min(width * 0.95, distance)));
    },
    cancel,
  }));
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
  useEffect(() => () => { clearTimeout(timer.current); if (frame.current !== undefined) cancelAnimationFrame(frame.current); }, []);
  const previous = motion?.direction === -1 ? motion.target : (index + count - 1) % count;
  const next = motion?.direction === 1 ? motion.target : (index + 1) % count;
  const move = (offset: number) => navigate((index + offset + count) % count, offset < 0 ? -1 : 1);
  return <div className="detail-gallery" role="region" aria-label="Фотографии свечи" onKeyDown={event => {
    if (count > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  }}>
    <div className="detail-photo">
      <div className="detail-photo-track" ref={track}>
        <img className="photo-current" src={photos[index]} alt={`${label}${count > 1 ? ` · фото ${index + 1}` : ""}`} decoding="async" draggable={false} />
        {count > 1 && <><img className="photo-adjacent photo-previous" src={photos[previous]} alt="" aria-hidden="true" decoding="async" draggable={false} /><img className="photo-adjacent photo-next" src={photos[next]} alt="" aria-hidden="true" decoding="async" draggable={false} /></>}
      </div>
      {count > 1 && <div className="photo-navigation"><button type="button" aria-label="Предыдущее фото" disabled={motion !== null} onClick={() => move(-1)}><ArrowIcon direction="left" /></button><span role="status" aria-live="polite">{index + 1} / {count}</span><button type="button" aria-label="Следующее фото" disabled={motion !== null} onClick={() => move(1)}><ArrowIcon direction="right" /></button></div>}
    </div>
    {count > 1 && <div className="photo-thumbnails">{photos.map((src, target) => <button key={src} type="button" aria-label={`Фото ${target + 1}`} aria-pressed={target === index} disabled={motion !== null} onClick={() => navigate(target, target < index ? -1 : 1)}><img src={src} alt="" width="70" height="82" loading="lazy" /></button>)}</div>}
  </div>;
}
