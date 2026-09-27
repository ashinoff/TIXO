"use client";
/* eslint-disable @next/next/no-img-element -- preserve the composition of workshop photographs */

import { useMemo } from "react";
import { usePhotoStory } from "@/lib/use-photo-story";

export const workshopScenes = [
  { image: "/assets/workshop/creation/01-mix.webp", label: "Сначала — гипс", detail: "Отмеряем, смешиваем, чувствуем текстуру.", alt: "Руки мастера замешивают белый гипс в чаше на деревянном столе" },
  { image: "/assets/workshop/creation/02-cast.webp", label: "Обретаем форму", detail: "Гипс заполняет форму. Начинается ожидание.", alt: "Мастер наливает гипсовую смесь в цилиндрическую силиконовую форму" },
  { image: "/assets/workshop/creation/03-release.webp", label: "Рождение кашпо", detail: "Снимаем форму — открываем каждое ребро.", alt: "Из мягкой силиконовой формы бережно извлекают белое ребристое кашпо" },
  { image: "/assets/workshop/creation/04-wick.webp", label: "Будущий огонь", detail: "Фитиль занимает своё место в самом центре.", alt: "Мастер закрепляет хлопковый фитиль по центру пустого белого кашпо" },
  { image: "/assets/workshop-real-candle.webp", label: "Тепло внутри", detail: "Соевый воск наполняет кашпо будущим светом.", alt: "Тёплый соевый воск наливают из металлического кувшина в белое ребристое кашпо" },
  { image: "/assets/workshop/creation/06-finished.webp", label: "Готова к твоему вечеру", detail: "Белая свеча. Сделана руками, чтобы согревать.", alt: "Готовая белая свеча в ребристом гипсовом кашпо с застывшим воском и незажжённым фитилём" },
] as const;

export function WorkshopStory({ pouringImage = workshopScenes[4].image }: { pouringImage?: string }) {
  const scenes = useMemo(() => workshopScenes.map((scene, index) => index === 4 ? { ...scene, image: pouringImage } : scene), [pouringImage]);
  const { root, frames, setFrames, currentIndex, busy, paused, dragging, holding, layers, onKey, onPointerDown, finishGesture, releasePointer } = usePhotoStory(scenes);
  const scene = scenes[currentIndex];

  return <div ref={root} className={`workshop-photo workshop-story reveal${dragging ? " is-dragging" : ""}${holding ? " is-held" : ""}`} role="region" aria-roledescription="карусель" aria-label="Шесть этапов создания свечи" tabIndex={0} aria-describedby="workshop-gesture-help" aria-keyshortcuts="ArrowLeft ArrowRight Home End Space" data-scene={currentIndex} data-playing={!paused} aria-busy={busy}
    onKeyDown={onKey} onPointerDown={onPointerDown} onPointerUp={event => finishGesture(event)} onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => releasePointer(event.pointerId)}>
    <div className="workshop-story-visual">
      {layers.map((frame, index) => {
        const current = index === layers.length - 1;
        const item = scenes[frame.index];
        return <div key={frame.key} className={`workshop-story-frame${current && frames.previous ? " is-revealing" : !current ? " is-leaving" : ""}`} aria-hidden={!current || undefined} inert={!current || undefined}
          onAnimationEnd={event => { if (!holding && current && event.target === event.currentTarget) setFrames(last => ({ ...last, previous: null })); }}>
          {!frame.failed && <img src={item.image} alt={item.alt} width="1024" height="1536" loading="eager" draggable={false}
            onLoad={() => { if (current && !frame.ready) setFrames(last => ({ ...last, current: { ...last.current, ready: true } })); }}
            onError={() => { if (current) setFrames(last => ({ ...last, current: { ...last.current, ready: true, failed: true } })); }} />}
          {frame.failed && <p className="workshop-story-unavailable">{item.label}<span>Фотография пока недоступна</span></p>}
        </div>;
      })}
      <div className="workshop-story-kicker" aria-hidden="true">ТИХО / ОТ ФОРМЫ ДО СВЕТА</div>
    </div>
    <div className="workshop-story-caption photo-story-copy" aria-live={paused ? "polite" : "off"} aria-atomic="true">
      <div><h3>{scene.label}</h3><p>{scene.detail}</p></div>
      <span className="workshop-story-count" aria-label={`${currentIndex + 1} из ${scenes.length}`}>{String(currentIndex + 1).padStart(2, "0")} <i>/ 06</i></span>
    </div>
    <p className="workshop-story-hint" aria-hidden="true">Листайте влево или вправо · удерживайте для паузы<span>мышью · свайпом · Shift + колесо</span></p>
    <p id="workshop-gesture-help" className="sr-only">Стрелки влево и вправо меняют этап. Home — первый, End — последний. Пробел останавливает или продолжает автосмену. Удерживайте палец или левую кнопку мыши на фотографии, чтобы остановить её. Отпустите, чтобы продолжить.</p>
  </div>;
}
