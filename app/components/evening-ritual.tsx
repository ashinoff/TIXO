"use client";
/* eslint-disable @next/next/no-img-element -- editorial ritual photographs retain their composition */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const SCENE_MS = 2000;
const FADE_MS = 1600;
export const ritualScenes = [
  { image: "/assets/ritual/01-space.webp", label: "Место", moment: "ПЕРЕД ПЕРВЫМ ОГНЁМ", title: "Освободи место\nдля тишины.", lead: "Вечер начинается с маленькой паузы.", care: "Поставь свечу на устойчивую негорючую подставку. Оставь вокруг свободное пространство — вдали от сквозняков, штор и других вещей, которые могут загореться.", alt: "Незажжённая чёрная свеча на широкой каменной подставке в спокойном тёмном интерьере" },
  { image: "/assets/ritual/02-light.webp", label: "Огонь", moment: "ПЕРВОЕ ПРИКОСНОВЕНИЕ", title: "Один огонь.\nДругой ритм.", lead: "Зажги свечу — и дай вечеру начаться.", care: "Сними упаковку и съёмный декор. Подготовь фитиль и зажги его по инструкции к своей свече: у каждой формы свои особенности. Погаси использованную спичку.", alt: "Рука подносит длинную зажжённую спичку к фитилю чёрной ребристой свечи" },
  { image: "/assets/ritual/03-stay.webp", label: "Мгновение", moment: "ПОКА СВЕЧА ГОРИТ", title: "Пусть всё\nподождёт.", lead: "Аромат раскрывается. Ты остаёшься рядом.", care: "Наслаждайся светом, не оставляя огонь без присмотра. Береги свечу от детей и животных. Пока воск горячий, не двигай её и соблюдай время горения из инструкции.", alt: "Тихое золотистое пламя над чёрной свечой отражается на тёмном камне" },
  { image: "/assets/ritual/04-extinguish.webp", label: "Пауза", moment: "КОГДА ВЕЧЕР ЗАКОНЧИЛСЯ", title: "Заверши вечер\nмягко.", lead: "Огонь гаснет. Ощущение остаётся.", care: "Аккуратно погаси пламя — например, специальным колпачком. Убедись, что фитиль больше не тлеет, и дай воску полностью остыть. Не гаси свечу водой.", alt: "Латунный колпачок над погашенной свечой, от фитиля поднимается тонкая нить дыма" },
  { image: "/assets/ritual/05-return.webp", label: "Возвращение", moment: "ДО СЛЕДУЮЩЕГО ВЕЧЕРА", title: "Сохрани\nэто чувство.", lead: "У хорошего вечера может быть продолжение.", care: "Когда свеча полностью остынет, убери её от прямого солнца и источников тепла. Защити от пыли — например, стеклянным колпаком. Перед новым огнём колпак обязательно сними.", alt: "Остывшая незажжённая чёрная свеча под прозрачным стеклянным колпаком на каменной подставке" },
] as const;

type Frame = { index: number; key: number; failed: boolean; ready: boolean };
const wrap = (index: number) => (index + ritualScenes.length) % ritualScenes.length;

export function EveningRitual() {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const [requested, setRequested] = useState({ index: 0, revision: 0 });
  const [frames, setFrames] = useState<{ current: Frame; previous: Frame | null }>({ current: { index: 0, key: 0, failed: false, ready: false }, previous: null });
  const [reduced, setReduced] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(true);
  const currentIndex = frames.current.index;
  const currentKey = frames.current.key;
  const busy = requested.index !== currentIndex;
  const paused = !playing || reduced || !pageVisible || busy || !frames.current.ready;
  const select = useCallback((index: number) => setRequested(last => ({ index: wrap(index), revision: last.revision + 1 })), []);
  const move = useCallback((direction: number) => setRequested(last => ({ index: wrap(last.index + direction), revision: last.revision + 1 })), []);

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
    first.src = ritualScenes[0].image;
    return () => { cancelled = true; first.onload = null; first.onerror = null; };
  }, []);

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
    if (requested.index === currentIndex) return;
    let cancelled = false;
    const image = new window.Image();
    const show = (failed: boolean) => {
      if (!cancelled) setFrames(last => ({ current: { index: requested.index, key: requested.revision, failed, ready: true }, previous: reduced ? null : last.current }));
    };
    image.onload = async () => { try { await image.decode?.(); } catch { /* A loaded photograph can still be shown. */ } show(false); };
    image.onerror = () => show(true);
    image.src = ritualScenes[requested.index].image;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [requested, currentIndex, reduced]);

  useEffect(() => {
    const next = new window.Image();
    next.src = ritualScenes[wrap(currentIndex + 1)].image;
  }, [currentIndex]);

  useEffect(() => {
    if (!frames.previous) return;
    const timer = setTimeout(() => setFrames(last => ({ ...last, previous: null })), FADE_MS + 100);
    return () => clearTimeout(timer);
  }, [frames.previous]);

  useEffect(() => {
    if (paused) return;
    // The story keeps its rhythm while scrolling, hovering or outside the viewport.
    const timer = setTimeout(() => select(currentIndex + 1), SCENE_MS);
    return () => clearTimeout(timer);
  }, [paused, currentIndex, currentKey, requested.revision, select]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "Home") { event.preventDefault(); select(0); }
    if (event.key === "End") { event.preventDefault(); select(ritualScenes.length - 1); }
    if (event.key === " " && event.target === event.currentTarget) {
      event.preventDefault();
      setPlaying(value => !value);
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, .ritual-story-copy")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };
  const finishGesture = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1);
  };
  const layers = [frames.previous, frames.current].filter((frame): frame is Frame => frame !== null);

  return <section className="evening-ritual pad" id="care" aria-labelledby="care-title">
    <header className="ritual-story-heading"><div><p className="eyebrow">05 / ПРОСТОЙ РИТУАЛ</p><h2 id="care-title">Чтобы свет<br /><span>радовал дольше.</span></h2></div><p>Пять мгновений одного вечера.<br />От первого огня до следующей встречи.</p></header>
    <div ref={root} className={`ritual-story${dragging ? " is-dragging" : ""}`} role="region" aria-roledescription="карусель" aria-label="Пять мгновений тихого вечера" tabIndex={0} aria-describedby="ritual-gesture-help" aria-keyshortcuts="ArrowLeft ArrowRight Home End Space" data-scene={currentIndex} data-playing={!paused} aria-busy={busy}
      onKeyDown={onKey} onPointerDown={onPointerDown} onPointerUp={event => finishGesture(event)} onPointerCancel={event => finishGesture(event, true)}>
      <div className="ritual-story-layers" aria-live={paused ? "polite" : "off"}>
        {layers.map((frame, index) => {
          const current = index === layers.length - 1;
          const scene = ritualScenes[frame.index];
          return <article key={frame.key} className={`ritual-story-frame${current && frames.previous ? " is-revealing" : !current ? " is-leaving" : ""}`} aria-hidden={!current || undefined} inert={!current || undefined} aria-label={`${frame.index + 1} из 5: ${scene.label}`}
            onAnimationEnd={event => { if (current && event.target === event.currentTarget) setFrames(last => ({ ...last, previous: null })); }}>
            {!frame.failed && <img src={scene.image} alt={scene.alt} width="1536" height="1024" loading="eager" draggable={false}
              onLoad={() => { if (current && !frame.ready) setFrames(last => ({ ...last, current: { ...last.current, ready: true } })); }}
              onError={() => { if (current) setFrames(last => ({ ...last, current: { ...last.current, ready: true, failed: true } })); }} />}
            <div className="ritual-story-shade" />
            <div className="ritual-story-copy"><span className="eyebrow">{String(frame.index + 1).padStart(2, "0")} / {scene.moment}</span><h3>{scene.title}</h3><p className="ritual-story-lead">{scene.lead}</p><p className="ritual-story-care">{scene.care}</p></div>
          </article>;
        })}
      </div>
      <div className="ritual-story-top"><span>ТИХО / ИСКУССТВО МАЛЕНЬКИХ ПАУЗ</span><span>{String(currentIndex + 1).padStart(2, "0")} <i>/ 05</i></span></div>
      <p className="ritual-drag-hint" aria-hidden="true">Листайте влево или вправо <span>мышью · свайпом · Shift + колесо</span></p>
      <p id="ritual-gesture-help" className="sr-only">Стрелки влево и вправо меняют сцену. Home — первая, End — последняя. Пробел останавливает или продолжает автосмену.</p>
    </div>
    <div className="ritual-afterglow"><div><p className="eyebrow">ВАШ МАЛЕНЬКИЙ ПЛАН НА ВЕЧЕР</p><h2>Меньше спешки.<br /><span>Больше себя.</span></h2></div><div><p>Одна свеча. Любимый аромат.<br />И немного времени, которое только твоё.</p><a className="button button-glass" href="#collection">Выбрать свою свечу <span aria-hidden="true">↗</span></a></div></div>
  </section>;
}
