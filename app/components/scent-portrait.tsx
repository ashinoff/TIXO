"use client";
/* eslint-disable @next/next/no-img-element -- uploaded aroma portraits retain their original URLs */

import { useEffect, useMemo, useState } from "react";

type Portrait = { src?: string | null; name: string; counter: string; description: string; chapterLabel: string; chapterDescription: string };
type Frame = Omit<Portrait, "src"> & { src: string | null; key: string; failed: boolean };

/** A photo and its caption share a snapshot so slow downloads cannot mismatch them. */
export function ScentPortrait({ src, name, counter, description, chapterLabel, chapterDescription }: Portrait) {
  const next = useMemo(() => ({ src: src ?? null, name, counter, description, chapterLabel, chapterDescription,
    key: JSON.stringify([src ?? null, name, counter, description, chapterLabel, chapterDescription]),
  }), [src, name, counter, description, chapterLabel, chapterDescription]);
  const [frames, setFrames] = useState<{ current: Frame; previous: Frame | null }>(() => ({
    current: { ...next, failed: !src }, previous: null,
  }));
  const currentSrc = frames.current.src;
  const currentKey = frames.current.key;
  const currentFailed = frames.current.failed;

  useEffect(() => {
    if (next.key === currentKey) return;
    let cancelled = false;
    const image = new window.Image();
    const show = (failed: boolean) => {
      if (cancelled) return;
      setFrames(last => ({
        current: { ...next, failed },
        previous: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? null : last.current,
      }));
    };
    image.onload = async () => {
      // Decoding before the fade prevents an empty frame on slow connections.
      try { await image.decode?.(); } catch { /* A loaded image can still be displayed. */ }
      show(false);
    };
    image.onerror = () => show(true);
    // A chapter change only crossfades text; keep the photo and its slow movement.
    if (next.src === currentSrc) void Promise.resolve().then(() => show(currentFailed));
    else if (next.src) image.src = next.src;
    else void Promise.resolve().then(() => show(true));
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [next, currentKey, currentSrc, currentFailed]);

  useEffect(() => {
    if (!frames.previous) return;
    // Also release the old image when animation events are skipped by a browser.
    const timer = setTimeout(() => setFrames(last => ({ ...last, previous: null })), 950);
    return () => clearTimeout(timer);
  }, [frames.previous]);

  const captions = [frames.previous, frames.current].filter((frame): frame is Frame => frame !== null);
  const photos = frames.previous && frames.previous.src !== currentSrc ? captions : [frames.current];
  return <div className="scent-portrait-images" aria-busy={next.key !== currentKey}>
    {photos.map((frame, index, layers) => {
      const current = index === layers.length - 1;
      return <div key={frame.src ?? "placeholder"} className={`scent-portrait-frame${current && photos.length > 1 ? " is-revealing" : ""}`} aria-hidden={!current || undefined}
        onAnimationEnd={event => { if (current && event.target === event.currentTarget) setFrames(last => ({ ...last, previous: null })); }}>
        {frame.src && !frame.failed ? <div className="scent-portrait-drift"><img src={frame.src} alt={current ? `Аромат ${frame.name} — образ композиции` : ""} width="1024" height="1024" loading="lazy"
          onError={() => { if (current) setFrames(last => ({ ...last, current: { ...last.current, failed: true } })); }} /></div>
          : <div className="scent-portrait-missing">Портрет аромата скоро появится</div>}
      </div>;
    })}
    <div className="scent-portrait-shade" />
    <div className="scent-portrait-captions" aria-live="polite" aria-atomic="true">
      {captions.map((frame, index) => {
        const current = index === captions.length - 1;
        return <div key={frame.key} className={`scent-portrait-caption${!current ? " is-leaving" : frames.previous ? " is-revealing" : ""}`} aria-hidden={!current || undefined} tabIndex={current ? 0 : undefined}
          onAnimationEnd={event => { if (current && event.target === event.currentTarget) setFrames(last => ({ ...last, previous: null })); }}>
          <span>{frame.counter}</span><h3>{frame.name}</h3>
          {frame.description && <p className="scent-portrait-description">{frame.description}</p>}
          {frame.chapterDescription && frame.chapterDescription !== frame.description && <div className="scent-portrait-chapter"><span>{frame.chapterLabel}</span><p>{frame.chapterDescription}</p></div>}
          {!frame.description && !frame.chapterDescription && <p className="scent-portrait-description">Мастерская скоро добавит описание этой главы аромата.</p>}
        </div>;
      })}
    </div>
  </div>;
}
