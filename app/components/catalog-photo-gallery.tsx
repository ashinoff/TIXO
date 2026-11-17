"use client";
/* eslint-disable @next/next/no-img-element -- preserve the original uploaded photographs */
import { useMemo, type HTMLAttributes, type ReactNode } from "react";
import { photoUrl } from "../../lib/photo-url";
import { useMobileLayout } from "../../lib/use-mobile-layout";
import { useCatalogPhotoSwipe } from "../../lib/use-catalog-photo-swipe";
import { slotKeys, usePhotoCarousel } from "./photo-carousel";
import { ArrowIcon } from "./ui-icon";

export function CatalogPhotoGallery({ photos, label, onOpen, inspection, children }: {
  photos: string[]; label: string; onOpen: () => void; inspection: HTMLAttributes<HTMLButtonElement>; children: ReactNode;
}) {
  const width = useMobileLayout() ? 640 : 960;
  const sized = useMemo(() => photos.map(src => photoUrl(src, width)), [photos, width]);
  const { index, motion, track, previous, next, move, drag, cancel } = usePhotoCarousel<HTMLSpanElement>(photos.length, sized);
  const swipe = useCatalogPhotoSwipe({ move, drag, cancel });
  const multiple = photos.length > 1;
  const keys = slotKeys(sized, index, previous, next);
  return <div className="catalog-photo-gallery" ref={swipe} role="group" aria-label={`Фотографии: ${label}`} onKeyDown={event => {
    if (multiple && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  }}>
    <button type="button" className={`product-image${photos[index]?.endsWith("hero.png") ? " black-image" : ""}`} aria-label={`Подробнее о свече ${label}`} onClick={onOpen} {...inspection}>
      <span className="catalog-photo-track" ref={track}>
        <span key={keys.current} className="catalog-photo-slide"><img className="catalog-photo-current" src={sized[index]} alt={`${label}${multiple ? ` · фото ${index + 1}` : ""}`} loading="lazy" decoding="async" draggable={false} /></span>
        {multiple && <span key={keys.previous} className="catalog-photo-slide catalog-photo-previous"><img src={sized[previous]} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} /></span>}
        {multiple && <span key={keys.next} className="catalog-photo-slide catalog-photo-next"><img src={sized[next]} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} /></span>}
      </span>
      {children}
    </button>
    {multiple && <div className="catalog-photo-navigation">
      <button type="button" aria-label="Предыдущее фото в каталоге" disabled={motion !== null} onClick={() => move(-1)}><ArrowIcon direction="left" /></button>
      <span role="status" aria-live="polite" aria-atomic="true">{index + 1} / {photos.length}</span>
      <button type="button" aria-label="Следующее фото в каталоге" disabled={motion !== null} onClick={() => move(1)}><ArrowIcon direction="right" /></button>
    </div>}
  </div>;
}
