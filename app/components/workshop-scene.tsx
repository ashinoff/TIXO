"use client";
/* eslint-disable @next/next/no-img-element -- workshop photography uses authored image URLs */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { emptyAromaProfile, type Scent } from "@/lib/catalog";

const chapters = [["top", "Начало"], ["heart", "Сердце"], ["base", "Шлейф"]] as const;
const FADE_MS = 2200;

function AromaCopy({ scent }: { scent: Scent }) {
  const [chapter, setChapter] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const profile = scent.profile ?? emptyAromaProfile();
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
    if (next === null) return;
    event.preventDefault(); setChapter(next); tabs.current[next]?.focus();
  };
  return <div className="builder-aroma">
    <p className="eyebrow">ТИХО / ВАШ АРОМАТ</p>
    <h3 tabIndex={0}>{scent.name}</h3>
    <div className="workshop-overview" tabIndex={0}>{scent.description || "История этого аромата скоро появится в мастерской."}</div>
    <div className="workshop-chapter-tabs" role="tablist" aria-label="Главы выбранного аромата">
      {chapters.map(([key, label], index) => <button key={key} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-chapter-${index}`} aria-selected={chapter === index} tabIndex={chapter === index ? 0 : -1} ref={element => { tabs.current[index] = element; }} onClick={() => setChapter(index)} onKeyDown={event => onKey(event, index)}><span>0{index + 1}</span>{label}</button>)}
    </div>
    <div className="builder-aroma-chapters">
      {chapters.map(([key], index) => <section key={key} role="tabpanel" id={`${id}-chapter-${index}`} aria-labelledby={`${id}-tab-${index}`} tabIndex={0} hidden={chapter !== index}>
        {profile[key].notes && <h4>{profile[key].notes}</h4>}
        <p>{profile[key].description || (!profile[key].notes ? "Мастерская скоро добавит описание этой главы." : "")}</p>
      </section>)}
    </div>
  </div>;
}

type Frame = { key: string; scent?: Scent; failed: boolean };

/** Keep the decoded photograph and its authored text together; steps never replace either. */
export function WorkshopScene({ scent }: { scent?: Scent }) {
  const next = useMemo(() => ({ key: JSON.stringify(scent ?? null), scent }), [scent]);
  const [frames, setFrames] = useState<{ shown: Frame; previous: Frame | null }>(() => ({ shown: { ...next, failed: false }, previous: null }));
  const shownKey = frames.shown.key;
  const shownSrc = frames.shown.scent?.image;
  const shownFailed = frames.shown.failed;
  useEffect(() => {
    if (next.key === shownKey) return;
    let cancelled = false;
    const image = new window.Image();
    const show = (failed: boolean) => {
      if (!cancelled) setFrames(last => ({ shown: { ...next, failed }, previous: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? null : last.shown }));
    };
    image.onload = async () => { try { await image.decode?.(); } catch { /* Loaded image remains usable. */ } show(false); };
    image.onerror = () => show(true);
    if (next.scent?.image === shownSrc) void Promise.resolve().then(() => show(shownFailed));
    else if (next.scent?.image) image.src = next.scent.image;
    else void Promise.resolve().then(() => show(false));
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [next, shownKey, shownSrc, shownFailed]);
  useEffect(() => {
    if (!frames.previous) return;
    const timer = setTimeout(() => setFrames(last => ({ ...last, previous: null })), FADE_MS + 100);
    return () => clearTimeout(timer);
  }, [frames.previous]);
  const layers = [frames.previous, frames.shown].filter((frame): frame is Frame => frame !== null);
  return <div className="workshop-atmosphere" aria-busy={shownKey !== next.key}>
    {layers.map((frame, index) => {
      const current = index === layers.length - 1;
      return <div key={frame.key} className={`workshop-atmosphere-layer${current && frames.previous ? " is-revealing" : !current ? " is-leaving" : ""}`} aria-hidden={!current || undefined} inert={!current || undefined}
        onAnimationEnd={event => { if (current && event.target === event.currentTarget) setFrames(last => ({ ...last, previous: null })); }}>
        <div className="workshop-background" aria-hidden="true">{frame.scent?.image && !frame.failed && <img src={frame.scent.image} alt="" width="1024" height="1024" loading="lazy" onError={() => { if (current) setFrames(last => ({ ...last, shown: { ...last.shown, failed: true } })); }} />}</div>
        <div className="workshop-background-shade" />
        <div className="workshop-aroma-copy" aria-live={current ? "polite" : "off"}>{frame.scent ? <AromaCopy scent={frame.scent} /> : <p className="eyebrow">ВЫБЕРИТЕ АРОМАТ ДЛЯ СВОЕЙ СВЕЧИ</p>}</div>
      </div>;
    })}
  </div>;
}
