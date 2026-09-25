"use client";
/* eslint-disable @next/next/no-img-element -- uploaded aroma portraits retain their original URLs */

import { useEffect, useState } from "react";

type Frame = { src: string | null; name: string; failed: boolean };

/** Keep the last decoded photograph visible until its replacement is ready. */
export function ScentPortrait({ src, name }: { src?: string | null; name: string }) {
  const [frames, setFrames] = useState<{ current: Frame; previous: Frame | null }>(() => ({
    current: { src: src ?? null, name, failed: !src }, previous: null,
  }));
  const currentSrc = frames.current.src;
  const currentName = frames.current.name;

  useEffect(() => {
    if ((src ?? null) === currentSrc && name === currentName) return;
    let cancelled = false;
    const image = new window.Image();
    const show = (failed: boolean) => {
      if (cancelled) return;
      setFrames(last => ({
        current: { src: src ?? null, name, failed },
        previous: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? null : last.current,
      }));
    };
    image.onload = async () => {
      // Decoding before the fade prevents an empty frame on slow connections.
      try { await image.decode?.(); } catch { /* A loaded image can still be displayed. */ }
      show(false);
    };
    image.onerror = () => show(true);
    if (src) image.src = src;
    else void Promise.resolve().then(() => show(true));
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [src, name, currentSrc, currentName]);

  useEffect(() => {
    if (!frames.previous) return;
    // Also release the old image when animation events are skipped by a browser.
    const timer = setTimeout(() => setFrames(last => ({ ...last, previous: null })), 950);
    return () => clearTimeout(timer);
  }, [frames.previous]);

  return <div className="scent-portrait-images" aria-busy={(src ?? null) !== currentSrc}>
    {[frames.previous, frames.current].filter((frame): frame is Frame => frame !== null).map((frame, index, layers) => {
      const current = index === layers.length - 1;
      return <div key={`${frame.src}:${frame.name}`} className={`scent-portrait-frame${current && frames.previous ? " is-revealing" : ""}`} aria-hidden={!current || undefined}
        onAnimationEnd={event => { if (current && event.target === event.currentTarget) setFrames(last => ({ ...last, previous: null })); }}>
        {frame.src && !frame.failed ? <div className="scent-portrait-drift"><img src={frame.src} alt={current ? `Аромат ${frame.name} — образ композиции` : ""} width="1024" height="1024" loading="lazy"
          onError={() => { if (current) setFrames(last => ({ ...last, current: { ...last.current, failed: true } })); }} /></div>
          : <div className="scent-portrait-missing">Портрет аромата скоро появится</div>}
      </div>;
    })}
  </div>;
}
